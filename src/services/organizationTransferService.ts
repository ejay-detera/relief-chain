import { supabase } from '@/lib/supabase';
import type {
  DestinationWalletValidation,
  OrganizationTransferPayload,
  OrganizationTransferRecord,
  OrganizationTransferResult,
  RegisteredOrganizationRecipient,
} from '@/types/organization-transfer';

const HORIZON_URL = process.env.EXPO_PUBLIC_STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org';
const RCPHP_ISSUER = process.env.EXPO_PUBLIC_STELLAR_RCPHP_ISSUER;
const STELLAR_ADDRESS_REGEX = /^G[A-Z2-7]{55}$/;

/**
 * Validates a destination Stellar wallet address on-chain and against registered organizations.
 */
export async function validateDestinationStellarAddress(
  address: string,
  currentOrgWallet?: string
): Promise<DestinationWalletValidation> {
  const cleanAddress = address.trim();

  if (!cleanAddress) {
    return {
      isValidFormat: false,
      errorMessage: 'Please enter a destination Stellar wallet address.',
    };
  }

  if (!STELLAR_ADDRESS_REGEX.test(cleanAddress)) {
    return {
      isValidFormat: false,
      errorMessage: 'Invalid Stellar address format. Must be 56 characters starting with "G".',
    };
  }

  if (currentOrgWallet && cleanAddress === currentOrgWallet) {
    return {
      isValidFormat: false,
      errorMessage: 'Destination cannot be your own organization treasury wallet.',
    };
  }

  // Check if destination matches a known registered organization
  let matchedOrganizationName: string | null = null;
  let matchedOrganizationId: string | null = null;

  try {
    const { data: matchedWallet } = await supabase
      .from('wallets')
      .select('owner_id, organizations(id, name)')
      .eq('owner_type', 'organization')
      .eq('address', cleanAddress)
      .eq('is_active', true)
      .maybeSingle();

    if (matchedWallet) {
      matchedOrganizationId = matchedWallet.owner_id;
      matchedOrganizationName = (matchedWallet as any)?.organizations?.name || null;
    }
  } catch (err) {
    console.warn('[validateDestination] Org lookup warning:', err);
  }

  // Verify on Horizon
  try {
    const { Horizon } = await import('@stellar/stellar-sdk');
    const server = new Horizon.Server(HORIZON_URL);
    const account = await server.loadAccount(cleanAddress);

    const rcphpTrustline = account.balances.find(
      (b: any) =>
        b.asset_type !== 'native' &&
        'asset_code' in b &&
        b.asset_code === 'RCPHP' &&
        (!RCPHP_ISSUER || b.asset_issuer === RCPHP_ISSUER)
    );

    if (!rcphpTrustline) {
      return {
        isValidFormat: true,
        isAccountActive: true,
        hasRcphpTrustline: false,
        matchedOrganizationName,
        matchedOrganizationId,
        errorMessage: 'Destination wallet does not have an RCPHP trustline.',
      };
    }

    if ('is_authorized' in rcphpTrustline && rcphpTrustline.is_authorized === false) {
      return {
        isValidFormat: true,
        isAccountActive: true,
        hasRcphpTrustline: true,
        isRcphpAuthorized: false,
        matchedOrganizationName,
        matchedOrganizationId,
        errorMessage: 'Destination RCPHP trustline is pending authorization by the issuer.',
      };
    }

    return {
      isValidFormat: true,
      isAccountActive: true,
      hasRcphpTrustline: true,
      isRcphpAuthorized: true,
      matchedOrganizationName,
      matchedOrganizationId,
      errorMessage: null,
    };
  } catch (err: any) {
    if (err?.response?.status === 404 || err?.name === 'NotFoundError') {
      return {
        isValidFormat: true,
        isAccountActive: false,
        matchedOrganizationName,
        matchedOrganizationId,
        errorMessage: 'Stellar account does not exist or has no funded testnet balance.',
      };
    }

    return {
      isValidFormat: true,
      errorMessage: `Could not verify address on Horizon: ${err?.message || 'Network error'}`,
    };
  }
}

/**
 * Fetches other registered organizations with active treasury wallets for quick-selection.
 */
export async function fetchRegisteredOrganizations(
  excludeOrganizationId?: string | null
): Promise<RegisteredOrganizationRecipient[]> {
  try {
    let query = supabase
      .from('wallets')
      .select('owner_id, address, organizations(id, name, slug)')
      .eq('owner_type', 'organization')
      .eq('purpose', 'organization_treasury')
      .eq('is_active', true);

    if (excludeOrganizationId) {
      query = query.neq('owner_id', excludeOrganizationId);
    }

    const { data, error } = await query;
    if (error) throw error;

    const results: RegisteredOrganizationRecipient[] = [];
    for (const row of data || []) {
      const org = (row as any).organizations;
      if (org && org.name && row.address) {
        results.push({
          organizationId: org.id,
          name: org.name,
          slug: org.slug,
          walletAddress: row.address,
        });
      }
    }

    return results;
  } catch (err) {
    console.error('[fetchRegisteredOrganizations] Error:', err);
    return [];
  }
}

/**
 * Submits an inter-organization fund transfer via Edge Function.
 */
export async function transferOrganizationFunds(
  payload: OrganizationTransferPayload
): Promise<OrganizationTransferResult> {
  const { data, error } = await supabase.functions.invoke<OrganizationTransferResult>(
    'transfer-organization-fund',
    {
      body: payload,
    }
  );

  if (error) {
    const errorMsg =
      (error as any)?.context?.json?.error?.message ||
      (error as any)?.message ||
      'Failed to transfer funds.';
    return {
      success: false,
      amountRcphp: payload.amountRcphp,
      senderWallet: '',
      destinationWallet: payload.destinationWallet,
      timestamp: new Date().toISOString(),
      errorMessage: errorMsg,
    };
  }

  if (!data || !data.success) {
    return {
      success: false,
      amountRcphp: payload.amountRcphp,
      senderWallet: '',
      destinationWallet: payload.destinationWallet,
      timestamp: new Date().toISOString(),
      errorMessage: data?.errorMessage || 'Transfer failed.',
    };
  }

  return data;
}

/**
 * Fetches transfer history for the organization.
 */
export async function fetchOrganizationTransfers(
  organizationId: string
): Promise<OrganizationTransferRecord[]> {
  try {
    const { data, error } = await supabase
      .from('organization_transfers')
      .select(`
        id,
        sender_organization_id,
        sender_wallet_address,
        destination_wallet_address,
        destination_organization_id,
        amount_stroops,
        transaction_hash,
        ledger_sequence,
        memo,
        status,
        error_message,
        created_at,
        confirmed_at,
        destination_org:organizations!destination_organization_id (
          name
        )
      `)
      .or(`sender_organization_id.eq.${organizationId},destination_organization_id.eq.${organizationId}`)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) throw error;

    return (data || []).map((row: any) => {
      const stroops = BigInt(row.amount_stroops || '0');
      const rcphp = (Number(stroops) / 10000000).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

      return {
        id: row.id,
        sender_organization_id: row.sender_organization_id,
        sender_wallet_address: row.sender_wallet_address,
        destination_wallet_address: row.destination_wallet_address,
        destination_organization_id: row.destination_organization_id,
        destination_organization_name: row.destination_org?.name || null,
        amount_stroops: row.amount_stroops,
        amount_rcphp: rcphp,
        transaction_hash: row.transaction_hash,
        ledger_sequence: row.ledger_sequence,
        memo: row.memo,
        status: row.status,
        error_message: row.error_message,
        created_at: row.created_at,
        confirmed_at: row.confirmed_at,
      };
    });
  } catch (err) {
    console.error('[fetchOrganizationTransfers] Error:', err);
    return [];
  }
}

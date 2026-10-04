// Edge Function: transfer-organization-fund
// Handles authorized inter-organization fund transfers on Stellar testnet.
// Fulfills ORG-01 with strict financial invariants and audit logging.

import {
  createEdgeServiceBinding,
  handleEdgeRequest,
  parseJsonBody,
  type EdgeRequestScope,
} from '../_shared/edge.ts';
import { FinancialErrorException } from '../_shared/errors.ts';
import { jsonResponse } from '../_shared/response.ts';
import { serveEdge } from '../_shared/runtime.ts';
import {
  Horizon,
  Keypair,
  TransactionBuilder,
  Operation,
  Asset,
  Memo,
  BASE_FEE,
} from 'npm:@stellar/stellar-sdk@16.0.1';

interface TransferRequestBody {
  destinationWallet?: unknown;
  amountRcphp?: unknown;
  memo?: unknown;
}

const STELLAR_ADDRESS_REGEX = /^G[A-Z2-7]{55}$/;
const RCPHP_ASSET_CODE = 'RCPHP';

const transferOrganizationFund = async (scope: EdgeRequestScope): Promise<Response> => {
  const { request, context, session, correlationId } = scope;
  const body = await parseJsonBody<TransferRequestBody>(request);

  const destinationWallet = typeof body.destinationWallet === 'string' ? body.destinationWallet.trim() : '';
  const amountStr = typeof body.amountRcphp === 'string' || typeof body.amountRcphp === 'number'
    ? String(body.amountRcphp).trim()
    : '';
  const memoText = typeof body.memo === 'string' ? body.memo.trim() : '';

  // 1. Validate inputs
  if (!destinationWallet || !STELLAR_ADDRESS_REGEX.test(destinationWallet)) {
    throw FinancialErrorException.of(
      'validation_failed',
      'A valid 56-character Stellar destination wallet address is required (starting with G).',
      { correlationId }
    );
  }

  const amountNum = parseFloat(amountStr);
  if (isNaN(amountNum) || amountNum <= 0) {
    throw FinancialErrorException.of(
      'validation_failed',
      'Transfer amount must be a positive number greater than 0.',
      { correlationId }
    );
  }

  const binding = createEdgeServiceBinding(context, correlationId);
  const service = binding.serviceClient;

  // 2. Authorize caller - must be active organization_administrator or finance_approver
  const { data: membership, error: memError } = await service
    .from('organization_memberships')
    .select('organization_id, role, is_active')
    .eq('user_id', session.userId)
    .eq('is_active', true)
    .maybeSingle();

  if (memError || !membership) {
    throw FinancialErrorException.of(
      'authorization_failed',
      'You do not have an active organization membership.',
      { correlationId }
    );
  }

  if (!['organization_administrator', 'finance_approver'].includes(membership.role)) {
    throw FinancialErrorException.of(
      'authorization_failed',
      'Only Organization Administrators or Finance Approvers can transfer organization funds.',
      { correlationId }
    );
  }

  const senderOrgId = membership.organization_id;

  // 3. Load sender organization treasury wallet
  const { data: senderWallet, error: walletError } = await service
    .from('wallets')
    .select('id, address')
    .eq('owner_type', 'organization')
    .eq('owner_id', senderOrgId)
    .eq('purpose', 'organization_treasury')
    .eq('is_active', true)
    .maybeSingle();

  if (walletError || !senderWallet) {
    throw FinancialErrorException.of(
      'validation_failed',
      'Sender organization does not have an active treasury wallet.',
      { correlationId }
    );
  }

  if (senderWallet.address === destinationWallet) {
    throw FinancialErrorException.of(
      'validation_failed',
      'Destination wallet cannot be the sender organization treasury wallet.',
      { correlationId }
    );
  }

  // 4. Retrieve sender treasury signing key
  const { data: keyRow } = await service
    .from('organization_treasury_keys')
    .select('secret_seed')
    .eq('organization_id', senderOrgId)
    .maybeSingle();

  let senderSecret = keyRow?.secret_seed;
  if (!senderSecret) {
    // Fall back to STELLAR_ORGANIZATION_TREASURY_SECRET if this is the default topology org
    senderSecret = Deno.env.get('STELLAR_ORGANIZATION_TREASURY_SECRET');
  }

  if (!senderSecret || !senderSecret.startsWith('S')) {
    throw FinancialErrorException.of(
      'dependency_unavailable',
      'Organization treasury signing key is not configured for on-chain submission.',
      { correlationId }
    );
  }

  const senderKp = Keypair.fromSecret(senderSecret);
  if (senderKp.publicKey() !== senderWallet.address) {
    throw FinancialErrorException.of(
      'dependency_unavailable',
      'Treasury key does not match the active registered treasury wallet address.',
      { correlationId }
    );
  }

  // 5. Connect to Horizon and validate accounts & balances
  const horizonUrl = context.stellar.horizonUrl || 'https://horizon-testnet.stellar.org';
  const server = new Horizon.Server(horizonUrl);
  const rcphpIssuer =
    Deno.env.get('EXPO_PUBLIC_STELLAR_RCPHP_ISSUER') ||
    Deno.env.get('STELLAR_RCPHP_ISSUER') ||
    context.stellar.rcphpIssuer ||
    'GAIKYUNHR734V5CKHXYE6PJOTIVIGT5B6W23TOFLMDKF525W3HASPO5I';

  // The active issuer on testnet
  const activeIssuer = 'GAIKYUNHR734V5CKHXYE6PJOTIVIGT5B6W23TOFLMDKF525W3HASPO5I';
  const effectiveIssuer = rcphpIssuer === activeIssuer ? rcphpIssuer : activeIssuer;
  const rcphpAsset = new Asset(RCPHP_ASSET_CODE, effectiveIssuer);

  // Check sender balance on Horizon
  let senderAccount;
  try {
    senderAccount = await server.loadAccount(senderKp.publicKey());
  } catch (err: any) {
    throw FinancialErrorException.of(
      'dependency_unavailable',
      `Failed to load sender treasury account on Stellar: ${err?.message || 'Not found'}`,
      { correlationId }
    );
  }

  const senderBalanceLine = senderAccount.balances.find(
    (b: any) =>
      b.asset_code === RCPHP_ASSET_CODE &&
      (b.asset_issuer === effectiveIssuer || b.asset_issuer === rcphpIssuer)
  );
  const availableBalance = parseFloat(senderBalanceLine?.balance || '0');

  if (availableBalance < amountNum) {
    throw FinancialErrorException.of(
      'insufficient_budget',
      `Insufficient available treasury balance. Available: ${availableBalance} RCPHP, Requested: ${amountNum} RCPHP.`,
      { correlationId }
    );
  }

  // Check destination account and trustline on Horizon
  let destAccount;
  try {
    destAccount = await server.loadAccount(destinationWallet);
  } catch (err: any) {
    if (err?.response?.status === 404 || err?.name === 'NotFoundError') {
      throw FinancialErrorException.of(
        'validation_failed',
        'Destination Stellar wallet account does not exist or has not been funded on the network.',
        { correlationId }
      );
    }
    throw FinancialErrorException.of(
      'dependency_unavailable',
      `Unable to verify destination account: ${err?.message || 'Network error'}`,
      { correlationId }
    );
  }

  const destTrustline = destAccount.balances.find(
    (b: any) =>
      b.asset_code === RCPHP_ASSET_CODE &&
      (b.asset_issuer === effectiveIssuer || b.asset_issuer === rcphpIssuer)
  );

  if (!destTrustline) {
    throw FinancialErrorException.of(
      'validation_failed',
      'Destination wallet does not have an RCPHP trustline. Recipient must add the RCPHP trustline before receiving aid funds.',
      { correlationId }
    );
  }

  if (destTrustline.is_authorized === false) {
    throw FinancialErrorException.of(
      'validation_failed',
      'Destination wallet RCPHP trustline has not been authorized by the asset issuer.',
      { correlationId }
    );
  }

  // 6. Build and submit payment transaction
  const networkPassphrase = context.stellar.networkPassphrase || 'Test SDF Network ; September 2015';
  const fee = String(BASE_FEE * 100);

  let builder = new TransactionBuilder(senderAccount, {
    fee,
    networkPassphrase,
  }).addOperation(
    Operation.payment({
      destination: destinationWallet,
      asset: rcphpAsset,
      amount: amountNum.toFixed(7),
    })
  );

  if (memoText) {
    builder = builder.addMemo(Memo.text(memoText.slice(0, 28)));
  }

  const transaction = builder.setTimeout(180).build();
  transaction.sign(senderKp);

  let submitResult;
  try {
    submitResult = await server.submitTransaction(transaction);
  } catch (err: any) {
    const errorCodes = err?.response?.data?.extras?.result_codes;
    console.error('Stellar transaction failed:', JSON.stringify(errorCodes, null, 2));
    throw FinancialErrorException.of(
      'dependency_unavailable',
      `Stellar transaction failed: ${JSON.stringify(errorCodes || err?.message || 'Transaction rejected')}`,
      { correlationId }
    );
  }

  // 7. Look up if destination wallet belongs to a registered organization
  const { data: matchedDestOrg } = await service
    .from('wallets')
    .select('owner_id, organizations(id, name)')
    .eq('owner_type', 'organization')
    .eq('address', destinationWallet)
    .eq('is_active', true)
    .maybeSingle();

  const destinationOrgId = matchedDestOrg?.owner_id || null;
  const destinationOrgName = (matchedDestOrg as any)?.organizations?.name || null;
  const amountStroops = BigInt(Math.floor(amountNum * 10000000));

  // 8. Record transfer in organization_transfers
  const { data: transferRecord, error: recordError } = await service
    .from('organization_transfers')
    .insert({
      sender_organization_id: senderOrgId,
      sender_wallet_address: senderWallet.address,
      destination_wallet_address: destinationWallet,
      destination_organization_id: destinationOrgId,
      amount_stroops: amountStroops.toString(),
      transaction_hash: submitResult.hash,
      ledger_sequence: submitResult.ledger,
      memo: memoText || null,
      status: 'confirmed',
      initiated_by: session.userId,
      confirmed_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (recordError) {
    console.warn('Failed to insert organization_transfers row:', recordError);
  }

  // 9. Record platform audit event for sender
  const { error: senderAuditErr } = await service.rpc('append_audit_event', {
    p_organization_id: senderOrgId,
    p_actor_user_id: session.userId,
    p_action: 'organization.funds_transferred',
    p_correlation_id: correlationId,
    p_sensitive_data_access: false,
    p_metadata: {
      transferId: transferRecord?.id,
      amountRcphp: amountNum.toFixed(7),
      destinationWallet,
      destinationOrganizationId: destinationOrgId,
      transactionHash: submitResult.hash,
      ledgerSequence: submitResult.ledger,
    },
  });
  if (senderAuditErr) {
    console.warn('Failed to append audit event for sender:', senderAuditErr);
  }

  // 10. Record platform audit event for recipient organization if registered
  if (destinationOrgId) {
    const { error: recipientAuditErr } = await service.rpc('append_audit_event', {
      p_organization_id: destinationOrgId,
      p_actor_user_id: session.userId,
      p_action: 'organization.funds_received',
      p_correlation_id: correlationId,
      p_sensitive_data_access: false,
      p_metadata: {
        transferId: transferRecord?.id,
        amountRcphp: amountNum.toFixed(7),
        senderWallet: senderWallet.address,
        senderOrganizationId: senderOrgId,
        transactionHash: submitResult.hash,
        ledgerSequence: submitResult.ledger,
      },
    });
    if (recipientAuditErr) {
      console.warn('Failed to append audit event for recipient:', recipientAuditErr);
    }
  }

  const responsePayload = {
    success: true,
    transferId: transferRecord?.id,
    transactionHash: submitResult.hash,
    ledgerSequence: submitResult.ledger,
    amountRcphp: amountNum.toFixed(2),
    senderWallet: senderWallet.address,
    destinationWallet,
    destinationOrganizationName: destinationOrgName,
    timestamp: new Date().toISOString(),
  };

  return jsonResponse(responsePayload, 200, correlationId);
};

serveEdge((request) => handleEdgeRequest(request, transferOrganizationFund));

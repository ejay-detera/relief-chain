// prepare-merchant-provision Edge Function.
//
// Builds the exact sponsored RCPHP trustline transaction a merchant's settlement
// wallet must sign to become able to hold RCPHP under AUTH_REQUIRED.
//
// Validates: Requirements 3.3, 3.6, 14.1, 16.2

import {
  createEdgeSignerRegistry,
  handleEdgeRequest,
  parseJsonBody,
  type EdgeRequestScope,
  createEdgeServiceBinding,
} from '../_shared/edge.ts';
import { FinancialErrorException } from '../_shared/errors.ts';
import { jsonResponse } from '../_shared/response.ts';
import { serveEdge } from '../_shared/runtime.ts';
import { requireRCPHPIdentifiers } from '../_shared/stellar/config.ts';
import { createGuardedHorizonClient } from '../_shared/stellar/horizon.ts';
import {
  buildSponsoredTrustlineTransaction,
  STELLAR_ACCOUNT_PATTERN,
} from '../_shared/stellar/wallet-provision.ts';

interface ProvisionBody {
  readonly walletAddress?: unknown;
}

const FRIENDBOT_URL = 'https://friendbot.stellar.org';

const prepareMerchantProvision = async (scope: EdgeRequestScope): Promise<Response> => {
  const { request, context, session, correlationId } = scope;
  const body = await parseJsonBody<ProvisionBody>(request);

  const walletAddress = typeof body.walletAddress === 'string' ? body.walletAddress : '';
  if (!STELLAR_ACCOUNT_PATTERN.test(walletAddress)) {
    throw FinancialErrorException.of('validation_failed', 'A valid wallet address is required.', { correlationId });
  }

  const binding = createEdgeServiceBinding(context, correlationId);
  const service = binding.serviceClient;

  // The caller must own a merchant entity
  const { data: merchant, error: merchantError } = await service
    .from('merchant_entities')
    .select('id')
    .eq('profile_id', session.userId)
    .maybeSingle();

  if (merchantError || !merchant) {
    throw FinancialErrorException.of('authorization_failed', 'No merchant entity is linked to this account.', { correlationId });
  }

  const horizon = createGuardedHorizonClient(context.stellar, context.guard);
  const signers = createEdgeSignerRegistry();
  const sponsorPublicKey = signers.publicKeyOf('sponsor');
  const rcphp = requireRCPHPIdentifiers(context.stellar);

  // Ensure the wallet account exists on testnet Friendbot first
  let account;
  try {
    account = await horizon.loadAccount(walletAddress);
  } catch {
    const funded = await fetch(`${FRIENDBOT_URL}/?addr=${encodeURIComponent(walletAddress)}`);
    if (funded.status !== 200) {
      throw FinancialErrorException.of('dependency_unavailable', 'Could not create the wallet account on testnet.', {
        correlationId,
        retryable: true,
      });
    }
    account = await horizon.loadAccount(walletAddress);
  }

  const authorizedTrustline = account.balances.some(
    (line) =>
      (line as { asset_code?: string; asset_issuer?: string; is_authorized?: boolean }).asset_code === rcphp.code &&
      (line as { asset_issuer?: string }).asset_issuer === rcphp.issuer &&
      (line as { is_authorized?: boolean }).is_authorized === true,
  );
  if (authorizedTrustline) {
    return jsonResponse({ provision: { alreadyProvisioned: true, walletAddress } }, 200, correlationId);
  }

  const sponsorAccount = await horizon.loadAccount(sponsorPublicKey);
  const transaction = buildSponsoredTrustlineTransaction({
    config: context.stellar,
    sponsorPublicKey,
    sponsorAccount,
    walletAddress,
  });

  return jsonResponse(
    {
      provision: {
        alreadyProvisioned: false,
        walletAddress,
        unsignedTxXdr: transaction.toXDR(),
        networkPassphrase: context.stellar.networkPassphrase,
        expectedSigner: walletAddress,
      },
    },
    200,
    correlationId,
  );
};

serveEdge((request) => handleEdgeRequest(request, prepareMerchantProvision));

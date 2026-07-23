// submit-wallet-provision Edge Function.
//
// Takes the phone-signed sponsored trustline transaction, verifies it is exactly
// the RCPHP trustline for the caller's wallet and carries the wallet signature,
// adds the sponsor signature and submits it, then authorizes the trustline with
// the issuer, and finally binds the verified beneficiary-identity wallet row.
//
// Validates: Requirements 3.3, 3.6, 14.1, 16.1, 16.2, 18.4

import type { Transaction } from '@stellar/stellar-sdk';

import {
    createEdgeServiceBinding,
    createEdgeSignerRegistry,
    handleEdgeRequest,
    parseJsonBody,
    type EdgeRequestScope,
} from '../_shared/edge.ts';
import { FinancialErrorException } from '../_shared/errors.ts';
import { jsonResponse } from '../_shared/response.ts';
import { serveEdge } from '../_shared/runtime.ts';
import { createGuardedHorizonClient } from '../_shared/stellar/horizon.ts';
import {
    assertSignedTrustlineMatches,
    buildIssuerAuthorizationTransaction,
    STELLAR_ACCOUNT_PATTERN,
} from '../_shared/stellar/wallet-provision.ts';
import { parseTransactionEnvelope } from '../_shared/stellar/xdr.ts';

interface SubmitProvisionBody {
  readonly walletAddress?: unknown;
  readonly signedTxXdr?: unknown;
}

const hex64 = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

const submitWalletProvision = async (scope: EdgeRequestScope): Promise<Response> => {
  const { request, context, session, correlationId } = scope;
  const body = await parseJsonBody<SubmitProvisionBody>(request);

  const walletAddress = typeof body.walletAddress === 'string' ? body.walletAddress : '';
  const signedTxXdr = typeof body.signedTxXdr === 'string' ? body.signedTxXdr : '';
  if (!STELLAR_ACCOUNT_PATTERN.test(walletAddress) || signedTxXdr === '') {
    throw FinancialErrorException.of('validation_failed', 'A wallet address and signed transaction are required.', {
      correlationId,
    });
  }

  const binding = createEdgeServiceBinding(context, correlationId);
  const service = binding.serviceClient;

  // The caller must own a beneficiary identity to bind the wallet to.
  const { data: identity, error: identityError } = await service
    .from('beneficiary_identities')
    .select('id')
    .eq('user_id', session.userId)
    .maybeSingle();
  if (identityError || !identity) {
    throw FinancialErrorException.of('authorization_failed', 'No beneficiary identity is linked to this account.', {
      correlationId,
    });
  }

  const horizon = createGuardedHorizonClient(context.stellar, context.guard);
  const signers = createEdgeSignerRegistry();
  const sponsorPublicKey = signers.publicKeyOf('sponsor');
  const issuerPublicKey = signers.publicKeyOf('issuer');

  // Verify the phone-signed transaction is exactly the sponsored RCPHP trustline.
  const parsed = parseTransactionEnvelope(signedTxXdr, context.stellar.networkPassphrase);
  if (parsed.isFeeBump) {
    throw FinancialErrorException.of('validation_failed', 'The provisioning transaction must not be a fee-bump.', {
      correlationId,
    });
  }
  const transaction = parsed.transaction as Transaction;
  assertSignedTrustlineMatches(transaction, {
    config: context.stellar,
    sponsorPublicKey,
    walletAddress,
    correlationId,
  });

  // Add the sponsor signature and submit the trustline creation.
  signers.get('sponsor').signTransaction(transaction);
  await horizon.submitTransaction(transaction);

  // Authorize the trustline with the issuer (AUTH_REQUIRED).
  const issuerAccount = await horizon.loadAccount(issuerPublicKey);
  const authTransaction = buildIssuerAuthorizationTransaction({
    config: context.stellar,
    issuerPublicKey,
    issuerAccount,
    walletAddress,
  });
  signers.get('issuer').signTransaction(authTransaction);
  await horizon.submitTransaction(authTransaction);

  // Bind the verified beneficiary-identity wallet row if not already present.
  const { data: existingWallet } = await service
    .from('wallets')
    .select('id')
    .eq('owner_type', 'beneficiary_identity')
    .eq('owner_id', identity.id)
    .eq('address', walletAddress)
    .maybeSingle();

  if (!existingWallet) {
    const nowIso = new Date().toISOString();
    const { error: insertError } = await service.from('wallets').insert({
      owner_type: 'beneficiary_identity',
      owner_id: identity.id,
      purpose: 'beneficiary',
      network: 'stellar_testnet',
      address: walletAddress,
      verification_status: 'verified',
      is_active: true,
      proof_challenge_digest: await hex64(`challenge:${walletAddress}`),
      proof_signature_digest: await hex64(`signature:${walletAddress}:${correlationId}`),
      proof_challenge_issued_at: nowIso,
      verified_at: nowIso,
      verified_by: session.userId,
    });
    if (insertError) {
      throw FinancialErrorException.of('dependency_unavailable', 'The wallet was provisioned on-chain but could not be bound.', {
        correlationId,
        retryable: true,
      });
    }
  }

  return jsonResponse({ provision: { provisioned: true, walletAddress } }, 200, correlationId);
};

serveEdge((request) => handleEdgeRequest(request, submitWalletProvision));

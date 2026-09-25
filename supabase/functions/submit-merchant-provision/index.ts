// submit-merchant-provision Edge Function.
//
// Takes the signed trustline transaction, submits it, authorizes it with the issuer,
// and binds the verified merchant-entity settlement wallet row.
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

const submitMerchantProvision = async (scope: EdgeRequestScope): Promise<Response> => {
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

  // The caller must own a merchant entity
  const { data: merchant, error: merchantError } = await service
    .from('merchant_entities')
    .select('id')
    .eq('profile_id', session.userId)
    .maybeSingle();

  if (merchantError || !merchant) {
    throw FinancialErrorException.of('authorization_failed', 'No merchant entity is linked to this account.', {
      correlationId,
    });
  }

  const horizon = createGuardedHorizonClient(context.stellar, context.guard);
  const signers = createEdgeSignerRegistry();
  const sponsorPublicKey = signers.publicKeyOf('sponsor');
  const issuerPublicKey = signers.publicKeyOf('issuer');

  // Verify the signed transaction
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

  // Authorize the trustline with the issuer
  const issuerAccount = await horizon.loadAccount(issuerPublicKey);
  const authTransaction = buildIssuerAuthorizationTransaction({
    config: context.stellar,
    issuerPublicKey,
    issuerAccount,
    walletAddress,
  });
  signers.get('issuer').signTransaction(authTransaction);
  await horizon.submitTransaction(authTransaction);

  // Bind the verified merchant-entity wallet row if not already present.
  // Rotation case: the merchant still uses an old active settlement wallet
  // (device lost its signer) and is provisioning a replacement. The wallets
  // table allows only one active merchant_settlement row per merchant
  // (`wallets_one_active_owner_purpose_idx`) and verified bindings are
  // immutable — they must be superseded, never updated in place. Sequence the
  // swap so two actives never coexist: insert the replacement as inactive,
  // supersede the old row to it, then activate the replacement.
  const { data: existingWallet } = await service
    .from('wallets')
    .select('id, is_active')
    .eq('owner_type', 'merchant_entity')
    .eq('owner_id', merchant.id)
    .eq('address', walletAddress)
    .maybeSingle();

  if (existingWallet) {
    // Idempotent retry: the address is already bound. If a previous rotation
    // attempt left it inactive while the old row is still active, finish the
    // swap now so the replacement becomes the single active wallet.
    if (!existingWallet.is_active) {
      const { data: currentActive } = await service
        .from('wallets')
        .select('id, address')
        .eq('owner_type', 'merchant_entity')
        .eq('owner_id', merchant.id)
        .eq('purpose', 'merchant_settlement')
        .eq('network', 'stellar_testnet')
        .eq('is_active', true)
        .maybeSingle();
      if (currentActive && currentActive.id !== existingWallet.id) {
        const nowIso = new Date().toISOString();
        const { error: supersedeError } = await service
          .from('wallets')
          .update({
            is_active: false,
            superseded_by_wallet_id: existingWallet.id,
            superseded_at: nowIso,
            superseded_by: session.userId,
          })
          .eq('id', currentActive.id)
          .eq('is_active', true);
        if (supersedeError) {
          throw FinancialErrorException.of('dependency_unavailable', 'The wallet was provisioned on-chain but could not be bound.', {
            correlationId,
            retryable: true,
          });
        }
        const { error: activateError } = await service
          .from('wallets')
          .update({ is_active: true })
          .eq('id', existingWallet.id);
        if (activateError) {
          throw FinancialErrorException.of('dependency_unavailable', 'The wallet was provisioned on-chain but could not be bound.', {
            correlationId,
            retryable: true,
          });
        }
      } else if (!currentActive) {
        const { error: activateError } = await service
          .from('wallets')
          .update({ is_active: true })
          .eq('id', existingWallet.id);
        if (activateError) {
          throw FinancialErrorException.of('dependency_unavailable', 'The wallet was provisioned on-chain but could not be bound.', {
            correlationId,
            retryable: true,
          });
        }
      }
    }
    return jsonResponse({ provision: { provisioned: true, walletAddress } }, 200, correlationId);
  }

  const { data: currentActiveWallet } = await service
    .from('wallets')
    .select('id, address')
    .eq('owner_type', 'merchant_entity')
    .eq('owner_id', merchant.id)
    .eq('purpose', 'merchant_settlement')
    .eq('network', 'stellar_testnet')
    .eq('is_active', true)
    .maybeSingle();

  if (!currentActiveWallet) {
    const nowIso = new Date().toISOString();
    const { error: insertError } = await service.from('wallets').insert({
      owner_type: 'merchant_entity',
      owner_id: merchant.id,
      purpose: 'merchant_settlement',
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
  } else if (currentActiveWallet.address !== walletAddress) {
    // Rotation: insert replacement as inactive, supersede the old active row,
    // then activate the replacement. Never two actives; never mutate verified
    // evidence in place.
    const nowIso = new Date().toISOString();
    const { data: inserted, error: insertError } = await service
      .from('wallets')
      .insert({
        owner_type: 'merchant_entity',
        owner_id: merchant.id,
        purpose: 'merchant_settlement',
        network: 'stellar_testnet',
        address: walletAddress,
        verification_status: 'verified',
        is_active: false,
        proof_challenge_digest: await hex64(`challenge:${walletAddress}`),
        proof_signature_digest: await hex64(`signature:${walletAddress}:${correlationId}`),
        proof_challenge_issued_at: nowIso,
        verified_at: nowIso,
        verified_by: session.userId,
      })
      .select('id')
      .single();
    if (insertError || !inserted) {
      throw FinancialErrorException.of('dependency_unavailable', 'The wallet was provisioned on-chain but could not be bound.', {
        correlationId,
        retryable: true,
      });
    }
    const { error: supersedeError } = await service
      .from('wallets')
      .update({
        is_active: false,
        superseded_by_wallet_id: inserted.id,
        superseded_at: nowIso,
        superseded_by: session.userId,
      })
      .eq('id', currentActiveWallet.id)
      .eq('is_active', true);
    if (supersedeError) {
      throw FinancialErrorException.of('dependency_unavailable', 'The wallet was provisioned on-chain but could not be bound.', {
        correlationId,
        retryable: true,
      });
    }
    const { error: activateError } = await service
      .from('wallets')
      .update({ is_active: true })
      .eq('id', inserted.id);
    if (activateError) {
      throw FinancialErrorException.of('dependency_unavailable', 'The wallet was provisioned on-chain but could not be bound.', {
        correlationId,
        retryable: true,
      });
    }
  }

  return jsonResponse({ provision: { provisioned: true, walletAddress } }, 200, correlationId);
};

serveEdge((request) => handleEdgeRequest(request, submitMerchantProvision));

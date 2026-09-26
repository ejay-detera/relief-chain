// retry-payment Edge Function.
//
// Exposes the existing `protocol.retry` path (supabase/functions/_shared/
// stellar/protocol.ts) for orphan-accepted merchant payments. PREPARE writes an
// `accepted` attempt with no hash; if device signing/submission never completes
// (biometric cancel, app kill, network drop), the invoice-bound idempotency key
// is already claimed, so a later authorize replays (attemptId null) and the
// client would observe `accepted`→pending forever. This function reuses the same
// intent — hence the same business idempotency key — and builds a fresh attempt
// with new sequence/auth data via the reconcile-before-retry gate, returning the
// fresh attemptId + signing package. It never signs server-side; the device
// signs with its SecureStore key. Confirmation stays reconciler-owned.
//
// Validates: Requirements 11.5, 11.6, 11.7, 11.8, 11.9, 14.1, 18.4, 18.8

import {
  createEdgeServiceBinding,
  handleEdgeRequest,
  parseJsonBody,
  type EdgeRequestScope,
  createEdgeTransactionProtocol,
} from '../_shared/edge.ts';
import { FinancialErrorException } from '../_shared/errors.ts';
import { jsonResponse } from '../_shared/response.ts';
import { serveEdge } from '../_shared/runtime.ts';
import {
  createMerchantPaymentStrategy,
  makeMerchantPaymentKey,
} from '../_shared/stellar/merchant-payment.ts';
import { createCashReconcilerBundle } from '../_shared/edge-cash-reconciler.ts';

interface PaymentRetryBody {
  readonly intentId?: unknown;
}

const readMetadataString = (metadata: unknown, key: string): string | null => {
  if (metadata !== null && typeof metadata === 'object' && !Array.isArray(metadata)) {
    const value = (metadata as Record<string, unknown>)[key];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }
  return null;
};

const retryPayment = async (scope: EdgeRequestScope): Promise<Response> => {
  const { request, context, session, correlationId } = scope;
  const body = await parseJsonBody<PaymentRetryBody>(request);

  const intentId = typeof body.intentId === 'string' ? body.intentId : '';

  if (!intentId) {
    throw FinancialErrorException.of('validation_failed', 'intentId is required.', { correlationId });
  }

  const binding = createEdgeServiceBinding(context, correlationId);
  const service = binding.serviceClient;

  // 1. Resolve caller beneficiary identity to verify ownership of this payment intent
  const { data: identity, error: identityError } = await service
    .from('beneficiary_identities')
    .select('id')
    .eq('user_id', session.userId)
    .maybeSingle();

  if (identityError || !identity) {
    throw FinancialErrorException.of('authorization_failed', 'No beneficiary identity is linked to this account.', { correlationId });
  }

  // 2. Load the intent and verify ownership
  const { data: intent, error: intentError } = await service
    .from('financial_intents')
    .select('*')
    .eq('id', intentId)
    .maybeSingle();

  if (intentError || !intent) {
    throw FinancialErrorException.of('validation_failed', 'The payment intent was not found.', { correlationId });
  }

  if (intent.beneficiary_identity_id !== identity.id) {
    throw FinancialErrorException.of('authorization_failed', 'You do not own this payment intent.', { correlationId });
  }

  if (intent.operation_type !== 'cash_payment') {
    throw FinancialErrorException.of('validation_failed', 'This intent is not a merchant payment.', { correlationId });
  }

  // Fail closed on numerics: a null amount must never be coerced into an insert.
  if (intent.amount_stroops === null) {
    throw FinancialErrorException.of('validation_failed', 'This payment intent is missing the amount to pay.', { correlationId });
  }

  // 3. Read the latest attempt explicitly so replay routing is auditable: an
  //    `accepted` latest means the prior prepare never submitted (orphan) and
  //    the retry below builds a fresh attempt; submitted/unknown reconcile
  //    first inside the protocol; observed_success is already settled and
  //    returns without building anything.
  const { data: priorAttempts, error: attemptsError } = await service
    .from('transaction_attempts')
    .select('id, attempt_number, status, transaction_hash')
    .eq('financial_intent_id', intent.id)
    .order('attempt_number', { ascending: true });

  if (attemptsError) {
    throw FinancialErrorException.of('dependency_unavailable', 'Unable to load prior attempts right now.', { correlationId });
  }

  const listAttempts = priorAttempts ?? [];
  const latest = listAttempts.length > 0 ? listAttempts[listAttempts.length - 1] : null;

  if (latest !== null && latest.status === 'observed_success') {
    return jsonResponse({
      payment: {
        intentId: intent.id,
        attemptId: latest.id,
        transactionHash: latest.transaction_hash ?? null,
        signingPackage: null,
        expectedSigner: null,
        settled: true,
        isReplay: true,
      },
    }, 200, correlationId);
  }

  // Retry through the shared protocol: reconcile-first on submitted/unknown,
  // settled without a new attempt on observed_success, fresh attempt under the
  // same intent (same invoice-bound key) on accepted/observed_failure.
  const reconciler = createCashReconcilerBundle(context, binding, correlationId);
  const protocol = createEdgeTransactionProtocol(context, {
    service: binding,
    correlationId,
    reconciler: reconciler.worker,
  });

  const strategy = createMerchantPaymentStrategy({ horizon: reconciler.horizon });

  const outcome = await protocol.retry(intent, strategy);

  if (outcome.settled) {
    return jsonResponse({
      payment: {
        intentId: intent.id,
        attemptId: outcome.attempt.id,
        transactionHash: outcome.attempt.transaction_hash ?? null,
        signingPackage: null,
        expectedSigner: null,
        settled: true,
        isReplay: true,
      },
    }, 200, correlationId);
  }

  const built = outcome.built;

  // The beneficiary wallet the local signer must match exactly. The source
  // address was bound into the immutable intent at prepare time, so the retry
  // reuses it rather than trusting any client-supplied value.
  const expectedSigner = readMetadataString(intent.request_metadata, 'source_address');
  const invoiceHex = readMetadataString(intent.request_metadata, 'invoice_id');

  // 4. Ensure the payment_intents workflow row exists. Prepare inserts it after
  //    building the attempt; a crash between the two leaves an orphan attempt
  //    without its workflow row, and submit would then fail its row-count check.
  //    Rebuild the links from stored rows only — never fabricate.
  const { data: existingIntent } = await service
    .from('payment_intents')
    .select('id')
    .eq('financial_intent_id', intent.id)
    .maybeSingle();

  if (!existingIntent) {
    if (!invoiceHex) {
      throw FinancialErrorException.of(
        'dependency_unavailable',
        'Unable to restore this payment right now. Ask the merchant for a new invoice.',
        { correlationId },
      );
    }
    const [{ data: invoiceRow }, { data: beneficiaryWallet }] = await Promise.all([
      service.from('invoices').select('id, merchant_id, settlement_wallet_id').eq('payload_hash', invoiceHex).maybeSingle(),
      service
        .from('wallets')
        .select('id')
        .eq('owner_type', 'beneficiary_identity')
        .eq('owner_id', identity.id)
        .eq('purpose', 'beneficiary')
        .eq('verification_status', 'verified')
        .eq('is_active', true)
        .eq('network', 'stellar_testnet')
        .maybeSingle(),
    ]);
    if (!invoiceRow || !beneficiaryWallet) {
      throw FinancialErrorException.of(
        'dependency_unavailable',
        'Unable to restore this payment right now. Ask the merchant for a new invoice.',
        { correlationId },
      );
    }
    const { error: insertIntentError } = await service
      .from('payment_intents')
      .insert({
        id: crypto.randomUUID(),
        financial_intent_id: intent.id,
        organization_id: intent.organization_id,
        invoice_id: invoiceRow.id,
        program_id: intent.program_id,
        beneficiary_identity_id: identity.id,
        beneficiary_wallet_id: beneficiaryWallet.id,
        merchant_id: invoiceRow.merchant_id,
        settlement_wallet_id: invoiceRow.settlement_wallet_id,
        enrollment_id: null,
        funding_source: 'cash',
        amount_stroops: intent.amount_stroops,
        idempotency_key: makeMerchantPaymentKey(invoiceHex),
        payload_hash: intent.payload_hash,
        status: 'prepared',
        correlation_id: correlationId,
      });
    if (insertIntentError) {
      throw FinancialErrorException.of(
        'dependency_unavailable',
        'Unable to restore this payment right now. Ask the merchant for a new invoice.',
        { correlationId },
      );
    }
  }

  return jsonResponse({
    payment: {
      intentId: intent.id,
      attemptId: built.attempt.id,
      transactionHash: null,
      signingPackage: built.signingPackage,
      expectedSigner,
      settled: false,
      isReplay: false,
    },
  }, 200, correlationId);
};

serveEdge((request) => handleEdgeRequest(request, retryPayment));

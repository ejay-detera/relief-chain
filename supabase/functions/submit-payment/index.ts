// submit-payment Edge Function.
//
// Validates: Requirements 11.5, 11.6, 11.7, 11.8, 11.9, 14.1, 18.4, 18.8

import {
  createEdgeServiceBinding,
  handleEdgeRequest,
  parseJsonBody,
  type EdgeRequestScope,
  createEdgeSignerRegistry,
  createEdgeTransactionProtocol,
} from '../_shared/edge.ts';
import { FinancialErrorException } from '../_shared/errors.ts';
import { jsonResponse } from '../_shared/response.ts';
import { serveEdge } from '../_shared/runtime.ts';
import {
  createMerchantPayment,
  createMerchantPaymentStrategy,
} from '../_shared/stellar/merchant-payment.ts';
import { createCashReconcilerBundle } from '../_shared/edge-cash-reconciler.ts';

interface PaymentSubmitBody {
  readonly intentId?: unknown;
  readonly attemptId?: unknown;
  readonly signed?: unknown;
}

const submitPayment = async (scope: EdgeRequestScope): Promise<Response> => {
  const { request, context, session, correlationId } = scope;
  const body = await parseJsonBody<PaymentSubmitBody>(request);

  const intentId = typeof body.intentId === 'string' ? body.intentId : '';
  const attemptId = typeof body.attemptId === 'string' ? body.attemptId : '';

  if (!intentId || !attemptId || !body.signed || typeof body.signed !== 'object') {
    throw FinancialErrorException.of('validation_failed', 'intentId, attemptId, and signed object are required.', { correlationId });
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

  // 2. Load the intent and attempt from DB
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

  const { data: attempt, error: attemptError } = await service
    .from('transaction_attempts')
    .select('*')
    .eq('id', attemptId)
    .maybeSingle();

  if (attemptError || !attempt) {
    throw FinancialErrorException.of('validation_failed', 'The transaction attempt was not found.', { correlationId });
  }

  if (attempt.financial_intent_id !== intent.id) {
    throw FinancialErrorException.of('validation_failed', 'The attempt does not match the intent.', { correlationId });
  }

  // Update payment_intents status from 'prepared' to 'signed'
  const { error: updateSignedError } = await service
    .from('payment_intents')
    .update({ status: 'signed' })
    .eq('financial_intent_id', intent.id)
    .eq('status', 'prepared');

  if (updateSignedError) {
    throw FinancialErrorException.of('dependency_unavailable', `Unable to update payment intent to signed: ${updateSignedError.message}`, { correlationId });
  }

  // 3. Assemble and submit payment
  const reconciler = createCashReconcilerBundle(context, binding, correlationId);
  const protocol = createEdgeTransactionProtocol(context, {
    service: binding,
    correlationId,
    reconciler: reconciler.worker,
  });

  const paymentOrchestrator = createMerchantPayment({
    protocol,
    strategy: createMerchantPaymentStrategy({ horizon: reconciler.horizon }),
    config: context.stellar,
    signers: createEdgeSignerRegistry(),
  });

  let submitted: { status: 'submitted'; attemptId: string; transactionHash: string };
  try {
    submitted = await paymentOrchestrator.submit({
      intent,
      attempt,
      signed: body.signed as any,
    });
  } catch (error) {
    // Transition payment_intents to failed if submission failed
    await service
      .from('payment_intents')
      .update({
        status: 'failed',
        failed_at: new Date().toISOString(),
        failure_code: (error as any).code ?? 'submission_failed'
      })
      .eq('financial_intent_id', intent.id)
      .in('status', ['signed', 'prepared']);

    throw error;
  }

  // 4. Transition payment_intents to 'submitted'
  const { error: updateSubmittedError } = await service
    .from('payment_intents')
    .update({
      status: 'submitted',
      transaction_hash: submitted.transactionHash,
      submitted_at: new Date().toISOString(),
    })
    .eq('financial_intent_id', intent.id)
    .eq('status', 'signed');

  if (updateSubmittedError) {
    throw FinancialErrorException.of('dependency_unavailable', `Unable to update payment intent to submitted: ${updateSubmittedError.message}`, { correlationId });
  }

  return jsonResponse({
    payment: {
      intentId: intent.id,
      transactionHash: submitted.transactionHash,
    },
  }, 200, correlationId);
};

serveEdge((request) => handleEdgeRequest(request, submitPayment));

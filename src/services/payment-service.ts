import { supabase } from '@/lib/supabase';
import type { FinancialError, FinancialResult } from '@/types/errors';
import type {
    ObservedPaymentStatus,
    PaymentPrepareRequest,
    PaymentSubmitRequest,
    PreparedPayment,
    SubmittedPayment,
} from '@/types/payment';

/**
 * Client boundary for beneficiary-initiated merchant payments (cash rail) and
 * voucher redemptions (Soroban rail).
 *
 * The mobile app NEVER performs privileged institutional signing and NEVER turns
 * a submission into a confirmation (Requirements 18.4, 18.8). This service only:
 *   1. asks an Edge Function to prepare a payment — the server re-decodes and
 *      re-verifies the invoice canonically and revalidates merchant, program,
 *      nonce, balance, and expiry ONLINE (Requirements 10.6, 13.6) — and returns
 *      ONLY the exact beneficiary signing package;
 *   2. relays the beneficiary-signed exact transaction / auth entry for
 *      submission; and
 *   3. reads the reconciled attempt so the UI can observe pending → confirmed.
 *
 * No transaction hash or "success" is ever fabricated here; a failure is a typed
 * FinancialError and confirmation comes only from reconciliation
 * (Requirements 11.8, 21.1, 21.4).
 */

const PREPARE_FUNCTION = 'prepare-payment';
const SUBMIT_FUNCTION = 'submit-payment';

const unknownError = (message: string): FinancialError => ({
  code: 'dependency_unavailable',
  message,
  retryable: true,
  correlationId: 'client-unresolved',
});

const toFinancialError = (value: unknown, fallback: string): FinancialError => {
  if (value && typeof value === 'object') {
    const candidate = value as Partial<FinancialError> & { error?: Partial<FinancialError> };
    const source = candidate.error ?? candidate;
    if (typeof source.code === 'string' && typeof source.message === 'string') {
      return {
        code: source.code as FinancialError['code'],
        message: source.message,
        retryable: source.retryable ?? false,
        correlationId: source.correlationId ?? 'client-unresolved',
        fieldErrors: source.fieldErrors,
      };
    }
  }
  return unknownError(fallback);
};

/**
 * Prepares a payment on the server. The server persists an immutable intent,
 * revalidates everything online, and returns ONLY the exact signing package for
 * the single chosen funding source. A replayed invoice-bound key returns the
 * prior intent with no package so the caller reconciles instead of re-signing.
 * 
 * Retries with exponential backoff on 503 Service Unavailable errors to handle
 * edge function cold starts and network latency issues.
 */
export const preparePayment = async (
  request: PaymentPrepareRequest,
): Promise<FinancialResult<PreparedPayment>> => {
  console.log('[preparePayment] Starting payment preparation');
  console.log('[preparePayment] Invoice asset:', JSON.stringify(request.invoice.asset));
  console.log('[preparePayment] Invoice amount:', request.invoice.amountStroops);
  console.log('[preparePayment] Funding source:', request.fundingSourceKind, request.fundingSourceId);
  
  const MAX_RETRIES = 3;
  const INITIAL_DELAY_MS = 1000; // 1 second
  
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[preparePayment] Attempt ${attempt + 1}/${MAX_RETRIES + 1}: Invoking ${PREPARE_FUNCTION}`);
      const { data, error } = await supabase.functions.invoke<{
        payment?: PreparedPayment;
        error?: FinancialError;
      }>(PREPARE_FUNCTION, { body: request });

      // If we got a 503, retry with exponential backoff
      if (error?.context?.status === 503) {
        if (attempt < MAX_RETRIES) {
          const delayMs = INITIAL_DELAY_MS * Math.pow(2, attempt);
          console.log(`payment-service prepare-payment 503 error, retrying in ${delayMs}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
          continue;
        }
        // Max retries exhausted
        console.log('payment-service prepare-payment ERROR (max retries):', JSON.stringify(error, null, 2), error.context);
        return { ok: false, error: toFinancialError(error.context ?? error, 'Payment service timed out. Please try again.') };
      }

      // Non-503 error or success
      if (error) {
        console.log('payment-service prepare-payment ERROR:', JSON.stringify(error, null, 2));
        console.log('payment-service prepare-payment ERROR context:', JSON.stringify(error.context, null, 2));
        console.log('payment-service prepare-payment ERROR message:', error.message);
        return { ok: false, error: toFinancialError(error.context ?? error, error.message) };
      }
      
      console.log('[preparePayment] Response data:', JSON.stringify(data, null, 2));
      
      if (!data?.payment) {
        console.log('[preparePayment] No payment in response, error:', JSON.stringify(data?.error, null, 2));
        return { ok: false, error: toFinancialError(data?.error, 'The payment could not be prepared.') };
      }
      
      console.log('[preparePayment] Payment prepared successfully');
      return { ok: true, data: data.payment };
    } catch (err) {
      // Network or unexpected errors - retry if we have attempts left
      if (attempt < MAX_RETRIES) {
        const delayMs = INITIAL_DELAY_MS * Math.pow(2, attempt);
        console.log(`payment-service prepare-payment exception, retrying in ${delayMs}ms (attempt ${attempt + 1}/${MAX_RETRIES}):`, err);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        continue;
      }
      // Max retries exhausted
      return {
        ok: false,
        error: unknownError(err instanceof Error ? err.message : 'Payment service is unavailable.'),
      };
    }
  }
  
  // Should never reach here, but TypeScript needs this
  return {
    ok: false,
    error: unknownError('Payment service is unavailable.'),
  };
};

/**
 * Relays the beneficiary-signed exact transaction / auth entry for submission.
 * The server verifies the signature and network binding against the stored
 * intent, adds only the permitted sponsor signature, submits, and marks the
 * attempt `submitted`. The accepted response never implies settlement.
 */
export const submitPayment = async (
  request: PaymentSubmitRequest,
): Promise<FinancialResult<SubmittedPayment>> => {
  try {
    const { data, error } = await supabase.functions.invoke<{
      payment?: SubmittedPayment;
      error?: FinancialError;
    }>(SUBMIT_FUNCTION, { body: request });

    if (error) {
      return { ok: false, error: toFinancialError(error.context ?? error, error.message) };
    }
    if (!data?.payment) {
      return { ok: false, error: toFinancialError(data?.error, 'The payment could not be submitted.') };
    }
    return { ok: true, data: data.payment };
  } catch (err) {
    return {
      ok: false,
      error: unknownError(err instanceof Error ? err.message : 'Payment service is unavailable.'),
    };
  }
};

type AttemptStatus =
  | 'accepted' | 'submitted' | 'unknown' | 'observed_success' | 'observed_failure';

type AttemptRow = Readonly<{
  status: AttemptStatus;
  transaction_hash: string | null;
  error_code: string | null;
  error_detail: string | null;
  correlation_id: string;
  attempt_number: number;
}>;

/**
 * Observes the latest attempt for a payment intent from reconciled state under
 * RLS. Only an `observed_success` attempt with matching ledger evidence is
 * reported `confirmed`; anything in flight is `submitted`/`pending`, and a
 * failed read is `unavailable`. A submission response alone never satisfies
 * confirmation (Requirements 11.8, 18.8, 21.4).
 */
export const observePayment = async (
  intentId: string,
): Promise<ObservedPaymentStatus> => {
  console.log('[observePayment] Querying transaction_attempts for intent:', intentId);
  try {
    const { data, error } = await supabase
      .from('transaction_attempts')
      .select('status, transaction_hash, error_code, error_detail, correlation_id, attempt_number')
      .eq('financial_intent_id', intentId)
      .order('attempt_number', { ascending: false })
      .limit(1);

    if (error) {
      console.error('[observePayment] Query error:', error);
      throw error;
    }

    console.log('[observePayment] Query result:', JSON.stringify(data, null, 2));
    const latest = (data as AttemptRow[] | null)?.[0] ?? null;
    
    if (!latest) {
      console.log('[observePayment] No attempt found, returning pending');
      return { status: 'pending', intentId, transactionHash: null };
    }

    console.log('[observePayment] Latest attempt status:', latest.status);
    console.log('[observePayment] Latest attempt error_detail:', latest.error_detail);

    switch (latest.status) {
      case 'observed_success':
        // Confirmation requires real ledger evidence; without a hash we stay honest.
        return latest.transaction_hash
          ? { status: 'confirmed', intentId, transactionHash: latest.transaction_hash }
          : { status: 'submitted', intentId, transactionHash: null };
      case 'observed_failure':
        console.log('[observePayment] Returning failure with error_detail:', latest.error_detail);
        return {
          status: 'failed',
          intentId,
          error: {
            code: 'submission_rejected',
            message: latest.error_detail ?? 'The payment failed on-chain.',
            retryable: false,
            correlationId: latest.correlation_id,
          },
        };
      case 'submitted':
      case 'unknown':
        return { status: 'submitted', intentId, transactionHash: latest.transaction_hash };
      case 'accepted':
      default:
        return { status: 'pending', intentId, transactionHash: latest.transaction_hash };
    }
  } catch (err) {
    console.error('[observePayment] Exception:', err);
    return {
      status: 'unavailable',
      reason: err instanceof Error ? err.message : 'Payment status is unavailable.',
      retryable: true,
    };
  }
};

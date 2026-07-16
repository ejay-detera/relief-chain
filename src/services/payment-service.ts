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
 */
export const preparePayment = async (
  request: PaymentPrepareRequest,
): Promise<FinancialResult<PreparedPayment>> => {
  try {
    const { data, error } = await supabase.functions.invoke<{
      payment?: PreparedPayment;
      error?: FinancialError;
    }>(PREPARE_FUNCTION, { body: request });

    if (error) {
      return { ok: false, error: toFinancialError(error.context ?? error, error.message) };
    }
    if (!data?.payment) {
      return { ok: false, error: toFinancialError(data?.error, 'The payment could not be prepared.') };
    }
    return { ok: true, data: data.payment };
  } catch (err) {
    return {
      ok: false,
      error: unknownError(err instanceof Error ? err.message : 'Payment service is unavailable.'),
    };
  }
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
  try {
    const { data, error } = await supabase
      .from('transaction_attempts')
      .select('status, transaction_hash, error_code, error_detail, correlation_id, attempt_number')
      .eq('financial_intent_id', intentId)
      .order('attempt_number', { ascending: false })
      .limit(1);

    if (error) throw error;

    const latest = (data as AttemptRow[] | null)?.[0] ?? null;
    if (!latest) {
      return { status: 'pending', intentId, transactionHash: null };
    }

    switch (latest.status) {
      case 'observed_success':
        // Confirmation requires real ledger evidence; without a hash we stay honest.
        return latest.transaction_hash
          ? { status: 'confirmed', intentId, transactionHash: latest.transaction_hash }
          : { status: 'submitted', intentId, transactionHash: null };
      case 'observed_failure':
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
    return {
      status: 'unavailable',
      reason: err instanceof Error ? err.message : 'Payment status is unavailable.',
      retryable: true,
    };
  }
};

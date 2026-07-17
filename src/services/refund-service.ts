import { supabase } from '@/lib/supabase';
import { parseStroopAmount, type LedgerEvidence } from '@/types/blockchain';
import type { FinancialError, FinancialResult } from '@/types/errors';
import type {
    PreparedRefund,
    Refund,
    RefundableSettlement,
    RefundAuthorization,
    RefundRequestInput,
    RefundStatus,
} from '@/types/refund';
import { toFinancialError, unknownFinancialError } from '@/utils/financial-error';

/**
 * Client boundary for merchant-initiated refunds.
 *
 * A refund is a signed compensating transaction that references the original
 * payment; the immutable original settlement is never edited or deleted
 * (Requirements 15.1, 15.2). The mobile app never performs privileged signing or
 * turns a submission into a confirmation. This service:
 *   1. asks an Edge Function to prepare and persist an immutable refund intent
 *      (returning `requires_exception` when the program has expired — Req 15.5),
 *   2. relays the merchant's explicit authorization to start the refund, and
 *   3. reads the reconciled refund lifecycle so the UI observes real state.
 *
 * Cumulative-refund bounds (Requirement 15.4) are enforced authoritatively by the
 * contract/Edge Function; {@link refundExceedsBounds} only guards the client.
 */

const PREPARE_FUNCTION = 'prepare-refund';
const SUBMIT_FUNCTION = 'submit-refund';

/**
 * Client-side guard: a requested refund may not exceed what remains refundable on
 * the original settlement. Returns true when the amount is invalid so the UI can
 * explain the limit before relaying anything to the server.
 */
export const refundExceedsBounds = (
  settlement: RefundableSettlement,
  amountStroops: string,
): boolean => {
  const requested = BigInt(amountStroops);
  return requested <= 0n || requested > BigInt(settlement.remainingRefundableStroops);
};

/** Prepares a refund intent on the server and returns it awaiting authorization. */
export const prepareRefund = async (
  request: RefundRequestInput,
): Promise<FinancialResult<PreparedRefund>> => {
  try {
    const { data, error } = await supabase.functions.invoke<{
      refund?: PreparedRefund;
      error?: unknown;
    }>(PREPARE_FUNCTION, { body: request });

    if (error) {
      return { ok: false, error: toFinancialError(error.context ?? error, error.message) };
    }
    if (!data?.refund) {
      return { ok: false, error: toFinancialError(data?.error, 'Refund could not be prepared.') };
    }
    return { ok: true, data: normalizePrepared(data.refund) };
  } catch (err) {
    return {
      ok: false,
      error: unknownFinancialError(
        err instanceof Error ? err.message : 'Refund service is unavailable.',
      ),
    };
  }
};

/**
 * Relays an explicit merchant authorization that starts a prepared refund. The
 * response confirms the refund was accepted for processing, not that value
 * settled — only reconciliation transitions a refund to `confirmed`.
 */
export const authorizeRefund = async (
  authorization: RefundAuthorization,
): Promise<FinancialResult<PreparedRefund>> => {
  try {
    const { data, error } = await supabase.functions.invoke<{
      refund?: PreparedRefund;
      error?: unknown;
    }>(SUBMIT_FUNCTION, { body: authorization });

    if (error) {
      return { ok: false, error: toFinancialError(error.context ?? error, error.message) };
    }
    if (!data?.refund) {
      return { ok: false, error: toFinancialError(data?.error, 'Refund could not be authorized.') };
    }
    return { ok: true, data: normalizePrepared(data.refund) };
  } catch (err) {
    return {
      ok: false,
      error: unknownFinancialError(
        err instanceof Error ? err.message : 'Refund service is unavailable.',
      ),
    };
  }
};

type RefundRow = Readonly<{
  id: string;
  original_settlement_id: string;
  merchant_id: string;
  program_id: string | null;
  amount_stroops: number;
  status: RefundStatus;
  correlation_id: string;
  requested_at: string;
  exception_reason: string | null;
  transaction_hash: string | null;
  ledger: number | null;
  confirmed_at: string | null;
  failure_code: string | null;
}>;

const REFUND_SELECT =
  'id, original_settlement_id, merchant_id, program_id, amount_stroops, status, correlation_id, ' +
  'requested_at, exception_reason, transaction_hash, ledger, confirmed_at, failure_code';

const shortReference = (correlationId: string): string =>
  `RFN-${correlationId.replace(/-/g, '').slice(0, 8).toUpperCase()}`;

const mapRow = (row: RefundRow): Refund => {
  const base = {
    id: row.id,
    originalSettlementId: row.original_settlement_id,
    merchantId: row.merchant_id,
    programId: row.program_id,
    amountStroops: parseStroopAmount(row.amount_stroops),
    reference: shortReference(row.correlation_id),
    requestedAt: row.requested_at,
  };

  switch (row.status) {
    case 'confirmed': {
      const evidence: LedgerEvidence = {
        network: 'testnet',
        transactionHash: row.transaction_hash ?? '',
        ledgerSequence: row.ledger ?? 0,
        confirmedAt: row.confirmed_at ?? row.requested_at,
        correlationId: row.correlation_id,
      };
      return { ...base, status: 'confirmed', evidence };
    }
    case 'failed': {
      const error: FinancialError = {
        code: 'submission_rejected',
        message: 'The refund could not be settled.',
        retryable: false,
        correlationId: row.correlation_id,
      };
      return { ...base, status: 'failed', error };
    }
    case 'exception_required':
      return {
        ...base,
        status: 'exception_required',
        exceptionReason:
          row.exception_reason ?? 'Refund requested after program expiry; routed for exception review.',
      };
    default:
      return { ...base, status: row.status };
  }
};

/**
 * Reads reconciled refunds for the caller. RLS scopes rows to the merchant's
 * organization. Confirmed refunds surface verifiable ledger references; the
 * original settlements they reference remain unchanged (Requirement 15.1).
 */
export const fetchRefunds = async (): Promise<FinancialResult<readonly Refund[]>> => {
  try {
    const { data, error } = await supabase
      .from('refunds')
      .select(REFUND_SELECT)
      .order('requested_at', { ascending: false });

    if (error) throw error;
    return { ok: true, data: ((data ?? []) as unknown as RefundRow[]).map(mapRow) };
  } catch (err) {
    return {
      ok: false,
      error: unknownFinancialError(
        err instanceof Error ? err.message : 'Refund history is unavailable.',
      ),
    };
  }
};

const normalizePrepared = (refund: PreparedRefund): PreparedRefund => ({
  refundId: refund.refundId,
  originalSettlementId: refund.originalSettlementId,
  amountStroops: parseStroopAmount(refund.amountStroops),
  status: refund.status,
  requiresException: refund.requiresException ?? false,
});

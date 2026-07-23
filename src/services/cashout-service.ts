import { supabase } from '@/lib/supabase';
import { parseStroopAmount } from '@/types/blockchain';
import type { CashOutRequest, CashOutRequestInput, CashOutStatus } from '@/types/cashout';
import type { FinancialResult } from '@/types/errors';
import { toFinancialError, unknownFinancialError } from '@/utils/financial-error';

/**
 * Client boundary for the simulated partner cash-out.
 *
 * The pilot cash-out is SIMULATED: it never performs a real bank or e-wallet
 * transfer (Requirement 12.7) and never moves the settled on-chain RCPHP balance.
 * A `failed` cash-out therefore cannot reverse confirmed on-chain ownership
 * (Requirement 12.8). This service only:
 *   1. relays a non-privileged request to an Edge Function that resolves the
 *      authenticated actor, organization, and settlement wallet, and persists the
 *      request in `requested` state, and
 *   2. reads the reconciled cash-out lifecycle so the UI can observe
 *      requested → processing → completed | failed (Requirement 12.6).
 *
 * It never fabricates a `completed` result locally (Requirements 21.1, 21.4).
 */

const REQUEST_FUNCTION = 'request-cashout';

type CashOutRow = Readonly<{
  id: string;
  status: CashOutStatus;
  amount_stroops: number;
  asset_code: string;
  is_simulated: boolean;
  partner_request_reference: string | null;
  requested_at: string;
  processing_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
  failure_code: string | null;
  correlation_id: string;
}>;

const CASHOUT_SELECT =
  'id, status, amount_stroops, asset_code, is_simulated, partner_request_reference, ' +
  'requested_at, processing_at, completed_at, failed_at, failure_code, correlation_id';

const mapRow = (row: CashOutRow): CashOutRequest => ({
  id: row.id,
  status: row.status,
  amountStroops: parseStroopAmount(row.amount_stroops),
  assetCode: 'RCPHP',
  network: 'testnet',
  isSimulated: row.is_simulated,
  partnerReference: row.partner_request_reference,
  requestedAt: row.requested_at,
  processingAt: row.processing_at,
  completedAt: row.completed_at,
  failedAt: row.failed_at,
  failureCode: row.failure_code,
  correlationId: row.correlation_id,
});

/**
 * Relays a simulated cash-out request. The response is whatever the server
 * persisted — typically a `requested` record; the client never advances the
 * status itself. Failures return a typed error rather than an invented success.
 */
export const requestCashOut = async (
  input: CashOutRequestInput,
): Promise<FinancialResult<CashOutRequest>> => {
  try {
    const { data, error } = await supabase.functions.invoke<{
      cashout?: CashOutRow;
      error?: unknown;
    }>(REQUEST_FUNCTION, { body: input });

    if (error) {
      return { ok: false, error: toFinancialError(error.context ?? error, error.message) };
    }
    if (!data?.cashout) {
      return { ok: false, error: toFinancialError(data?.error, 'Cash-out could not be requested.') };
    }
    return { ok: true, data: mapRow(data.cashout) };
  } catch (err) {
    return {
      ok: false,
      error: unknownFinancialError(
        err instanceof Error ? err.message : 'Cash-out service is unavailable.',
      ),
    };
  }
};

/**
 * Reads the merchant's reconciled simulated cash-out requests. RLS scopes rows to
 * the caller's organization/merchant. This is the authoritative lifecycle read;
 * it is never derived from client state or timers.
 */
export const fetchCashOutRequests = async (): Promise<
  FinancialResult<readonly CashOutRequest[]>
> => {
  try {
    const { data, error } = await supabase
      .from('cashout_requests')
      .select(CASHOUT_SELECT)
      .order('requested_at', { ascending: false });

    if (error) throw error;
    return { ok: true, data: ((data ?? []) as unknown as CashOutRow[]).map(mapRow) };
  } catch (err) {
    return {
      ok: false,
      error: unknownFinancialError(
        err instanceof Error ? err.message : 'Cash-out history is unavailable.',
      ),
    };
  }
};

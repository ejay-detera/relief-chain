import type { FinancialError, FinancialResult } from '@/types/errors';
import type {
  MerchantSettlementCheckInput,
  MerchantSettlementCheckResult,
} from '@/types/merchant-settlement';

/**
 * Client boundary for the authorized merchant settlement check.
 *
 * The merchant Receive screen calls `reconcile-stellar` with the MERCHANT'S
 * OWN session (merchant-self passes the Edge authorization check). This
 * service only relays that call and maps the reconciler-owned response
 * honestly:
 *
 *   - confirmation comes ONLY from the reconciler's observed counts — zero
 *     means nothing confirmed yet, never a fabricated `confirmed`;
 *   - numerics fail closed (unsafe values return `validation_failed` rather
 *     than a coerced count);
 *   - transport failures stay typed `FinancialError`s, never successes.
 *
 * Dependency-injected `invoke` keeps this testable without a Supabase client
 * or network. The default wiring (merchant session) lives in
 * `use-merchant-settlement-check`, which passes `supabase.functions.invoke`.
 */

export type MerchantReconcileInvoke = (
  functionName: 'reconcile-stellar',
  options: Readonly<{ body: Readonly<{ merchantId: string; organizationId: string }> }>,
) => Promise<Readonly<{ data: unknown; error: unknown }>>;

type InvokeError = Readonly<{
  message?: unknown;
  context?: unknown;
}>;

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

/** Fail-closed count parsing: only safe non-negative integers pass. */
const toSafeCount = (value: unknown): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/**
 * Relays an authorized settlement check and maps the reconciler-owned result.
 * Never marks anything confirmed client-side.
 */
export const reconcileMerchantSettlement = async (
  input: MerchantSettlementCheckInput,
  invoke: MerchantReconcileInvoke,
): Promise<FinancialResult<MerchantSettlementCheckResult>> => {
  if (!input.merchantId || !input.organizationId) {
    return {
      ok: false,
      error: {
        code: 'validation_failed',
        message: 'A merchant and organization are required to check settlement status.',
        retryable: false,
        correlationId: 'client-unresolved',
      },
    };
  }

  let data: unknown;
  let error: unknown;
  try {
    const response = await invoke('reconcile-stellar', {
      body: { merchantId: input.merchantId, organizationId: input.organizationId },
    });
    data = response.data;
    error = response.error;
  } catch (caught: unknown) {
    const message = caught instanceof Error ? caught.message : 'Settlement check is unavailable.';
    return { ok: false, error: unknownError(message) };
  }

  if (error) {
    const invokeError = error as InvokeError;
    const context = isRecord(invokeError) ? invokeError.context : error;
    return {
      ok: false,
      error: toFinancialError(
        context ?? error,
        typeof invokeError.message === 'string' ? invokeError.message : 'Settlement check failed.',
      ),
    };
  }

  if (!isRecord(data)) {
    return { ok: false, error: unknownError('Settlement check returned no result.') };
  }

  const summary = isRecord(data.summary) ? data.summary : null;
  const counts = summary && isRecord(summary.counts) ? summary.counts : null;
  if (!summary || !counts) {
    return { ok: false, error: unknownError('Settlement check returned an unreadable result.') };
  }

  const confirmedCount = toSafeCount(counts.confirmedIntents);
  const failedCount = toSafeCount(counts.failedIntents);
  const observedCount = toSafeCount(counts.observedTransactions);
  if (confirmedCount === null || failedCount === null || observedCount === null) {
    return {
      ok: false,
      error: {
        code: 'validation_failed',
        message: 'Settlement check returned an unsafe count.',
        retryable: false,
        correlationId: 'client-unresolved',
      },
    };
  }

  return {
    ok: true,
    data: {
      checkedAt: new Date().toISOString(),
      confirmedCount,
      failedCount,
      observedCount,
      projectionWritten: data.merchantProjectionWritten === true,
      rawSummary: summary,
    },
  };
};

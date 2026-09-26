import type { DistributionJobStatus } from '../types/distribution';
import type {
  DistributionReconcileCheckInput,
  DistributionReconcileCheckResult,
} from '../types/distribution-reconcile';
import type { FinancialError, FinancialResult } from '../types/errors';

/**
 * Client boundary for the authorized LGU distribution reconcile check.
 *
 * The distribution observation screen calls `reconcile-stellar` with the LGU
 * user's OWN session (org role passes the Edge job-branch authorization
 * check). This service only relays that call and maps the reconciler-owned
 * response honestly:
 *
 *   - confirmation comes ONLY from the reconciler's observed job status and
 *     counts — zero means nothing confirmed yet, never a fabricated
 *     `confirmed`;
 *   - numerics fail closed (unsafe values return `validation_failed` rather
 *     than a coerced count);
 *   - transport failures stay typed `FinancialError`s, never successes.
 *
 * Dependency-injected `invoke` keeps this testable without a Supabase client
 * or network. The default wiring (LGU session) lives in
 * `use-distribution-reconcile-check`, which passes
 * `supabase.functions.invoke`. This module has no runtime imports, so the
 * transpiled output loads under plain node --test with no alias resolution.
 */

export type DistributionReconcileInvoke = (
  functionName: 'reconcile-stellar',
  options: Readonly<{ body: Readonly<{ jobId: string }> }>,
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

const JOB_STATUSES: ReadonlySet<string> = new Set([
  'draft',
  'validating',
  'awaiting_approval',
  'queued',
  'submitting',
  'reconciling',
  'completed',
  'partial_failed',
  'cancelled',
]);

/**
 * Relays an authorized distribution reconcile check and maps the
 * reconciler-owned job-branch result. Never marks anything confirmed
 * client-side.
 */
export const reconcileDistributionJob = async (
  input: DistributionReconcileCheckInput,
  invoke: DistributionReconcileInvoke,
): Promise<FinancialResult<DistributionReconcileCheckResult>> => {
  if (!input.jobId) {
    return {
      ok: false,
      error: {
        code: 'validation_failed',
        message: 'A distribution job is required to check distribution status.',
        retryable: false,
        correlationId: 'client-unresolved',
      },
    };
  }

  let data: unknown;
  let error: unknown;
  try {
    const response = await invoke('reconcile-stellar', {
      body: { jobId: input.jobId },
    });
    data = response.data;
    error = response.error;
  } catch (caught: unknown) {
    const message = caught instanceof Error ? caught.message : 'Distribution check is unavailable.';
    return { ok: false, error: unknownError(message) };
  }

  if (error) {
    const invokeError = error as InvokeError;
    const context = isRecord(invokeError) ? invokeError.context : error;
    return {
      ok: false,
      error: toFinancialError(
        context ?? error,
        typeof invokeError.message === 'string' ? invokeError.message : 'Distribution check failed.',
      ),
    };
  }

  if (!isRecord(data)) {
    return { ok: false, error: unknownError('Distribution check returned no result.') };
  }

  const counts = isRecord(data.counts) ? data.counts : null;
  const jobStatus = typeof data.jobStatus === 'string' ? data.jobStatus : '';
  if (!counts || !JOB_STATUSES.has(jobStatus)) {
    return { ok: false, error: unknownError('Distribution check returned an unreadable result.') };
  }

  const confirmedCount = toSafeCount(counts.confirmed);
  const failedCount = toSafeCount(counts.failed);
  const totalCount = toSafeCount(counts.total);
  if (confirmedCount === null || failedCount === null || totalCount === null) {
    return {
      ok: false,
      error: {
        code: 'validation_failed',
        message: 'Distribution check returned an unsafe count.',
        retryable: false,
        correlationId: 'client-unresolved',
      },
    };
  }

  const beneficiaryProjectionsWritten =
    typeof data.beneficiaryProjectionsWritten === 'number'
      ? toSafeCount(data.beneficiaryProjectionsWritten)
      : 0;
  if (beneficiaryProjectionsWritten === null) {
    return {
      ok: false,
      error: {
        code: 'validation_failed',
        message: 'Distribution check returned an unsafe count.',
        retryable: false,
        correlationId: 'client-unresolved',
      },
    };
  }

  return {
    ok: true,
    data: {
      checkedAt: new Date().toISOString(),
      jobStatus: jobStatus as DistributionJobStatus,
      confirmedCount,
      failedCount,
      totalCount,
      projectionWritten: data.projectionWritten === true,
      beneficiaryProjectionsWritten,
      rawResponse: data,
    },
  };
};

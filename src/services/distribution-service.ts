import { supabase } from '@/lib/supabase';
import { parseStroopAmount } from '@/types/blockchain';
import type {
    DistributionAuthorization,
    DistributionJobObservation,
    DistributionJobProjection,
    DistributionPrepareRequest,
    DistributionRecipientOutcome,
    DistributionRecipientStatus,
    DistributionRetryRequest,
    PreparedDistribution
} from '@/types/distribution';
import type { FinancialError, FinancialResult } from '@/types/errors';

/**
 * Client boundary for server-managed distribution jobs.
 *
 * The mobile app never performs privileged organization signing and never turns
 * a submission into a confirmation (Requirements 18.3, 18.4). This service only:
 *   1. asks an Edge Function to prepare and persist an immutable job intent,
 *   2. relays an explicit organization authorization to start the job, and
 *   3. reads the reconciled projection so the UI can observe recipient states.
 *
 * No transaction hash, ledger sequence, or "success" is ever fabricated here; a
 * failure is returned as a typed FinancialError (Requirements 21.1, 21.4).
 */

const PREPARE_FUNCTION = 'prepare-disbursement';
const SUBMIT_FUNCTION = 'submit-disbursement';

/**
 * Distinguishes a first authorization from a relayed retry on the shared submit
 * Edge Function. The server owns retry classification; the client only names the
 * intent (Requirement 8.6).
 */
const SUBMIT_MODE_AUTHORIZE = 'authorize' as const;
const SUBMIT_MODE_RETRY = 'retry' as const;

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

/** Prepares a distribution job on the server and returns the job awaiting authorization. */
export const prepareDistribution = async (
  request: DistributionPrepareRequest,
): Promise<FinancialResult<PreparedDistribution>> => {
  try {
    const { data, error } = await supabase.functions.invoke<{
      job?: PreparedDistribution;
      error?: FinancialError;
    }>(PREPARE_FUNCTION, { body: request });

    if (error) {
      return { ok: false, error: toFinancialError(error.context ?? error, error.message) };
    }
    if (!data?.job) {
      return { ok: false, error: toFinancialError(data?.error, 'Distribution could not be prepared.') };
    }
    return { ok: true, data: normalizePrepared(data.job) };
  } catch (err) {
    return {
      ok: false,
      error: unknownError(err instanceof Error ? err.message : 'Distribution service is unavailable.'),
    };
  }
};

/**
 * Relays an explicit authorization that starts a prepared job. The server
 * coordinates institutional signing and submission; the response only confirms
 * that the job was accepted for processing, not that any transfer settled.
 */
export const authorizeDistribution = async (
  authorization: DistributionAuthorization,
): Promise<FinancialResult<PreparedDistribution>> => {
  try {
    const { data, error } = await supabase.functions.invoke<{
      job?: PreparedDistribution;
      error?: FinancialError;
    }>(SUBMIT_FUNCTION, { body: { ...authorization, mode: SUBMIT_MODE_AUTHORIZE } });

    if (error) {
      return { ok: false, error: toFinancialError(error.context ?? error, error.message) };
    }
    if (!data?.job) {
      return { ok: false, error: toFinancialError(data?.error, 'Distribution could not be authorized.') };
    }
    return { ok: true, data: normalizePrepared(data.job) };
  } catch (err) {
    return {
      ok: false,
      error: unknownError(err instanceof Error ? err.message : 'Distribution service is unavailable.'),
    };
  }
};

/**
 * Relays a safe-retry request for a partially-failed job to the server. The
 * client is deliberately not the authority on retryability: it sends only the
 * job identity, and the server re-validates enrollment, wallet, budget, and
 * duplicate status, classifies which recipients are eligible, and retries only
 * unconfirmed or failed transfers under their existing deterministic
 * idempotency keys. Confirmed transfers are preserved and never duplicated, and
 * the accepted response never implies any transfer settled — confirmation still
 * comes only from reconciliation (Requirements 8.5, 8.6, 18.8, 21.4).
 */
export const retryDistribution = async (
  request: DistributionRetryRequest,
): Promise<FinancialResult<PreparedDistribution>> => {
  try {
    const { data, error } = await supabase.functions.invoke<{
      job?: PreparedDistribution;
      error?: FinancialError;
    }>(SUBMIT_FUNCTION, { body: { ...request, mode: SUBMIT_MODE_RETRY } });

    if (error) {
      return { ok: false, error: toFinancialError(error.context ?? error, error.message) };
    }
    if (!data?.job) {
      return { ok: false, error: toFinancialError(data?.error, 'Distribution could not be retried.') };
    }
    return { ok: true, data: normalizePrepared(data.job) };
  } catch (err) {
    return {
      ok: false,
      error: unknownError(err instanceof Error ? err.message : 'Distribution service is unavailable.'),
    };
  }
};

type JobProjectionRow = Readonly<{
  distribution_job_id: string;
  organization_id: string;
  program_id: string;
  status: DistributionJobProjection['status'];
  recipient_count: number;
  pending_count: number;
  submitted_count: number;
  confirmed_count: number;
  failed_count: number;
  cancelled_count: number;
  total_amount_stroops: number;
  confirmed_amount_stroops: number;
  failed_amount_stroops: number;
  confirmed_transaction_count: number;
  latest_transaction_hash: string | null;
  as_of_ledger: number;
  reconciled_at: string;
  is_stale: boolean;
  stale_since: string | null;
  is_quarantined: boolean;
  quarantine_issue_id: string | null;
}>;

type JobRow = Readonly<{
  id: string;
  organization_id: string;
  program_id: string;
  status: DistributionJobProjection['status'];
  recipient_count: number;
  pending_count: number;
  submitted_count: number;
  confirmed_count: number;
  failed_count: number;
  cancelled_count: number;
  total_amount_stroops: number;
}>;

/**
 * Observes a job. The reconciled projection is authoritative for confirmed
 * counts and ledger references; before reconciliation writes a row we fall back
 * to the authoritative workflow table for early lifecycle status only.
 */
export const observeDistributionJob = async (
  jobId: string,
): Promise<DistributionJobObservation> => {
  try {
    const projection = await supabase
      .from('distribution_job_projection')
      .select(
        'distribution_job_id, organization_id, program_id, status, recipient_count, pending_count, submitted_count, confirmed_count, failed_count, cancelled_count, total_amount_stroops, confirmed_amount_stroops, failed_amount_stroops, confirmed_transaction_count, latest_transaction_hash, as_of_ledger, reconciled_at, is_stale, stale_since, is_quarantined, quarantine_issue_id',
      )
      .eq('distribution_job_id', jobId)
      .maybeSingle();

    if (projection.error) throw projection.error;
    if (projection.data) {
      const row = projection.data as JobProjectionRow;
      return {
        status: 'observed',
        job: mapProjection(row),
        reconciliation: {
          asOfLedger: row.as_of_ledger,
          reconciledAt: row.reconciled_at,
          isStale: row.is_stale,
          staleSince: row.stale_since,
          isQuarantined: row.is_quarantined,
          quarantineIssueId: row.quarantine_issue_id,
        },
      };
    }

    const job = await supabase
      .from('distribution_jobs')
      .select(
        'id, organization_id, program_id, status, recipient_count, pending_count, submitted_count, confirmed_count, failed_count, cancelled_count, total_amount_stroops',
      )
      .eq('id', jobId)
      .maybeSingle();

    if (job.error) throw job.error;
    if (!job.data) return { status: 'empty' };

    return { status: 'observed', job: mapWorkflowJob(job.data as JobRow), reconciliation: null };
  } catch (err) {
    return {
      status: 'unavailable',
      reason: err instanceof Error ? err.message : 'Distribution status is unavailable.',
      retryable: true,
    };
  }
};

type RecipientRow = Readonly<{
  id: string;
  correlation_id: string;
  amount_stroops: number;
  status: DistributionRecipientStatus;
  transaction_hash: string | null;
  confirmed_ledger: number | null;
  failure_code: string | null;
  failure_reason: string | null;
}>;

/**
 * Reads PII-safe recipient outcomes for a job. Recipients are referenced only by
 * a short pseudonymous correlation reference; no names, government IDs, or
 * identity-to-wallet mappings are surfaced (Requirements 8.8, 19.1).
 */
export const fetchRecipientOutcomes = async (
  jobId: string,
): Promise<FinancialResult<readonly DistributionRecipientOutcome[]>> => {
  try {
    const { data, error } = await supabase
      .from('distribution_recipients')
      .select(
        'id, correlation_id, amount_stroops, status, transaction_hash, confirmed_ledger, failure_code, failure_reason',
      )
      .eq('distribution_job_id', jobId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return { ok: true, data: (data as RecipientRow[] | null ?? []).map(mapRecipient) };
  } catch (err) {
    return {
      ok: false,
      error: unknownError(err instanceof Error ? err.message : 'Recipient outcomes are unavailable.'),
    };
  }
};

/**
 * Advisory hint mirroring the server's failure classification so the UI can
 * distinguish "safe to retry" from "needs review" without a round trip. It is
 * NOT the authority: an actual retry always relays to the server, which
 * re-classifies eligibility and dedupes by idempotency key before resending
 * anything (see {@link retryDistribution}). These codes are the transient,
 * non-terminal classes the resumable engine can safely re-attempt.
 */
const RETRYABLE_FAILURE_CODES: ReadonlySet<string> = new Set([
  'submission_unknown',
  'dependency_unavailable',
  'sponsor_unavailable',
  'reconciliation_failed',
]);

const shortReference = (correlationId: string): string =>
  `RCP-${correlationId.replace(/-/g, '').slice(0, 8).toUpperCase()}`;

const mapRecipient = (row: RecipientRow): DistributionRecipientOutcome => ({
  id: row.id,
  reference: shortReference(row.correlation_id),
  amountStroops: parseStroopAmount(row.amount_stroops),
  status: row.status,
  transactionHash: row.transaction_hash,
  confirmedLedger: row.confirmed_ledger,
  failureCode: row.failure_code,
  failureReason: row.failure_reason,
  safeToRetry: row.status === 'failed' && row.failure_code !== null
    && RETRYABLE_FAILURE_CODES.has(row.failure_code),
});

const mapProjection = (row: JobProjectionRow): DistributionJobProjection => ({
  distributionJobId: row.distribution_job_id,
  organizationId: row.organization_id,
  programId: row.program_id,
  status: row.status,
  recipientCount: row.recipient_count,
  pendingCount: row.pending_count,
  submittedCount: row.submitted_count,
  confirmedCount: row.confirmed_count,
  failedCount: row.failed_count,
  cancelledCount: row.cancelled_count,
  totalAmountStroops: parseStroopAmount(row.total_amount_stroops),
  confirmedAmountStroops: parseStroopAmount(row.confirmed_amount_stroops),
  failedAmountStroops: parseStroopAmount(row.failed_amount_stroops),
  confirmedTransactionCount: row.confirmed_transaction_count,
  latestTransactionHash: row.latest_transaction_hash,
});

const mapWorkflowJob = (row: JobRow): DistributionJobProjection => ({
  distributionJobId: row.id,
  organizationId: row.organization_id,
  programId: row.program_id,
  status: row.status,
  recipientCount: row.recipient_count,
  pendingCount: row.pending_count,
  submittedCount: row.submitted_count,
  confirmedCount: row.confirmed_count,
  failedCount: row.failed_count,
  cancelledCount: row.cancelled_count,
  totalAmountStroops: parseStroopAmount(row.total_amount_stroops),
  confirmedAmountStroops: parseStroopAmount(0),
  failedAmountStroops: parseStroopAmount(0),
  confirmedTransactionCount: 0,
  latestTransactionHash: null,
});

const normalizePrepared = (job: PreparedDistribution): PreparedDistribution => ({
  jobId: job.jobId,
  programId: job.programId,
  recipientCount: job.recipientCount,
  totalAmountStroops: parseStroopAmount(job.totalAmountStroops),
  status: job.status,
});

import { supabase } from '@/lib/supabase';
import type { DistributionJobStatus } from '@/types/distribution';

export interface Disbursement {
  id: string;
  programId: string;
  programName: string;
  disasterEvent: string;
  amount: number;
  recipientsCount: number;
  date: string;
  txHash: string;
  status: DistributionJobStatus;
  confirmedCount: number;
  failedCount: number;
}

/** Stellar classic assets (including the RCPHP test asset) use 7 decimal places. */
const STROOPS_PER_PESO = 10_000_000;

type JobHistoryRow = Readonly<{
  id: string;
  program_id: string;
  status: DistributionJobStatus;
  recipient_count: number;
  confirmed_count: number;
  failed_count: number;
  total_amount_stroops: number;
  created_at: string;
  programs: Readonly<{ name: string; disaster_event: string | null }> | null;
  distribution_job_projection: Readonly<{ latest_transaction_hash: string | null }> | null;
}>;

/**
 * Maps one reconciled workflow row to the history list model. Fails closed on
 * numerics: a non-integer or unsafe stroop/count value throws rather than
 * rendering a coerced amount (financial rule).
 */
export const mapDistributionJobRow = (row: JobHistoryRow): Disbursement => {
  if (!Number.isSafeInteger(row.total_amount_stroops) || row.total_amount_stroops < 0) {
    throw new Error('Invalid distribution amount in history row.');
  }
  if (!Number.isSafeInteger(row.recipient_count) || row.recipient_count < 0) {
    throw new Error('Invalid recipient count in history row.');
  }
  const confirmed = Number.isSafeInteger(row.confirmed_count) && row.confirmed_count >= 0
    ? row.confirmed_count
    : 0;
  const failed = Number.isSafeInteger(row.failed_count) && row.failed_count >= 0
    ? row.failed_count
    : 0;
  return {
    id: row.id,
    programId: row.program_id,
    programName: row.programs?.name ?? 'Unknown program',
    disasterEvent: row.programs?.disaster_event ?? 'General Calamity',
    amount: row.total_amount_stroops / STROOPS_PER_PESO,
    recipientsCount: row.recipient_count,
    date: new Date(row.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
    txHash: row.distribution_job_projection?.latest_transaction_hash ?? '',
    status: row.status,
    confirmedCount: confirmed,
    failedCount: failed,
  };
};

/**
 * Reads the LGU disbursement history from the authoritative workflow table.
 *
 * The legacy `disbursements` table is never written by the current
 * prepare/submit flow (which persists `distribution_jobs` +
 * `distribution_recipients`), so reading it always renders an empty history.
 * This reads `distribution_jobs` with its program join and the reconciled
 * projection hash instead. RLS (`Organization members can view distribution
 * jobs`) scopes rows to the caller's organization; no status allowlist is
 * applied so `reconciling` and `partial_failed` jobs remain visible.
 */
export const fetchDisbursements = async (): Promise<Disbursement[]> => {
  const { data, error } = await supabase
    .from('distribution_jobs')
    .select(
      'id, program_id, status, recipient_count, confirmed_count, failed_count, total_amount_stroops, created_at, programs(name, disaster_event), distribution_job_projection(latest_transaction_hash)',
    )
    .order('created_at', { ascending: false });

  if (error) throw error;

  return ((data ?? []) as unknown as readonly JobHistoryRow[]).map(mapDistributionJobRow);
};

import { useCallback, useEffect, useRef, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { parseStroopAmount } from '@/types/blockchain';
import type {
    BalanceAidType,
    DistributionJobSummary,
    ProgramFinancialSummary,
    ProjectionState,
} from '@/types/projection';
import { buildProjectionState, type ProjectionRowMeta } from '@/utils/projection-state';

type ProgramRow = ProjectionRowMeta &
  Readonly<{
    program_id: string;
    aid_type: BalanceAidType;
    program_status: string;
    funding_status: string;
    budget_stroops: number;
    funded_stroops: number;
    distributed_stroops: number;
    redeemed_stroops: number;
    refunded_stroops: number;
    returned_stroops: number;
    escrow_balance_stroops: number;
    contract_id: string | null;
    latest_transaction_hash: string | null;
  }>;

type JobRow = ProjectionRowMeta &
  Readonly<{
    distribution_job_id: string;
    program_id: string;
    status: string;
    total_amount_stroops: number;
    confirmed_amount_stroops: number;
    failed_amount_stroops: number;
    recipient_count: number;
    pending_count: number;
    submitted_count: number;
    confirmed_count: number;
    failed_count: number;
    cancelled_count: number;
    latest_transaction_hash: string | null;
  }>;

const PROGRAM_SELECT =
  'program_id, aid_type, program_status, funding_status, budget_stroops, funded_stroops, ' +
  'distributed_stroops, redeemed_stroops, refunded_stroops, returned_stroops, escrow_balance_stroops, ' +
  'contract_id, latest_transaction_hash, reconciled_at, as_of_ledger, is_stale, is_quarantined, quarantine_issue_id';

const JOB_SELECT =
  'distribution_job_id, program_id, status, total_amount_stroops, confirmed_amount_stroops, ' +
  'failed_amount_stroops, recipient_count, pending_count, submitted_count, confirmed_count, ' +
  'failed_count, cancelled_count, latest_transaction_hash, reconciled_at, as_of_ledger, ' +
  'is_stale, is_quarantined, quarantine_issue_id';

const toProgramSummary = (row: ProgramRow): ProgramFinancialSummary => ({
  programId: row.program_id,
  aidType: row.aid_type,
  programStatus: row.program_status,
  fundingStatus: row.funding_status,
  budgetStroops: parseStroopAmount(row.budget_stroops),
  fundedStroops: parseStroopAmount(row.funded_stroops),
  distributedStroops: parseStroopAmount(row.distributed_stroops),
  redeemedStroops: parseStroopAmount(row.redeemed_stroops),
  refundedStroops: parseStroopAmount(row.refunded_stroops),
  returnedStroops: parseStroopAmount(row.returned_stroops),
  escrowBalanceStroops: parseStroopAmount(row.escrow_balance_stroops),
  contractId: row.contract_id,
  latestTransactionHash: row.latest_transaction_hash,
  assetCode: 'RCPHP',
  network: 'testnet',
});

const toJobSummary = (row: JobRow): DistributionJobSummary => ({
  distributionJobId: row.distribution_job_id,
  programId: row.program_id,
  status: row.status,
  totalAmountStroops: parseStroopAmount(row.total_amount_stroops),
  confirmedAmountStroops: parseStroopAmount(row.confirmed_amount_stroops),
  failedAmountStroops: parseStroopAmount(row.failed_amount_stroops),
  recipientCount: row.recipient_count,
  pendingCount: row.pending_count,
  submittedCount: row.submitted_count,
  confirmedCount: row.confirmed_count,
  failedCount: row.failed_count,
  cancelledCount: row.cancelled_count,
  latestTransactionHash: row.latest_transaction_hash,
});

export type OrganizationFinancialsHook = Readonly<{
  programs: ProjectionState<ProgramFinancialSummary[]>;
  jobs: ProjectionState<DistributionJobSummary[]>;
  refresh: () => Promise<void>;
}>;

const unavailable = (err: unknown, subject: string): ProjectionState<never[]> => ({
  status: 'unavailable',
  reason: err instanceof Error ? err.message : `${subject} are unavailable.`,
  retryable: true,
});

/**
 * Reads the organization's reconciled program financials and distribution-job
 * status from `program_financial_projection` and `distribution_job_projection`.
 * RLS scopes rows to the caller's organization membership. Dashboards are served
 * from these indexed projections rather than synchronous ledger scans, and a
 * failed read surfaces `unavailable` rather than a fabricated metric
 * (Requirements 18.1, 18.2, 19.3, 21.2, 22.3).
 */
export function useOrganizationFinancials(): OrganizationFinancialsHook {
  const [programs, setPrograms] = useState<ProjectionState<ProgramFinancialSummary[]>>({ status: 'loading' });
  const [jobs, setJobs] = useState<ProjectionState<DistributionJobSummary[]>>({ status: 'loading' });
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    setPrograms({ status: 'loading' });
    setJobs({ status: 'loading' });

    const [programResult, jobResult] = await Promise.allSettled([
      supabase.from('program_financial_projection').select(PROGRAM_SELECT).order('reconciled_at', { ascending: false }),
      supabase.from('distribution_job_projection').select(JOB_SELECT).order('reconciled_at', { ascending: false }),
    ]);

    if (request !== requestRef.current) return;

    if (programResult.status === 'fulfilled' && !programResult.value.error) {
      const rows = (programResult.value.data ?? []) as unknown as ProgramRow[];
      setPrograms(buildProjectionState(rows, (r) => r.map(toProgramSummary)));
    } else {
      const reason = programResult.status === 'rejected' ? programResult.reason : programResult.value.error;
      setPrograms(unavailable(reason, 'Program financials'));
    }

    if (jobResult.status === 'fulfilled' && !jobResult.value.error) {
      const rows = (jobResult.value.data ?? []) as unknown as JobRow[];
      setJobs(buildProjectionState(rows, (r) => r.map(toJobSummary)));
    } else {
      const reason = jobResult.status === 'rejected' ? jobResult.reason : jobResult.value.error;
      setJobs(unavailable(reason, 'Distribution jobs'));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { programs, jobs, refresh: load };
}

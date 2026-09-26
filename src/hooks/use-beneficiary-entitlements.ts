import { useCallback, useEffect, useRef, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { parseStroopAmount } from '@/types/blockchain';
import type {
    BalanceAidType,
    BeneficiaryProgramEntitlement,
    ProjectionState,
} from '@/types/projection';
import { buildProjectionState, type ProjectionRowMeta } from '@/utils/projection-state';

type ProgramRef = Readonly<{ name: string | null; purpose: string | null }>;

type EntitlementRow = ProjectionRowMeta &
  Readonly<{
    program_id: string;
    aid_type: BalanceAidType;
    available_balance_stroops: number;
    allocated_stroops: number;
    distributed_stroops: number;
    redeemed_stroops: number;
    refunded_stroops: number;
    confirmed_transaction_count: number;
    latest_transaction_hash: string | null;
    asset_code: string;
    is_abandoned: boolean | null;
    abandonment_note: string | null;
    abandonment_evidence_ref: string | null;
    abandoned_at: string | null;
    program: ProgramRef | ProgramRef[] | null;
  }>;

const SELECT =
  'program_id, aid_type, available_balance_stroops, allocated_stroops, distributed_stroops, ' +
  'redeemed_stroops, refunded_stroops, confirmed_transaction_count, latest_transaction_hash, ' +
  'asset_code, reconciled_at, as_of_ledger, is_stale, is_quarantined, quarantine_issue_id, ' +
  'is_abandoned, abandonment_note, abandonment_evidence_ref, abandoned_at, ' +
  'program:programs ( name, purpose )';

const isAbandonedRow = (row: EntitlementRow): boolean =>
  row.is_abandoned === true &&
  typeof row.abandonment_note === 'string' &&
  row.abandonment_note.trim().length > 0;

const programName = (program: EntitlementRow['program']): ProgramRef => {
  if (Array.isArray(program)) return program[0] ?? { name: null, purpose: null };
  return program ?? { name: null, purpose: null };
};

const toEntitlement = (row: EntitlementRow): BeneficiaryProgramEntitlement => {
  const ref = programName(row.program);
  const abandonmentNote = typeof row.abandonment_note === 'string' ? row.abandonment_note : null;
  return {
    programId: row.program_id,
    programName: ref.name ?? 'Program',
    purpose: ref.purpose,
    aidType: row.aid_type,
    availableStroops: parseStroopAmount(row.available_balance_stroops),
    allocatedStroops: parseStroopAmount(row.allocated_stroops),
    distributedStroops: parseStroopAmount(row.distributed_stroops),
    redeemedStroops: parseStroopAmount(row.redeemed_stroops),
    refundedStroops: parseStroopAmount(row.refunded_stroops),
    confirmedTransactionCount: row.confirmed_transaction_count,
    latestTransactionHash: row.latest_transaction_hash,
    assetCode: 'RCPHP',
    network: 'testnet',
    isAbandoned: row.is_abandoned === true && abandonmentNote !== null && abandonmentNote.trim().length > 0,
    abandonmentNote,
    abandonmentEvidenceRef:
      typeof row.abandonment_evidence_ref === 'string' ? row.abandonment_evidence_ref : null,
    abandonedAt: typeof row.abandoned_at === 'string' ? row.abandoned_at : null,
  };
};

export type BeneficiaryEntitlementsHook = Readonly<{
  entitlements: ProjectionState<BeneficiaryProgramEntitlement[]>;
  abandoned: readonly BeneficiaryProgramEntitlement[];
  refresh: () => Promise<void>;
}>;

/**
 * Reads the beneficiary's reconciled per-program entitlements from the indexed
 * `beneficiary_balance_projection`. RLS scopes rows to the signed-in beneficiary.
 * Money is never read from `enrollments`; a failed read surfaces `unavailable`
 * rather than a fabricated balance (Requirements 18.1, 18.2, 21.1, 21.2, 21.3).
 */
export function useBeneficiaryEntitlements(): BeneficiaryEntitlementsHook {
  const [entitlements, setEntitlements] = useState<
    ProjectionState<BeneficiaryProgramEntitlement[]>
  >({ status: 'loading' });
  const [abandoned, setAbandoned] = useState<readonly BeneficiaryProgramEntitlement[]>([]);
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    setEntitlements({ status: 'loading' });
    try {
      const { data, error } = await supabase
        .from('beneficiary_balance_projection')
        .select(SELECT)
        .order('reconciled_at', { ascending: false });

      if (error) throw error;
      if (request !== requestRef.current) return;

      const rows = (data ?? []) as unknown as EntitlementRow[];
      // Spendable rows drive the summary and trust state; abandoned rows are
      // preserved separately for the greyed history section and never summed.
      const spendableRows = rows.filter((row) => !isAbandonedRow(row));
      const abandonedRows = rows.filter(isAbandonedRow);
      setEntitlements(buildProjectionState(spendableRows, (r) => r.map(toEntitlement)));
      setAbandoned(abandonedRows.map(toEntitlement));
    } catch (err: unknown) {
      if (request !== requestRef.current) return;
      setEntitlements({
        status: 'unavailable',
        reason: err instanceof Error ? err.message : 'Assistance balances are unavailable.',
        retryable: true,
      });
    }
  }, []);

  // Mount fetch is intentional: initial state is already `loading`.
  // Matches the existing hook pattern.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  return { entitlements, abandoned, refresh: load };
}

/** Finds the reconciled entitlement for a program, if one has been reconciled. */
export const entitlementForProgram = (
  state: ProjectionState<BeneficiaryProgramEntitlement[]>,
  programId: string,
): BeneficiaryProgramEntitlement | null => {
  if (state.status !== 'current' && state.status !== 'stale' && state.status !== 'quarantined') {
    return null;
  }
  const list = state.status === 'quarantined' ? state.data : state.data;
  if (!list) return null;
  return list.find((item) => item.programId === programId) ?? null;
};

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
    program: ProgramRef | ProgramRef[] | null;
  }>;

const SELECT =
  'program_id, aid_type, available_balance_stroops, allocated_stroops, distributed_stroops, ' +
  'redeemed_stroops, refunded_stroops, confirmed_transaction_count, latest_transaction_hash, ' +
  'asset_code, reconciled_at, as_of_ledger, is_stale, is_quarantined, quarantine_issue_id, ' +
  'program:programs ( name, purpose )';

const programName = (program: EntitlementRow['program']): ProgramRef => {
  if (Array.isArray(program)) return program[0] ?? { name: null, purpose: null };
  return program ?? { name: null, purpose: null };
};

const toEntitlement = (row: EntitlementRow): BeneficiaryProgramEntitlement => {
  const ref = programName(row.program);
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
  };
};

export type BeneficiaryEntitlementsHook = Readonly<{
  entitlements: ProjectionState<BeneficiaryProgramEntitlement[]>;
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
      setEntitlements(buildProjectionState(rows, (r) => r.map(toEntitlement)));
    } catch (err: unknown) {
      if (request !== requestRef.current) return;
      setEntitlements({
        status: 'unavailable',
        reason: err instanceof Error ? err.message : 'Assistance balances are unavailable.',
        retryable: true,
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { entitlements, refresh: load };
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

import { useCallback, useEffect, useRef, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { fetchLiveRCPHPBalance } from '@/services/stellar-account-balance-service';
import { parseStroopAmount, type StroopAmount } from '@/types/blockchain';
import type { LiveBalanceState, PilotBalanceSummary, ProjectionState } from '@/types/projection';
import { addStroops, ZERO_STROOPS } from '@/utils/format-stroops';

type ProjectionRow = Readonly<{
  program_id: string;
  aid_type: 'cash' | 'voucher';
  available_balance_stroops: number;
  distributed_stroops: number;
  redeemed_stroops: number;
  refunded_stroops: number;
  confirmed_transaction_count: number;
  reconciled_at: string;
  as_of_ledger: number;
  is_stale: boolean;
  is_quarantined: boolean;
  quarantine_issue_id: string | null;
  is_abandoned: boolean | null;
  abandonment_note: string | null;
  abandonment_evidence_ref: string | null;
  abandoned_at: string | null;
}>;

export type AbandonedBalanceRow = Readonly<{
  programId: string;
  aidType: 'cash' | 'voucher';
  availableStroops: StroopAmount;
  distributedStroops: StroopAmount;
  redeemedStroops: StroopAmount;
  refundedStroops: StroopAmount;
  abandonmentNote: string;
  abandonmentEvidenceRef: string | null;
  abandonedAt: string | null;
}>;

export type BeneficiaryBalancesHook = Readonly<{
  balance: ProjectionState<PilotBalanceSummary>;
  liveBalance: LiveBalanceState;
  abandoned: readonly AbandonedBalanceRow[];
  refresh: () => Promise<void>;
}>;

const isAbandoned = (row: ProjectionRow): boolean =>
  row.is_abandoned === true &&
  typeof row.abandonment_note === 'string' &&
  row.abandonment_note.trim().length > 0;

const toAbandonedRow = (row: ProjectionRow): AbandonedBalanceRow => ({
  programId: row.program_id,
  aidType: row.aid_type,
  availableStroops: parseStroopAmount(row.available_balance_stroops),
  distributedStroops: parseStroopAmount(row.distributed_stroops),
  redeemedStroops: parseStroopAmount(row.redeemed_stroops),
  refundedStroops: parseStroopAmount(row.refunded_stroops),
  abandonmentNote: row.abandonment_note ?? '',
  abandonmentEvidenceRef: row.abandonment_evidence_ref,
  abandonedAt: row.abandoned_at,
});

const summarize = (rows: readonly ProjectionRow[]): PilotBalanceSummary => {
  let cash: StroopAmount = ZERO_STROOPS;
  let voucher: StroopAmount = ZERO_STROOPS;
  let confirmed = 0;
  for (const row of rows) {
    if (isAbandoned(row)) continue;
    const available = parseStroopAmount(row.available_balance_stroops);
    if (row.aid_type === 'cash') cash = addStroops(cash, available);
    else voucher = addStroops(voucher, available);
    confirmed += row.confirmed_transaction_count;
  }
  return {
    cashAvailableStroops: cash,
    voucherAvailableStroops: voucher,
    assetCode: 'RCPHP',
    network: 'testnet',
    confirmedTransactionCount: confirmed,
  };
};

/** Oldest reconciliation across rows drives the freshness the user is shown. */
const oldest = (rows: readonly ProjectionRow[]): ProjectionRow =>
  rows.reduce((acc, row) => (row.reconciled_at < acc.reconciled_at ? row : acc), rows[0]);

const toProjectionState = (rows: readonly ProjectionRow[]): ProjectionState<PilotBalanceSummary> => {
  if (rows.length === 0) {
    return { status: 'empty', checkedAt: new Date().toISOString() };
  }

  // Spendable rows drive sums and trust state; abandoned rows are dispositioned
  // history and never quarantine or stale the spendable summary.
  const spendable = rows.filter((row) => !isAbandoned(row));
  const summary = summarize(rows);
  const reference = oldest(spendable.length > 0 ? spendable : rows);
  const metadata = { asOfLedger: reference.as_of_ledger, reconciledAt: reference.reconciled_at };

  const quarantined = spendable.find((row) => row.is_quarantined);
  if (quarantined) {
    return {
      status: 'quarantined',
      data: summary,
      metadata,
      issueId: quarantined.quarantine_issue_id ?? 'unknown',
      reason: 'A reconciliation mismatch is under operator review.',
    };
  }

  if (spendable.some((row) => row.is_stale)) {
    return {
      status: 'stale',
      data: summary,
      metadata,
      reason: 'Showing the last reconciled balance while new ledger data is pending.',
    };
  }

  return { status: 'current', data: summary, metadata };
};

/**
 * Reads the beneficiary's reconciled RCPHP cash and voucher balances from the
 * indexed projection. RLS scopes rows to the signed-in beneficiary. A failure is
 * surfaced as `unavailable`; it is never converted into a populated success
 * (Requirements 18.1, 21.2, 21.3, 21.4).
 *
 * When the active verified wallet address is supplied, refresh also fetches
 * the live on-chain RCPHP balance for that wallet (read-only Horizon GET, no
 * secrets, no signing). The live figure complements the reconciled summary —
 * the two are exposed separately and never merged. The live fetch runs only
 * on explicit refresh/mount with in-flight dedupe via `requestRef`; there is
 * no polling loop.
 */
export function useBeneficiaryBalances(walletAddress?: string | null): BeneficiaryBalancesHook {
  const [balance, setBalance] = useState<ProjectionState<PilotBalanceSummary>>({ status: 'loading' });
  const [liveBalance, setLiveBalance] = useState<LiveBalanceState>({ status: 'idle' });
  const [abandoned, setAbandoned] = useState<readonly AbandonedBalanceRow[]>([]);
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    const address = walletAddress && walletAddress.trim().length > 0 ? walletAddress : null;
    setBalance({ status: 'loading' });
    setLiveBalance(address ? { status: 'loading' } : { status: 'idle' });

    const loadProjection = async (): Promise<void> => {
      try {
        const { data, error } = await supabase
          .from('beneficiary_balance_projection')
          .select(
            'program_id, aid_type, available_balance_stroops, distributed_stroops, redeemed_stroops, refunded_stroops, confirmed_transaction_count, reconciled_at, as_of_ledger, is_stale, is_quarantined, quarantine_issue_id, is_abandoned, abandonment_note, abandonment_evidence_ref, abandoned_at',
          )
          .order('reconciled_at', { ascending: false });

        if (error) throw error;
        if (request !== requestRef.current) return;

        const rows = (data ?? []) as ProjectionRow[];
        setBalance(toProjectionState(rows));
        setAbandoned(rows.filter(isAbandoned).map(toAbandonedRow));
      } catch (err: unknown) {
        if (request !== requestRef.current) return;
        setBalance({
          status: 'unavailable',
          reason: err instanceof Error ? err.message : 'Balance service is unavailable.',
          retryable: true,
        });
      }
    };

    const loadLive = async (): Promise<void> => {
      if (!address) return;
      try {
        const result = await fetchLiveRCPHPBalance(address);
        if (request !== requestRef.current) return;
        if (result.ok) {
          setLiveBalance({ status: 'live', data: result.data });
        } else {
          setLiveBalance({
            status: 'unavailable',
            reason: result.error.message,
            retryable: result.error.retryable,
            checkedAt: new Date().toISOString(),
          });
        }
      } catch (err: unknown) {
        if (request !== requestRef.current) return;
        setLiveBalance({
          status: 'unavailable',
          reason: err instanceof Error ? err.message : 'Live balance is unavailable.',
          retryable: true,
          checkedAt: new Date().toISOString(),
        });
      }
    };

    await Promise.all([loadProjection(), loadLive()]);
  }, [walletAddress]);

  // Mount fetch is intentional: initial state is already `loading`, and `load`
  // revalidates on wallet change. Matches the existing hook pattern.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  return { balance, liveBalance, abandoned, refresh: load };
}

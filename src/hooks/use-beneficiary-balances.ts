import { useCallback, useEffect, useRef, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { parseStroopAmount, type StroopAmount } from '@/types/blockchain';
import type { PilotBalanceSummary, ProjectionState } from '@/types/projection';
import { addStroops, ZERO_STROOPS } from '@/utils/format-stroops';

type ProjectionRow = Readonly<{
  aid_type: 'cash' | 'voucher';
  available_balance_stroops: number;
  confirmed_transaction_count: number;
  reconciled_at: string;
  as_of_ledger: number;
  is_stale: boolean;
  is_quarantined: boolean;
  quarantine_issue_id: string | null;
}>;

export type BeneficiaryBalancesHook = Readonly<{
  balance: ProjectionState<PilotBalanceSummary>;
  refresh: () => Promise<void>;
}>;

const summarize = (rows: readonly ProjectionRow[]): PilotBalanceSummary => {
  let cash: StroopAmount = ZERO_STROOPS;
  let voucher: StroopAmount = ZERO_STROOPS;
  let confirmed = 0;
  for (const row of rows) {
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

  const summary = summarize(rows);
  const reference = oldest(rows);
  const metadata = { asOfLedger: reference.as_of_ledger, reconciledAt: reference.reconciled_at };

  const quarantined = rows.find((row) => row.is_quarantined);
  if (quarantined) {
    return {
      status: 'quarantined',
      data: summary,
      metadata,
      issueId: quarantined.quarantine_issue_id ?? 'unknown',
      reason: 'A reconciliation mismatch is under operator review.',
    };
  }

  if (rows.some((row) => row.is_stale)) {
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
 */
export function useBeneficiaryBalances(): BeneficiaryBalancesHook {
  const [balance, setBalance] = useState<ProjectionState<PilotBalanceSummary>>({ status: 'loading' });
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    setBalance({ status: 'loading' });
    try {
      const { data, error } = await supabase
        .from('beneficiary_balance_projection')
        .select(
          'aid_type, available_balance_stroops, confirmed_transaction_count, reconciled_at, as_of_ledger, is_stale, is_quarantined, quarantine_issue_id',
        )
        .order('reconciled_at', { ascending: false });

      if (error) throw error;
      if (request !== requestRef.current) return;

      setBalance(toProjectionState((data ?? []) as ProjectionRow[]));
    } catch (err: unknown) {
      if (request !== requestRef.current) return;
      setBalance({
        status: 'unavailable',
        reason: err instanceof Error ? err.message : 'Balance service is unavailable.',
        retryable: true,
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { balance, refresh: load };
}

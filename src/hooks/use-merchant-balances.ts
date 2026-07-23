import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { parseStroopAmount } from '@/types/blockchain';
import type { MerchantBalanceSummary, ProjectionState } from '@/types/projection';
import { addStroops, ZERO_STROOPS } from '@/utils/format-stroops';
import { buildProjectionState, type ProjectionRowMeta } from '@/utils/projection-state';

type MerchantBalanceRow = ProjectionRowMeta &
  Readonly<{
    settled_balance_stroops: number;
    gross_settled_stroops: number;
    refunded_stroops: number;
    pending_cashout_stroops: number;
    completed_cashout_stroops: number;
    confirmed_settlement_count: number;
    latest_transaction_hash: string | null;
  }>;

const SELECT =
  'settled_balance_stroops, gross_settled_stroops, refunded_stroops, pending_cashout_stroops, ' +
  'completed_cashout_stroops, confirmed_settlement_count, latest_transaction_hash, ' +
  'reconciled_at, as_of_ledger, is_stale, is_quarantined, quarantine_issue_id';

/**
 * Aggregates every reconciled program-scoped merchant row (a merchant may settle
 * across programs) into one honest position. The newest row supplies the
 * verifiable transaction reference.
 */
const summarize = (rows: readonly MerchantBalanceRow[]): MerchantBalanceSummary => {
  let settled = ZERO_STROOPS;
  let gross = ZERO_STROOPS;
  let refunded = ZERO_STROOPS;
  let pendingCashout = ZERO_STROOPS;
  let completedCashout = ZERO_STROOPS;
  let settlementCount = 0;

  for (const row of rows) {
    settled = addStroops(settled, parseStroopAmount(row.settled_balance_stroops));
    gross = addStroops(gross, parseStroopAmount(row.gross_settled_stroops));
    refunded = addStroops(refunded, parseStroopAmount(row.refunded_stroops));
    pendingCashout = addStroops(pendingCashout, parseStroopAmount(row.pending_cashout_stroops));
    completedCashout = addStroops(completedCashout, parseStroopAmount(row.completed_cashout_stroops));
    settlementCount += row.confirmed_settlement_count;
  }

  const newest = rows.reduce((acc, row) => (row.reconciled_at > acc.reconciled_at ? row : acc), rows[0]);

  return {
    settledBalanceStroops: settled,
    grossSettledStroops: gross,
    refundedStroops: refunded,
    pendingCashoutStroops: pendingCashout,
    completedCashoutStroops: completedCashout,
    confirmedSettlementCount: settlementCount,
    latestTransactionHash: newest.latest_transaction_hash,
    assetCode: 'RCPHP',
    network: 'testnet',
  };
};

export type MerchantBalancesHook = Readonly<{
  balance: ProjectionState<MerchantBalanceSummary>;
  refresh: () => Promise<void>;
}>;

/**
 * Reads the merchant's reconciled settlement, refund, and cash-out position from
 * `merchant_balance_projection`. This replaces the demo sales-metric RPC; a
 * failed read surfaces `unavailable` and is never converted into a fabricated
 * balance (Requirements 12.3, 18.1, 21.1, 21.2, 21.7).
 */
export function useMerchantBalances(): MerchantBalancesHook {
  const [balance, setBalance] = useState<ProjectionState<MerchantBalanceSummary>>({ status: 'loading' });
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    setBalance({ status: 'loading' });
    try {
      const { data, error } = await supabase
        .from('merchant_balance_projection')
        .select(SELECT)
        .order('reconciled_at', { ascending: false });

      if (error) throw error;
      if (request !== requestRef.current) return;

      const rows = (data ?? []) as unknown as MerchantBalanceRow[];
      setBalance(buildProjectionState(rows, summarize));
    } catch (err: unknown) {
      if (request !== requestRef.current) return;
      setBalance({
        status: 'unavailable',
        reason: err instanceof Error ? err.message : 'Settlement balances are unavailable.',
        retryable: true,
      });
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return { balance, refresh: load };
}

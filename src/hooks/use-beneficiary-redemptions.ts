import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { RedemptionRecord } from '@/types/wallet';

type RedemptionRow = Readonly<{
  id: string;
  merchant_name: string | null;
  amount: number;
  category: string | null;
  redeemed_at: string | null;
  remaining_balance: number | null;
  tx_hash: string | null;
  status: string | null;
}>;

const KNOWN_CATEGORIES: readonly RedemptionRecord['category'][] = [
  'Food',
  'Medicine',
  'School Supplies',
  'Cash',
];

const toCategory = (value: string | null): RedemptionRecord['category'] =>
  KNOWN_CATEGORIES.find((category) => category === value) ?? 'Cash';

const toStatus = (value: string | null): RedemptionRecord['status'] =>
  value === 'Completed' || value === 'Pending' || value === 'Failed' ? value : 'Pending';

const toRedemptionRecord = (row: RedemptionRow): RedemptionRecord => ({
  id: row.id,
  merchant: row.merchant_name ?? 'Unknown Merchant',
  amount: `₱${row.amount}`,
  category: toCategory(row.category),
  date: row.redeemed_at ? new Date(row.redeemed_at).toLocaleDateString() : 'Pending',
  remainingBalance: row.remaining_balance != null ? `₱${row.remaining_balance}` : '---',
  txHash: row.tx_hash ?? 'Pending',
  status: toStatus(row.status),
  direction: 'debit',
});

export type BeneficiaryRedemptionsHook = Readonly<{
  redemptions: RedemptionRecord[];
  isLoading: boolean;
  /** Set when the read fails; the list stays empty rather than showing fabricated rows. */
  error: string | null;
  refresh: () => Promise<void>;
}>;

/**
 * Reads the beneficiary's redemption history. A failed read surfaces an error and
 * an empty list; it is never replaced with sample or fallback transactions
 * (Requirements 21.1, 21.4).
 */
export function useBeneficiaryRedemptions(): BeneficiaryRedemptionsHook {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [redemptions, setRedemptions] = useState<RedemptionRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    if (!userId) {
      setRedemptions([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const { data, error: queryError } = await supabase
        .from('redemptions')
        .select('id, merchant_name, amount, category, redeemed_at, remaining_balance, tx_hash, status')
        .eq('beneficiary_id', userId)
        .order('redeemed_at', { ascending: false });

      if (queryError) throw queryError;
      if (request !== requestRef.current) return;

      setRedemptions(((data ?? []) as RedemptionRow[]).map(toRedemptionRecord));
    } catch (err: unknown) {
      if (request !== requestRef.current) return;
      setRedemptions([]);
      setError(err instanceof Error ? err.message : 'Unable to load transactions.');
    } finally {
      if (request === requestRef.current) setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { redemptions, isLoading, error, refresh: load };
}

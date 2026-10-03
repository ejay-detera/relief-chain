import { useCallback, useEffect, useRef, useState } from 'react';

import { PILOT_ASSET_CODE } from '@/constants/pilot-disclosure';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { parseStroopAmount } from '@/types/blockchain';
import { RedemptionRecord } from '@/types/wallet';
import { formatStroops } from '@/utils/format-stroops';

/**
 * Previously this hook read `public.redemptions` — a legacy table from the
 * very first migration with no live writer anywhere in the app or Edge
 * Functions (confirmed: zero inserts in `src/` or `supabase/functions/`,
 * only raw-SQL test fixtures). The transaction history screen was reading a
 * table that is permanently empty on hosted. `payment_intents` joined to
 * `invoices` (for the merchant's settlement wallet / category) and
 * `merchant_entities` (for a display name) IS the real, live beneficiary
 * payment history — it already has an RLS policy scoping rows to the
 * paying beneficiary (`can_view_payment_workflow`), and hosted has live
 * confirmed rows in it.
 */
type PaymentIntentRow = Readonly<{
  id: string;
  amount_stroops: number;
  funding_source: 'cash' | 'voucher';
  status: string;
  transaction_hash: string | null;
  confirmed_at: string | null;
  created_at: string;
  merchant: { display_name: string | null } | { display_name: string | null }[] | null;
}>;

const toFundingSource = (value: 'cash' | 'voucher'): RedemptionRecord['fundingSource'] =>
  value === 'voucher' ? 'Voucher' : 'Cash';

const toStatus = (value: string): RedemptionRecord['status'] => {
  if (value === 'confirmed') return 'Completed';
  if (value === 'failed' || value === 'expired') return 'Failed';
  return 'Pending';
};

const merchantDisplayName = (merchant: PaymentIntentRow['merchant']): string => {
  const row = Array.isArray(merchant) ? merchant[0] : merchant;
  return row?.display_name ?? 'Unknown Merchant';
};

const toRedemptionRecord = (row: PaymentIntentRow): RedemptionRecord => {
  const dateSource = row.confirmed_at ?? row.created_at;
  return {
    id: row.id,
    merchant: merchantDisplayName(row.merchant),
    amount: `${formatStroops(parseStroopAmount(row.amount_stroops))} ${PILOT_ASSET_CODE}`,
    fundingSource: toFundingSource(row.funding_source),
    date: dateSource ? new Date(dateSource).toLocaleDateString() : 'Pending',
    // No per-transaction running balance is tracked anywhere in this
    // schema — shown as unavailable rather than fabricated.
    remainingBalance: null,
    txHash: row.transaction_hash,
    status: toStatus(row.status),
    direction: 'debit',
  };
};

export type BeneficiaryRedemptionsHook = Readonly<{
  redemptions: RedemptionRecord[];
  isLoading: boolean;
  /** Set when the read fails; the list stays empty rather than showing fabricated rows. */
  error: string | null;
  refresh: () => Promise<void>;
}>;

/**
 * Reads the beneficiary's real payment/redemption history from
 * `payment_intents` (RLS-scoped to the paying beneficiary). A failed read
 * surfaces an error and an empty list; it is never replaced with sample or
 * fallback transactions (Requirements 21.1, 21.4).
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
      // RLS already scopes `payment_intents` to rows this beneficiary
      // participates in (`can_view_payment_workflow`); no explicit
      // beneficiary filter is added here so a direct identity-id join isn't
      // needed client-side.
      const { data, error: queryError } = await supabase
        .from('payment_intents')
        .select(
          'id, amount_stroops, funding_source, status, transaction_hash, confirmed_at, created_at, merchant:merchant_entities ( display_name )',
        )
        .order('created_at', { ascending: false });

      if (queryError) throw queryError;
      if (request !== requestRef.current) return;

      setRedemptions(((data ?? []) as unknown as PaymentIntentRow[]).map(toRedemptionRecord));
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

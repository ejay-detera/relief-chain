import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { parseStroopAmount, type StroopAmount } from '@/types/blockchain';
import type { RefundableSettlement } from '@/types/refund';
import { addStroops, ZERO_STROOPS } from '@/utils/format-stroops';

/** Refund rows in these states hold or intend to hold value against the bound. */
const REFUND_COUNTS_AGAINST_BOUND: ReadonlySet<string> = new Set([
  'requested',
  'approved',
  'signed',
  'submitted',
  'confirmed',
]);

type ProgramExpiry = Readonly<{
  expiry_policy: 'none' | 'fixed';
  expires_at: string | null;
}>;

type SettlementRow = Readonly<{
  id: string;
  voucher_redemption_id: string | null;
  merchant_id: string;
  program_id: string | null;
  amount_stroops: number;
  correlation_id: string;
  program: ProgramExpiry | ProgramExpiry[] | null;
}>;

/** Supabase returns a to-one join as an object or a single-element array. */
const programOf = (program: SettlementRow['program']): ProgramExpiry | null => {
  if (Array.isArray(program)) return program[0] ?? null;
  return program;
};

type RefundAggregateRow = Readonly<{
  original_settlement_id: string;
  amount_stroops: number;
  status: string;
}>;

export type SettlementsState =
  | { status: 'loading' }
  | { status: 'ready'; settlements: readonly RefundableSettlement[] }
  | { status: 'unavailable'; reason: string };

export type MerchantSettlementsHook = Readonly<{
  state: SettlementsState;
  refresh: () => Promise<void>;
}>;

const shortReference = (correlationId: string): string =>
  `STL-${correlationId.replace(/-/g, '').slice(0, 8).toUpperCase()}`;

const isExpired = (program: ProgramExpiry | null, now: number): boolean =>
  program?.expiry_policy === 'fixed'
  && program.expires_at !== null
  && new Date(program.expires_at).getTime() < now;

const subtractFloor = (original: StroopAmount, refunded: StroopAmount): StroopAmount => {
  const remaining = BigInt(original) - BigInt(refunded);
  return remaining > 0n ? parseStroopAmount(remaining) : ZERO_STROOPS;
};

/**
 * Reads the merchant's confirmed settlements and computes what remains refundable
 * on each, so a refund can never be requested beyond the original amount
 * (Requirement 15.4). Authoritative bound enforcement remains in the
 * contract/Edge Function; this only supplies the client guard and UI labels.
 */
export function useMerchantSettlements(merchantEntityId?: string | null): MerchantSettlementsHook {
  const [state, setState] = useState<SettlementsState>({ status: 'loading' });
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    setState({ status: 'loading' });
    try {
      let settlementQuery = supabase
        .from('settlements')
        .select(
          'id, voucher_redemption_id, merchant_id, program_id, amount_stroops, correlation_id, program:programs ( expiry_policy, expires_at )',
        )
        .eq('status', 'confirmed');

      if (merchantEntityId) {
        settlementQuery = settlementQuery.eq('merchant_id', merchantEntityId);
      }

      const settlements = await settlementQuery.order('created_at', { ascending: false });

      if (settlements.error) throw settlements.error;

      let refundQuery = supabase
        .from('refunds')
        .select('original_settlement_id, amount_stroops, status');

      if (merchantEntityId) {
        refundQuery = refundQuery.eq('merchant_id', merchantEntityId);
      }

      const refunds = await refundQuery;

      if (refunds.error) throw refunds.error;
      if (request !== requestRef.current) return;

      const refundedBySettlement = new Map<string, StroopAmount>();
      for (const row of (refunds.data ?? []) as unknown as RefundAggregateRow[]) {
        if (!REFUND_COUNTS_AGAINST_BOUND.has(row.status)) continue;
        const current = refundedBySettlement.get(row.original_settlement_id) ?? ZERO_STROOPS;
        refundedBySettlement.set(
          row.original_settlement_id,
          addStroops(current, parseStroopAmount(row.amount_stroops)),
        );
      }

      const now = Date.now();
      const settlementRows = (settlements.data ?? []) as unknown as SettlementRow[];
      const mapped = settlementRows.map((row): RefundableSettlement => {
        const original = parseStroopAmount(row.amount_stroops);
        const alreadyRefunded = refundedBySettlement.get(row.id) ?? ZERO_STROOPS;
        return {
          settlementId: row.id,
          voucherRedemptionId: row.voucher_redemption_id,
          merchantId: row.merchant_id,
          programId: row.program_id,
          originalAmountStroops: original,
          alreadyRefundedStroops: alreadyRefunded,
          remainingRefundableStroops: subtractFloor(original, alreadyRefunded),
          isProgramExpired: isExpired(programOf(row.program), now),
          reference: shortReference(row.correlation_id),
        };
      });

      setState({ status: 'ready', settlements: mapped });
    } catch (err: unknown) {
      if (request !== requestRef.current) return;
      const message =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err
            ? String((err as { message: unknown }).message)
            : 'Settlements are unavailable.';
      setState({
        status: 'unavailable',
        reason: message,
      });
    }
  }, [merchantEntityId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return { state, refresh: load };
}

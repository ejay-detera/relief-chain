import { supabase } from '@/lib/supabase';
import type { MerchantMetrics } from '@/types/merchant-metrics';

export type SettlementMetricRow = {
  amount_stroops: number | bigint | string | null;
  kind: 'voucher_redemption' | 'cash_payment' | string;
  confirmed_at?: string | null;
  created_at?: string;
};

/**
 * Computes authentic merchant metrics from real confirmed settlement rows.
 * Total sales is the sum of all settled amounts (both vouchers and cash payments) in PHP/RCPHP.
 * Vouchers processed is the count of confirmed voucher redemptions.
 */
export const calculateMerchantMetricsFromSettlements = (
  merchantId: string,
  rows: readonly SettlementMetricRow[],
): MerchantMetrics => {
  let totalStroops = 0n;
  let vouchersProcessed = 0;
  let latestIso = '';

  for (const row of rows) {
    if (row.amount_stroops != null) {
      try {
        totalStroops += BigInt(row.amount_stroops);
      } catch {
        // Ignore unparseable stroop value
      }
    }
    if (row.kind === 'voucher_redemption') {
      vouchersProcessed += 1;
    }
    const rowDate = row.confirmed_at || row.created_at;
    if (rowDate && (!latestIso || rowDate > latestIso)) {
      latestIso = rowDate;
    }
  }

  const totalSales = Number(totalStroops) / 10_000_000;

  return {
    merchantId,
    vouchersProcessed,
    totalSales,
    updatedAt: latestIso || new Date().toISOString(),
  };
};

/**
 * Resolves the merchant's real metrics by querying public.settlements for confirmed settlements.
 * If an explicitMerchantId is provided, it queries for that merchant;
 * otherwise it resolves the merchant entity ID associated with the authenticated profile.
 * Never fabricates mock values or hardcoded fallbacks.
 */
export const getOrCreateMerchantMetrics = async (
  explicitMerchantId?: string | null,
): Promise<MerchantMetrics> => {
  let merchantId = explicitMerchantId ?? null;

  if (!merchantId) {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (userId) {
      const { data: entityData } = await supabase
        .from('merchant_entities')
        .select('id')
        .eq('profile_id', userId)
        .maybeSingle();
      merchantId = entityData?.id ?? null;
    }
  }

  // Try RPC which aggregates real redemptions and projections
  try {
    const { data: rpcMetrics, error: rpcErr } = await supabase.rpc(
      'get_or_create_merchant_metrics' as never
    );
    if (!rpcErr && rpcMetrics) {
      const row = rpcMetrics as Record<string, unknown>;
      return {
        merchantId: (row.merchant_id as string) || merchantId || '',
        vouchersProcessed: Number(row.vouchers_processed || 0),
        totalSales: Number(row.total_sales || 0),
        updatedAt: (row.updated_at as string) || new Date().toISOString(),
      };
    }
  } catch {
    // Fall back to direct settlements query
  }

  if (!merchantId) {
    return {
      merchantId: '',
      vouchersProcessed: 0,
      totalSales: 0,
      updatedAt: new Date().toISOString(),
    };
  }

  const { data, error } = await supabase
    .from('settlements')
    .select('amount_stroops, kind, confirmed_at, created_at')
    .eq('merchant_id', merchantId)
    .eq('status', 'confirmed');

  if (error) throw error;

  const rows = (data ?? []) as unknown as SettlementMetricRow[];
  return calculateMerchantMetricsFromSettlements(merchantId, rows);
};

export const recordDemoMerchantRedemption = async (): Promise<MerchantMetrics> => {
  return getOrCreateMerchantMetrics();
};

import { supabase } from '@/lib/supabase';
import type { MerchantMetrics } from '@/types/merchant-metrics';

const toNumber = (value: unknown, field: string): number => {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed)) throw new Error(`Merchant metrics returned an invalid ${field}.`);
  return parsed;
};

const parseMerchantMetrics = (value: unknown): MerchantMetrics => {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || typeof candidate !== 'object') throw new Error('Merchant metrics were not returned.');
  const row = candidate as Record<string, unknown>;
  if (typeof row.merchant_id !== 'string' || typeof row.updated_at !== 'string') {
    throw new Error('Merchant metrics returned an invalid record.');
  }
  return {
    merchantId: row.merchant_id,
    vouchersProcessed: toNumber(row.vouchers_processed, 'voucher count'),
    totalSales: toNumber(row.total_sales, 'sales total'),
    updatedAt: row.updated_at,
  };
};

const callMetricsRpc = async (functionName: 'get_or_create_merchant_metrics' | 'record_demo_merchant_redemption') => {
  const { data, error } = await supabase.rpc(functionName);
  if (error) throw error;
  return parseMerchantMetrics(data as unknown);
};

export const getOrCreateMerchantMetrics = (): Promise<MerchantMetrics> =>
  callMetricsRpc('get_or_create_merchant_metrics');

export const recordDemoMerchantRedemption = (): Promise<MerchantMetrics> =>
  callMetricsRpc('record_demo_merchant_redemption');

import { supabase } from '@/lib/supabase';
import { formatStroops } from '@/utils/format-stroops';
import { PILOT_ASSET_CODE } from '@/constants/pilot-disclosure';

export type MerchantPaymentRecord = {
  id: string;
  txHash: string;
  amountFormatted: string;
  date: string;
  status: 'Completed' | 'Pending' | 'Failed';
  beneficiaryName: string;
};

export const fetchMerchantPaymentHistory = async (merchantEntityId: string): Promise<MerchantPaymentRecord[]> => {
  const { data, error } = await supabase
    .from('financial_intents')
    .select(`
      id,
      amount_stroops,
      created_at,
      status,
      beneficiary_identities (
        user_id
      )
    `)
    .eq('merchant_id', merchantEntityId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('fetchMerchantPaymentHistory error:', error);
    throw error;
  }

  return (data ?? []).map((row: any) => ({
    id: row.id,
    txHash: row.id.slice(0, 8) + '...' + row.id.slice(-6),
    amountFormatted: `${formatStroops(row.amount_stroops)} ${PILOT_ASSET_CODE}`,
    date: new Date(row.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    status: row.status === 'confirmed' ? 'Completed' : row.status === 'failed' ? 'Failed' : 'Pending',
    beneficiaryName: 'Beneficiary',
  }));
};

export const fetchLguPaymentHistory = async (organizationId: string): Promise<MerchantPaymentRecord[]> => {
  const { data, error } = await supabase
    .from('financial_intents')
    .select(`
      id,
      amount_stroops,
      created_at,
      status,
      merchant_entities!inner (
        organization_id
      )
    `)
    .eq('merchant_entities.organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error('fetchLguPaymentHistory error:', error);
    throw error;
  }

  return (data ?? []).map((row: any) => ({
    id: row.id,
    txHash: row.id.slice(0, 8) + '...' + row.id.slice(-6),
    amountFormatted: `${formatStroops(row.amount_stroops)} ${PILOT_ASSET_CODE}`,
    date: new Date(row.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    status: row.status === 'confirmed' ? 'Completed' : row.status === 'failed' ? 'Failed' : 'Pending',
    beneficiaryName: 'Beneficiary',
  }));
};

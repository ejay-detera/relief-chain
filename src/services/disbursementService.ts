import { supabase } from '@/lib/supabase';

export interface Disbursement {
  id: string;
  programName: string;
  disasterEvent: string;
  amount: number;
  recipientsCount: number;
  date: string;
  txHash: string;
}

export const fetchDisbursements = async (): Promise<Disbursement[]> => {
  const { data, error } = await supabase
    .from('disbursements')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data || []).map((d) => ({
    id: d.id,
    programName: d.program_name,
    disasterEvent: d.disaster_event || 'General Calamity',
    amount: Number(d.amount),
    recipientsCount: d.recipients_count,
    date: new Date(d.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
    txHash: d.tx_hash,
  }));
};

export const createDisbursement = async (payload: {
  programId: string;
  programName: string;
  disasterEvent: string;
  amount: number;
  recipientsCount: number;
  txHash: string;
}): Promise<Disbursement> => {
  const { data, error } = await supabase
    .from('disbursements')
    .insert({
      program_id: payload.programId,
      program_name: payload.programName,
      disaster_event: payload.disasterEvent,
      amount: payload.amount,
      recipients_count: payload.recipientsCount,
      tx_hash: payload.txHash,
    })
    .select()
    .single();

  if (error) throw error;

  return {
    id: data.id,
    programName: data.program_name,
    disasterEvent: data.disaster_event || 'General Calamity',
    amount: Number(data.amount),
    recipientsCount: data.recipients_count,
    date: new Date(data.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
    txHash: data.tx_hash,
  };
};

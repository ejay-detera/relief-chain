import { supabase } from '@/lib/supabase';

export interface SmsNotificationPayload {
  recipientPhoneNumber: string;
  programName: string;
  amount?: string | number;
  inviteCode?: string;
  actionMessage: string;
}

export interface SmsSendResult {
  success: boolean;
  messageId: string;
  deliveredTo: string;
  status: 'simulated_queued' | 'simulated_delivered';
  timestamp: string;
}

/**
 * SMS Notification Dispatcher Stub (US7 / US8).
 * Note per project architecture rules: SMS stays as an auditable stub
 * until an external telecoms gateway is contracted.
 */
export const sendSmsNotification = async (
  payload: SmsNotificationPayload
): Promise<SmsSendResult> => {
  const simulatedId = `sms_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  // Log in test environment
  if (__DEV__) {
    console.log(`[SMS Stub] Outgoing SMS to ${payload.recipientPhoneNumber}:`, {
      program: payload.programName,
      amount: payload.amount,
      inviteCode: payload.inviteCode,
      message: payload.actionMessage,
    });
  }

  return {
    success: true,
    messageId: simulatedId,
    deliveredTo: payload.recipientPhoneNumber,
    status: 'simulated_delivered',
    timestamp: new Date().toISOString(),
  };
};

export interface PendingSmsInvite {
  id: string;
  programId: string;
  fullName: string;
  phoneNumber: string;
  status: 'pending' | 'sent' | 'registered' | 'failed';
  inviteCode: string;
  createdAt: string;
}

/**
 * Creates pending SMS invites for targeted beneficiaries imported via CSV.
 */
export const createPendingSmsInvites = async (
  programId: string,
  beneficiaries: { fullName: string; phoneNumber: string }[]
): Promise<{ count: number }> => {
  if (beneficiaries.length === 0) return { count: 0 };

  const rows = beneficiaries.map((b) => {
    const inviteCode = `RC-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    return {
      program_id: programId,
      full_name: b.fullName.trim(),
      phone_number: b.phoneNumber.trim(),
      invite_code: inviteCode,
      status: 'pending',
    };
  });

  const { error } = await supabase.from('pending_sms_invites').insert(rows);
  if (error) throw error;

  // Simulate outgoing SMS dispatch for each invite
  for (const row of rows) {
    void sendSmsNotification({
      recipientPhoneNumber: row.phone_number,
      programName: 'Relief Assistance Program',
      inviteCode: row.invite_code,
      actionMessage: `You have been targeted for disaster aid. Use activation code ${row.invite_code} or register in ReliefChain to claim your assistance.`,
    });
  }

  return { count: rows.length };
};

export const fetchPendingSmsInvites = async (
  programId: string
): Promise<PendingSmsInvite[]> => {
  const { data, error } = await supabase
    .from('pending_sms_invites')
    .select('*')
    .eq('program_id', programId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching pending SMS invites:', error);
    return [];
  }

  return (data ?? []).map((row: any) => ({
    id: row.id,
    programId: row.program_id,
    fullName: row.full_name,
    phoneNumber: row.phone_number,
    status: row.status,
    inviteCode: row.invite_code,
    createdAt: row.created_at,
  }));
};

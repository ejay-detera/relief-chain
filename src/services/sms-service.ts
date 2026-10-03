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

export interface CreatePendingSmsInvitesResult {
  /** Invite rows actually inserted (excludes duplicates skipped below). */
  count: number;
  /** Of the inserted rows, how many matched an already-registered beneficiary by phone number. */
  alreadyRegistered: number;
  /**
   * CSV rows skipped because this phone number already has an invite for this
   * program (either from an earlier import, or a repeated row in this same
   * CSV) — re-uploading the same list no longer creates duplicate invites.
   */
  skippedDuplicates: number;
}

/**
 * Normalizes a phone number to its last 10 digits so "+639171234567",
 * "09171234567", and "9171234567" compare equal. Mirrors
 * `private.normalize_phone()` in
 * `20261002120000_enforce_private_program_access.sql` — keep both in sync.
 */
const normalizePhone = (phone: string): string => phone.replace(/\D/g, '').slice(-10);

/**
 * Creates pending SMS invites for targeted beneficiaries imported via CSV.
 *
 * Before inserting, this now:
 * 1. Skips any phone number that already has an invite for this program
 *    (re-uploading the same CSV, or a duplicated row within one CSV, no
 *    longer creates duplicate `pending_sms_invites` rows — also enforced at
 *    the DB level by a unique index on `(program_id, normalize_phone(...))`).
 * 2. Checks each remaining phone number against existing `beneficiary`
 *    profiles. A match means this person already has a ReliefChain account —
 *    the invite row is still created (it is what grants them access to a
 *    *private* program per `private.is_program_invited_beneficiary()`), but
 *    its status is set directly to 'registered' and no "activate your
 *    account" SMS is sent, since there is no account left to activate. A
 *    database trigger notifies that beneficiary in-app instead (see
 *    `20261002160000_add_sms_invite_dedupe_and_registered_notice.sql`).
 */
export const createPendingSmsInvites = async (
  programId: string,
  beneficiaries: { fullName: string; phoneNumber: string }[]
): Promise<CreatePendingSmsInvitesResult> => {
  if (beneficiaries.length === 0) return { count: 0, alreadyRegistered: 0, skippedDuplicates: 0 };

  const [{ data: existingInvites, error: existingError }, { data: beneficiaryProfiles, error: profilesError }] =
    await Promise.all([
      supabase.from('pending_sms_invites').select('phone_number').eq('program_id', programId),
      supabase.from('profiles').select('mobile_number').eq('role', 'beneficiary').not('mobile_number', 'is', null),
    ]);

  if (existingError) throw existingError;
  if (profilesError) throw profilesError;

  const existingPhones = new Set((existingInvites ?? []).map((r) => normalizePhone(r.phone_number)));
  const registeredPhones = new Set(
    (beneficiaryProfiles ?? [])
      .map((r) => (r.mobile_number ? normalizePhone(r.mobile_number) : null))
      .filter((value): value is string => Boolean(value))
  );

  const seenInBatch = new Set<string>();
  let skippedDuplicates = 0;
  let alreadyRegistered = 0;

  const rows = beneficiaries.flatMap((b) => {
    const normalized = normalizePhone(b.phoneNumber);
    if (!normalized || existingPhones.has(normalized) || seenInBatch.has(normalized)) {
      skippedDuplicates += 1;
      return [];
    }
    seenInBatch.add(normalized);

    const isRegistered = registeredPhones.has(normalized);
    if (isRegistered) alreadyRegistered += 1;

    const inviteCode = `RC-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    return [{
      program_id: programId,
      full_name: b.fullName.trim(),
      phone_number: b.phoneNumber.trim(),
      invite_code: inviteCode,
      status: (isRegistered ? 'registered' : 'pending') as 'registered' | 'pending',
    }];
  });

  if (rows.length === 0) return { count: 0, alreadyRegistered, skippedDuplicates };

  const { error } = await supabase.from('pending_sms_invites').insert(rows);
  if (error) throw error;

  // Simulate outgoing "activate your account" SMS only for people who do not
  // already have an account — an already-registered beneficiary gets an
  // in-app notification instead (via the database trigger), not this SMS.
  for (const row of rows) {
    if (row.status !== 'pending') continue;
    void sendSmsNotification({
      recipientPhoneNumber: row.phone_number,
      programName: 'Relief Assistance Program',
      inviteCode: row.invite_code,
      actionMessage: `You have been targeted for disaster aid. Use activation code ${row.invite_code} or register in ReliefChain to claim your assistance.`,
    });
  }

  return { count: rows.length, alreadyRegistered, skippedDuplicates };
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

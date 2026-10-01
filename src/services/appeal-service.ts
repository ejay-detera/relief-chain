import { supabase } from '@/lib/supabase';
import { AppealStatus, BeneficiaryAppeal, CreateAppealInput } from '@/types/appeal';

interface RawAppealRow {
  id: string;
  enrollment_id: string;
  beneficiary_id: string;
  program_id: string;
  reason: string;
  document_urls: string[];
  status: AppealStatus;
  reviewer_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  program?: {
    name: string;
  } | null;
}

const mapRow = (row: RawAppealRow): BeneficiaryAppeal => ({
  id: row.id,
  enrollmentId: row.enrollment_id,
  beneficiaryId: row.beneficiary_id,
  programId: row.program_id,
  programName: row.program?.name ?? 'Assistance Program',
  reason: row.reason,
  documentUrls: row.document_urls ?? [],
  status: row.status,
  reviewerNotes: row.reviewer_notes,
  reviewedBy: row.reviewed_by,
  reviewedAt: row.reviewed_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const submitAppeal = async (input: CreateAppealInput): Promise<BeneficiaryAppeal> => {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) throw new Error('You must be signed in to submit an appeal');

  const { data, error } = await supabase
    .from('beneficiary_appeals')
    .insert({
      enrollment_id: input.enrollmentId,
      beneficiary_id: userId,
      program_id: input.programId,
      reason: input.reason.trim(),
      document_urls: input.documentUrls ?? [],
      status: 'pending',
    })
    .select(`
      *,
      program:programs ( name )
    `)
    .single();

  if (error) throw error;
  return mapRow(data as unknown as RawAppealRow);
};

export const fetchBeneficiaryAppeals = async (): Promise<BeneficiaryAppeal[]> => {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) return [];

  const { data, error } = await supabase
    .from('beneficiary_appeals')
    .select(`
      *,
      program:programs ( name )
    `)
    .eq('beneficiary_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching beneficiary appeals:', error);
    return [];
  }

  return ((data ?? []) as unknown as RawAppealRow[]).map(mapRow);
};

export const fetchProgramAppeals = async (
  programId?: string,
  statusFilter?: AppealStatus
): Promise<BeneficiaryAppeal[]> => {
  let query = supabase
    .from('beneficiary_appeals')
    .select(`
      *,
      program:programs ( name )
    `)
    .order('created_at', { ascending: false });

  if (programId) {
    query = query.eq('program_id', programId);
  }
  if (statusFilter) {
    query = query.eq('status', statusFilter);
  }

  const { data, error } = await query;
  if (error) throw error;

  return ((data ?? []) as unknown as RawAppealRow[]).map(mapRow);
};

export const resolveAppeal = async (
  appealId: string,
  decision: 'approved' | 'rejected',
  reviewerNotes?: string
): Promise<void> => {
  const { data: sessionData } = await supabase.auth.getSession();
  const reviewerId = sessionData.session?.user.id;

  const { data: appeal, error: fetchErr } = await supabase
    .from('beneficiary_appeals')
    .select('enrollment_id, beneficiary_id, program_id')
    .eq('id', appealId)
    .single();

  if (fetchErr || !appeal) throw fetchErr ?? new Error('Appeal not found');

  const now = new Date().toISOString();

  // 1. Update appeal record
  const { error: updateErr } = await supabase
    .from('beneficiary_appeals')
    .update({
      status: decision,
      reviewer_notes: reviewerNotes ?? null,
      reviewed_by: reviewerId ?? null,
      reviewed_at: now,
      updated_at: now,
    })
    .eq('id', appealId);

  if (updateErr) throw updateErr;

  // 2. If approved, re-open enrollment for verification review
  if (decision === 'approved' && appeal.enrollment_id) {
    await supabase
      .from('enrollments')
      .update({
        approval_status: 'Pending',
        rejection_remarks: null,
      })
      .eq('id', appeal.enrollment_id);
  }
};

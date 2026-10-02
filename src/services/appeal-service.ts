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

/**
 * Resolves an appeal (approve/reject). Delegates both the status update and,
 * on approval, the enrollment reopen to a single `security definer` RPC
 * (`resolve_beneficiary_appeal`) so the two writes happen in one transaction
 * — a crash or dropped connection between them can no longer leave an appeal
 * marked 'approved' with its enrollment never reopened. The RPC also
 * enforces that reviewer notes are present when rejecting.
 */
export const resolveAppeal = async (
  appealId: string,
  decision: 'approved' | 'rejected',
  reviewerNotes?: string
): Promise<void> => {
  const { error } = await supabase.rpc('resolve_beneficiary_appeal', {
    p_appeal_id: appealId,
    p_decision: decision,
    p_reviewer_notes: reviewerNotes ?? null,
  });

  if (error) throw error;
};

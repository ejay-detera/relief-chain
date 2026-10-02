import { supabase } from '@/lib/supabase';
import {
    EnrollmentRequirementResponse,
    ProgramRequirement,
    RequirementResponseInput,
} from '@/types/program-requirement';

interface RawRequirementRow {
  id: string;
  program_id: string;
  label: string;
  description: string | null;
  type: string;
  is_mandatory: boolean;
  allowed_file_types: string[] | null;
  created_at: string;
}

const mapRow = (row: RawRequirementRow): ProgramRequirement => ({
  id: row.id,
  programId: row.program_id,
  label: row.label,
  description: row.description,
  type: (row.type as ProgramRequirement['type']) || 'document',
  isMandatory: row.is_mandatory,
  allowedFileTypes: row.allowed_file_types ?? ['png', 'jpg', 'jpeg', 'pdf', 'docx'],
  createdAt: row.created_at,
});

export const fetchProgramRequirements = async (
  programId: string
): Promise<ProgramRequirement[]> => {
  const { data, error } = await supabase
    .from('program_requirements')
    .select('*')
    .eq('program_id', programId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching program requirements:', error);
    return [];
  }

  return ((data ?? []) as unknown as RawRequirementRow[]).map(mapRow);
};

export const saveProgramRequirements = async (
  programId: string,
  requirements: {
    label: string;
    description?: string;
    type: 'document' | 'text' | 'number' | 'boolean';
    isMandatory: boolean;
    allowedFileTypes?: string[];
  }[]
): Promise<void> => {
  if (requirements.length === 0) return;

  const rows = requirements.map((r) => ({
    program_id: programId,
    label: r.label,
    description: r.description ?? null,
    type: r.type,
    is_mandatory: r.isMandatory,
    allowed_file_types: r.allowedFileTypes ?? ['png', 'jpg', 'jpeg', 'pdf', 'docx'],
  }));

  const { error } = await supabase.from('program_requirements').insert(rows);
  if (error) throw error;
};

export const submitRequirementResponses = async (
  enrollmentId: string,
  responses: RequirementResponseInput[]
): Promise<void> => {
  if (responses.length === 0) return;

  const rows = responses.map((r) => ({
    enrollment_id: enrollmentId,
    requirement_id: r.requirementId,
    value: r.value ?? null,
    file_url: r.fileUrl ?? null,
  }));

  const { error } = await supabase
    .from('enrollment_requirement_responses')
    .upsert(rows, { onConflict: 'enrollment_id,requirement_id' });

  if (error) throw error;
};

export const fetchEnrollmentResponses = async (
  enrollmentId: string
): Promise<EnrollmentRequirementResponse[]> => {
  const { data, error } = await supabase
    .from('enrollment_requirement_responses')
    .select(`
      id,
      enrollment_id,
      requirement_id,
      value,
      file_url,
      created_at,
      status,
      reviewer_notes,
      reviewed_by,
      reviewed_at,
      requirement:program_requirements (
        id,
        program_id,
        label,
        description,
        type,
        is_mandatory
      )
    `)
    .eq('enrollment_id', enrollmentId);

  if (error) {
    console.error('Error fetching enrollment responses:', error);
    return [];
  }

  return (data ?? []).map((row: any) => ({
    id: row.id,
    enrollmentId: row.enrollment_id,
    requirementId: row.requirement_id,
    value: row.value,
    fileUrl: row.file_url,
    createdAt: row.created_at,
    status: row.status ?? 'submitted',
    reviewerNotes: row.reviewer_notes ?? null,
    reviewedBy: row.reviewed_by ?? null,
    reviewedAt: row.reviewed_at ?? null,
    requirement: row.requirement
      ? {
          id: row.requirement.id,
          programId: row.requirement.program_id,
          label: row.requirement.label,
          description: row.requirement.description,
          type: row.requirement.type,
          isMandatory: row.requirement.is_mandatory,
        }
      : undefined,
  }));
};

/**
 * Marks a single requirement response verified/rejected. Delegates to the
 * `review_requirement_response` RPC (not a direct `.update()`) so the
 * reviewer attribution (`reviewed_by`, `reviewed_at`) cannot be forged by the
 * client and reviewer notes are enforced server-side when rejecting.
 */
export const reviewRequirementResponse = async (
  responseId: string,
  status: 'verified' | 'rejected',
  reviewerNotes?: string
): Promise<void> => {
  const { error } = await supabase.rpc('review_requirement_response', {
    p_response_id: responseId,
    p_status: status,
    p_reviewer_notes: reviewerNotes ?? null,
  });

  if (error) throw error;
};

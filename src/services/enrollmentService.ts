import { supabase } from '@/lib/supabase';

export type EnrollmentApprovalStatus = 'Approved' | 'Pending' | 'Rejected';

export interface ProgramApplicant {
  enrollmentId: string;
  beneficiaryId: string;
  fullName: string;
  govId: string | null;
  mobileNumber: string | null;
  barangayName: string | null;
  approvalStatus: EnrollmentApprovalStatus;
  voucherBalance: number;
  category: string;
  createdAt: string;
}

export interface BeneficiaryApplication {
  enrollmentId: string;
  programId: string;
  programName: string;
  approvalStatus: EnrollmentApprovalStatus;
  voucherBalance: number;
  category: string;
  createdAt: string;
}

/**
 * Fetches all Enrollments (Applications) for a given Program, joined with the
 * applying Beneficiary's profile, so an Organization can review pending
 * applications on the Program Details screen.
 */
export const fetchProgramApplicants = async (programId: string): Promise<ProgramApplicant[]> => {
  const { data, error } = await supabase
    .from('enrollments')
    .select(`
      id,
      beneficiary_id,
      approval_status,
      voucher_balance,
      category,
      created_at,
      beneficiary:profiles!enrollments_beneficiary_id_fkey (
        id,
        full_name,
        gov_id,
        mobile_number,
        barangay:barangays ( name )
      )
    `)
    .eq('program_id', programId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    enrollmentId: row.id,
    beneficiaryId: row.beneficiary_id,
    fullName: row.beneficiary?.full_name ?? 'Unknown Beneficiary',
    govId: row.beneficiary?.gov_id ?? null,
    mobileNumber: row.beneficiary?.mobile_number ?? null,
    barangayName: row.beneficiary?.barangay?.name ?? null,
    approvalStatus: row.approval_status,
    voucherBalance: Number(row.voucher_balance ?? 0),
    category: row.category,
    createdAt: row.created_at,
  }));
};

/**
 * Fetches all Applications (Enrollments) submitted by a given Beneficiary, joined
 * with the Program name, so an Organization can see a Beneficiary's application
 * history from the Beneficiary Verification screen.
 */
export const fetchBeneficiaryApplications = async (beneficiaryId: string): Promise<BeneficiaryApplication[]> => {
  const { data, error } = await supabase
    .from('enrollments')
    .select(`
      id,
      program_id,
      approval_status,
      voucher_balance,
      category,
      created_at,
      program:programs ( name )
    `)
    .eq('beneficiary_id', beneficiaryId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    enrollmentId: row.id,
    programId: row.program_id,
    programName: row.program?.name ?? 'Unknown Program',
    approvalStatus: row.approval_status,
    voucherBalance: Number(row.voucher_balance ?? 0),
    category: row.category,
    createdAt: row.created_at,
  }));
};

/**
 * Updates an Enrollment's approval status (Approve/Reject an Application).
 * Approving an Application also allocates the Program's per-beneficiary amount
 * as the Enrollment's voucher_balance and copies the Program's expiry date, so
 * the Beneficiary actually receives assistance instead of a permanent ₱0 balance.
 */
export const updateEnrollmentStatus = async (
  enrollmentId: string,
  approvalStatus: EnrollmentApprovalStatus
): Promise<void> => {
  if (approvalStatus === 'Approved') {
    const { data: enrollment, error: enrollmentError } = await supabase
      .from('enrollments')
      .select('program_id')
      .eq('id', enrollmentId)
      .single();

    if (enrollmentError) throw enrollmentError;

    const { data: program, error: programError } = await supabase
      .from('programs')
      .select('amount_per_beneficiary, expires_at')
      .eq('id', enrollment.program_id)
      .single();

    if (programError) throw programError;

    const { error } = await supabase
      .from('enrollments')
      .update({
        approval_status: approvalStatus,
        voucher_balance: program.amount_per_beneficiary,
        expires_at: program.expires_at,
      })
      .eq('id', enrollmentId);

    if (error) throw error;
    return;
  }

  const { error } = await supabase
    .from('enrollments')
    .update({ approval_status: approvalStatus })
    .eq('id', enrollmentId);

  if (error) throw error;
};

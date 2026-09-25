import { supabase } from '@/lib/supabase';

export type EnrollmentApprovalStatus = 'Approved' | 'Pending' | 'Rejected';

/**
 * Generates an RFC 4122 v4 UUID. `crypto.randomUUID()` is not reliably present
 * on Hermes/React Native even with `react-native-get-random-values` loaded
 * (that polyfill only covers `getRandomValues`), so this derives a v4 UUID
 * directly from random bytes instead of assuming the method exists.
 */
const randomUuidV4 = (): string => {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10xx
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

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

/** 1 RCPHP = 10,000,000 stroops (7 decimal places), matching the Stellar asset precision. */
const STROOPS_PER_RCPHP = 10_000_000;

/**
 * Updates an Enrollment's approval status (Approve/Reject an Application).
 *
 * Approving an Application allocates the Program's per-beneficiary amount as
 * the Enrollment's voucher_balance (legacy display column) and copies the
 * Program's expiry date. Once a Program is `active`,
 * `private.enforce_program_enrollment_allocation()` additionally REQUIRES
 * `allocation_amount_stroops` (positive), `allocation_correlation_id`, and an
 * actor (`approved_by`) in the SAME update — omitting them raises `23514`
 * ("active-program beneficiary additions require actor, correlation, and
 * positive allocation"). The trigger will default `approved_by`/`approved_at`
 * from the caller's session if left null, but the amount and correlation id
 * must be supplied explicitly.
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
      .select('amount_per_beneficiary, expires_at, default_allocation_stroops')
      .eq('id', enrollment.program_id)
      .single();

    if (programError) throw programError;

    // Prefer the policy's fixed allocation (stroops) when the program enforces
    // one; otherwise derive stroops from the legacy per-beneficiary peso amount.
    const allocationAmountStroops =
      program.default_allocation_stroops ??
      Math.round(Number(program.amount_per_beneficiary ?? 0) * STROOPS_PER_RCPHP);

    if (!Number.isFinite(allocationAmountStroops) || allocationAmountStroops <= 0) {
      throw new Error('This program has no positive per-beneficiary allocation configured.');
    }

    const { error } = await supabase
      .from('enrollments')
      .update({
        approval_status: approvalStatus,
        voucher_balance: program.amount_per_beneficiary,
        expires_at: program.expires_at,
        allocation_amount_stroops: allocationAmountStroops,
        allocation_correlation_id: randomUuidV4(),
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

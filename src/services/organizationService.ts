import { supabase } from '@/lib/supabase';
import type { UserProfile } from '@/types/auth';
import { OrganizationProgram } from '@/types/organization';
import { fetchWithRetry } from '@/utils/fetch-with-retry';
import { getRegistrationStatus } from '@/utils/registration-window';

const VALID_CATEGORIES = ['Food', 'Medicine', 'School Supplies', 'Cash'] as const;
type EnrollmentCategory = (typeof VALID_CATEGORIES)[number];

/** Maps a Program's `voucher_type` to a valid `enrollments.category` value. */
const toEnrollmentCategory = (voucherType: string | null): EnrollmentCategory => {
  if (!voucherType) return 'Cash';
  const normalized = voucherType.trim().toLowerCase();
  const match = VALID_CATEGORIES.find((category) => category.toLowerCase() === normalized);
  return match ?? 'Cash';
};

/**
 * Fetches Organizations with at least one Ongoing_Program, joined with the
 * Beneficiary's own existing Enrollment status per Program (Requirement 1, 3.3),
 * and evaluates location-based eligibility against the Program's assigned
 * barangays (Programs with no assigned barangays are open to everyone).
 * Retries the query up to 2 additional times (3 total attempts) before throwing.
 */
export const fetchOrganizationPrograms = async (
  beneficiaryId: string,
  beneficiaryBarangayId: UserProfile['barangay_id']
): Promise<OrganizationProgram[]> =>
  fetchWithRetry(async () => {
    const [programsResult, enrollmentsResult] = await Promise.all([
      supabase
        .from('programs')
        .select(`
          id,
          name,
          purpose,
          registration_open,
          registration_close,
          voucher_type,
          created_by,
          organization:profiles!programs_created_by_fkey (
            id,
            full_name
          ),
          program_barangays (
            barangay_id,
            barangays ( name )
          )
        `)
        .eq('status', 'active'),
      supabase
        .from('enrollments')
        .select('program_id, approval_status')
        .eq('beneficiary_id', beneficiaryId),
    ]);

    if (programsResult.error) throw programsResult.error;
    if (enrollmentsResult.error) throw enrollmentsResult.error;

    const enrollmentByProgramId = new Map<string, 'Approved' | 'Pending' | 'Rejected'>();
    for (const enrollment of enrollmentsResult.data ?? []) {
      enrollmentByProgramId.set(enrollment.program_id, enrollment.approval_status);
    }

    return (programsResult.data ?? []).map((row: any) => {
      const { status, canApply } = getRegistrationStatus(row.registration_open, row.registration_close);
      const existingEnrollmentStatus = enrollmentByProgramId.get(row.id) ?? null;

      const assignedBarangays: { id: number; name: string }[] = (row.program_barangays ?? [])
        .map((pb: any) => ({ id: pb.barangay_id, name: pb.barangays?.name }))
        .filter((b: { id: number; name: string | undefined }) => Boolean(b.name));
      // No assigned barangays means the Program is open to any location.
      const isEligibleByLocation =
        assignedBarangays.length === 0 ||
        (beneficiaryBarangayId != null && assignedBarangays.some((b) => b.id === beneficiaryBarangayId));

      return {
        id: row.id,
        organizationId: row.organization?.id ?? row.created_by,
        organizationName: row.organization?.full_name ?? 'Unknown Organization',
        programName: row.name,
        purpose: row.purpose ?? '',
        registrationOpen: row.registration_open,
        registrationClose: row.registration_close,
        registrationStatus: status,
        // Disabled if the window isn't open, the Beneficiary already has an Enrollment
        // for this Program (Requirement 3.3, 3.6), or the Beneficiary's barangay isn't
        // one of the Program's assigned areas.
        canApply: canApply && existingEnrollmentStatus === null && isEligibleByLocation,
        voucherType: row.voucher_type,
        existingEnrollmentStatus,
        isEligibleByLocation,
        eligibleBarangayNames: assignedBarangays.map((b) => b.name),
      } satisfies OrganizationProgram;
    });
  });

/**
 * Creates an Enrollment (Application) for the given Beneficiary and Program,
 * with `approval_status` set to "Pending" (Requirement 3.1).
 */
export const applyToProgram = async (beneficiaryId: string, program: OrganizationProgram): Promise<void> => {
  const category = toEnrollmentCategory(program.voucherType);

  const { error } = await supabase.from('enrollments').insert({
    beneficiary_id: beneficiaryId,
    program_id: program.id,
    approval_status: 'Pending',
    category,
  });

  if (error) throw error;
};

/**
 * Fetches all active LGUs (Organizations).
 */
export const fetchActiveLGUs = async (): Promise<{id: string, name: string}[]> => {
  const { data, error } = await supabase
    .from('organizations')
    .select('id, name')
    .eq('is_active', true)
    .order('name');
  
  if (error) throw error;
  return data ?? [];
};

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

export {
  isLocationEligible,
  isProgramApplicable,
  type LocationEligibilityInput,
  type ProgramApplicabilityInput,
} from '@/utils/program-applicability';
import { isLocationEligible, isProgramApplicable } from '@/utils/program-applicability';

/**
 * Fetches Organizations with at least one Ongoing_Program, joined with the
 * Beneficiary's own existing Enrollment status per Program (Requirement 1, 3.3),
 * and evaluates location-based eligibility against the Program's assigned
 * barangays and areas (Programs with no assigned locations are open to everyone).
 * Retries the query up to 2 additional times (3 total attempts) before throwing.
 */
export const fetchOrganizationPrograms = async (
  beneficiaryId: string,
  beneficiaryBarangayId: UserProfile['barangay_id'],
  beneficiaryAreaId?: UserProfile['area_id']
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
          voucher_types,
          created_by,
          organization:profiles!programs_created_by_fkey (
            id,
            full_name
          ),
          program_barangays (
            barangay_id,
            barangays ( name )
          ),
          program_areas (
            area_id,
            areas ( name )
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

      const assignedAreas: { id: number; name: string }[] = (row.program_areas ?? [])
        .map((pa: any) => ({ id: pa.area_id, name: pa.areas?.name }))
        .filter((a: { id: number; name: string | undefined }) => Boolean(a.name));

      const isEligibleByLocation = isLocationEligible({
        assignedBarangayIds: assignedBarangays.map((b) => b.id),
        assignedAreaIds: assignedAreas.map((a) => a.id),
        beneficiaryBarangayId,
        beneficiaryAreaId,
      });

      const resolvedVoucherType =
        row.voucher_type ??
        (Array.isArray(row.voucher_types) && row.voucher_types.length > 0 ? row.voucher_types[0] : null);

      const isApplicable = isProgramApplicable({
        isEligibleByLocation,
        existingEnrollmentStatus,
        registrationStatus: status,
      });

      return {
        id: row.id,
        organizationId: row.organization?.id ?? row.created_by,
        organizationName: row.organization?.full_name ?? 'Unknown Organization',
        programName: row.name,
        purpose: row.purpose ?? '',
        registrationOpen: row.registration_open,
        registrationClose: row.registration_close,
        registrationStatus: status,
        canApply: canApply && existingEnrollmentStatus === null && isEligibleByLocation,
        voucherType: resolvedVoucherType,
        existingEnrollmentStatus,
        isEligibleByLocation,
        eligibleBarangayNames: assignedBarangays.map((b) => b.name),
        eligibleAreaNames: assignedAreas.map((a) => a.name),
        isApplicable,
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

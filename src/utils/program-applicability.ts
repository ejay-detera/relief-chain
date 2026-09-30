import type { RegistrationStatus } from './registration-window';

export type ProgramApplicabilityInput = {
  isEligibleByLocation: boolean;
  existingEnrollmentStatus: 'Approved' | 'Pending' | 'Rejected' | null;
  registrationStatus: RegistrationStatus;
};

/**
 * Evaluates whether a program is applicable / fit for a beneficiary.
 * A program is applicable when:
 * 1. The beneficiary meets the location criteria (matching barangay or area, or program is open to all).
 * 2. The beneficiary does not already have an approved enrollment (approved programs belong in My Assistance).
 * 3. The program's registration window has not expired/closed.
 */
export function isProgramApplicable(input: ProgramApplicabilityInput): boolean {
  return (
    input.isEligibleByLocation &&
    input.existingEnrollmentStatus !== 'Approved' &&
    input.registrationStatus !== 'Closed'
  );
}

export type LocationEligibilityInput = {
  assignedBarangayIds: number[];
  assignedAreaIds: number[];
  beneficiaryBarangayId: number | null | undefined;
  beneficiaryAreaId?: number | null | undefined;
};

/**
 * Evaluates whether a beneficiary is eligible for a program based on geographic location.
 * - Programs with no assigned barangays and no assigned areas are open to everyone.
 * - If a program has assigned barangays, the beneficiary's barangay_id must match.
 * - If a program has assigned areas and no assigned barangays, the beneficiary's area_id must match.
 */
export function isLocationEligible(input: LocationEligibilityInput): boolean {
  const hasBarangayRestriction = input.assignedBarangayIds.length > 0;
  const hasAreaRestriction = input.assignedAreaIds.length > 0;
  const hasLocationRestriction = hasBarangayRestriction || hasAreaRestriction;

  if (!hasLocationRestriction) {
    return true;
  }

  if (hasBarangayRestriction) {
    return (
      input.beneficiaryBarangayId != null &&
      input.assignedBarangayIds.includes(input.beneficiaryBarangayId)
    );
  }

  if (hasAreaRestriction) {
    return (
      input.beneficiaryAreaId != null &&
      input.assignedAreaIds.includes(input.beneficiaryAreaId)
    );
  }

  return false;
}

export type ProgramFilterScope = 'canApply' | 'inMyArea' | 'all';

export type FilterProgramsOptions = {
  /**
   * Filter scope:
   * - 'canApply': Only programs the beneficiary can apply to right now (open registration, matching location, not yet applied).
   * - 'inMyArea': All programs matching beneficiary's location (including upcoming and pending applications).
   * - 'all': All active programs across all areas.
   * Defaults to 'canApply'.
   */
  scope?: ProgramFilterScope;
  applicableOnly?: boolean;
  canApplyOnly?: boolean;
  selectedCategory?: string;
  searchQuery?: string;
};

/**
 * Filters a list of programs by applicability, category, and search text.
 */
export function filterPrograms<
  T extends {
    canApply: boolean;
    isApplicable: boolean;
    voucherType: string | null;
    programName: string;
    organizationName: string;
    purpose: string;
  },
>(programs: T[], options: FilterProgramsOptions = {}): T[] {
  const {
    selectedCategory = 'All',
    searchQuery = '',
  } = options;

  const scope: ProgramFilterScope =
    options.scope ??
    (options.canApplyOnly
      ? 'canApply'
      : options.applicableOnly === false
        ? 'all'
        : 'canApply');

  return programs.filter((program) => {
    // 1. Scope filter
    if (scope === 'canApply' && !program.canApply) {
      return false;
    }
    if (scope === 'inMyArea' && !program.isApplicable) {
      return false;
    }

    // 2. Category filter
    if (selectedCategory && selectedCategory !== 'All') {
      const vType = program.voucherType?.toLowerCase() ?? '';
      const target = selectedCategory.toLowerCase();
      if (!vType.includes(target)) {
        return false;
      }
    }

    // 3. Search query filter
    if (searchQuery && searchQuery.trim().length > 0) {
      const q = searchQuery.toLowerCase().trim();
      const matchName = program.programName.toLowerCase().includes(q);
      const matchOrg = program.organizationName.toLowerCase().includes(q);
      const matchPurpose = program.purpose.toLowerCase().includes(q);
      if (!matchName && !matchOrg && !matchPurpose) {
        return false;
      }
    }

    return true;
  });
}


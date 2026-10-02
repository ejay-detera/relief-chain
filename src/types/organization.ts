import { RegistrationStatus } from '@/utils/registration-window';

export type OrganizationProgram = {
  id: string; // program id
  organizationId: string;
  organizationName: string;
  programName: string;
  purpose: string;
  registrationOpen: string | null;
  registrationClose: string | null;
  registrationStatus: RegistrationStatus;
  canApply: boolean;
  voucherType: string | null;
  existingEnrollmentStatus: 'Approved' | 'Pending' | 'Rejected' | null;
  /** The Beneficiary's own Enrollment id for this Program, when one exists. Used to deep-link to its status view. */
  existingEnrollmentId: string | null;
  /** True when the Program has no barangay restriction, or the Beneficiary's barangay is one of the assigned barangays. */
  isEligibleByLocation: boolean;
  /** Names of the barangays the Program is restricted to, for display when the Beneficiary is not eligible. Empty means no restriction. */
  eligibleBarangayNames: string[];
  /** True when this program is fit and applicable for the beneficiary (location eligible, registration not closed, and not already approved). */
  isApplicable: boolean;
  /** Names of the areas the Program is restricted to. Empty means no area restriction. */
  eligibleAreaNames?: string[];
};

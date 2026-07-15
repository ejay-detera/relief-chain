import { RegistrationStatus } from '@/utils/registration-window';

export type OrganizationProgram = {
  id: string;                 // program id
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
  /** True when the Program has no barangay restriction, or the Beneficiary's barangay is one of the assigned barangays. */
  isEligibleByLocation: boolean;
  /** Names of the barangays the Program is restricted to, for display when the Beneficiary is not eligible. Empty means no restriction. */
  eligibleBarangayNames: string[];
};

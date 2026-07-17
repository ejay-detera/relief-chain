import { initialOrganizationRegistrationData, type OrganizationRegistrationData } from '@/types/organization-registration';
import { getOrganizationStepError } from '@/utils/registration-validation';

/**
 * The subset of `OrganizationRegistrationData` a Resubmission actually edits
 * (Requirement 15.1): organization name, organization type, contact
 * information, and Authorized_Representative details. Email, mobile number,
 * sex/civil status, password, wallet address, and the verification document
 * are collected once at sign-up and are not part of a Resubmission.
 */
export type ResubmitFormData = Pick<
  OrganizationRegistrationData,
  'organizationName' | 'organizationType' | 'regionProvinceCity' | 'firstName' | 'lastName' | 'middleInitial' | 'position'
>;

export const initialResubmitFormData: ResubmitFormData = {
  organizationName: initialOrganizationRegistrationData.organizationName,
  organizationType: initialOrganizationRegistrationData.organizationType,
  regionProvinceCity: initialOrganizationRegistrationData.regionProvinceCity,
  firstName: initialOrganizationRegistrationData.firstName,
  lastName: initialOrganizationRegistrationData.lastName,
  middleInitial: initialOrganizationRegistrationData.middleInitial,
  position: initialOrganizationRegistrationData.position,
};

// Placeholder values for the sign-up-only fields `getOrganizationStepError`'s
// step-2 check also validates (email, mobile number, sex, civil status,
// password). These are constants that always satisfy their respective rules
// (valid email/mobile patterns, a strong password matching itself) — they
// exist only to satisfy the shared validator's step-2 field-shape contract
// so its representative-name/position rule can be reused verbatim, without
// duplicating that rule here and without ever gating on real user input for
// fields a Resubmission does not collect.
const VALIDATION_PLACEHOLDERS = {
  email: 'placeholder@reliefchain.app',
  mobileNumber: '09171234567',
  sex: 'female' as const,
  civilStatus: 'single' as const,
  password: 'Placeholder1!',
  confirmPassword: 'Placeholder1!',
};

const toValidatableData = (data: ResubmitFormData): OrganizationRegistrationData => ({
  ...initialOrganizationRegistrationData,
  ...data,
  ...VALIDATION_PLACEHOLDERS,
});

/**
 * Reuses `getOrganizationStepError` (the same validator `OrganizationDetailsStep`
 * and `OrganizationAccountStep` use) for the organization-detail rule (step 1)
 * and the representative-name/position rule (part of step 2), so a
 * Resubmission is gated on exactly the same business rules as initial sign-up
 * for the fields it edits, with no duplicated validation logic.
 */
export const getResubmitFormError = (data: ResubmitFormData): string | null => {
  const validatable = toValidatableData(data);
  return getOrganizationStepError(validatable, 1) ?? getOrganizationStepError(validatable, 2);
};

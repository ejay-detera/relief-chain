import type { BeneficiaryRegistrationData, BeneficiaryRegistrationStep } from '@/types/beneficiary-registration';
import type { OrganizationRegistrationData, OrganizationRegistrationStep } from '@/types/organization-registration';
import { isStrongPassword } from '@/utils/password-validation';

export const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const mobileNumberPattern = /^09\d{9}$/;

export const isRealNonFutureDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const real = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  const today = new Date();
  return real && date.getTime() < Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
};

export const getOrganizationStepError = (data: OrganizationRegistrationData, step: OrganizationRegistrationStep): string | null => {
  if (step === 1 && (!data.organizationName.trim() || !data.organizationType.trim() || !data.regionProvinceCity.trim())) return 'Enter the organization name, type, and region, province, or city.';
  if (step === 2) {
    if (!data.firstName.trim() || !data.lastName.trim() || !data.position.trim() || !data.sex || !data.civilStatus) return 'Complete all required representative details.';
    if (!emailPattern.test(data.email.trim())) return 'Enter a valid email address.';
    if (!mobileNumberPattern.test(data.mobileNumber)) return 'Enter an 11-digit Philippine mobile number starting with 09.';
    if (!isStrongPassword(data.password)) return 'Create a strong password that meets every requirement.';
    if (data.password !== data.confirmPassword) return 'Passwords do not match.';
  }
  if (step === 3) {
    if (!data.stellarWalletAddress.trim()) return 'Enter your Stellar wallet address.';
    if (!data.verificationDocument) return 'Select an organization ID or accreditation document.';
    if (!data.agreesToTerms) return 'Agree to the Terms & Conditions to continue.';
  }
  return null;
};

export const getBeneficiaryStepError = (data: BeneficiaryRegistrationData, step: BeneficiaryRegistrationStep): string | null => {
  if (step === 1) {
    if (!data.firstName.trim() || !data.lastName.trim() || !data.sex || !data.civilStatus) return 'Complete all required account details.';
    if (!isRealNonFutureDate(data.birthdate)) return 'Select a valid birthdate that is not in the future.';
  }
  if (step === 2) {
    if (!mobileNumberPattern.test(data.mobileNumber)) return 'Enter an 11-digit Philippine mobile number starting with 09.';
    if (!emailPattern.test(data.email.trim())) return 'Enter a valid email address.';
    if (!data.completeAddress.trim() || !data.municipalityCity.trim()) return 'Enter your complete address and municipality or city.';
  }
  if (step === 3 && (!data.governmentIdNumber.trim() || !data.governmentIdDocument)) return 'Enter your government ID number and select an ID image or PDF.';
  if (step === 4) {
    if (!data.stellarWalletAddress.trim()) return 'Enter your Stellar wallet address.';
    if (!isStrongPassword(data.password)) return 'Create a strong password that meets every requirement.';
    if (data.password !== data.confirmPassword) return 'Passwords do not match.';
    if (!data.agreesToTerms) return 'Agree to the Terms & Conditions to continue.';
  }
  return null;
};

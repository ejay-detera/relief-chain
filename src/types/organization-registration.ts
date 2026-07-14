import type { SelectedDocumentAsset } from '@/types/registration';

export type OrganizationRegistrationStep = 1 | 2 | 3;
export type OrganizationSex = 'female' | 'male';
export type OrganizationCivilStatus = 'single' | 'married' | 'widowed' | 'separated';

export type OrganizationRegistrationData = {
  organizationName: string;
  organizationType: string;
  regionProvinceCity: string;
  lastName: string;
  firstName: string;
  middleInitial: string;
  position: string;
  email: string;
  sex: OrganizationSex | null;
  civilStatus: OrganizationCivilStatus | null;
  mobileNumber: string;
  password: string;
  confirmPassword: string;
  stellarWalletAddress: string;
  verificationDocument: SelectedDocumentAsset | null;
  agreesToTerms: boolean;
};

export const initialOrganizationRegistrationData: OrganizationRegistrationData = {
  organizationName: '', organizationType: '', regionProvinceCity: '', lastName: '', firstName: '',
  middleInitial: '', position: '', email: '', sex: null, civilStatus: null, mobileNumber: '',
  password: '', confirmPassword: '', stellarWalletAddress: '', verificationDocument: null,
  agreesToTerms: false,
};

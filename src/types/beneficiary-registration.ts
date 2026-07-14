import type { SelectedDocumentAsset } from '@/types/registration';

export type BeneficiaryRegistrationStep = 1 | 2 | 3 | 4;
export type BeneficiarySex = 'female' | 'male';
export type BeneficiaryCivilStatus = 'single' | 'married' | 'widowed' | 'separated';

export type BeneficiaryRegistrationData = {
  lastName: string;
  firstName: string;
  middleInitial: string;
  birthdate: string;
  sex: BeneficiarySex | null;
  civilStatus: BeneficiaryCivilStatus | null;
  mobileNumber: string;
  email: string;
  completeAddress: string;
  municipalityCity: string;
  governmentIdNumber: string;
  governmentIdDocument: SelectedDocumentAsset | null;
  stellarWalletAddress: string;
  password: string;
  confirmPassword: string;
  agreesToTerms: boolean;
  cityId: number | null;
  city: string;
  districtId: number | null;
  district: string;
  barangayId: number | null;
  barangay: string;
};

export const initialBeneficiaryRegistrationData: BeneficiaryRegistrationData = {
  lastName: '', firstName: '', middleInitial: '', birthdate: '', sex: null, civilStatus: null,
  mobileNumber: '', email: '', completeAddress: '', municipalityCity: '', governmentIdNumber: '',
  governmentIdDocument: null, stellarWalletAddress: '', password: '', confirmPassword: '',
  agreesToTerms: false,
  cityId: null,
  city: '',
  districtId: null,
  district: '',
  barangayId: null,
  barangay: '',
};

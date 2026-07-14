export type MerchantBusinessType = 'grocery' | 'pharmacy' | 'convenienceStore' | 'other';

export type MerchantRegistrationData = {
  address: string;
  agreesToTerms: boolean;
  businessName: string;
  businessTypes: MerchantBusinessType[];
  confirmPassword: string;
  email: string;
  firstName: string;
  lastName: string;
  middleInitial: string;
  mobileNumber: string;
  password: string;
  stellarWalletAddress: string;
};

export type MerchantRegistrationStep = 1 | 2 | 3 | 4;

export const initialMerchantRegistrationData: MerchantRegistrationData = {
  address: '',
  agreesToTerms: false,
  businessName: '',
  businessTypes: [],
  confirmPassword: '',
  email: '',
  firstName: '',
  lastName: '',
  middleInitial: '',
  mobileNumber: '',
  password: '',
  stellarWalletAddress: '',
};

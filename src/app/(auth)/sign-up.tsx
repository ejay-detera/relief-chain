import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Alert } from 'react-native';

import { BeneficiaryRegistrationFlow } from '@/components/BeneficiaryRegistration/BeneficiaryRegistrationFlow';
import { MerchantRegistrationFlow } from '@/components/MerchantRegistration/MerchantRegistrationFlow';
import { OrganizationRegistrationFlow } from '@/components/OrganizationRegistration/OrganizationRegistrationFlow';
import { isUserRole, type UserRole } from '@/types/auth';

const SignUpScreen = () => {
  const { role: roleParam } = useLocalSearchParams<{ role?: string }>();
  const router = useRouter();
  const role: UserRole | null = isUserRole(roleParam) ? roleParam : null;

  useEffect(() => {
    if (role) return;
    Alert.alert('Choose an account type', 'Select Organization, Beneficiary, or Merchant to register.');
    router.replace('/(auth)/choose-account');
  }, [role, router]);

  if (role === 'lgu') return <OrganizationRegistrationFlow />;
  if (role === 'beneficiary') return <BeneficiaryRegistrationFlow />;
  if (role === 'merchant') return <MerchantRegistrationFlow />;
  return null;
};

export default SignUpScreen;

import { useEffect, useState } from 'react';
import { Alert, BackHandler } from 'react-native';

import { MerchantRegistrationShell } from '@/components/MerchantRegistration/MerchantRegistrationShell';
import { MerchantRegistrationStep } from '@/components/MerchantRegistration/MerchantRegistrationStep';
import { supabase } from '@/lib/supabase';
import {
  initialMerchantRegistrationData,
  type MerchantRegistrationData,
  type MerchantRegistrationStep as MerchantRegistrationStepType,
} from '@/types/merchant-registration';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const stepTitles: Record<MerchantRegistrationStepType, string> = {
  1: 'Business Information',
  2: 'Owner Information',
  3: 'Wallet & Verification',
  4: 'Account',
};

export default function SignUpScreen() {
  const [data, setData] = useState<MerchantRegistrationData>(initialMerchantRegistrationData);
  const [step, setStep] = useState<MerchantRegistrationStepType>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateRegistration = (values: Partial<MerchantRegistrationData>) => {
    setData((current) => ({ ...current, ...values }));
  };

  const validateCurrentStep = () => {
    if (step === 1) {
      const hasRequiredDetails = data.businessName.trim() && data.businessTypes.length > 0 && data.address.trim();

      if (!hasRequiredDetails) {
        Alert.alert('Complete business details', 'Enter a business name, select at least one business type, and provide an address.');
        return false;
      }
    }

    if (step === 2) {
      const hasRequiredDetails = data.firstName.trim() && data.lastName.trim() && data.mobileNumber.trim();
      const hasValidEmail = emailPattern.test(data.email.trim());

      if (!hasRequiredDetails || !hasValidEmail) {
        Alert.alert('Complete owner details', 'Enter the owner’s first and last name, mobile number, and a valid email address.');
        return false;
      }
    }

    if (step === 3 && !data.stellarWalletAddress.trim()) {
      Alert.alert('Wallet required', 'Enter the Stellar wallet address before continuing.');
      return false;
    }

    return true;
  };

  const advanceStep = () => {
    if (!validateCurrentStep()) return;

    setStep((current) => Math.min(current + 1, 4) as MerchantRegistrationStepType);
  };

  const goToCompletedStep = (targetStep: MerchantRegistrationStepType) => {
    if (targetStep <= step) {
      setStep(targetStep);
    }
  };

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (step === 1) return false;

      setStep((current) => (current - 1) as MerchantRegistrationStepType);
      return true;
    });

    return () => subscription.remove();
  }, [step]);

  const handlePermitUpload = () => {
    Alert.alert('Upload Business Permit', 'Business-permit upload will be available when document verification is connected.');
  };

  const createAccount = async () => {
    if (!data.email || !data.password || !data.firstName || !data.lastName) {
      Alert.alert('Missing details', 'Complete the owner information and account fields to continue.');
      return;
    }

    if (data.password !== data.confirmPassword) {
      Alert.alert('Passwords do not match', 'Enter the same password in both fields.');
      return;
    }

    if (!data.agreesToTerms) {
      Alert.alert('Terms required', 'Agree to the Terms & Conditions before creating your account.');
      return;
    }

    setIsSubmitting(true);
    const fullName = [data.firstName, data.middleInitial, data.lastName].filter(Boolean).join(' ');

    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: data.email.trim(),
        password: data.password,
        options: {
          data: {
            business_name: data.businessName,
            business_types: data.businessTypes,
            mobile_number: data.mobileNumber,
          },
        },
      });

      if (authError) {
        Alert.alert('Account creation failed', authError.message);
        return;
      }

      if (authData.user) {
        const { error: profileError } = await supabase.from('profiles').insert({
          id: authData.user.id,
          role: 'merchant',
          full_name: fullName,
          location: data.address,
          stellar_pubkey: data.stellarWalletAddress || null,
        });

        if (profileError) {
          Alert.alert('Profile setup failed', profileError.message);
          return;
        }
      }

      Alert.alert('Account created', 'Your merchant account has been created successfully.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <MerchantRegistrationShell
      onStepPress={goToCompletedStep}
      step={step}
      title={stepTitles[step]}
    >
      <MerchantRegistrationStep
        data={data}
        isSubmitting={isSubmitting}
        onChange={updateRegistration}
        onNext={advanceStep}
        onSubmit={createAccount}
        onUploadPermit={handlePermitUpload}
        step={step}
      />
    </MerchantRegistrationShell>
  );
}

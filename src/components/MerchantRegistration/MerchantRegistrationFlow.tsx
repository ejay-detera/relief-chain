import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, BackHandler } from 'react-native';

import { MerchantRegistrationShell } from '@/components/MerchantRegistration/MerchantRegistrationShell';
import { MerchantRegistrationStep } from '@/components/MerchantRegistration/MerchantRegistrationStep';
import { isSupabaseConfigured, supabase, supabaseSetupMessage } from '@/lib/supabase';
import { initialMerchantRegistrationData, type MerchantRegistrationData, type MerchantRegistrationStep as Step } from '@/types/merchant-registration';
import { isStrongPassword } from '@/utils/password-validation';
import { emailPattern, mobileNumberPattern } from '@/utils/registration-validation';
import { SubmissionConfirmationStep } from './SubmissionConfirmationStep';

const titles: Record<Step, string> = { 1: 'Business Information', 2: 'Owner Information', 3: 'Wallet & Verification', 4: 'Account' };

const getStepError = (data: MerchantRegistrationData, step: Step): string | null => {
  if (step === 1 && (!data.businessName.trim() || data.businessTypes.length === 0 || !data.address.trim())) return 'Enter a business name, type, and address.';
  if (step === 2) {
    if (!data.firstName.trim() || !data.lastName.trim()) return 'Enter the owner’s first and last name.';
    if (!mobileNumberPattern.test(data.mobileNumber)) return 'Enter an 11-digit Philippine mobile number starting with 09.';
    if (!emailPattern.test(data.email.trim())) return 'Enter a valid email address.';
  }
  if (step === 4) {
    if (!isStrongPassword(data.password)) return 'Create a strong password that meets every requirement.';
    if (data.password !== data.confirmPassword) return 'Passwords do not match.';
    if (!data.agreesToTerms) return 'Agree to the Terms & Conditions to continue.';
  }
  return null;
};

export const MerchantRegistrationFlow = () => {
  const [data, setData] = useState<MerchantRegistrationData>(initialMerchantRegistrationData);
  const [step, setStep] = useState<Step>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const router = useRouter();

  const update = (values: Partial<MerchantRegistrationData>) => setData((current) => ({ ...current, ...values }));
  const validate = (target: Step) => {
    const message = getStepError(data, target);
    if (message) Alert.alert('Check your details', message);
    return !message;
  };
  const next = () => {
    if (!validate(step) || step === 4) return;
    setStep((step + 1) as Step);
  };

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (step === 1) return false;
      setStep((step - 1) as Step);
      return true;
    });
    return () => subscription.remove();
  }, [step]);

  const createAccount = async () => {
    const invalidStep = ([1, 2, 3, 4] as Step[]).find((target) => getStepError(data, target));
    if (invalidStep) {
      setStep(invalidStep);
      validate(invalidStep);
      return;
    }
    if (!isSupabaseConfigured) {
      Alert.alert('Supabase setup required', supabaseSetupMessage);
      return;
    }

    setIsSubmitting(true);
    try {
      const fullName = [data.firstName, data.middleInitial, data.lastName].filter(Boolean).join(' ');
      const { data: signUpData, error } = await supabase.auth.signUp({
        email: data.email.trim(),
        password: data.password,
        options: { data: {
          role: 'merchant', full_name: fullName, location: data.address.trim(), gov_id: null,
          stellar_pubkey: data.stellarWalletAddress.trim() || null, business_name: data.businessName.trim(),
          business_types: data.businessTypes, mobile_number: data.mobileNumber,
          business_permit_name: data.permitDocument?.name ?? null,
          business_permit_mime_type: data.permitDocument?.mimeType ?? null,
        } },
      });
      if (error) {
        Alert.alert('Account creation failed', error.message);
        return;
      }
      if (signUpData?.user) {
        setSubmitted(true);
      } else {
        router.replace({ pathname: '/(auth)/verify-email', params: { email: data.email.trim(), role: 'merchant' } });
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Please try again.';
      Alert.alert('Account creation failed', message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) return <SubmissionConfirmationStep />;

  return (
    <MerchantRegistrationShell onStepPress={(target) => target <= step && setStep(target)} step={step} title={titles[step]}>
      <MerchantRegistrationStep
        data={data}
        isSubmitting={isSubmitting}
        onChange={update}
        onNext={next}
        onSubmit={createAccount}
        step={step}
      />
    </MerchantRegistrationShell>
  );
};

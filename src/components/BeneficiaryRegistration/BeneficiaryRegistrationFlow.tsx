import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, BackHandler } from 'react-native';

import { RegistrationShell } from '@/components/AuthRegistration/RegistrationShell';
import { isSupabaseConfigured, supabase, supabaseSetupMessage } from '@/lib/supabase';
import { initialBeneficiaryRegistrationData, type BeneficiaryRegistrationData, type BeneficiaryRegistrationStep as Step } from '@/types/beneficiary-registration';
import { getBeneficiaryStepError } from '@/utils/registration-validation';

import { BeneficiaryAccountStep } from './BeneficiaryAccountStep';
import { BeneficiaryPersonalStep } from './BeneficiaryPersonalStep';
import { BeneficiaryVerificationStep } from './BeneficiaryVerificationStep';
import { BeneficiaryWalletStep } from './BeneficiaryWalletStep';

const titles: Record<Step, string> = { 1: 'Account Creation', 2: 'Personal Information', 3: 'Verification', 4: 'Wallet & Account' };
const beneficiaryDescription = 'Register your account to manage disaster relief programs and receive financial assistance securely.';
const descriptions: Record<Step, string> = {
  1: beneficiaryDescription,
  2: beneficiaryDescription,
  3: beneficiaryDescription,
  4: beneficiaryDescription,
};
const steps: Step[] = [1, 2, 3, 4];

export const BeneficiaryRegistrationFlow = () => {
  const [data, setData] = useState<BeneficiaryRegistrationData>(initialBeneficiaryRegistrationData);
  const [step, setStep] = useState<Step>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  const update = (values: Partial<BeneficiaryRegistrationData>) => setData((current) => ({ ...current, ...values }));
  const validate = (target: Step) => {
    const message = getBeneficiaryStepError(data, target);
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
    const invalidStep = steps.find((target) => getBeneficiaryStepError(data, target));
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
      const location = [data.completeAddress, data.barangay, data.district, data.city].filter(Boolean).join(', ');
      const document = data.governmentIdDocument;
      if (!document) return;
      const { data: signUpData, error } = await supabase.auth.signUp({
        email: data.email.trim(),
        password: data.password,
        options: { data: {
          role: 'beneficiary', full_name: fullName, gov_id: data.governmentIdNumber.trim(), location,
          stellar_pubkey: data.stellarWalletAddress.trim(), birthdate: data.birthdate,
          first_name: data.firstName.trim(), last_name: data.lastName.trim(),
          middle_initial: data.middleInitial.trim() || null, mobile_number: data.mobileNumber,
          sex: data.sex, civil_status: data.civilStatus, complete_address: data.completeAddress.trim(),
          municipality_city: data.municipalityCity.trim(), government_id_document_name: document.name,
          government_id_document_mime_type: document.mimeType,
        } },
      });
      if (error) {
        Alert.alert('Account creation failed', error.message);
        return;
      }
      if (signUpData?.session) {
        router.replace({ pathname: '/(auth)/registration-success', params: { role: 'beneficiary' } });
      } else {
        router.replace({ pathname: '/(auth)/verify-email', params: { email: data.email.trim(), role: 'beneficiary' } });
      }
    } catch (error: unknown) {
      Alert.alert('Account creation failed', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <RegistrationShell description={descriptions[step]} onStepPress={(target) => target <= step && setStep(target as Step)} step={step} title={titles[step]} totalSteps={4}>
      {step === 1 && <BeneficiaryAccountStep data={data} onChange={update} onNext={next} />}
      {step === 2 && <BeneficiaryPersonalStep data={data} onChange={update} onNext={next} />}
      {step === 3 && <BeneficiaryVerificationStep data={data} onChange={update} onNext={next} />}
      {step === 4 && <BeneficiaryWalletStep data={data} isSubmitting={isSubmitting} onChange={update} onSubmit={createAccount} />}
    </RegistrationShell>
  );
};

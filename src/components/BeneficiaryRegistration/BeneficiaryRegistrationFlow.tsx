import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, BackHandler } from 'react-native';

import { RegistrationShell } from '@/components/AuthRegistration/RegistrationShell';
import { isSupabaseConfigured, supabase, supabaseSetupMessage } from '@/lib/supabase';
import { initialBeneficiaryRegistrationData, type BeneficiaryRegistrationData, type BeneficiaryRegistrationStep as Step } from '@/types/beneficiary-registration';
import { readDocumentForUpload } from '@/utils/document-upload';
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

  /**
   * Uploads the already-selected government ID to the given Storage path,
   * retrying up to three attempts before giving up. Kept separate from
   * `createAccount` so a failed-upload retry re-attempts only the upload —
   * re-running `supabase.auth.signUp()` against an email that already has an
   * account would fail or create confusion, not actually fix anything.
   */
  const uploadIdDocument = async (
    document: NonNullable<BeneficiaryRegistrationData['governmentIdDocument']>,
    filePath: string
  ): Promise<boolean> => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const uploadPayload = await readDocumentForUpload(document).catch(() => null);
      if (!uploadPayload) continue;

      const { error: uploadError } = await supabase.storage
        .from('valid_ids')
        .upload(filePath, uploadPayload.body, { contentType: uploadPayload.contentType, upsert: true });

      if (!uploadError) return true;
    }
    return false;
  };

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

  /**
   * Retries only the ID upload against an account that was already created
   * by a prior `createAccount()` call. `filePath` is the same Storage key
   * recorded on that account's `gov_id_url` metadata, so a successful retry
   * lands in the exact place the profile already expects it.
   */
  const retryIdUpload = async (
    document: NonNullable<BeneficiaryRegistrationData['governmentIdDocument']>,
    filePath: string
  ) => {
    setIsSubmitting(true);
    try {
      const uploaded = await uploadIdDocument(document, filePath);
      if (!uploaded) {
        Alert.alert(
          'ID Upload Failed',
          'We still could not upload your government ID. Your registration is not complete without it — please try again.',
          [
            { text: 'Retry', onPress: () => void retryIdUpload(document, filePath) },
            { text: 'Cancel', style: 'cancel' },
          ]
        );
        return;
      }
      router.replace({ pathname: '/(auth)/registration-success', params: { role: 'beneficiary' } });
    } finally {
      setIsSubmitting(false);
    }
  };

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
      if (!document) {
        Alert.alert('Document required', 'Please upload a government ID.');
        return;
      }

      // 1. Prepare upload path
      const fileExt = document.name.split('.').pop() || 'jpg';
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
      const filePath = fileName;

      // 2. Perform Supabase authentication sign up with metadata
      const { data: signUpData, error } = await supabase.auth.signUp({
        email: data.email.trim(),
        password: data.password,
        options: { data: {
          role: 'beneficiary', full_name: fullName, gov_id: data.governmentIdNumber.trim(), location,
          stellar_pubkey: data.stellarWalletAddress.trim(), birthdate: data.birthdate,
          first_name: data.firstName.trim(), last_name: data.lastName.trim(),
          middle_initial: data.middleInitial.trim() || null, mobile_number: data.mobileNumber,
          sex: data.sex, civil_status: data.civilStatus, complete_address: data.completeAddress.trim(),
          municipality_city: data.municipalityCity.trim(), gov_id_url: filePath,
          city_id: data.cityId, area_id: data.districtId, barangay_id: data.barangayId,
          household_size: data.householdSize,
        } },
      });
      if (error) {
        Alert.alert('Account creation failed', error.message);
        return;
      }

      // 3. Upload ID document to Supabase storage 'valid_ids' bucket if session
      // exists. The profile row already exists at this point (auth.signUp
      // above triggers handle_new_user()), and a client has no admin API to
      // delete it, so a failed upload cannot be rolled back outright — but it
      // must not be silently treated as a completed registration either
      // (BEN-01 requires a valid ID). Offer an explicit retry that re-attempts
      // only the upload rather than advancing to registration-success with no
      // ID actually on file.
      if (signUpData?.session) {
        const uploaded = await uploadIdDocument(document, filePath);
        if (!uploaded) {
          Alert.alert(
            'ID Upload Failed',
            'Your account was created, but we could not upload your government ID after multiple attempts. Your registration is not complete without it — please try again.',
            [
              { text: 'Retry', onPress: () => void retryIdUpload(document, filePath) },
              { text: 'Cancel', style: 'cancel' },
            ]
          );
          return;
        }

        router.replace({ pathname: '/(auth)/registration-success', params: { role: 'beneficiary' } });
      } else {
        Alert.alert('Email Verification Required', 'Account created! Since email confirmation is required, you must upload your ID securely after logging in.');
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

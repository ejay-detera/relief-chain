import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, BackHandler } from 'react-native';

import { RegistrationShell } from '@/components/AuthRegistration/RegistrationShell';
import { isSupabaseConfigured, supabase, supabaseSetupMessage } from '@/lib/supabase';
import { initialOrganizationRegistrationData, type OrganizationRegistrationData, type OrganizationRegistrationStep as Step } from '@/types/organization-registration';
import { getOrganizationStepError } from '@/utils/registration-validation';
import { getPostSignUpDestination } from '@/utils/signup-routing';

import { OrganizationAccountStep } from './OrganizationAccountStep';
import { OrganizationDetailsStep } from './OrganizationDetailsStep';
import { OrganizationVerificationStep } from './OrganizationVerificationStep';

const titles: Record<Step, string> = { 1: 'Organization Registration', 2: 'Account Information', 3: 'Wallet & Verification' };
const organizationDescription = 'Register your organization to manage disaster relief programs and distribute financial assistance securely.';
const descriptions: Record<Step, string> = {
  1: organizationDescription,
  2: organizationDescription,
  3: organizationDescription,
};
const steps: Step[] = [1, 2, 3];

export const OrganizationRegistrationFlow = () => {
  const [data, setData] = useState<OrganizationRegistrationData>(initialOrganizationRegistrationData);
  const [step, setStep] = useState<Step>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  const update = (values: Partial<OrganizationRegistrationData>) => setData((current) => ({ ...current, ...values }));
  const validate = (target: Step) => {
    const message = getOrganizationStepError(data, target);
    if (message) Alert.alert('Check your details', message);
    return !message;
  };
  const next = () => {
    if (!validate(step) || step === 3) return;
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
    const invalidStep = steps.find((target) => getOrganizationStepError(data, target));
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
      const document = data.verificationDocument;
      if (!document) return;
      const email = data.email.trim();

      // Organization (lgu) sign-up skips email-OTP confirmation (Requirement 9.1):
      // the `lgu-signup` Edge Function creates a pre-confirmed account via the
      // Auth Admin API, then this client signs in with the same credentials to
      // establish a session. beneficiary/merchant sign-up is untouched and
      // still calls supabase.auth.signUp directly (Requirement 9.2).
      const { error: createError } = await supabase.functions.invoke('lgu-signup', {
        body: {
          email,
          password: data.password,
          metadata: {
            full_name: fullName, gov_id: null, location: data.regionProvinceCity.trim(),
            stellar_pubkey: data.stellarWalletAddress.trim(), organization_name: data.organizationName.trim(),
            organization_type: data.organizationType.trim(), representative_first_name: data.firstName.trim(),
            representative_last_name: data.lastName.trim(), representative_middle_initial: data.middleInitial.trim() || null,
            representative_position: data.position.trim(), sex: data.sex, civil_status: data.civilStatus,
            mobile_number: data.mobileNumber, organization_document_name: document.name,
            organization_document_mime_type: document.mimeType,
          },
        },
      });
      if (createError) {
        Alert.alert('Account creation failed', createError.message);
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: data.password });
      if (signInError) {
        Alert.alert('Account creation failed', signInError.message);
        return;
      }

      // Session is now always established for lgu (no OTP step). lgu always
      // routes to application-review, never registration-success or
      // verify-email (Requirement 11.1, Property 15). getPostSignUpDestination
      // is the single source of truth for this decision (see Property 15's
      // test); the branch below only translates that decision into a typed
      // expo-router route.
      const destination = getPostSignUpDestination('lgu', true);
      if (destination === 'application-review') {
        router.replace({ pathname: '/(auth)/application-review' });
      } else if (destination === 'registration-success') {
        router.replace({ pathname: '/(auth)/registration-success', params: { role: 'lgu' } });
      } else {
        router.replace({ pathname: '/(auth)/verify-email', params: { email, role: 'lgu' } });
      }
    } catch (error: unknown) {
      Alert.alert('Account creation failed', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <RegistrationShell description={descriptions[step]} onStepPress={(target) => target <= step && setStep(target as Step)} step={step} title={titles[step]} totalSteps={3}>
      {step === 1 && <OrganizationDetailsStep data={data} onChange={update} onNext={next} />}
      {step === 2 && <OrganizationAccountStep data={data} onChange={update} onNext={next} />}
      {step === 3 && <OrganizationVerificationStep data={data} isSubmitting={isSubmitting} onChange={update} onSubmit={createAccount} />}
    </RegistrationShell>
  );
};

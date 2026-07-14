import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmailVerificationForm } from '@/components/AuthVerification/EmailVerificationForm';
import { authVerificationStyles as styles } from '@/components/AuthVerification/styles';
import { ThemedView } from '@/components/themed-view';
import { isSupabaseConfigured, supabase, supabaseSetupMessage } from '@/lib/supabase';
import { isUserRole, type UserRole } from '@/types/auth';

const OTP_LENGTH = 8;
const RESEND_DURATION_SECONDS = 60;

const formatCountdown = (seconds: number) => {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const remainingSeconds = (seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainingSeconds}`;
};

export default function VerifyEmailScreen() {
  const { email: emailParam, role: roleParam } = useLocalSearchParams<{ email?: string; role?: string }>();
  const role: UserRole | null = isUserRole(roleParam) ? roleParam : null;
  const [code, setCode] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [secondsRemaining, setSecondsRemaining] = useState(RESEND_DURATION_SECONDS);
  const [isResending, setIsResending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const router = useRouter();
  const email = emailParam?.trim() ?? '';

  useEffect(() => {
    if (role && email) return;
    Alert.alert('Registration details unavailable', 'Return to account selection and start registration again.');
    router.replace('/(auth)/choose-account');
  }, [email, role, router]);

  useEffect(() => {
    if (secondsRemaining === 0) return;

    const interval = setInterval(() => {
      setSecondsRemaining((current) => Math.max(current - 1, 0));
    }, 1000);

    return () => clearInterval(interval);
  }, [secondsRemaining]);

  const updateCode = (index: number, value: string) => {
    setCode((current) => current.map((digit, digitIndex) => (digitIndex === index ? value : digit)));
  };

  const verifyCode = async () => {
    const token = code.join('');

    if (!email || token.length !== OTP_LENGTH) {
      Alert.alert('Verification code required', 'Enter the 8-digit code sent to your email.');
      return;
    }

    if (!isSupabaseConfigured) {
      Alert.alert('Supabase setup required', supabaseSetupMessage);
      return;
    }

    setIsVerifying(true);
    const { error } = await supabase.auth.verifyOtp({ email, token, type: 'signup' });
    setIsVerifying(false);

    if (error) {
      Alert.alert('Verification failed', error.message);
      return;
    }

    if (!role) return;
    router.replace({ pathname: '/(auth)/registration-success', params: { role } });
  };

  const resendCode = async () => {
    if (!email) {
      Alert.alert('Email unavailable', 'Return to registration and try again.');
      return;
    }

    if (!isSupabaseConfigured) {
      Alert.alert('Supabase setup required', supabaseSetupMessage);
      return;
    }

    setIsResending(true);
    const { error } = await supabase.auth.resend({ email, type: 'signup' });
    setIsResending(false);

    if (error) {
      Alert.alert('Unable to resend code', error.message);
      return;
    }

    setCode(Array(OTP_LENGTH).fill(''));
    setSecondsRemaining(RESEND_DURATION_SECONDS);
  };

  if (!role || !email) return null;

  return (
    <ThemedView style={styles.page}>
      <SafeAreaView style={styles.safeArea}>
        <EmailVerificationForm
          code={code}
          countdown={secondsRemaining > 0 ? formatCountdown(secondsRemaining) : null}
          email={email || 'your registered email'}
          isResending={isResending}
          isVerifying={isVerifying}
          onChangeCode={updateCode}
          onClose={() => role
            ? router.replace({ pathname: '/(auth)/sign-in', params: { role } })
            : router.replace('/(auth)/choose-account')}
          onResend={resendCode}
          onVerify={verifyCode}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

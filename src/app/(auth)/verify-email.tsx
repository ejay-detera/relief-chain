import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmailVerificationForm } from '@/components/AuthVerification/EmailVerificationForm';
import { authVerificationStyles as styles } from '@/components/AuthVerification/styles';
import { ThemedView } from '@/components/themed-view';
import { isSupabaseConfigured, supabase, supabaseSetupMessage } from '@/lib/supabase';

const OTP_LENGTH = 6;
const RESEND_DURATION_SECONDS = 60;

const formatCountdown = (seconds: number) => {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const remainingSeconds = (seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainingSeconds}`;
};

export default function VerifyEmailScreen() {
  const { email: emailParam } = useLocalSearchParams<{ email?: string }>();
  const [code, setCode] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [secondsRemaining, setSecondsRemaining] = useState(RESEND_DURATION_SECONDS);
  const [isResending, setIsResending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const router = useRouter();
  const email = emailParam ?? '';

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
      Alert.alert('Verification code required', 'Enter the 6-digit code sent to your email.');
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

    router.replace('/(auth)/registration-success' as any);
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
          onClose={() => router.replace('/(auth)/sign-in' as any)}
          onResend={resendCode}
          onVerify={verifyCode}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

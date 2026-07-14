import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PasswordRecoveryFlow } from '@/components/AuthPasswordRecovery/PasswordRecoveryFlow';
import { passwordRecoveryStyles as styles } from '@/components/AuthPasswordRecovery/styles';
import { ThemedView } from '@/components/themed-view';
import { isSupabaseConfigured, supabase, supabaseSetupMessage } from '@/lib/supabase';
import {
    PASSWORD_RECOVERY_OTP_LENGTH,
    type PasswordRecoveryCode,
    type PasswordRecoveryCodeIndex,
    type PasswordRecoveryStep,
} from '@/types/auth';

const RESEND_DURATION_SECONDS = 200;

const createEmptyCode = (): PasswordRecoveryCode => Array.from({ length: PASSWORD_RECOVERY_OTP_LENGTH }, () => '');

const formatCountdown = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
};

export default function ForgotPasswordScreen() {
  const { email: emailParam } = useLocalSearchParams<{ email?: string }>();
  const router = useRouter();
  const [code, setCode] = useState<PasswordRecoveryCode>(createEmptyCode);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isResending, setIsResending] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [secondsUntilExpiry, setSecondsUntilExpiry] = useState<number | null>(null);
  const [step, setStep] = useState<PasswordRecoveryStep>('code');

  const email = emailParam?.trim() ?? '';
  const hasMinimumLength = newPassword.length >= 8;
  const hasLettersAndNumbers = /[A-Za-z]/.test(newPassword) && /\d/.test(newPassword);
  const isPasswordValid = hasMinimumLength && hasLettersAndNumbers && newPassword === confirmPassword;

  useEffect(() => {
    if (secondsUntilExpiry === null || secondsUntilExpiry <= 0) {
      return undefined;
    }

    const timeout = setTimeout(() => {
      setSecondsUntilExpiry((currentSeconds) => (currentSeconds && currentSeconds > 0 ? currentSeconds - 1 : 0));
    }, 1000);

    return () => clearTimeout(timeout);
  }, [secondsUntilExpiry]);

  const handleCodeChange = (index: PasswordRecoveryCodeIndex, value: string) => {
    setCode((currentCode) => currentCode.map((digit, digitIndex) => (digitIndex === index ? value : digit)));
  };

  const handlePasteCode = (startIndex: PasswordRecoveryCodeIndex, value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, PASSWORD_RECOVERY_OTP_LENGTH - startIndex);

    setCode((currentCode) => currentCode.map((digit, index) => digits[index - startIndex] ?? digit));
  };

  const handleResend = async () => {
    if (!email) {
      Alert.alert('Email unavailable', 'Return to sign in and request a new recovery code.');
      return;
    }

    if (!isSupabaseConfigured) {
      Alert.alert('Supabase setup required', supabaseSetupMessage);
      return;
    }

    setIsResending(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    setIsResending(false);

    if (error) {
      Alert.alert('Unable to resend code', error.message);
      return;
    }

    setCode(createEmptyCode());
    setSecondsUntilExpiry(RESEND_DURATION_SECONDS);
  };

  const handleVerifyCode = async () => {
    const token = code.join('');

    if (token.length !== PASSWORD_RECOVERY_OTP_LENGTH) {
      Alert.alert('Verification code required', `Enter the ${PASSWORD_RECOVERY_OTP_LENGTH}-digit code sent to your email.`);
      return;
    }

    if (!isSupabaseConfigured) {
      Alert.alert('Supabase setup required', supabaseSetupMessage);
      return;
    }

    setIsVerifying(true);
    const { error } = await supabase.auth.verifyOtp({ email, token, type: 'recovery' });
    setIsVerifying(false);

    if (error) {
      Alert.alert('Verification failed', error.message);
      return;
    }

    setStep('reset');
  };

  const handleSubmitPassword = async () => {
    if (!isPasswordValid) {
      return;
    }

    setIsUpdatingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setIsUpdatingPassword(false);

    if (error) {
      Alert.alert('Unable to update password', error.message);
      return;
    }

    await supabase.auth.signOut();
    setStep('success');
  };

  const handleClose = () => {
    router.replace('/(auth)/sign-in');
  };

  return (
    <ThemedView style={styles.page}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView behavior={Platform.select({ ios: 'padding', default: undefined })} style={styles.safeArea}>
          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            <PasswordRecoveryFlow
              code={code}
              confirmPassword={confirmPassword}
              email={email}
              expiresIn={secondsUntilExpiry === null ? null : formatCountdown(secondsUntilExpiry)}
              isPasswordValid={isPasswordValid}
              isResending={isResending}
              isUpdatingPassword={isUpdatingPassword}
              isVerifying={isVerifying}
              newPassword={newPassword}
              onChangeCode={handleCodeChange}
              onClose={handleClose}
              onConfirmPasswordChange={setConfirmPassword}
              onNewPasswordChange={setNewPassword}
              onPasteCode={handlePasteCode}
              onResend={handleResend}
              onSubmitPassword={handleSubmitPassword}
              onVerifyCode={handleVerifyCode}
              step={step}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

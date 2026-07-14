import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthBrandHeader } from '@/components/AuthSignIn/AuthBrandHeader';
import { AuthSignInForm, type SignInMethod } from '@/components/AuthSignIn/AuthSignInForm';
import { authSignInStyles as styles } from '@/components/AuthSignIn/styles';
import { ThemedView } from '@/components/themed-view';
import { isSupabaseConfigured, supabase, supabaseSetupMessage } from '@/lib/supabase';

type SignInRole = 'lgu' | 'beneficiary' | 'merchant';

const registrationPrompts: Record<SignInRole, string> = {
  lgu: 'New Organization?',
  beneficiary: 'New Beneficiary?',
  merchant: 'New Merchant?',
};

export default function SignInScreen() {
  const { email: emailParam, role } = useLocalSearchParams<{ email?: string; role?: SignInRole }>();
  const [identifier, setIdentifier] = useState(emailParam ?? '');
  const [accessKey, setAccessKey] = useState('');
  const [method, setMethod] = useState<SignInMethod>('merchantId');
  const [isLoading, setIsLoading] = useState(false);
  const [isSendingRecovery, setIsSendingRecovery] = useState(false);
  const router = useRouter();

  const registrationPrompt = role ? registrationPrompts[role] : 'New Account?';

  const signInWithCredentials = async () => {
    if (!identifier.trim() || !accessKey) {
      Alert.alert('Missing credentials', 'Enter your beneficiary ID and access key to continue.');
      return;
    }

    if (!isSupabaseConfigured) {
      Alert.alert('Supabase setup required', supabaseSetupMessage);
      return;
    }

    setIsLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: identifier.trim(),
      password: accessKey,
    });
    setIsLoading(false);

    if (error) {
      Alert.alert('Identity Verification Failed', error.message);
    }
  };

  const handleForgotPassword = async () => {
    const email = identifier.trim();

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      Alert.alert('Email required', 'Enter the email address linked to your account to recover your password.');
      return;
    }

    if (!isSupabaseConfigured) {
      Alert.alert('Supabase setup required', supabaseSetupMessage);
      return;
    }

    setIsSendingRecovery(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    setIsSendingRecovery(false);

    if (error) {
      Alert.alert('Unable to send code', error.message);
      return;
    }

    router.push({ pathname: '/(auth)/forgot-password', params: { email } });
  };

  const handleScanId = () => {
    Alert.alert('Scan ID', 'ID scanning will be available when the camera verification flow is connected.');
  };

  return (
    <ThemedView style={styles.page}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.select({ ios: 'padding', default: undefined })}
          style={styles.safeArea}
        >
          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            <AuthBrandHeader />
            <AuthSignInForm
              accessKey={accessKey}
              identifier={identifier}
              isLoading={isLoading}
              isSendingRecovery={isSendingRecovery}
              method={method}
              onAccessKeyChange={setAccessKey}
              onForgotPassword={handleForgotPassword}
              onIdentifierChange={setIdentifier}
              onRegister={() => router.push('/(auth)/sign-up')}
              onScanId={handleScanId}
              onSelectMethod={setMethod}
              onVerifyIdentity={signInWithCredentials}
              registrationPrompt={registrationPrompt}
              registrationLabel="Register your account"
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

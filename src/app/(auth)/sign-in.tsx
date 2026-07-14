import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthBrandHeader } from '@/components/AuthSignIn/AuthBrandHeader';
import { AuthSignInForm, type SignInMethod } from '@/components/AuthSignIn/AuthSignInForm';
import { authSignInStyles as styles } from '@/components/AuthSignIn/styles';
import { ThemedView } from '@/components/themed-view';
import { isSupabaseConfigured, supabase, supabaseSetupMessage } from '@/lib/supabase';
import { isUserRole, type UserRole } from '@/types/auth';

const registrationPrompts: Record<UserRole, string> = {
  lgu: 'New Organization?', beneficiary: 'New Beneficiary?', merchant: 'New Merchant?',
};

const SignInScreen = () => {
  const params = useLocalSearchParams<{ email?: string; role?: string }>();
  const [identifier, setIdentifier] = useState(params.email ?? '');
  const [accessKey, setAccessKey] = useState('');
  const [method, setMethod] = useState<SignInMethod>('email');
  const [isLoading, setIsLoading] = useState(false);
  const [isSendingRecovery, setIsSendingRecovery] = useState(false);
  const router = useRouter();
  const role = isUserRole(params.role) ? params.role : null;

  useEffect(() => {
    if (params.role === undefined || role) return;
    Alert.alert('Invalid account type', 'Choose a valid account type to continue.');
    router.replace('/(auth)/choose-account');
  }, [params.role, role, router]);

  const signInWithCredentials = async () => {
    if (!identifier.trim() || !accessKey) {
      Alert.alert('Missing credentials', `Enter your ${method === 'email' ? 'email address' : 'mobile number'} and password.`);
      return;
    }
    if (!isSupabaseConfigured) {
      Alert.alert('Supabase setup required', supabaseSetupMessage);
      return;
    }

    setIsLoading(true);
    const credentials = method === 'email'
      ? { email: identifier.trim(), password: accessKey }
      : { phone: identifier.trim(), password: accessKey };
    const { error } = await supabase.auth.signInWithPassword(credentials);
    setIsLoading(false);
    if (error) Alert.alert('Identity Verification Failed', error.message);
  };

  const handleForgotPassword = async () => {
    const email = identifier.trim();
    if (method !== 'email' || !/^\S+@\S+\.\S+$/.test(email)) {
      Alert.alert('Email required', 'Select Email and enter the address linked to your account.');
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
    router.push({ pathname: '/(auth)/forgot-password', params: role ? { email, role } : { email } });
  };

  const register = () => {
    if (role) router.push({ pathname: '/(auth)/sign-up', params: { role } });
    else router.push('/(auth)/choose-account');
  };

  return (
    <ThemedView style={styles.page}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView behavior={Platform.select({ ios: 'padding', default: undefined })} style={styles.safeArea}>
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
              onRegister={register}
              onScanId={() => Alert.alert('Scan ID', 'ID scanning will be available when camera verification is connected.')}
              onSelectMethod={setMethod}
              onVerifyIdentity={signInWithCredentials}
              registrationPrompt={role ? registrationPrompts[role] : 'New Account?'}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
};

export default SignInScreen;

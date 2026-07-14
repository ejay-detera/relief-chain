import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthBrandHeader } from '@/components/AuthSignIn/AuthBrandHeader';
import { AuthSignInForm, type SignInMethod } from '@/components/AuthSignIn/AuthSignInForm';
import { authSignInStyles as styles } from '@/components/AuthSignIn/styles';
import { ThemedView } from '@/components/themed-view';
import { supabase } from '@/lib/supabase';

export default function SignInScreen() {
  const [identifier, setIdentifier] = useState('');
  const [accessKey, setAccessKey] = useState('');
  const [method, setMethod] = useState<SignInMethod>('merchantId');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const signInWithCredentials = async () => {
    if (!identifier.trim() || !accessKey) {
      Alert.alert('Missing credentials', 'Enter your beneficiary ID and access key to continue.');
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
              method={method}
              onAccessKeyChange={setAccessKey}
              onIdentifierChange={setIdentifier}
              onRegister={() => router.push('/(auth)/sign-up')}
              onScanId={handleScanId}
              onSelectMethod={setMethod}
              onVerifyIdentity={signInWithCredentials}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

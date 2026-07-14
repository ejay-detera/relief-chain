import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthBrandHeader } from '@/components/AuthSignIn/AuthBrandHeader';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import type { MerchantRegistrationStep } from '@/types/merchant-registration';

import { MerchantProgress } from './MerchantProgress';
import { merchantRegistrationStyles as styles } from './styles';

type MerchantRegistrationShellProps = {
  children: ReactNode;
  step: MerchantRegistrationStep;
  title: string;
};

export function MerchantRegistrationShell({ children, step, title }: MerchantRegistrationShellProps) {
  return (
    <ThemedView style={styles.page}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.select({ ios: 'padding', default: undefined })}
          style={styles.safeArea}
        >
          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            <AuthBrandHeader />
            <View style={styles.card}>
              <ThemedText style={styles.title}>{title}</ThemedText>
              <ThemedText style={styles.description}>
                Register your account to manage disaster relief programs and receive financial assistance securely.
              </ThemedText>
              <MerchantProgress step={step} />
              {children}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

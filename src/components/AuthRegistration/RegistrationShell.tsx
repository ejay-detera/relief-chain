import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthBrandHeader } from '@/components/AuthSignIn/AuthBrandHeader';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

import { RegistrationProgress } from './RegistrationProgress';
import { registrationStyles as styles } from './styles';

type RegistrationShellProps = {
  children: ReactNode;
  description: string;
  onStepPress: (step: number) => void;
  step: number;
  title: string;
  totalSteps: number;
};

export const RegistrationShell = ({ children, description, onStepPress, step, title, totalSteps }: RegistrationShellProps) => (
  <ThemedView style={styles.page}>
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.select({ ios: 'padding', default: undefined })} style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <AuthBrandHeader />
          <View style={styles.card}>
            <ThemedText style={styles.title}>{title}</ThemedText>
            <ThemedText style={styles.description}>{description}</ThemedText>
            <RegistrationProgress onStepPress={onStepPress} step={step} totalSteps={totalSteps} />
            {children}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  </ThemedView>
);

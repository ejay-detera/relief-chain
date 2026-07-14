import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';

import { authVerificationStyles as styles } from './styles';

export function RegistrationSuccessContent() {
  return (
    <View style={styles.splashContent}>
      <ThemedText style={styles.splashTitle}>Account created{`\n`}successfully!</ThemedText>
      <View style={styles.splashWelcome}>
        <ThemedText style={styles.splashWelcomeText}>Welcome to </ThemedText>
        <ThemedText style={styles.splashRelief}>Relief</ThemedText>
        <ThemedText style={styles.splashChain}>Chain</ThemedText>
      </View>
    </View>
  );
}

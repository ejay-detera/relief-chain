import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';

import { authVerificationStyles as styles } from './styles';

export function RegistrationSuccessContent() {
  return (
    <View style={styles.splashContent}>
      <ThemedText style={styles.splashTitle}>Registration Submitted{`\n`}Successfully!</ThemedText>
      <ThemedText style={[styles.splashWelcomeText, { marginTop: 8, fontSize: 13, color: '#4A5568' }]}>
        Status: Registered · Pending Verification
      </ThemedText>
      <View style={[styles.splashWelcome, { marginTop: 12 }]}>
        <ThemedText style={styles.splashWelcomeText}>Welcome to </ThemedText>
        <ThemedText style={styles.splashRelief}>Relief</ThemedText>
        <ThemedText style={styles.splashChain}>Chain</ThemedText>
      </View>
    </View>
  );
}

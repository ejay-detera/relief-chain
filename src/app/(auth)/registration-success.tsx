import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RegistrationSuccessContent } from '@/components/AuthVerification/RegistrationSuccessContent';
import { authVerificationStyles as styles } from '@/components/AuthVerification/styles';
import { ThemedView } from '@/components/themed-view';

const DASHBOARD_DELAY_MS = 2500;

export default function RegistrationSuccessScreen() {
  const router = useRouter();

  useEffect(() => {
    const timeout = setTimeout(() => {
      router.replace('/(merchant)' as any);
    }, DASHBOARD_DELAY_MS);

    return () => clearTimeout(timeout);
  }, [router]);

  return (
    <ThemedView style={styles.page}>
      <SafeAreaView style={styles.safeArea}>
        <RegistrationSuccessContent />
      </SafeAreaView>
    </ThemedView>
  );
}

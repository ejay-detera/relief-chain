import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RegistrationSuccessContent } from '@/components/AuthVerification/RegistrationSuccessContent';
import { authVerificationStyles as styles } from '@/components/AuthVerification/styles';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/context/AuthContext';
import { getRoleHome } from '@/utils/auth-routing';

const DASHBOARD_DELAY_MS = 2500;

const RegistrationSuccessScreen = () => {
  const router = useRouter();
  const { session, profile, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    if (!session) {
      router.replace('/(auth)/choose-account');
      return;
    }
    if (!profile) return;

    const timeout = setTimeout(() => {
      router.replace(getRoleHome(profile.role));
    }, DASHBOARD_DELAY_MS);
    return () => clearTimeout(timeout);
  }, [isLoading, profile, router, session]);

  return (
    <ThemedView style={styles.page}>
      <SafeAreaView style={styles.safeArea}>
        <RegistrationSuccessContent />
      </SafeAreaView>
    </ThemedView>
  );
};

export default RegistrationSuccessScreen;

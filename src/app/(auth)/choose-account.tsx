import { useRouter } from 'expo-router';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AccountChooserContent } from '@/components/AccountChooser/AccountChooserContent';
import { ThemedView } from '@/components/themed-view';
import type { UserRole } from '@/types/auth';

const ChooseAccountScreen = () => {
  const router = useRouter();
  const openRoleRoute = (pathname: '/(auth)/sign-in' | '/(auth)/sign-up', role: UserRole) => {
    router.push({ pathname, params: { role } });
  };

  return (
    <ThemedView style={styles.page}>
      <SafeAreaView style={styles.safeArea}>
        <AccountChooserContent
          onRegister={(role) => openRoleRoute('/(auth)/sign-up', role)}
          onScanId={() => router.push('/(auth)/sign-in')}
          onSignIn={(role) => openRoleRoute('/(auth)/sign-in', role)}
        />
      </SafeAreaView>
    </ThemedView>
  );
};

export default ChooseAccountScreen;

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#FFFFFF' },
  safeArea: { flex: 1 },
});
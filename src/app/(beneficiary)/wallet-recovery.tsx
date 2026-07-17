import { FontAwesome } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BiometricFallbackNote } from '@/components/WalletRecovery/BiometricFallbackNote';
import { RecoveryDisclosureCard } from '@/components/WalletRecovery/RecoveryDisclosureCard';
import { WalletRotationStatusCard } from '@/components/WalletRecovery/WalletRotationStatusCard';
import { ThemedText } from '@/components/themed-text';
import {
    EXTERNAL_CASH_RECOVERY_DISCLOSURE,
    PARTNER_RECOVERY_DISCLOSURE,
    PILOT_ROTATION_DISCLOSURE,
} from '@/constants/recovery-disclosure';
import { BottomTabInset, BrandColors, Spacing } from '@/constants/theme';
import { usePilotWallet } from '@/hooks/use-pilot-wallet';
import { rotationStatusFromWalletState } from '@/utils/wallet-rotation-status';

/**
 * Beneficiary wallet recovery: confirmed rotation status, biometric/secure
 * fallback guidance, and the fixed recovery disclosures (Requirements 16.4, 16.5,
 * 16.6, 16.7, 20.3, 20.4). A thin shell — rotation status is derived from the
 * local signer state and the recovery infrastructure; it never reveals secrets.
 */
const WalletRecoveryScreen = () => {
  const router = useRouter();
  const { state, isLoading } = usePilotWallet();
  const rotationView = useMemo(() => rotationStatusFromWalletState(state), [state]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Go back" accessibilityRole="button" hitSlop={10} onPress={() => router.back()}>
          <FontAwesome color={BrandColors.navy} name="chevron-left" size={18} />
        </Pressable>
        <ThemedText style={styles.title}>Wallet & recovery</ThemedText>
        <View style={styles.spacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ThemedText style={styles.sectionLabel}>Wallet status</ThemedText>
        {isLoading ? (
          <View style={styles.loadingCard}>
            <ThemedText style={styles.loadingText}>Checking your wallet…</ThemedText>
          </View>
        ) : (
          <WalletRotationStatusCard view={rotationView} />
        )}

        <ThemedText style={styles.sectionLabel}>Approving payments</ThemedText>
        <BiometricFallbackNote />

        <ThemedText style={styles.sectionLabel}>What can be recovered</ThemedText>
        <RecoveryDisclosureCard disclosure={PILOT_ROTATION_DISCLOSURE} />
        <RecoveryDisclosureCard disclosure={PARTNER_RECOVERY_DISCLOSURE} />
        <RecoveryDisclosureCard disclosure={EXTERNAL_CASH_RECOVERY_DISCLOSURE} />
      </ScrollView>
    </SafeAreaView>
  );
};

export default WalletRecoveryScreen;

const styles = StyleSheet.create({
  safeArea: { backgroundColor: '#FAFAFC', flex: 1 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: Spacing.four, paddingVertical: Spacing.three },
  title: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 20 },
  spacer: { width: 18 },
  content: { gap: Spacing.three, paddingBottom: BottomTabInset + Spacing.six, paddingHorizontal: Spacing.four, paddingTop: Spacing.two },
  sectionLabel: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13, letterSpacing: 0.3, marginTop: Spacing.one, textTransform: 'uppercase' },
  loadingCard: { alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 16, padding: Spacing.five },
  loadingText: { color: BrandColors.grey, fontFamily: 'PlusJakartaSans_400Regular', fontSize: 13 },
});

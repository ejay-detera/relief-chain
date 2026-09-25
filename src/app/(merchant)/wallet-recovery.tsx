import { FontAwesome } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RecoveryDisclosureCard } from '@/components/WalletRecovery/RecoveryDisclosureCard';
import { WalletRotationStatusCard } from '@/components/WalletRecovery/WalletRotationStatusCard';
import { MerchantRotationPanel } from '@/components/MerchantWalletRecovery/MerchantRotationPanel';
import { ThemedText } from '@/components/themed-text';
import { PILOT_ROTATION_DISCLOSURE } from '@/constants/recovery-disclosure';
import { BrandColors, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useMerchantWallet } from '@/hooks/use-merchant-wallet';
import { rotationStatusFromWalletState } from '@/utils/wallet-rotation-status';

/**
 * Merchant wallet recovery: honest signer status plus explicit rotation from
 * the still-bound old settlement wallet to a replacement generated on this
 * device. Thin shell — rotation work lives in `MerchantRotationPanel`; this
 * screen owns wallet state and navigation only.
 */
const MerchantWalletRecoveryScreen = () => {
  const router = useRouter();
  const { session } = useAuth();
  const { state, merchantEntityId, isLoading, error, refresh } = useMerchantWallet();
  const [refreshing, setRefreshing] = useState(false);
  const rotationView = useMemo(() => rotationStatusFromWalletState(state), [state]);
  const userId = session?.user.id ?? null;

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  };

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
            <ThemedText style={styles.loadingText}>Checking your merchant signer…</ThemedText>
          </View>
        ) : (
          <WalletRotationStatusCard view={rotationView} />
        )}
        {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}

        {userId && merchantEntityId ? (
          <MerchantRotationPanel
            merchantEntityId={merchantEntityId}
            onRotated={handleRefresh}
            refreshing={refreshing || isLoading}
            userId={userId}
            walletState={state}
          />
        ) : null}

        <ThemedText style={styles.sectionLabel}>What replacement means</ThemedText>
        <RecoveryDisclosureCard disclosure={PILOT_ROTATION_DISCLOSURE} />
        <ThemedText style={styles.note}>
          The old settlement wallet stays bound until the replacement is provisioned on-chain. Rotation supersedes it — the old address is deactivated, never edited — so only one active settlement wallet exists.
        </ThemedText>
      </ScrollView>
    </SafeAreaView>
  );
};

export default MerchantWalletRecoveryScreen;

const styles = StyleSheet.create({
  safeArea: { backgroundColor: '#FFFFFF', flex: 1 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: Spacing.four, paddingVertical: Spacing.three },
  title: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 20 },
  spacer: { width: 18 },
  content: { gap: Spacing.three, paddingBottom: Spacing.eight, paddingHorizontal: Spacing.four, paddingTop: Spacing.two },
  sectionLabel: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13, letterSpacing: 0.3, marginTop: Spacing.one, textTransform: 'uppercase' },
  loadingCard: { alignItems: 'center', backgroundColor: BrandColors.lightGray, borderRadius: 16, padding: Spacing.five },
  loadingText: { color: BrandColors.grey, fontFamily: 'PlusJakartaSans_400Regular', fontSize: 13 },
  error: { color: '#C0392B', fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 12 },
  note: { color: BrandColors.grey, fontFamily: 'PlusJakartaSans_400Regular', fontSize: 12, lineHeight: 18 },
});

import { FontAwesome } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MfaSecurityPanel } from '@/components/Mfa/MfaSecurityPanel';
import { ThemedText } from '@/components/themed-text';
import { BrandColors, Spacing } from '@/constants/theme';

/**
 * Merchant security settings: MFA enrollment and recent step-up for financial
 * actions such as wallet changes, refunds, and cash-out (Requirements 20.1,
 * 20.2). A thin shell around the shared MFA panel.
 */
const MerchantSecurityScreen = () => {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Go back" accessibilityRole="button" hitSlop={10} onPress={() => router.back()}>
          <FontAwesome color={BrandColors.navy} name="chevron-left" size={18} />
        </Pressable>
        <ThemedText style={styles.title}>Security</ThemedText>
        <View style={styles.spacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ThemedText style={styles.intro}>
          Protect your merchant account with multi-factor authentication. Wallet changes, refunds,
          and cash-out require multi-factor and a recent step-up.
        </ThemedText>
        <MfaSecurityPanel accountLabel="merchant" stepUpActionDescription="authorize this financial action" />
      </ScrollView>
    </SafeAreaView>
  );
};

export default MerchantSecurityScreen;

const styles = StyleSheet.create({
  safeArea: { backgroundColor: '#FAFAFC', flex: 1 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: Spacing.four, paddingVertical: Spacing.three },
  title: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 20 },
  spacer: { width: 18 },
  content: { gap: Spacing.three, paddingBottom: Spacing.eight, paddingHorizontal: Spacing.four, paddingTop: Spacing.two },
  intro: { color: BrandColors.grey, fontFamily: 'PlusJakartaSans_400Regular', fontSize: 14, lineHeight: 20 },
});

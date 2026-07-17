import { FontAwesome } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { MerchantBottomNavigation } from '@/components/MerchantDashboard/MerchantBottomNavigation';
import { MerchantProfileContent } from '@/components/MerchantProfile/MerchantProfileContent';
import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, FloatingTabBarGap, FloatingTabBarHeight, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { merchantWalletPublicKey, useMerchantWallet } from '@/hooks/use-merchant-wallet';

const metadataString = (metadata: unknown, key: string): string | null => {
  if (!metadata || typeof metadata !== 'object') return null;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
};
const createHandle = (name: string) => {
  const slug = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 24);
  return `@${slug || 'merchant'}`;
};

const MerchantProfileScreen = () => {
  const router = useRouter();
  const { profile, session } = useAuth();
  const insets = useSafeAreaInsets();
  const { state: walletState } = useMerchantWallet();
  const publicKey = merchantWalletPublicKey(walletState);
  const metadata: unknown = session?.user.user_metadata;
  const profileName = [profile?.first_name, profile?.last_name].filter((part): part is string => Boolean(part)).join(' ');
  const fullName = profile?.full_name?.trim() || metadataString(metadata, 'full_name') || profileName || 'Merchant Account';
  const merchantId = profile?.id || session?.user.id || 'Not available';
  const walletAddress = profile?.stellar_pubkey || metadataString(metadata, 'stellar_pubkey') || publicKey || 'Not available';
  const mobileNumber = profile?.mobile_number || session?.user.phone || metadataString(metadata, 'mobile_number') || 'Not available';
  return <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}><View style={styles.screen}>
    <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + FloatingTabBarGap + FloatingTabBarHeight + Spacing.four }} showsVerticalScrollIndicator={false}>
      <MerchantProfileContent fullName={fullName} handle={createHandle(fullName)} merchantId={merchantId} mobileNumber={mobileNumber} walletAddress={walletAddress} />
      <Pressable onPress={() => router.push('/(merchant)/security' as any)} style={styles.securityRow}>
        <View style={styles.securityRowLeft}>
          <FontAwesome color={BrandColors.navy} name="shield" size={16} />
          <View>
            <ThemedText style={styles.securityTitle}>Security & MFA</ThemedText>
            <ThemedText style={styles.securitySubtitle}>Authenticator and step-up for financial actions</ThemedText>
          </View>
        </View>
        <FontAwesome color={BrandColors.grey} name="chevron-right" size={14} />
      </Pressable>
    </ScrollView>
    <MerchantBottomNavigation active="profile" />
  </View></SafeAreaView>;
};
export default MerchantProfileScreen;
const styles = StyleSheet.create({
  safeArea: { backgroundColor: '#FFFFFF', flex: 1 },
  screen: { flex: 1 },
  securityRow: {
    alignItems: 'center',
    backgroundColor: BrandColors.lightGray,
    borderRadius: BorderRadius.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: Spacing.four,
    marginTop: Spacing.two,
    padding: Spacing.three,
  },
  securityRowLeft: { alignItems: 'center', columnGap: 12, flexDirection: 'row' },
  securityTitle: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14 },
  securitySubtitle: { color: BrandColors.grey, fontFamily: 'PlusJakartaSans_400Regular', fontSize: 12, marginTop: 2 },
});

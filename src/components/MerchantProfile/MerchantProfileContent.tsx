import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { MerchantProfileDetailRow } from '@/components/MerchantProfile/MerchantProfileDetailRow';
import { LogoutButton } from '@/components/shared/LogoutButton';
import { ThemedText } from '@/components/themed-text';
import { BrandColors, Spacing } from '@/constants/theme';

type Props = { fullName: string; handle: string; merchantId: string; mobileNumber: string; walletAddress: string };
export const MerchantProfileContent = ({ fullName, handle, merchantId, mobileNumber, walletAddress }: Props) => <>
  <View style={styles.hero}>
    <View style={styles.logoRow}><Image contentFit="contain" source={require('@/assets/public/Logo.svg')} style={styles.logo} /></View>
    <View style={styles.avatar}><MaterialCommunityIcons color={BrandColors.navy} name="account" size={74} /></View>
    <ThemedText style={styles.name}>{fullName}</ThemedText><ThemedText style={styles.handle}>{handle}</ThemedText>
  </View>
  <View style={styles.panel}>
    <MerchantProfileDetailRow icon="identifier" label="Merchant ID" value={merchantId} />
    <MerchantProfileDetailRow icon="wallet-outline" label="Stellar Wallet Address" value={walletAddress} />
    <MerchantProfileDetailRow icon="cellphone" label="Mobile Number" value={mobileNumber} />
    <View style={styles.logout}><LogoutButton /></View>
  </View>
</>;
const styles = StyleSheet.create({
  hero: { alignItems: 'center', backgroundColor: '#FFFFFF', minHeight: 350, paddingHorizontal: Spacing.four }, logoRow: { alignItems: 'flex-end', alignSelf: 'stretch' }, logo: { height: 58, width: 104 },
  avatar: { alignItems: 'center', backgroundColor: BrandColors.lightGray, borderColor: BrandColors.green, borderRadius: 62, borderWidth: 4, height: 124, justifyContent: 'center', marginTop: Spacing.four, width: 124 },
  name: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 22, marginTop: Spacing.three, textAlign: 'center' }, handle: { color: BrandColors.green, fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13, marginTop: Spacing.one },
  panel: { backgroundColor: '#FFFFFF', borderColor: BrandColors.lightGray, borderTopLeftRadius: 32, borderTopRightRadius: 32, borderWidth: 1, elevation: 5, gap: Spacing.three, padding: Spacing.four, shadowColor: '#112E58', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.08, shadowRadius: 10 }, logout: { marginTop: Spacing.one },
});

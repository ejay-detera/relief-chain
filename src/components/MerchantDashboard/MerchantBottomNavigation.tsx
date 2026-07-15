import { MaterialCommunityIcons } from '@expo/vector-icons';
import { type Href, useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, FloatingTabBarGap, FloatingTabBarHeight } from '@/constants/theme';

export type MerchantNavigationActiveItem = 'dashboard' | 'programs' | 'profile';
type Props = { active: MerchantNavigationActiveItem };

export const MerchantBottomNavigation = ({ active }: Props) => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return <View style={[styles.bar, { bottom: insets.bottom + FloatingTabBarGap }]}>
    <Pressable accessibilityLabel="Dashboard" accessibilityRole="button" onPress={() => router.replace('/(merchant)' as Href)} style={[styles.item, active === 'dashboard' && styles.active]}>
      <MaterialCommunityIcons color="#FFFFFF" name="view-dashboard-outline" size={21} /><ThemedText style={styles.label}>Dashboard</ThemedText>
    </Pressable>
    <Pressable accessibilityLabel="Programs" accessibilityRole="button" onPress={() => router.replace('/(merchant)/programs')} style={[styles.item, active === 'programs' && styles.active]}>
      <MaterialCommunityIcons color="#FFFFFF" name="hand-heart-outline" size={22} /><ThemedText style={styles.label}>Programs</ThemedText>
    </Pressable>
    <Pressable accessibilityLabel="QR Scan" accessibilityRole="button" onPress={() => router.push('/(merchant)/receive')} style={styles.item}>
      <MaterialCommunityIcons color="#FFFFFF" name="qrcode-scan" size={22} /><ThemedText style={styles.label}>QR Scan</ThemedText>
    </Pressable>
    <Pressable accessibilityLabel="Profile" accessibilityRole="button" onPress={() => router.replace('/(merchant)/profile')} style={[styles.item, active === 'profile' && styles.active]}>
      <MaterialCommunityIcons color="#FFFFFF" name="account-outline" size={22} /><ThemedText style={styles.label}>Profile</ThemedText>
    </Pressable>
  </View>;
};

const styles = StyleSheet.create({
  bar: { alignItems: 'center', backgroundColor: BrandColors.green, borderRadius: BorderRadius.xl, flexDirection: 'row', height: FloatingTabBarHeight, justifyContent: 'space-around', left: 10, paddingHorizontal: 6, position: 'absolute', right: 10, shadowColor: BrandColors.navy, shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 7 },
  item: { alignItems: 'center', borderRadius: BorderRadius.lg, flex: 1, height: 48, justifyContent: 'center', maxWidth: 72 },
  active: { backgroundColor: BrandColors.navy },
  label: { color: '#FFFFFF', fontFamily: 'PlusJakartaSans_700Bold', fontSize: 7, marginTop: 1 },
});

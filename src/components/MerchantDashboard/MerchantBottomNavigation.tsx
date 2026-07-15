import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { BorderRadius, BrandColors } from '@/constants/theme';

type MerchantBottomNavigationProps = { onProfilePress: () => void; onReceivePress: () => void };

export const MerchantBottomNavigation = ({ onProfilePress, onReceivePress }: MerchantBottomNavigationProps) => (
  <View style={styles.bar}>
    <View style={[styles.item, styles.active]}><MaterialCommunityIcons color="#FFFFFF" name="view-dashboard-outline" size={25} /></View>
    <Pressable accessibilityLabel="Merchant benefits" accessibilityRole="button" style={styles.item}><MaterialCommunityIcons color="#FFFFFF" name="hand-heart" size={27} /></Pressable>
    <Pressable accessibilityLabel="Receive payment" accessibilityRole="button" onPress={onReceivePress} style={styles.item}><MaterialCommunityIcons color="#FFFFFF" name="qrcode-scan" size={26} /></Pressable>
    <Pressable accessibilityLabel="Merchant profile" accessibilityRole="button" onPress={onProfilePress} style={styles.item}><MaterialCommunityIcons color="#FFFFFF" name="account" size={27} /></Pressable>
  </View>
);

const styles = StyleSheet.create({
  bar: { alignItems: 'center', backgroundColor: BrandColors.green, borderRadius: BorderRadius.xl, bottom: 10, flexDirection: 'row', height: 39, justifyContent: 'space-around', left: 10, position: 'absolute', right: 10 },
  item: { alignItems: 'center', height: 32, justifyContent: 'center', width: 42 },
  active: { backgroundColor: BrandColors.navy, borderRadius: BorderRadius.md },
});

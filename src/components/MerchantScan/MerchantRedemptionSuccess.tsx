import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';

type Props = { onDashboard: () => void; onScanAnother: () => void };
export const MerchantRedemptionSuccess = ({ onDashboard, onScanAnother }: Props) => <SafeAreaView style={styles.safeArea}>
  <View style={styles.content}>
    <View style={styles.check}><MaterialCommunityIcons color="#FFFFFF" name="check" size={58} /></View>
    <ThemedText style={styles.title}>Redemption complete</ThemedText>
    <ThemedText style={styles.name}>Demo Beneficiary</ThemedText>
    <View style={styles.card}><ThemedText style={styles.label}>Food Relief Voucher</ThemedText><ThemedText style={styles.amount}>₱500</ThemedText></View>
    <Pressable accessibilityRole="button" onPress={onScanAnother} style={styles.primary}><ThemedText style={styles.primaryText}>Scan another</ThemedText></Pressable>
    <Pressable accessibilityRole="button" onPress={onDashboard} style={styles.secondary}><ThemedText style={styles.secondaryText}>Return to dashboard</ThemedText></Pressable>
  </View>
</SafeAreaView>;

const styles = StyleSheet.create({
  safeArea: { backgroundColor: '#FFFFFF', flex: 1 }, content: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: Spacing.four },
  check: { alignItems: 'center', backgroundColor: BrandColors.green, borderRadius: 48, height: 96, justifyContent: 'center', width: 96 },
  title: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 25, marginTop: Spacing.four, textAlign: 'center' },
  name: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 16, marginTop: Spacing.two },
  card: { alignItems: 'center', backgroundColor: BrandColors.lightGray, borderRadius: BorderRadius.lg, marginVertical: Spacing.five, padding: Spacing.four, width: '100%' },
  label: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 15 }, amount: { color: BrandColors.green, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 34, marginTop: Spacing.two },
  primary: { alignItems: 'center', backgroundColor: BrandColors.green, borderRadius: BorderRadius.xl, padding: Spacing.three, width: '100%' }, primaryText: { color: '#FFFFFF', fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15 },
  secondary: { alignItems: 'center', borderColor: BrandColors.navy, borderRadius: BorderRadius.xl, borderWidth: 1, marginTop: Spacing.three, padding: Spacing.three, width: '100%' }, secondaryText: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15 },
});

import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';

export const SalesSummaryCard = () => (
  <View style={styles.card}>
    <ThemedText style={styles.label}>Total Sales</ThemedText>
    <ThemedText style={styles.total}>₱142,800</ThemedText>
  </View>
);

const styles = StyleSheet.create({
  card: { backgroundColor: '#FFFFFF', borderRadius: BorderRadius.md, elevation: 3, minHeight: 85, padding: Spacing.three, shadowColor: '#000000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 8 },
  label: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 12 },
  total: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 20, marginTop: Spacing.one },
});

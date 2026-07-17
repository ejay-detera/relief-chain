import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import type { MerchantMetrics } from '@/types/merchant-metrics';

type Props = { isLoading: boolean; metrics: MerchantMetrics | null };
const formatSales = (value: number) => `${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} RCPHP`;

export const SalesSummaryCard = ({ isLoading, metrics }: Props) => {
  const unavailable = isLoading || !metrics;
  return <View style={styles.row}>
    <View style={styles.card}><ThemedText style={styles.label}>Total Sales</ThemedText><ThemedText style={styles.total}>{unavailable ? '—' : formatSales(metrics.totalSales)}</ThemedText></View>
    <View style={styles.card}><ThemedText style={styles.label}>Vouchers Processed</ThemedText><ThemedText style={styles.total}>{unavailable ? '—' : metrics.vouchersProcessed.toLocaleString('en-PH')}</ThemedText></View>
  </View>;
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Spacing.three },
  card: { backgroundColor: '#FFFFFF', borderRadius: BorderRadius.md, elevation: 3, flex: 1, minHeight: 91, padding: Spacing.three, shadowColor: '#112E58', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 8 },
  label: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 10, minHeight: 27 },
  total: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 17, marginTop: Spacing.one },
});

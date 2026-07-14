import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';

type ProgramsSummaryProps = { activePrograms: number; vouchersProcessed: number };

export const ProgramsSummary = ({ activePrograms, vouchersProcessed }: ProgramsSummaryProps) => (
  <View style={styles.container}>
    <View style={styles.stats}>
      <View style={styles.statCard}><ThemedText style={styles.statNumber}>{activePrograms}</ThemedText><ThemedText style={styles.statLabel}>Active Programs</ThemedText></View>
      <View style={styles.statCard}><ThemedText style={styles.statNumber}>{vouchersProcessed.toLocaleString('en-PH')}</ThemedText><ThemedText style={styles.statLabel}>Vouchers Processed</ThemedText></View>
    </View>
    <View style={styles.settlement}><ThemedText style={styles.settlementLabel}>Next Settlement</ThemedText><ThemedText style={styles.settlementDate}>Tomorrow</ThemedText></View>
  </View>
);

const styles = StyleSheet.create({
  container: { gap: Spacing.three },
  stats: { flexDirection: 'row', gap: Spacing.three },
  statCard: { alignItems: 'center', backgroundColor: '#FFFFFF', borderColor: 'rgba(151,151,151,0.2)', borderRadius: BorderRadius.md, borderWidth: 1, elevation: 3, flex: 1, height: 88, justifyContent: 'center', shadowColor: '#000000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.1, shadowRadius: 8 },
  statNumber: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 26, lineHeight: 30 },
  statLabel: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 9, marginTop: Spacing.one },
  settlement: { backgroundColor: BrandColors.green, borderRadius: BorderRadius.md, minHeight: 54, padding: Spacing.two },
  settlementLabel: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 8 },
  settlementDate: { color: '#FFFFFF', fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15, marginTop: 1 },
});

import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PILOT_ASSET_CODE } from '@/constants/pilot-disclosure';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import type { MerchantPaymentHistorySummary } from '@/types/merchant-payment-history';
import { formatStroops } from '@/utils/format-stroops';

type Props = {
  summary: MerchantPaymentHistorySummary;
};

export const InvoiceHistorySummary = ({ summary }: Props) => {
  return (
    <View style={styles.card}>
      <View style={styles.balanceSection}>
        <ThemedText style={styles.label}>Total Received</ThemedText>
        <View style={styles.amountRow}>
          <ThemedText style={styles.currencyPrefix}>₱</ThemedText>
          <ThemedText style={styles.amount}>{formatStroops(summary.totalReceivedStroops)}</ThemedText>
          <ThemedText style={styles.assetCode}>{PILOT_ASSET_CODE}</ThemedText>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <ThemedText style={styles.statNumber}>{summary.settledCount}</ThemedText>
          <ThemedText style={styles.statLabel}>Completed</ThemedText>
        </View>
        <View style={styles.divider} />
        <View style={styles.statBox}>
          <ThemedText style={[styles.statNumber, { color: BrandColors.yellow }]}>{summary.activeCount}</ThemedText>
          <ThemedText style={styles.statLabel}>Active QRs</ThemedText>
        </View>
        <View style={styles.divider} />
        <View style={styles.statBox}>
          <ThemedText style={[styles.statNumber, { color: BrandColors.grey }]}>{summary.expiredCount}</ThemedText>
          <ThemedText style={styles.statLabel}>Expired</ThemedText>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: BrandColors.navy,
    borderRadius: BorderRadius.xl,
    padding: Spacing.four,
    gap: Spacing.three,
    shadowColor: BrandColors.navy,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 4,
  },
  balanceSection: {
    gap: 4,
  },
  label: {
    color: '#DCE6F5',
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12,
  },
  amountRow: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: Spacing.one,
  },
  currencyPrefix: {
    color: BrandColors.green,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 22,
  },
  amount: {
    color: '#FFFFFF',
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 26,
  },
  assetCode: {
    color: '#91A1B7',
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
    marginLeft: 2,
  },
  statsRow: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: BorderRadius.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  statBox: {
    alignItems: 'center',
    flex: 1,
  },
  statNumber: {
    color: '#FFFFFF',
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 16,
  },
  statLabel: {
    color: '#C5D4EA',
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 11,
    marginTop: 2,
  },
  divider: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    width: 1,
    height: '80%',
    alignSelf: 'center',
  },
});

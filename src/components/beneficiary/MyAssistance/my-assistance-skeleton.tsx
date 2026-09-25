import { StyleSheet, View } from 'react-native';

import { Skeleton } from '@/components/shared/Skeleton';
import { BorderRadius, Spacing } from '@/constants/theme';

/**
 * Placeholder shapes matching the My Assistance screen's real layout (total
 * balance card + program voucher cards) so there's no jump in size once real
 * data replaces it. Shown only for the initial `isLoading` state.
 */
export function MyAssistanceSkeleton() {
  return (
    <View>
      {/* Total balance card */}
      <View style={styles.balanceCard}>
        <Skeleton height={12} style={styles.balanceTitle} width={150} />
        <Skeleton borderRadius={BorderRadius.sm} height={30} style={styles.balanceValue} width={170} />
        <Skeleton height={11} style={styles.balanceSub} width={130} />
      </View>

      {/* Program voucher cards */}
      {[0, 1].map((i) => (
        <View key={i} style={styles.voucherCard}>
          <View style={styles.headerRow}>
            <Skeleton borderRadius={12} height={18} width={70} />
          </View>
          <Skeleton height={15} style={styles.name} width="55%" />
          <View style={styles.bodyRow}>
            <View style={styles.balanceColumn}>
              <Skeleton height={11} style={styles.rowLabel} width={90} />
              <Skeleton height={20} style={styles.rowValue} width={110} />
            </View>
            <View style={styles.purposeColumn}>
              <Skeleton height={11} style={styles.rowLabel} width={60} />
              <Skeleton height={13} width={80} />
            </View>
          </View>
          <Skeleton borderRadius={BorderRadius.md} height={40} width="100%" />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  balanceCard: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.four,
    marginHorizontal: Spacing.four,
    marginBottom: Spacing.four,
    backgroundColor: 'white',
  },
  balanceTitle: { marginBottom: Spacing.two },
  balanceValue: { marginBottom: Spacing.two },
  balanceSub: {},
  voucherCard: {
    backgroundColor: 'white',
    borderRadius: BorderRadius.lg,
    padding: Spacing.four,
    marginHorizontal: Spacing.four,
    marginBottom: Spacing.three,
  },
  headerRow: {
    marginBottom: Spacing.two,
  },
  name: {
    marginBottom: Spacing.three,
  },
  bodyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.three,
  },
  balanceColumn: {
    flex: 1,
  },
  purposeColumn: {
    alignItems: 'flex-end',
  },
  rowLabel: {
    marginBottom: Spacing.half,
  },
  rowValue: {
    marginBottom: Spacing.two,
  },
});

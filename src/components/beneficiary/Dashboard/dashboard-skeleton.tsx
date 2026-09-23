import { StyleSheet, View } from 'react-native';

import { Skeleton, SkeletonRow } from '@/components/shared/Skeleton';
import { BorderRadius, Spacing } from '@/constants/theme';

/**
 * Placeholder shapes matching the dashboard's real layout (balance card, quick
 * action grid, program card, transactions list) so there's no jump in size
 * once real data replaces it. Shown only for the initial `isLoading` state,
 * not on pull-to-refresh (the existing content stays visible for that).
 */
export function DashboardSkeleton() {
  return (
    <View>
      {/* Balance card */}
      <View style={styles.balanceCard}>
        <Skeleton height={12} style={styles.balanceTitle} width={140} />
        <Skeleton borderRadius={BorderRadius.sm} height={32} style={styles.balanceValue} width={180} />
        <Skeleton height={12} style={styles.balanceSub} width={120} />
        <SkeletonRow style={styles.balanceActions}>
          <Skeleton borderRadius={BorderRadius.md} height={34} style={styles.balanceButton} width={100} />
          <Skeleton borderRadius={BorderRadius.md} height={34} width={100} />
        </SkeletonRow>
      </View>

      {/* Quick action grid */}
      <View style={styles.grid}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={styles.actionCard}>
            <Skeleton borderRadius={28} height={56} style={styles.actionIcon} width={56} />
            <Skeleton height={12} width={64} />
          </View>
        ))}
      </View>

      {/* Active program card */}
      <View style={styles.section}>
        <Skeleton height={16} style={styles.sectionTitle} width={130} />
        <View style={styles.programCard}>
          <Skeleton height={14} style={styles.programName} width="60%" />
          <Skeleton height={11} style={styles.programLabel} width={100} />
          <Skeleton borderRadius={BorderRadius.sm} height={24} style={styles.programBalance} width={140} />
        </View>
      </View>

      {/* Recent transactions */}
      <View style={styles.section}>
        <Skeleton height={16} style={styles.sectionTitle} width={160} />
        <View style={styles.transactionsCard}>
          {[0, 1, 2].map((i) => (
            <SkeletonRow key={i} style={styles.transactionRow}>
              <Skeleton borderRadius={18} height={36} width={36} />
              <View style={styles.transactionInfo}>
                <Skeleton height={13} style={styles.transactionName} width="70%" />
                <Skeleton height={11} width={80} />
              </View>
              <Skeleton height={13} width={56} />
            </SkeletonRow>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  balanceCard: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.four,
    marginHorizontal: Spacing.four,
    marginBottom: Spacing.three,
    backgroundColor: 'white',
  },
  balanceTitle: { marginBottom: Spacing.two },
  balanceValue: { marginBottom: Spacing.two },
  balanceSub: {},
  balanceActions: { columnGap: Spacing.two, marginTop: Spacing.three },
  balanceButton: {},
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: Spacing.four,
    columnGap: Spacing.three,
    rowGap: Spacing.three,
    marginBottom: Spacing.five,
  },
  actionCard: {
    backgroundColor: 'white',
    width: '47%',
    minHeight: 120,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(151, 151, 151, 0.2)',
  },
  actionIcon: { marginBottom: Spacing.two },
  section: {
    marginHorizontal: Spacing.four,
    marginBottom: Spacing.four,
  },
  sectionTitle: { marginBottom: Spacing.two },
  programCard: {
    backgroundColor: 'white',
    borderRadius: BorderRadius.lg,
    padding: Spacing.four,
  },
  programName: { marginBottom: Spacing.two },
  programLabel: { marginBottom: Spacing.half },
  programBalance: { marginTop: Spacing.half },
  transactionsCard: {
    backgroundColor: 'white',
    borderRadius: BorderRadius.lg,
    padding: Spacing.three,
  },
  transactionRow: {
    justifyContent: 'space-between',
    paddingVertical: Spacing.two,
    columnGap: Spacing.three,
  },
  transactionInfo: {
    flex: 1,
    rowGap: Spacing.half,
  },
  transactionName: {},
});

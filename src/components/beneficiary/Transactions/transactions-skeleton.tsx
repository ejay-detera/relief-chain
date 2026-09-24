import { StyleSheet, View } from 'react-native';

import { Skeleton, SkeletonRow } from '@/components/shared/Skeleton';
import { Spacing } from '@/constants/theme';

/**
 * Placeholder rows matching the transaction history list's real layout so
 * there's no jump in size once real data replaces it. Shown only for the
 * initial `isLoading` state.
 */
export function TransactionsSkeleton() {
  return (
    <View>
      {[0, 1, 2, 3].map((i) => (
        <SkeletonRow key={i} style={styles.row}>
          <View style={styles.leftCol}>
            <Skeleton height={15} style={styles.merchant} width="60%" />
            <Skeleton height={12} style={styles.date} width={90} />
            <Skeleton height={10} width={140} />
          </View>
          <View style={styles.rightCol}>
            <Skeleton height={16} style={styles.amount} width={60} />
            <Skeleton height={11} width={80} />
          </View>
        </SkeletonRow>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    justifyContent: 'space-between',
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    backgroundColor: 'white',
  },
  leftCol: {
    flex: 1,
    marginRight: Spacing.three,
  },
  merchant: {
    marginBottom: 4,
  },
  date: {
    marginBottom: 4,
  },
  rightCol: {
    alignItems: 'flex-end',
  },
  amount: {
    marginBottom: 4,
  },
});

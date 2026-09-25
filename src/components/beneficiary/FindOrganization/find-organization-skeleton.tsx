import { StyleSheet, View } from 'react-native';

import { Skeleton } from '@/components/shared/Skeleton';
import { BorderRadius, Spacing } from '@/constants/theme';

/**
 * Placeholder cards matching the organization/program list's real layout so
 * there's no jump in size once real data replaces it. Shown only for the
 * initial `isLoading` state.
 */
export function FindOrganizationSkeleton() {
  return (
    <View style={styles.list}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={styles.card}>
          <View style={styles.header}>
            <Skeleton borderRadius={20} height={40} style={styles.iconCircle} width={40} />
            <View style={styles.info}>
              <Skeleton height={12} style={styles.orgName} width="50%" />
              <Skeleton height={15} width="70%" />
            </View>
          </View>
          <Skeleton height={13} style={styles.purposeLine} width="90%" />
          <Skeleton height={13} style={styles.purposeLine} width="60%" />
          <Skeleton borderRadius={BorderRadius.md} height={30} width={90} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: Spacing.four,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: BorderRadius.lg,
    padding: Spacing.three,
    marginBottom: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.two,
  },
  iconCircle: {
    marginRight: Spacing.three,
  },
  info: {
    flex: 1,
  },
  orgName: {
    marginBottom: 2,
  },
  purposeLine: {
    marginBottom: Spacing.two,
  },
});

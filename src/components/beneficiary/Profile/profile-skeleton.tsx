import { StyleSheet, View } from 'react-native';

import { Skeleton } from '@/components/shared/Skeleton';
import { BorderRadius, Spacing } from '@/constants/theme';

/**
 * Placeholder shapes matching the profile screen's real layout (header,
 * detail panel, recovery row) so there's no jump in size once real data
 * replaces it. Shown only while auth/profile data is loading.
 */
export function ProfileSkeleton() {
  return (
    <View>
      {/* Profile header */}
      <View style={styles.header}>
        <Skeleton borderRadius={40} height={80} style={styles.avatar} width={80} />
        <Skeleton height={16} width={140} />
      </View>

      {/* Detail panel */}
      <View style={styles.panel}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={styles.detailRow}>
            <Skeleton borderRadius={16} height={32} style={styles.detailIcon} width={32} />
            <View style={styles.detailInfo}>
              <Skeleton height={11} style={styles.detailLabel} width={120} />
              <Skeleton height={14} width={160} />
            </View>
          </View>
        ))}
        <Skeleton borderRadius={BorderRadius.full} height={44} width="100%" />
      </View>

      {/* Recovery row */}
      <View style={styles.recoveryRow}>
        <Skeleton borderRadius={BorderRadius.lg} height={56} width="100%" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    marginBottom: Spacing.four,
  },
  avatar: {
    marginBottom: Spacing.three,
  },
  panel: {
    backgroundColor: 'white',
    borderRadius: BorderRadius.lg,
    padding: Spacing.four,
    marginBottom: Spacing.four,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.three,
  },
  detailIcon: {
    marginRight: Spacing.three,
  },
  detailInfo: {
    flex: 1,
  },
  detailLabel: {
    marginBottom: Spacing.half,
  },
  recoveryRow: {
    marginBottom: Spacing.four,
  },
});

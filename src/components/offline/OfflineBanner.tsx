import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, Spacing } from '@/constants/theme';
import { useNetworkState } from '@/hooks/use-network-state';

interface OfflineBannerProps {
  pendingCount?: number;
  cachedBeneficiariesCount?: number;
  onPressSync?: () => void;
}

export function OfflineBanner({
  pendingCount = 0,
  cachedBeneficiariesCount = 0,
  onPressSync,
}: OfflineBannerProps) {
  const { isOffline } = useNetworkState();

  if (!isOffline && pendingCount === 0) {
    return null;
  }

  const offlineLabel =
    cachedBeneficiariesCount > 0
      ? `Offline Mode • ${cachedBeneficiariesCount} Beneficiaries Pre-cached`
      : 'Offline Mode • Local Verification';

  return (
    <Pressable
      onPress={onPressSync}
      style={({ pressed }) => [
        styles.container,
        isOffline ? styles.offlineBg : styles.pendingBg,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.content}>
        <MaterialCommunityIcons
          name={isOffline ? 'cloud-off-outline' : 'sync'}
          size={16}
          color={isOffline ? '#92400E' : '#1E40AF'}
        />
        <ThemedText style={[styles.text, isOffline ? styles.offlineText : styles.pendingText]}>
          {isOffline ? offlineLabel : 'Online • Transactions Ready to Sync'}
        </ThemedText>
        {pendingCount > 0 && (
          <View style={styles.badge}>
            <ThemedText style={styles.badgeText}>
              {pendingCount} {pendingCount === 1 ? 'Pending' : 'Pending'}
            </ThemedText>
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  offlineBg: {
    backgroundColor: '#FEF3C7',
    borderBottomColor: '#FDE68A',
  },
  pendingBg: {
    backgroundColor: '#EFF6FF',
    borderBottomColor: '#DBEAFE',
  },
  pressed: {
    opacity: 0.8,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: Spacing.two,
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
  },
  offlineText: {
    color: '#92400E',
  },
  pendingText: {
    color: '#1E40AF',
  },
  badge: {
    backgroundColor: '#D97706',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: BorderRadius.full,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
});

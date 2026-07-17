import { FontAwesome } from '@expo/vector-icons';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import type { MfaFactorSummary } from '@/types/mfa';

type Props = {
  factors: readonly MfaFactorSummary[];
  removingId: string | null;
  onRemove: (factor: MfaFactorSummary) => void;
};

const factorTypeLabel = (factor: MfaFactorSummary): string =>
  factor.factorType === 'phone' ? 'Phone (SMS)' : 'Authenticator app (TOTP)';

/**
 * Lists the account's enrolled MFA factors and lets the user remove one. Uses a
 * FlatList per the frontend list rules; each row shows its verification status.
 */
export const MfaFactorList = ({ factors, removingId, onRemove }: Props) => (
  <FlatList
    data={factors}
    keyExtractor={(factor) => factor.id}
    scrollEnabled={false}
    ItemSeparatorComponent={() => <View style={styles.separator} />}
    renderItem={({ item }) => {
      const isVerified = item.status === 'verified';
      const isRemoving = removingId === item.id;
      return (
        <View style={styles.row}>
          <View style={styles.rowIcon}>
            <FontAwesome
              color={item.factorType === 'phone' ? BrandColors.navy : BrandColors.green}
              name={item.factorType === 'phone' ? 'mobile' : 'lock'}
              size={18}
            />
          </View>
          <View style={styles.rowText}>
            <ThemedText style={styles.rowTitle}>
              {item.friendlyName?.trim() || factorTypeLabel(item)}
            </ThemedText>
            <ThemedText style={styles.rowSubtitle}>
              {factorTypeLabel(item)} · {isVerified ? 'Verified' : 'Pending verification'}
            </ThemedText>
          </View>
          <Pressable
            accessibilityLabel={`Remove ${item.friendlyName ?? 'factor'}`}
            accessibilityRole="button"
            accessibilityState={{ disabled: isRemoving }}
            disabled={isRemoving}
            hitSlop={8}
            onPress={() => onRemove(item)}
            style={styles.removeButton}
          >
            <ThemedText style={styles.removeLabel}>{isRemoving ? 'Removing…' : 'Remove'}</ThemedText>
          </Pressable>
        </View>
      );
    }}
  />
);

const styles = StyleSheet.create({
  row: { alignItems: 'center', flexDirection: 'row', gap: Spacing.three, paddingVertical: Spacing.two },
  rowIcon: {
    alignItems: 'center',
    backgroundColor: BrandColors.lightGray,
    borderRadius: 999,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14 },
  rowSubtitle: { color: BrandColors.grey, fontFamily: 'PlusJakartaSans_400Regular', fontSize: 12 },
  removeButton: {
    borderColor: BrandColors.grey,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  removeLabel: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 12 },
  separator: { backgroundColor: BrandColors.lightGray, height: 1 },
});

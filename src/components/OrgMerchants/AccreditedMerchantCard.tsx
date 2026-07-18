import { Pressable, StyleSheet, View } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';
import { BrandColors, BorderRadius, Spacing } from '@/constants/theme';
import type { AccreditedMerchant } from '@/services/merchantManagementService';

type Props = { merchant: AccreditedMerchant; onSuspend: () => void; onReactivate: () => void };

export const AccreditedMerchantCard = ({ merchant, onSuspend, onReactivate }: Props) => {
  const isSuspended = merchant.status === 'suspended';

  return (
    <View style={[styles.card, isSuspended && styles.cardSuspended]}>
      <View style={styles.row}>
        <View style={styles.avatar}>
          <FontAwesome name="building" size={18} color={BrandColors.navy} />
        </View>
        <View style={styles.info}>
          <ThemedText style={styles.name} numberOfLines={1}>{merchant.displayName}</ThemedText>
          <ThemedText style={styles.meta}>{merchant.category}</ThemedText>
        </View>
        <View style={styles.right}>
          <View style={[styles.badge, { backgroundColor: isSuspended ? '#FDF2F8' : '#EAFAF1' }]}>
            <ThemedText style={[styles.badgeText, { color: isSuspended ? '#8E44AD' : BrandColors.green }]}>
              {isSuspended ? 'Suspended' : 'Active'}
            </ThemedText>
          </View>
        </View>
      </View>
      <View style={styles.actions}>
        {isSuspended ? (
          <Pressable style={[styles.actionBtn, { borderColor: BrandColors.green }]} onPress={onReactivate}>
            <ThemedText style={[styles.actionText, { color: BrandColors.green }]}>Reactivate</ThemedText>
          </Pressable>
        ) : (
          <Pressable style={[styles.actionBtn, { borderColor: '#E74C3C' }]} onPress={onSuspend}>
            <ThemedText style={[styles.actionText, { color: '#E74C3C' }]}>Suspend</ThemedText>
          </Pressable>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: { backgroundColor: '#FFF', borderRadius: BorderRadius.md, borderWidth: 0.5, borderColor: 'rgba(151,151,151,0.35)', marginHorizontal: Spacing.three, marginBottom: Spacing.two, padding: Spacing.three },
  cardSuspended: { opacity: 0.7 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  avatar: { width: 44, height: 44, borderRadius: BorderRadius.md, backgroundColor: BrandColors.lightGray, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, gap: 2 },
  name: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13, color: BrandColors.navy },
  meta: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 11, color: BrandColors.grey },
  right: { alignItems: 'flex-end', gap: 4 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: BorderRadius.sm },
  badgeText: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 10 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: Spacing.three, borderTopWidth: 1, borderTopColor: BrandColors.lightGray, paddingTop: Spacing.three },
  actionBtn: { borderWidth: 1, borderRadius: BorderRadius.md, paddingVertical: 6, paddingHorizontal: Spacing.four },
  actionText: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 12 },
});

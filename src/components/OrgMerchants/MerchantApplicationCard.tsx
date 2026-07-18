import { Pressable, StyleSheet, View } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';
import { BrandColors, BorderRadius, Spacing } from '@/constants/theme';
import type { PendingMerchant } from '@/services/merchantManagementService';

type Props = { merchant: PendingMerchant; onPress: () => void };

export const MerchantApplicationCard = ({ merchant, onPress }: Props) => (
  <Pressable style={styles.card} onPress={onPress} accessibilityRole="button">
    <View style={styles.row}>
      <View style={styles.avatar}>
        <FontAwesome name="building" size={18} color={BrandColors.navy} />
      </View>
      <View style={styles.info}>
        <ThemedText style={styles.name} numberOfLines={1}>{merchant.displayName}</ThemedText>
        <ThemedText style={styles.meta}>{merchant.category}</ThemedText>
        {merchant.stellarPubkey && (
          <ThemedText style={styles.wallet} numberOfLines={1}>
            {merchant.stellarPubkey.slice(0, 8)}...{merchant.stellarPubkey.slice(-6)}
          </ThemedText>
        )}
      </View>
      <View style={styles.right}>
        <ThemedText style={styles.date}>
          {new Date(merchant.submittedAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
        </ThemedText>
        <FontAwesome name="chevron-right" size={12} color={BrandColors.grey} />
      </View>
    </View>
  </Pressable>
);

const styles = StyleSheet.create({
  card: { backgroundColor: '#FFF', borderRadius: BorderRadius.md, borderWidth: 0.5, borderColor: 'rgba(151,151,151,0.35)', marginHorizontal: Spacing.three, marginBottom: Spacing.two, padding: Spacing.three },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  avatar: { width: 44, height: 44, borderRadius: BorderRadius.md, backgroundColor: BrandColors.lightGray, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, gap: 2 },
  name: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13, color: BrandColors.navy },
  meta: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 11, color: BrandColors.grey },
  wallet: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 10, color: BrandColors.grey },
  right: { alignItems: 'flex-end', gap: 4 },
  date: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 10, color: BrandColors.grey },
});

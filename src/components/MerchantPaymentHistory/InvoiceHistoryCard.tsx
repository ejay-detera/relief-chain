import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import type { MerchantInvoiceRecord } from '@/types/merchant-payment-history';
import { formatStroops } from '@/utils/format-stroops';

type Props = {
  record: MerchantInvoiceRecord;
  onPress: (record: MerchantInvoiceRecord) => void;
};

const formatDate = (isoString: string): string => {
  try {
    const date = new Date(isoString);
    const now = new Date();
    const isToday =
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear();

    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (isToday) return `Today, ${timeStr}`;

    const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    return `${dateStr}, ${timeStr}`;
  } catch {
    return isoString;
  }
};

const getRemainingMinutes = (expiresAt: string): string => {
  const diff = Date.parse(expiresAt) - Date.now();
  if (diff <= 0) return 'Expired';
  const mins = Math.floor(diff / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  if (mins < 1) return `${secs}s left`;
  return `${mins}m left`;
};

export const InvoiceHistoryCard = ({ record, onPress }: Props) => {
  const { invoice, status, createdAt } = record;
  const isSettled = status === 'settled';
  const isActive = status === 'active';
  const isExpired = status === 'expired';

  const badgeConfig = isSettled
    ? { text: 'Settled', bg: 'rgba(111, 202, 75, 0.15)', color: BrandColors.green, icon: 'check-circle' as const }
    : isActive
    ? { text: getRemainingMinutes(invoice.expiresAt), bg: 'rgba(228, 207, 16, 0.18)', color: '#A07E00', icon: 'clock-outline' as const }
    : { text: 'Expired', bg: 'rgba(151, 151, 151, 0.15)', color: BrandColors.grey, icon: 'clock-alert-outline' as const };

  return (
    <Pressable
      accessibilityLabel={`Invoice for ${formatStroops(invoice.amountStroops)} PHP, status ${status}`}
      accessibilityRole="button"
      onPress={() => onPress(record)}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={[styles.iconWrap, { backgroundColor: badgeConfig.bg }]}>
        <MaterialCommunityIcons color={badgeConfig.color} name={badgeConfig.icon} size={22} />
      </View>

      <View style={styles.middleSection}>
        <View style={styles.topLine}>
          <ThemedText style={styles.amount}>+ ₱{formatStroops(invoice.amountStroops)}</ThemedText>
          <View style={[styles.statusBadge, { backgroundColor: badgeConfig.bg }]}>
            <ThemedText style={[styles.statusText, { color: badgeConfig.color }]}>
              {badgeConfig.text}
            </ThemedText>
          </View>
        </View>

        <View style={styles.bottomLine}>
          <ThemedText style={styles.date}>{formatDate(createdAt || invoice.issuedAt)}</ThemedText>
          <View style={styles.kindBadge}>
            <ThemedText style={styles.kindText}>
              {invoice.kind === 'voucher' ? `Voucher · ${invoice.category}` : 'Cash'}
            </ThemedText>
          </View>
        </View>
      </View>

      <MaterialCommunityIcons color="#C0CAD7" name="chevron-right" size={20} />
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(151, 151, 151, 0.25)',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: Spacing.two,
    padding: Spacing.three,
  },
  cardPressed: {
    backgroundColor: '#F8FAFC',
    borderColor: BrandColors.navy,
  },
  iconWrap: {
    alignItems: 'center',
    borderRadius: BorderRadius.full,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  middleSection: {
    flex: 1,
    gap: 4,
  },
  topLine: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  amount: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 16,
  },
  statusBadge: {
    borderRadius: BorderRadius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 11,
  },
  bottomLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.two,
  },
  date: {
    color: BrandColors.grey,
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 11,
  },
  kindBadge: {
    backgroundColor: '#F1F4F9',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  kindText: {
    color: '#55657E',
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 10,
  },
});

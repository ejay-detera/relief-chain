// src/components/MerchantInvoice/PendingPaymentItem.tsx
import { Pressable, View, StyleSheet } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { BrandColors, Spacing } from '@/constants/theme';
import { formatStroops } from '@/utils/format-stroops';
import type { PendingPayment } from '@/hooks/use-pending-payments';
import { MaterialCommunityIcons } from '@expo/vector-icons';

type Props = {
  payment: PendingPayment;
  onRefresh?: () => void;
};

export function PendingPaymentItem({ payment, onRefresh }: Props) {
  const amount = formatStroops(payment.amountStroops as any);
  const date = new Date(payment.createdAt).toLocaleString();

  return (
    <View style={styles.container}>
      <View style={styles.info}>
        <ThemedText style={styles.amount}>${amount}</ThemedText>
        <ThemedText style={styles.date}>{date}</ThemedText>
        {payment.transactionHash && (
          <ThemedText style={styles.tx}>Tx: {payment.transactionHash.slice(0, 8)}…</ThemedText>
        )}
      </View>
      {onRefresh && (
        <Pressable accessibilityLabel="Refresh" accessibilityRole="button" onPress={onRefresh} style={styles.refreshBtn}>
          <MaterialCommunityIcons name="refresh" size={20} color={BrandColors.navy} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.two,
    borderWidth: 1,
    borderColor: BrandColors.grey,
    borderRadius: 12,
    marginBottom: Spacing.one,
  },
  info: {
    flexDirection: 'column',
  },
  amount: {
    fontFamily: 'PlusJakartaSans_700Bold',
    color: BrandColors.navy,
    fontSize: 16,
  },
  date: {
    fontFamily: 'PlusJakartaSans_500Medium',
    color: BrandColors.grey,
    fontSize: 13,
  },
  tx: {
    fontFamily: 'PlusJakartaSans_400Regular',
    color: BrandColors.grey,
    fontSize: 12,
    marginTop: 2,
  },
  refreshBtn: {
    padding: Spacing.one,
  },
});

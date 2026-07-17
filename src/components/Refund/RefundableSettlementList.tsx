import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PILOT_ASSET_CODE } from '@/constants/pilot-disclosure';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import type { SettlementsState } from '@/hooks/use-merchant-settlements';
import type { RefundableSettlement } from '@/types/refund';
import { formatStroops } from '@/utils/format-stroops';

type Props = {
  state: SettlementsState;
  onRetry: () => void;
  onRefund: (settlement: RefundableSettlement) => void;
};

const SettlementRow = ({
  settlement,
  onRefund,
}: {
  settlement: RefundableSettlement;
  onRefund: (settlement: RefundableSettlement) => void;
}) => {
  const refundable = BigInt(settlement.remainingRefundableStroops) > 0n;
  return (
    <View style={styles.row}>
      <View style={styles.rowInfo}>
        <ThemedText style={styles.amount}>
          {formatStroops(settlement.remainingRefundableStroops)} {PILOT_ASSET_CODE}
        </ThemedText>
        <ThemedText style={styles.meta}>
          {settlement.reference} · refundable of {formatStroops(settlement.originalAmountStroops)}
          {settlement.isProgramExpired ? ' · program expired' : ''}
        </ThemedText>
      </View>
      <Pressable
        accessibilityRole="button"
        disabled={!refundable}
        onPress={() => onRefund(settlement)}
        style={[styles.action, !refundable && styles.actionDisabled]}
      >
        <ThemedText style={styles.actionLabel}>{refundable ? 'Refund' : 'Fully refunded'}</ThemedText>
      </Pressable>
    </View>
  );
};

/**
 * Lists confirmed settlements a merchant can still refund, with the remaining
 * refundable amount so a refund can never exceed the original (Requirement 15.4).
 */
export const RefundableSettlementList = ({ state, onRetry, onRefund }: Props) => {
  if (state.status === 'loading') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={BrandColors.navy} />
      </View>
    );
  }

  if (state.status === 'unavailable') {
    return (
      <View style={styles.messageBox}>
        <ThemedText style={styles.message}>{state.reason}</ThemedText>
        <ThemedText accessibilityRole="button" onPress={onRetry} style={styles.retry}>
          Retry
        </ThemedText>
      </View>
    );
  }

  if (state.settlements.length === 0) {
    return (
      <View style={styles.messageBox}>
        <ThemedText style={styles.message}>No confirmed settlements to refund.</ThemedText>
      </View>
    );
  }

  return (
    <FlatList
      data={state.settlements}
      keyExtractor={(item) => item.settlementId}
      renderItem={({ item }) => <SettlementRow onRefund={onRefund} settlement={item} />}
      scrollEnabled={false}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
    />
  );
};

const styles = StyleSheet.create({
  centered: { alignItems: 'center', paddingVertical: Spacing.four },
  messageBox: {
    alignItems: 'center',
    backgroundColor: BrandColors.lightGray,
    borderRadius: BorderRadius.md,
    gap: Spacing.one,
    padding: Spacing.three,
  },
  message: { color: BrandColors.grey, fontFamily: 'PlusJakartaSans_500Medium', fontSize: 12, textAlign: 'center' },
  retry: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 12 },
  row: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two, paddingVertical: Spacing.two },
  rowInfo: { flex: 1, gap: 2 },
  amount: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14 },
  meta: { color: BrandColors.grey, fontFamily: 'PlusJakartaSans_400Regular', fontSize: 11 },
  action: {
    backgroundColor: BrandColors.navy,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  actionDisabled: { backgroundColor: BrandColors.grey },
  actionLabel: { color: '#FFFFFF', fontFamily: 'PlusJakartaSans_700Bold', fontSize: 11 },
  separator: { backgroundColor: BrandColors.lightGray, height: 1 },
});

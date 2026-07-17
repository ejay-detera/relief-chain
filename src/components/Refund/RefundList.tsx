import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';

import { RefundStatusPill } from '@/components/Refund/RefundStatusPill';
import { ThemedText } from '@/components/themed-text';
import { PILOT_ASSET_CODE } from '@/constants/pilot-disclosure';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import type { RefundListState } from '@/hooks/use-merchant-refunds';
import type { Refund } from '@/types/refund';
import { formatStroops } from '@/utils/format-stroops';

type Props = {
  state: RefundListState;
  onRetry: () => void;
};

const shortHash = (hash: string): string =>
  hash.length > 16 ? `${hash.slice(0, 8)}…${hash.slice(-6)}` : hash;

const timestamp = (value: string): string => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
};

const RefundRow = ({ refund }: { refund: Refund }) => (
  <View style={styles.row}>
    <View style={styles.rowHeader}>
      <ThemedText style={styles.amount}>
        {formatStroops(refund.amountStroops)} {PILOT_ASSET_CODE}
      </ThemedText>
      <RefundStatusPill status={refund.status} />
    </View>
    <ThemedText style={styles.meta}>
      {refund.reference} · requested {timestamp(refund.requestedAt)}
    </ThemedText>
    {refund.status === 'confirmed' && refund.evidence.transactionHash ? (
      <ThemedText style={styles.meta}>Ref: {shortHash(refund.evidence.transactionHash)}</ThemedText>
    ) : null}
    {refund.status === 'exception_required' ? (
      <ThemedText style={styles.exception}>{refund.exceptionReason}</ThemedText>
    ) : null}
    {refund.status === 'failed' ? (
      <ThemedText style={styles.failure}>{refund.error.message}</ThemedText>
    ) : null}
  </View>
);

/**
 * Reconciled list of refunds. Each row references an immutable original
 * settlement and never mutates it (Requirements 15.1, 15.2). A failed read is
 * shown as unavailable, never as an empty success.
 */
export const RefundList = ({ state, onRetry }: Props) => {
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

  if (state.refunds.length === 0) {
    return (
      <View style={styles.messageBox}>
        <ThemedText style={styles.message}>No refunds yet.</ThemedText>
      </View>
    );
  }

  return (
    <FlatList
      data={state.refunds}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <RefundRow refund={item} />}
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
  row: { gap: 2, paddingVertical: Spacing.two },
  rowHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  amount: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14 },
  meta: { color: BrandColors.grey, fontFamily: 'PlusJakartaSans_400Regular', fontSize: 11 },
  exception: { color: '#9A5B00', fontFamily: 'PlusJakartaSans_500Medium', fontSize: 11, lineHeight: 15 },
  failure: { color: '#C0392B', fontFamily: 'PlusJakartaSans_500Medium', fontSize: 11, lineHeight: 15 },
  separator: { backgroundColor: BrandColors.lightGray, height: 1 },
});

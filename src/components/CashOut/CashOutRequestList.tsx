import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';

import { CashOutStatusPill } from '@/components/CashOut/CashOutStatusPill';
import { ThemedText } from '@/components/themed-text';
import { PILOT_ASSET_CODE } from '@/constants/pilot-disclosure';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import type { CashOutListState } from '@/hooks/use-cashout-requests';
import type { CashOutRequest } from '@/types/cashout';
import { formatStroops } from '@/utils/format-stroops';

type Props = {
  state: CashOutListState;
  onRetry: () => void;
};

const timestamp = (value: string): string => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
};

const CashOutRow = ({ request }: { request: CashOutRequest }) => (
  <View style={styles.row}>
    <View style={styles.rowHeader}>
      <ThemedText style={styles.amount}>
        {formatStroops(request.amountStroops)} {PILOT_ASSET_CODE}
      </ThemedText>
      <CashOutStatusPill status={request.status} />
    </View>
    <ThemedText style={styles.meta}>Requested {timestamp(request.requestedAt)}</ThemedText>
    {request.isSimulated ? <ThemedText style={styles.simulated}>SIMULATED · not a real bank transfer</ThemedText> : null}
    {request.partnerReference ? (
      <ThemedText style={styles.meta}>Partner ref: {request.partnerReference}</ThemedText>
    ) : null}
    {request.status === 'failed' ? (
      <ThemedText style={styles.failure}>
        Cash-out failed{request.failureCode ? ` (${request.failureCode})` : ''}. Your settled balance is
        unchanged.
      </ThemedText>
    ) : null}
  </View>
);

/**
 * Reconciled list of simulated cash-out requests. Every row is labeled SIMULATED
 * and a failed cash-out explicitly states the on-chain balance is unchanged
 * (Requirements 12.6, 12.7, 12.8). Never rendered from timers or client state.
 */
export const CashOutRequestList = ({ state, onRetry }: Props) => {
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

  if (state.requests.length === 0) {
    return (
      <View style={styles.messageBox}>
        <ThemedText style={styles.message}>No cash-out requests yet.</ThemedText>
      </View>
    );
  }

  return (
    <FlatList
      data={state.requests}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <CashOutRow request={item} />}
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
  simulated: { color: '#7A6C00', fontFamily: 'PlusJakartaSans_700Bold', fontSize: 10 },
  failure: { color: '#C0392B', fontFamily: 'PlusJakartaSans_500Medium', fontSize: 11, lineHeight: 15 },
  separator: { backgroundColor: BrandColors.lightGray, height: 1 },
});

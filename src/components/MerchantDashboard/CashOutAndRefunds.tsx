import { Pressable, StyleSheet, View } from 'react-native';

import { CashOutRequestList } from '@/components/CashOut/CashOutRequestList';
import { SimulatedCashOutNotice } from '@/components/CashOut/SimulatedCashOutNotice';
import { RefundableSettlementList } from '@/components/Refund/RefundableSettlementList';
import { RefundList } from '@/components/Refund/RefundList';
import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import type { CashOutListState } from '@/hooks/use-cashout-requests';
import type { MerchantRefundsHook } from '@/hooks/use-merchant-refunds';
import type { SettlementsState } from '@/hooks/use-merchant-settlements';
import type { RefundableSettlement } from '@/types/refund';

type Props = {
  cashOut: CashOutListState;
  onRetryCashOut: () => void;
  onRequestCashOut: () => void;
  settlements: SettlementsState;
  onRetrySettlements: () => void;
  onRequestRefund: (settlement: RefundableSettlement) => void;
  refunds: MerchantRefundsHook['state'];
  onRetryRefunds: () => void;
};

const Card = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <View style={styles.card}>
    <ThemedText style={styles.cardTitle}>{title}</ThemedText>
    {children}
  </View>
);

/**
 * Presentational merchant panel that composes the simulated cash-out and refund
 * flows. State (hooks, modal visibility) is owned by the screen; this only
 * renders reconciled lists and relays user intent up via callbacks.
 */
export const CashOutAndRefunds = ({
  cashOut,
  onRetryCashOut,
  onRequestCashOut,
  settlements,
  onRetrySettlements,
  onRequestRefund,
  refunds,
  onRetryRefunds,
}: Props) => (
  <View style={styles.container}>
    <Card title="Cash-out">
      <SimulatedCashOutNotice />
      <Pressable accessibilityRole="button" onPress={onRequestCashOut} style={styles.primaryButton}>
        <ThemedText style={styles.primaryLabel}>Request cash-out</ThemedText>
      </Pressable>
      <CashOutRequestList onRetry={onRetryCashOut} state={cashOut} />
    </Card>

    <Card title="Refundable settlements">
      <RefundableSettlementList onRefund={onRequestRefund} onRetry={onRetrySettlements} state={settlements} />
    </Card>

    <Card title="Refund history">
      <RefundList onRetry={onRetryRefunds} state={refunds} />
    </Card>
  </View>
);

const styles = StyleSheet.create({
  container: { gap: Spacing.three },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.lg,
    gap: Spacing.two,
    padding: Spacing.three,
  },
  cardTitle: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15 },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: BrandColors.green,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.two,
  },
  primaryLabel: { color: '#FFFFFF', fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14 },
});

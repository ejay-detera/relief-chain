import { StyleSheet, View } from 'react-native';

import { RefundableSettlementList } from '@/components/Refund/RefundableSettlementList';
import { RefundList } from '@/components/Refund/RefundList';
import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import type { MerchantRefundsHook } from '@/hooks/use-merchant-refunds';
import type { SettlementsState } from '@/hooks/use-merchant-settlements';
import type { RefundableSettlement } from '@/types/refund';

type Props = {
  settlements: SettlementsState;
  onRetrySettlements: () => void;
  onRequestRefund: (settlement: RefundableSettlement) => void;
  refunds: MerchantRefundsHook['state'];
  onRetryRefunds: () => void;
  // Optional legacy props for backwards-compatibility
  cashOut?: unknown;
  onRetryCashOut?: () => void;
  onRequestCashOut?: () => void;
};

const Card = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <View style={styles.card}>
    <ThemedText style={styles.cardTitle}>{title}</ThemedText>
    {children}
  </View>
);

/**
 * Presentational merchant panel that renders refundable settlements and refund history.
 * Cash-out is accessible directly via the Withdraw button on the Wallet Balance card.
 */
export const RefundsSection = ({
  settlements,
  onRetrySettlements,
  onRequestRefund,
  refunds,
  onRetryRefunds,
}: Props) => (
  <View style={styles.container}>
    <Card title="Refundable settlements">
      <RefundableSettlementList onRefund={onRequestRefund} onRetry={onRetrySettlements} state={settlements} />
    </Card>

    <Card title="Refund history">
      <RefundList onRetry={onRetryRefunds} state={refunds} />
    </Card>
  </View>
);

export const CashOutAndRefunds = RefundsSection;

const styles = StyleSheet.create({
  container: { gap: Spacing.three },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.lg,
    gap: Spacing.two,
    padding: Spacing.three,
  },
  cardTitle: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15 },
});

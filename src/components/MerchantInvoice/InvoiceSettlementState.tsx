import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import type { InvoiceSettlementState as SettlementState } from '@/types/invoice';

type Props = {
  state: SettlementState;
};

/**
 * Honest merchant-side settlement status for a presented invoice. Settlement is
 * reported as `settled` ONLY when reconciliation supplies confirmed ledger
 * evidence; while the invoice is awaiting a scan or awaiting confirmation it is
 * never described as paid (Requirements 12.3, 13.4, 21.2, 21.4). A submission
 * response alone is not settlement.
 */
export const InvoiceSettlementState = ({ state }: Props) => {
  switch (state.status) {
    case 'awaiting_scan':
      return (
        <View style={[styles.card, styles.neutral]}>
          <ThemedText style={styles.title}>Awaiting beneficiary scan</ThemedText>
          <ThemedText style={styles.body}>
            Ask the beneficiary to scan this invoice. Funds are not settled until confirmed on-chain.
          </ThemedText>
        </View>
      );
    case 'pending':
      return (
        <View style={[styles.card, styles.neutral]}>
          <View style={styles.row}>
            <ActivityIndicator color={BrandColors.navy} size="small" />
            <ThemedText style={styles.title}>Payment submitted — awaiting confirmation</ThemedText>
          </View>
          <ThemedText style={styles.body}>
            The transaction is submitted but not yet confirmed. Do not release goods as settled until confirmation.
          </ThemedText>
        </View>
      );
    case 'settled':
      return (
        <View style={[styles.card, styles.settled]}>
          <ThemedText style={styles.title}>Settlement confirmed</ThemedText>
          <ThemedText style={styles.body}>Confirmed on ledger {state.evidence.ledgerSequence}.</ThemedText>
          <ThemedText style={styles.mono}>{state.evidence.transactionHash}</ThemedText>
        </View>
      );
    case 'expired':
      return (
        <View style={[styles.card, styles.blocked]}>
          <ThemedText style={styles.title}>Invoice expired</ThemedText>
          <ThemedText style={styles.body}>This invoice can no longer be paid. Create a new invoice with a fresh nonce.</ThemedText>
        </View>
      );
    case 'unavailable':
      return (
        <View style={[styles.card, styles.blocked]}>
          <ThemedText style={styles.title}>Settlement status unavailable</ThemedText>
          <ThemedText style={styles.body}>{state.reason}</ThemedText>
        </View>
      );
  }
};

const styles = StyleSheet.create({
  card: { borderRadius: BorderRadius.lg, gap: Spacing.one, padding: Spacing.three },
  neutral: { backgroundColor: BrandColors.lightGray },
  settled: { backgroundColor: 'rgba(111,202,75,0.14)' },
  blocked: { backgroundColor: 'rgba(192,57,43,0.10)' },
  row: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two },
  title: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13 },
  body: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_500Medium', fontSize: 12, lineHeight: 17 },
  mono: { color: BrandColors.grey, fontFamily: 'PlusJakartaSans_500Medium', fontSize: 10 },
});

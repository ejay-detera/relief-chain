import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PILOT_ASSET_CODE, PILOT_NETWORK_LABEL, PILOT_NO_VALUE_LABEL } from '@/constants/pilot-disclosure';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import type { InvoiceV1 } from '@/types/invoice';
import { formatStroops } from '@/utils/format-stroops';

type Props = {
  invoice: InvoiceV1;
  /** The submitted transaction hash, when the network has accepted it. */
  transactionHash: string | null;
  onRefresh: () => void;
  refreshing?: boolean;
};

/**
 * Shows a payment that has been submitted but is NOT yet confirmed. It is
 * deliberately explicit that pending is not settled: value is confirmed only
 * after on-chain observation by reconciliation (Requirements 11.8, 13.4, 21.2).
 * The submitted transaction hash is surfaced as a verifiable reference when the
 * network has accepted it (Requirement 21.6).
 */
export const PaymentPending = ({ invoice, transactionHash, onRefresh, refreshing = false }: Props) => (
  <View style={styles.container}>
    <View style={styles.badge}>
      <ActivityIndicator color={BrandColors.navy} size="small" />
      <ThemedText style={styles.badgeText}>Submitted · awaiting confirmation</ThemedText>
    </View>

    <ThemedText style={styles.amount}>
      {formatStroops(invoice.amountStroops)} {PILOT_ASSET_CODE}
    </ThemedText>
    <ThemedText style={styles.disclosure}>{PILOT_NETWORK_LABEL} · {PILOT_NO_VALUE_LABEL}</ThemedText>

    <ThemedText style={styles.note}>
      This payment is not settled yet. It is confirmed only once the transaction is observed
      on-chain. Do not treat it as complete until it shows confirmed.
    </ThemedText>

    {transactionHash ? (
      <View style={styles.refBlock}>
        <ThemedText style={styles.refLabel}>Testnet transaction reference</ThemedText>
        <ThemedText selectable style={styles.refValue}>{transactionHash}</ThemedText>
      </View>
    ) : null}

    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: refreshing }}
      disabled={refreshing}
      onPress={onRefresh}
      style={({ pressed }) => [styles.refresh, (refreshing || pressed) && styles.refreshDisabled]}
    >
      <ThemedText style={styles.refreshText}>
        {refreshing ? 'Checking status…' : 'Check confirmation status'}
      </ThemedText>
    </Pressable>
  </View>
);

const styles = StyleSheet.create({
  container: { gap: Spacing.two },
  badge: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(228,207,16,0.18)',
    borderRadius: BorderRadius.full,
    flexDirection: 'row',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  badgeText: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 12 },
  amount: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 30, marginTop: Spacing.two },
  disclosure: { color: BrandColors.grey, fontFamily: 'PlusJakartaSans_500Medium', fontSize: 11 },
  note: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_500Medium', fontSize: 13, lineHeight: 19, marginTop: Spacing.two },
  refBlock: { backgroundColor: BrandColors.lightGray, borderRadius: BorderRadius.lg, gap: Spacing.half, marginTop: Spacing.two, padding: Spacing.three },
  refLabel: { color: BrandColors.grey, fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 11, letterSpacing: 0.4, textTransform: 'uppercase' },
  refValue: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_500Medium', fontSize: 12 },
  refresh: { alignItems: 'center', backgroundColor: BrandColors.navy, borderRadius: BorderRadius.xl, marginTop: Spacing.three, padding: Spacing.three },
  refreshDisabled: { opacity: 0.6 },
  refreshText: { color: '#FFFFFF', fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15 },
});

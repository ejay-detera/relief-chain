import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PILOT_ASSET_CODE, PILOT_NETWORK_LABEL, PILOT_NO_VALUE_LABEL } from '@/constants/pilot-disclosure';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import type { InvoiceV1 } from '@/types/invoice';
import { formatStroops } from '@/utils/format-stroops';

/** The reconciled or terminal outcome of a payment authorization. */
export type PaymentResultOutcome =
  | { kind: 'confirmed'; transactionHash: string }
  | { kind: 'failed'; message: string; retryable: boolean }
  | { kind: 'expired'; reason: string }
  | { kind: 'rejected'; reason: string }
  | { kind: 'unavailable'; reason: string; retryable: boolean };

type Props = {
  invoice: InvoiceV1;
  outcome: PaymentResultOutcome;
  /** Re-runs approval and payment (rejected / retryable failure / unavailable). */
  onRetry: () => void;
  /** Returns to scanning a new invoice. */
  onScanAgain: () => void;
};

/**
 * Presents the honest outcome of a payment. Only `confirmed` is a settled
 * result, and it is shown with a verifiable testnet transaction reference
 * (Requirement 21.6). Rejection and expiry moved NO value and say so, so the
 * beneficiary knows the balance is preserved (Requirements 11.9, 13.5). A
 * failed or unavailable outcome is never dressed up as success
 * (Requirements 21.2, 21.4).
 */
export const PaymentResult = ({ invoice, outcome, onRetry, onScanAgain }: Props) => {
  const presentation = describe(outcome);

  return (
    <View style={styles.container}>
      <View style={[styles.iconWrap, { backgroundColor: presentation.tint }]}>
        <MaterialCommunityIcons color={presentation.color} name={presentation.icon} size={40} />
      </View>

      <ThemedText style={styles.title}>{presentation.title}</ThemedText>

      {outcome.kind === 'confirmed' ? (
        <>
          <ThemedText style={styles.amount}>
            {formatStroops(invoice.amountStroops)} {PILOT_ASSET_CODE}
          </ThemedText>
          <ThemedText style={styles.disclosure}>{PILOT_NETWORK_LABEL} · {PILOT_NO_VALUE_LABEL}</ThemedText>
          <View style={styles.refBlock}>
            <ThemedText style={styles.refLabel}>Verifiable testnet transaction</ThemedText>
            <ThemedText selectable style={styles.refValue}>{outcome.transactionHash}</ThemedText>
          </View>
        </>
      ) : (
        <ThemedText style={styles.body}>{presentation.body}</ThemedText>
      )}

      {presentation.showRetry ? (
        <Pressable accessibilityRole="button" onPress={onRetry} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
          <ThemedText style={styles.primaryText}>{presentation.retryLabel}</ThemedText>
        </Pressable>
      ) : null}

      <Pressable accessibilityRole="button" onPress={onScanAgain} style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
        <ThemedText style={styles.secondaryText}>{presentation.doneLabel}</ThemedText>
      </Pressable>
    </View>
  );
};

type Presentation = {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  color: string;
  tint: string;
  title: string;
  body: string;
  showRetry: boolean;
  retryLabel: string;
  doneLabel: string;
};

const describe = (outcome: PaymentResultOutcome): Presentation => {
  switch (outcome.kind) {
    case 'confirmed':
      return {
        icon: 'check-circle', color: BrandColors.green, tint: 'rgba(111,202,75,0.18)',
        title: 'Payment confirmed', body: '', showRetry: false, retryLabel: '', doneLabel: 'Done',
      };
    case 'failed':
      return {
        icon: 'alert-circle', color: '#C0392B', tint: 'rgba(192,57,43,0.12)',
        title: 'Payment failed', body: outcome.message,
        showRetry: outcome.retryable, retryLabel: 'Try again', doneLabel: 'Back to scan',
      };
    case 'expired':
      return {
        icon: 'timer-off', color: '#C0392B', tint: 'rgba(192,57,43,0.12)',
        title: 'Invoice expired', body: `${outcome.reason} No funds were moved.`,
        showRetry: false, retryLabel: '', doneLabel: 'Scan a new invoice',
      };
    case 'rejected':
      return {
        icon: 'shield-off', color: BrandColors.navy, tint: 'rgba(17,46,88,0.10)',
        title: 'Authorization cancelled', body: `${outcome.reason} Your balance is unchanged.`,
        showRetry: true, retryLabel: 'Authorize again', doneLabel: 'Cancel',
      };
    case 'unavailable':
      return {
        icon: 'cloud-off-outline', color: BrandColors.grey, tint: 'rgba(151,151,151,0.15)',
        title: 'Payment status unavailable', body: outcome.reason,
        showRetry: outcome.retryable, retryLabel: 'Try again', doneLabel: 'Back to scan',
      };
  }
};

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: Spacing.two },
  iconWrap: { alignItems: 'center', borderRadius: BorderRadius.full, height: 80, justifyContent: 'center', marginBottom: Spacing.one, width: 80 },
  title: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 20, textAlign: 'center' },
  amount: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 28, marginTop: Spacing.one },
  disclosure: { color: BrandColors.grey, fontFamily: 'PlusJakartaSans_500Medium', fontSize: 11 },
  body: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_500Medium', fontSize: 14, lineHeight: 20, textAlign: 'center' },
  refBlock: { alignSelf: 'stretch', backgroundColor: BrandColors.lightGray, borderRadius: BorderRadius.lg, gap: Spacing.half, marginTop: Spacing.three, padding: Spacing.three },
  refLabel: { color: BrandColors.grey, fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 11, letterSpacing: 0.4, textTransform: 'uppercase' },
  refValue: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_500Medium', fontSize: 12 },
  primary: { alignItems: 'center', alignSelf: 'stretch', backgroundColor: BrandColors.green, borderRadius: BorderRadius.xl, marginTop: Spacing.three, padding: Spacing.three },
  primaryText: { color: '#FFFFFF', fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15 },
  secondary: { alignItems: 'center', alignSelf: 'stretch', padding: Spacing.three },
  secondaryText: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 14 },
  pressed: { opacity: 0.85 },
});

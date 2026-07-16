import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { PaymentPending } from '@/components/PaymentStatus/PaymentPending';
import { PaymentResult, type PaymentResultOutcome } from '@/components/PaymentStatus/PaymentResult';
import { ThemedText } from '@/components/themed-text';
import { BrandColors, Spacing } from '@/constants/theme';
import type { PaymentFlowState } from '@/hooks/use-payment-intent';
import type { InvoiceV1 } from '@/types/invoice';

type Props = {
  state: PaymentFlowState;
  invoice: InvoiceV1;
  checking: boolean;
  onCheck: () => void;
  onRetry: () => void;
  onScanAgain: () => void;
};

const TRANSIENT_LABELS: Record<string, string> = {
  authorizing: 'Waiting for your approval…',
  revalidating: 'Revalidating the invoice and your balance…',
  signing: 'Signing the payment on this device…',
  submitting: 'Submitting to the network…',
};

/**
 * Routes the beneficiary payment flow to its honest view: a lightweight progress
 * indicator for the pre-submission steps, {@link PaymentPending} once submitted
 * (never shown as settled), and {@link PaymentResult} for a reconciled or
 * terminal outcome. Returns `null` while idle so the screen shows the review.
 */
export const PaymentFlowView = ({ state, invoice, checking, onCheck, onRetry, onScanAgain }: Props) => {
  if (state.status === 'idle') return null;

  if (
    state.status === 'authorizing' ||
    state.status === 'revalidating' ||
    state.status === 'signing' ||
    state.status === 'submitting'
  ) {
    return (
      <View style={styles.progress}>
        <ActivityIndicator color={BrandColors.navy} size="large" />
        <ThemedText style={styles.progressText}>{TRANSIENT_LABELS[state.status]}</ThemedText>
        <ThemedText style={styles.progressNote}>No funds move until this payment confirms on-chain.</ThemedText>
      </View>
    );
  }

  if (state.status === 'pending') {
    return (
      <PaymentPending
        invoice={invoice}
        onRefresh={onCheck}
        refreshing={checking}
        transactionHash={state.transactionHash}
      />
    );
  }

  return <PaymentResult invoice={invoice} onRetry={onRetry} onScanAgain={onScanAgain} outcome={toOutcome(state)} />;
};

/** Maps a terminal flow state to the result presentation. */
const toOutcome = (
  state: Extract<PaymentFlowState, { status: 'confirmed' | 'failed' | 'expired' | 'rejected' | 'unavailable' }>,
): PaymentResultOutcome => {
  switch (state.status) {
    case 'confirmed':
      return { kind: 'confirmed', transactionHash: state.transactionHash };
    case 'failed':
      return { kind: 'failed', message: state.error.message, retryable: state.error.retryable };
    case 'expired':
      return { kind: 'expired', reason: state.reason };
    case 'rejected':
      return { kind: 'rejected', reason: state.reason };
    case 'unavailable':
      return { kind: 'unavailable', reason: state.reason, retryable: state.retryable };
  }
};

const styles = StyleSheet.create({
  progress: { alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.six },
  progressText: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 16, textAlign: 'center' },
  progressNote: { color: BrandColors.grey, fontFamily: 'PlusJakartaSans_500Medium', fontSize: 13, textAlign: 'center' },
});

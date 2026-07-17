import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PILOT_ASSET_CODE } from '@/constants/pilot-disclosure';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import { refundExceedsBounds } from '@/services/refund-service';
import type { StroopAmount } from '@/types/blockchain';
import type { RefundableSettlement } from '@/types/refund';
import { formatStroops, stroopsFromDecimalInput } from '@/utils/format-stroops';

export type RefundSubmitOutcome = { ok: true } | { ok: false; message: string };

type Props = {
  visible: boolean;
  onClose: () => void;
  /** The confirmed settlement being refunded; `null` while none is selected. */
  settlement: RefundableSettlement | null;
  /** Parent relays the prepare/submit to the Edge Function and returns the outcome. */
  onSubmit: (settlementId: string, amountStroops: StroopAmount) => Promise<RefundSubmitOutcome>;
};

/**
 * Self-contained refund request modal. It owns its amount form state and guards
 * the cumulative-refund bound client-side (Requirement 15.4) before relaying to
 * the server. When the program has expired it discloses that the refund routes to
 * the audited exception workflow (Requirement 15.5). The immutable original
 * settlement is referenced, never edited (Requirements 15.1, 15.2).
 */
export const RequestRefundModal = ({ visible, onClose, settlement, onSubmit }: Props) => {
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setAmount('');
    setError(null);
    setSubmitting(false);
  };

  const close = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  const submit = async () => {
    if (!settlement) return;
    setError(null);

    let stroops: StroopAmount;
    try {
      stroops = stroopsFromDecimalInput(amount);
    } catch (err) {
      setError(err instanceof RangeError ? err.message : 'Enter a valid amount.');
      return;
    }
    if (refundExceedsBounds(settlement, stroops)) {
      setError(
        `Refund cannot exceed the remaining refundable ${formatStroops(
          settlement.remainingRefundableStroops,
        )} ${PILOT_ASSET_CODE}.`,
      );
      return;
    }

    setSubmitting(true);
    const outcome = await onSubmit(settlement.settlementId, stroops);
    if (outcome.ok) {
      reset();
      onClose();
      return;
    }
    setSubmitting(false);
    setError(outcome.message);
  };

  return (
    <Modal animationType="slide" onRequestClose={close} transparent visible={visible}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <ThemedText style={styles.title}>Refund settlement</ThemedText>

          {settlement ? (
            <>
              <ThemedText style={styles.meta}>
                {settlement.reference} · original {formatStroops(settlement.originalAmountStroops)}{' '}
                {PILOT_ASSET_CODE}
              </ThemedText>
              <ThemedText style={styles.meta}>
                Remaining refundable: {formatStroops(settlement.remainingRefundableStroops)}{' '}
                {PILOT_ASSET_CODE}
              </ThemedText>

              {settlement.isProgramExpired ? (
                <View style={styles.exceptionBox}>
                  <ThemedText style={styles.exceptionText}>
                    This program has expired. The refund will be routed to the audited exception
                    workflow for review before any value moves.
                  </ThemedText>
                </View>
              ) : null}

              <ThemedText style={styles.label}>Refund amount ({PILOT_ASSET_CODE})</ThemedText>
              <TextInput
                editable={!submitting}
                keyboardType="decimal-pad"
                onChangeText={setAmount}
                placeholder="0.00"
                placeholderTextColor={BrandColors.grey}
                style={styles.input}
                value={amount}
              />

              {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}

              <View style={styles.actions}>
                <Pressable accessibilityRole="button" disabled={submitting} onPress={close} style={[styles.button, styles.cancel]}>
                  <ThemedText style={styles.cancelLabel}>Cancel</ThemedText>
                </Pressable>
                <Pressable accessibilityRole="button" disabled={submitting} onPress={submit} style={[styles.button, styles.confirm]}>
                  {submitting ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <ThemedText style={styles.confirmLabel}>Request refund</ThemedText>
                  )}
                </Pressable>
              </View>
            </>
          ) : (
            <ThemedText style={styles.meta}>Select a settlement to refund.</ThemedText>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(17,46,88,0.35)', flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    gap: Spacing.two,
    padding: Spacing.four,
  },
  title: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 18 },
  meta: { color: BrandColors.grey, fontFamily: 'PlusJakartaSans_400Regular', fontSize: 12 },
  exceptionBox: {
    backgroundColor: '#FBEFE0',
    borderRadius: BorderRadius.md,
    padding: Spacing.two,
  },
  exceptionText: { color: '#9A5B00', fontFamily: 'PlusJakartaSans_500Medium', fontSize: 11, lineHeight: 15 },
  label: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_500Medium', fontSize: 12, marginTop: Spacing.one },
  input: {
    borderColor: BrandColors.lightGray,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 18,
    padding: Spacing.two,
  },
  error: { color: '#C0392B', fontFamily: 'PlusJakartaSans_500Medium', fontSize: 12 },
  actions: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.two },
  button: { alignItems: 'center', borderRadius: BorderRadius.md, flex: 1, justifyContent: 'center', minHeight: 44 },
  cancel: { backgroundColor: BrandColors.lightGray },
  cancelLabel: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14 },
  confirm: { backgroundColor: BrandColors.green },
  confirmLabel: { color: '#FFFFFF', fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14 },
});

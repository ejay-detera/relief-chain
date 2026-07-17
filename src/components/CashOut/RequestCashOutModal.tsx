import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { SimulatedCashOutNotice } from '@/components/CashOut/SimulatedCashOutNotice';
import { ThemedText } from '@/components/themed-text';
import { PILOT_ASSET_CODE } from '@/constants/pilot-disclosure';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import type { StroopAmount } from '@/types/blockchain';
import { formatStroops, stroopsFromDecimalInput } from '@/utils/format-stroops';

export type CashOutSubmitOutcome = { ok: true } | { ok: false; message: string };

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Available settled/cash balance used to bound the request. */
  availableStroops: StroopAmount;
  /** Parent relays the request to the Edge Function and returns the real outcome. */
  onSubmit: (amountStroops: StroopAmount) => Promise<CashOutSubmitOutcome>;
};

/**
 * Self-contained simulated cash-out request modal. It owns its amount form state
 * and only calls back with a validated stroop amount; the parent relays it to the
 * Edge Function. The confirmation shown reflects the server outcome — a failure
 * is never presented as success (Requirements 6.7, 12.5, 12.7, 21.4).
 */
export const RequestCashOutModal = ({ visible, onClose, availableStroops, onSubmit }: Props) => {
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
    setError(null);
    let stroops: StroopAmount;
    try {
      stroops = stroopsFromDecimalInput(amount);
    } catch (err) {
      setError(err instanceof RangeError ? err.message : 'Enter a valid amount.');
      return;
    }
    if (BigInt(stroops) > BigInt(availableStroops)) {
      setError('Amount exceeds your available balance.');
      return;
    }

    setSubmitting(true);
    const outcome = await onSubmit(stroops);
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
          <ThemedText style={styles.title}>Request cash-out</ThemedText>
          <SimulatedCashOutNotice />

          <ThemedText style={styles.label}>Amount ({PILOT_ASSET_CODE})</ThemedText>
          <TextInput
            editable={!submitting}
            keyboardType="decimal-pad"
            onChangeText={setAmount}
            placeholder="0.00"
            placeholderTextColor={BrandColors.grey}
            style={styles.input}
            value={amount}
          />
          <ThemedText style={styles.available}>
            Available: {formatStroops(availableStroops)} {PILOT_ASSET_CODE}
          </ThemedText>

          {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}

          <View style={styles.actions}>
            <Pressable accessibilityRole="button" disabled={submitting} onPress={close} style={[styles.button, styles.cancel]}>
              <ThemedText style={styles.cancelLabel}>Cancel</ThemedText>
            </Pressable>
            <Pressable accessibilityRole="button" disabled={submitting} onPress={submit} style={[styles.button, styles.confirm]}>
              {submitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <ThemedText style={styles.confirmLabel}>Request</ThemedText>
              )}
            </Pressable>
          </View>
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
  available: { color: BrandColors.grey, fontFamily: 'PlusJakartaSans_400Regular', fontSize: 11 },
  error: { color: '#C0392B', fontFamily: 'PlusJakartaSans_500Medium', fontSize: 12 },
  actions: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.two },
  button: { alignItems: 'center', borderRadius: BorderRadius.md, flex: 1, justifyContent: 'center', minHeight: 44 },
  cancel: { backgroundColor: BrandColors.lightGray },
  cancelLabel: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14 },
  confirm: { backgroundColor: BrandColors.green },
  confirmLabel: { color: '#FFFFFF', fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14 },
});

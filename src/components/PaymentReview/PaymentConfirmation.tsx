import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PILOT_ASSET_CODE } from '@/constants/pilot-disclosure';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import type { FundingSource, InvoiceV1 } from '@/types/invoice';
import { formatStroops } from '@/utils/format-stroops';

type Props = {
  invoice: InvoiceV1;
  /** The single selected source, or `null` until one eligible source is chosen. */
  selected: FundingSource | null;
  /** Whether a verified signer is available to authorize the payment. */
  canAuthorize: boolean;
  onConfirm: (source: FundingSource) => void;
  onCancel: () => void;
};

/**
 * Confirms the one selected funding source and the resulting balance before the
 * beneficiary proceeds to authorization (Requirements 10.7, 11.3). It never
 * implies the payment is complete: value moves only after the beneficiary
 * authorizes and reconciliation confirms the transaction on-chain
 * (Requirements 11.7, 11.8).
 */
export const PaymentConfirmation = ({ invoice, selected, canAuthorize, onConfirm, onCancel }: Props) => {
  const ready = selected?.eligible === true && canAuthorize;

  return (
    <View style={styles.container}>
      {selected?.eligible ? (
        <View style={styles.summary}>
          <View style={styles.summaryRow}>
            <ThemedText style={styles.summaryLabel}>Paying with</ThemedText>
            <ThemedText style={styles.summaryValue}>{selected.label}</ThemedText>
          </View>
          <View style={styles.summaryRow}>
            <ThemedText style={styles.summaryLabel}>Amount</ThemedText>
            <ThemedText style={styles.summaryValue}>
              {formatStroops(invoice.amountStroops)} {PILOT_ASSET_CODE}
            </ThemedText>
          </View>
          <View style={styles.summaryRow}>
            <ThemedText style={styles.summaryLabel}>Balance after payment</ThemedText>
            <ThemedText style={styles.summaryStrong}>
              {formatStroops(selected.resultingBalanceStroops)} {PILOT_ASSET_CODE}
            </ThemedText>
          </View>
        </View>
      ) : (
        <ThemedText style={styles.hint}>Select an eligible funding source to continue.</ThemedText>
      )}

      {selected?.eligible && !canAuthorize ? (
        <ThemedText style={styles.warning}>
          A verified wallet signer is required before you can authorize this payment.
        </ThemedText>
      ) : null}

      <ThemedText style={styles.note}>
        Funds move only after you authorize this payment and it is confirmed on-chain.
      </ThemedText>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !ready }}
        disabled={!ready}
        onPress={() => { if (selected?.eligible) onConfirm(selected); }}
        style={({ pressed }) => [styles.confirm, (!ready || pressed) && styles.confirmDisabled]}
      >
        <ThemedText style={styles.confirmText}>Continue to authorization</ThemedText>
      </Pressable>

      <Pressable accessibilityRole="button" onPress={onCancel} style={styles.cancel}>
        <ThemedText style={styles.cancelText}>Cancel</ThemedText>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { gap: Spacing.two },
  summary: { backgroundColor: BrandColors.lightGray, borderRadius: BorderRadius.lg, gap: Spacing.one, padding: Spacing.three },
  summaryRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two },
  summaryLabel: { color: BrandColors.grey, fontFamily: 'PlusJakartaSans_500Medium', fontSize: 13 },
  summaryValue: { color: BrandColors.navy, flexShrink: 1, fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13, textAlign: 'right' },
  summaryStrong: { color: BrandColors.green, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14 },
  hint: { color: BrandColors.grey, fontFamily: 'PlusJakartaSans_500Medium', fontSize: 13 },
  warning: { color: '#C0392B', fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 12, lineHeight: 16 },
  note: { color: BrandColors.grey, fontFamily: 'PlusJakartaSans_500Medium', fontSize: 11, lineHeight: 16 },
  confirm: { alignItems: 'center', backgroundColor: BrandColors.green, borderRadius: BorderRadius.xl, marginTop: Spacing.one, padding: Spacing.three },
  confirmDisabled: { opacity: 0.5 },
  confirmText: { color: '#FFFFFF', fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15 },
  cancel: { alignItems: 'center', padding: Spacing.two },
  cancelText: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 14 },
});

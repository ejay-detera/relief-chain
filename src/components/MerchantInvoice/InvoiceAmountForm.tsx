import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PILOT_ASSET_CODE, PILOT_NETWORK_LABEL, PILOT_NO_VALUE_LABEL } from '@/constants/pilot-disclosure';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import type { MerchantInvoiceDraft } from '@/types/invoice';
import { stroopsFromDecimalInput } from '@/utils/format-stroops';

type Props = {
  isSubmitting: boolean;
  onSubmit: (draft: MerchantInvoiceDraft) => void;
};

export const InvoiceAmountForm = ({ isSubmitting, onSubmit }: Props) => {
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    let amountStroops;
    try {
      amountStroops = stroopsFromDecimalInput(amount);
    } catch (caught: unknown) {
      setError(caught instanceof RangeError ? caught.message : 'Enter a valid amount.');
      return;
    }

    onSubmit({
      kind: 'cash',
      amountStroops,
      categoryAttested: false,
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.inputSection}>
        <ThemedText style={styles.label}>Amount to Receive ({PILOT_ASSET_CODE})</ThemedText>
        <View style={styles.amountInputRow}>
          <ThemedText style={styles.currencyPrefix}>₱</ThemedText>
          <TextInput
            accessibilityLabel="Invoice amount"
            autoFocus
            keyboardType="decimal-pad"
            onChangeText={(text) => {
              setAmount(text);
              setError(null);
            }}
            placeholder="0.00"
            placeholderTextColor={BrandColors.grey}
            style={styles.amountInput}
            value={amount}
          />
        </View>
        <ThemedText style={styles.disclosure}>{PILOT_NETWORK_LABEL} · {PILOT_NO_VALUE_LABEL}</ThemedText>
      </View>

      {error && <ThemedText style={styles.error}>{error}</ThemedText>}

      <Pressable
        accessibilityRole="button"
        disabled={isSubmitting}
        onPress={submit}
        style={[styles.submit, isSubmitting && styles.submitDisabled]}
      >
        <ThemedText style={styles.submitText}>
          {isSubmitting ? 'Generating QR…' : 'Generate QR Code'}
        </ThemedText>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: Spacing.four,
  },
  inputSection: {
    gap: Spacing.two,
  },
  label: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
  },
  amountInputRow: {
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderColor: BrandColors.lightGray,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    flexDirection: 'row',
    paddingHorizontal: Spacing.three,
  },
  currencyPrefix: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 26,
    marginRight: Spacing.one,
  },
  amountInput: {
    color: BrandColors.navy,
    flex: 1,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 26,
    paddingVertical: Spacing.three,
  },
  disclosure: {
    color: BrandColors.grey,
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 11,
  },
  error: {
    color: '#C0392B',
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13,
  },
  submit: {
    alignItems: 'center',
    backgroundColor: BrandColors.navy,
    borderRadius: 24,
    paddingVertical: Spacing.three,
  },
  submitDisabled: {
    opacity: 0.6,
  },
  submitText: {
    color: '#FFFFFF',
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 16,
  },
});

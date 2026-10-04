import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';

interface TransferAmountInputProps {
  amount: string;
  onChangeAmount: (text: string) => void;
  availableRcphp: number;
  availableRcphpFormatted: string;
}

export function TransferAmountInput({
  amount,
  onChangeAmount,
  availableRcphp,
  availableRcphpFormatted,
}: TransferAmountInputProps) {
  const amountNum = parseFloat(amount || '0');
  const isOverBalance = amountNum > availableRcphp;
  const remainingRcphp = Math.max(0, availableRcphp - (isNaN(amountNum) ? 0 : amountNum));

  const handlePercentage = (percent: number) => {
    const calculated = (availableRcphp * percent).toFixed(2);
    onChangeAmount(calculated);
  };

  return (
    <View style={styles.container}>
      <ThemedText style={styles.label}>Transfer Amount</ThemedText>

      <View style={[styles.inputWrapper, isOverBalance ? styles.inputError : null]}>
        <ThemedText style={styles.currencyPrefix}>₱</ThemedText>
        <TextInput
          keyboardType="decimal-pad"
          onChangeText={onChangeAmount}
          placeholder="0.00"
          placeholderTextColor={BrandColors.grey}
          style={styles.input}
          value={amount}
        />
        <View style={styles.currencyBadge}>
          <ThemedText style={styles.currencyText}>RCPHP</ThemedText>
        </View>
      </View>

      {/* Quick percentage buttons */}
      <View style={styles.presetRow}>
        <Pressable onPress={() => handlePercentage(0.25)} style={styles.presetBtn}>
          <ThemedText style={styles.presetText}>25%</ThemedText>
        </Pressable>
        <Pressable onPress={() => handlePercentage(0.5)} style={styles.presetBtn}>
          <ThemedText style={styles.presetText}>50%</ThemedText>
        </Pressable>
        <Pressable onPress={() => handlePercentage(0.75)} style={styles.presetBtn}>
          <ThemedText style={styles.presetText}>75%</ThemedText>
        </Pressable>
        <Pressable onPress={() => handlePercentage(1.0)} style={[styles.presetBtn, styles.presetMaxBtn]}>
          <ThemedText style={[styles.presetText, styles.presetMaxText]}>Max</ThemedText>
        </Pressable>
      </View>

      {/* Helper balance info */}
      <View style={styles.helperRow}>
        <ThemedText style={styles.helperLabel}>Post-transfer Remaining:</ThemedText>
        <ThemedText style={[styles.helperValue, isOverBalance ? styles.helperError : null]}>
          {isOverBalance
            ? 'Insufficient treasury balance'
            : `${remainingRcphp.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} RCPHP`}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.four,
    marginBottom: Spacing.four,
  },
  label: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 14,
    color: BrandColors.navy,
    marginBottom: Spacing.two,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BrandColors.lightGray,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    paddingHorizontal: Spacing.three,
    minHeight: 52,
  },
  inputError: {
    borderColor: '#D32F2F',
    backgroundColor: '#FFEBEE',
  },
  currencyPrefix: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 18,
    color: BrandColors.navy,
    marginRight: Spacing.two,
  },
  input: {
    flex: 1,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 18,
    color: BrandColors.navy,
    paddingVertical: Spacing.two,
  },
  currencyBadge: {
    backgroundColor: '#D1E7DD',
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  currencyText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 11,
    color: '#0F5132',
  },
  presetRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  presetBtn: {
    flex: 1,
    backgroundColor: '#F0F2F5',
    paddingVertical: 6,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetMaxBtn: {
    backgroundColor: '#E8F5E9',
  },
  presetText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
    color: BrandColors.navy,
  },
  presetMaxText: {
    color: BrandColors.green,
  },
  helperRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.two,
  },
  helperLabel: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 12,
    color: BrandColors.grey,
  },
  helperValue: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
    color: BrandColors.navy,
  },
  helperError: {
    color: '#D32F2F',
  },
});

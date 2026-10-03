import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PILOT_ASSET_CODE, PILOT_NETWORK_LABEL } from '@/constants/pilot-disclosure';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import type { BeneficiaryVoucherBalanceItem } from '@/services/merchant-redemption-service';

type Props = {
  selectedVoucher: BeneficiaryVoucherBalanceItem | null;
  amount: string;
  onAmountChange: (text: string) => void;
  isValid: boolean;
  validationError: string | null;
  remainingPhp: string | null;
  isSubmitting: boolean;
  onSubmit: () => void;
};

const QUICK_AMOUNTS = ['100', '200', '500'];

export function RedemptionAmountForm({
  selectedVoucher,
  amount,
  onAmountChange,
  isValid,
  validationError,
  remainingPhp,
  isSubmitting,
  onSubmit,
}: Props) {
  if (!selectedVoucher) return null;

  const handleMax = () => {
    onAmountChange(selectedVoucher.availablePhp.replace(/,/g, ''));
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <ThemedText style={styles.title}>Redemption Amount</ThemedText>
        <ThemedText style={styles.programContext}>
          {selectedVoucher.category || selectedVoucher.voucherType}
        </ThemedText>
      </View>

      {/* Input Row */}
      <View style={styles.inputContainer}>
        <View style={[styles.amountInputRow, validationError ? styles.amountInputRowError : null]}>
          <ThemedText style={styles.currencyPrefix}>₱</ThemedText>
          <TextInput
            accessibilityLabel="Redemption amount"
            editable={!isSubmitting}
            keyboardType="decimal-pad"
            onChangeText={onAmountChange}
            placeholder="0.00"
            placeholderTextColor={BrandColors.grey}
            style={styles.amountInput}
            value={amount}
          />
        </View>

        {/* Quick Amount Buttons */}
        <View style={styles.quickAmountRow}>
          {QUICK_AMOUNTS.map((q) => (
            <Pressable
              disabled={isSubmitting}
              key={q}
              onPress={() => onAmountChange(q)}
              style={styles.quickButton}
            >
              <ThemedText style={styles.quickButtonText}>₱{q}</ThemedText>
            </Pressable>
          ))}
          <Pressable disabled={isSubmitting} onPress={handleMax} style={styles.maxButton}>
            <ThemedText style={styles.maxButtonText}>Use Max</ThemedText>
          </Pressable>
        </View>
      </View>

      {/* Real-time Remaining Balance or Error */}
      {validationError ? (
        <View style={styles.errorBanner}>
          <MaterialCommunityIcons name="alert-circle" size={16} color="#DC2626" />
          <ThemedText style={styles.errorText}>{validationError}</ThemedText>
        </View>
      ) : remainingPhp !== null ? (
        <View style={styles.remainingBanner}>
          <MaterialCommunityIcons name="information-outline" size={16} color={BrandColors.green} />
          <ThemedText style={styles.remainingText}>
            Remaining balance after redemption: ₱{remainingPhp} {PILOT_ASSET_CODE}
          </ThemedText>
        </View>
      ) : (
        <ThemedText style={styles.disclosure}>
          {PILOT_NETWORK_LABEL} · Vouchers cannot be cashed out
        </ThemedText>
      )}

      {/* Submit Button */}
      <Pressable
        accessibilityRole="button"
        disabled={!isValid || isSubmitting}
        onPress={onSubmit}
        style={[styles.submitButton, (!isValid || isSubmitting) && styles.submitButtonDisabled]}
      >
        <MaterialCommunityIcons
          color="#FFFFFF"
          name={isSubmitting ? 'loading' : 'check-circle-outline'}
          size={18}
        />
        <ThemedText style={styles.submitButtonText}>
          {isSubmitting ? 'Processing Redemption…' : 'Confirm & Redeem Voucher'}
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.xl,
    padding: Spacing.four,
    gap: Spacing.three,
    boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
  },
  programContext: {
    color: BrandColors.green,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
  },
  inputContainer: {
    gap: Spacing.two,
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderColor: BrandColors.lightGray,
    borderWidth: 1.5,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.three,
    height: 56,
  },
  amountInputRowError: {
    borderColor: '#DC2626',
    backgroundColor: '#FEF2F2',
  },
  currencyPrefix: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 24,
    marginRight: Spacing.one,
  },
  amountInput: {
    flex: 1,
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 24,
    height: '100%',
  },
  quickAmountRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  quickButton: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: BorderRadius.md,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
  },
  quickButtonText: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
  },
  maxButton: {
    flex: 1.2,
    paddingVertical: 6,
    borderRadius: BorderRadius.md,
    backgroundColor: '#EEF2F6',
    borderWidth: 1,
    borderColor: BrandColors.navy,
    alignItems: 'center',
  },
  maxButtonText: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 12,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    backgroundColor: '#FEF2F2',
    padding: Spacing.two,
    borderRadius: BorderRadius.md,
  },
  errorText: {
    color: '#DC2626',
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 11,
    flex: 1,
  },
  remainingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    backgroundColor: '#ECFDF5',
    padding: Spacing.two,
    borderRadius: BorderRadius.md,
  },
  remainingText: {
    color: BrandColors.green,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 11,
    flex: 1,
  },
  disclosure: {
    color: BrandColors.grey,
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 11,
    textAlign: 'center',
  },
  submitButton: {
    backgroundColor: BrandColors.navy,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
    borderRadius: BorderRadius.lg,
  },
  submitButtonDisabled: {
    backgroundColor: BrandColors.grey,
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
  },
});

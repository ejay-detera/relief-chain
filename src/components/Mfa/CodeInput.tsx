import { StyleSheet, TextInput } from 'react-native';

import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';

type Props = {
  value: string;
  onChange: (next: string) => void;
  /** Number of digits expected; defaults to 6 for TOTP. */
  length?: number;
  autoFocus?: boolean;
};

/**
 * A single controlled numeric input for a one-time code. Keeps only digits and
 * clamps to `length`, so the parent modal owns the value and submission.
 */
export const CodeInput = ({ value, onChange, length = 6, autoFocus = true }: Props) => (
  <TextInput
    accessibilityLabel="Authentication code"
    autoFocus={autoFocus}
    keyboardType="number-pad"
    maxLength={length}
    onChangeText={(text) => onChange(text.replace(/[^0-9]/g, '').slice(0, length))}
    placeholder="123456"
    placeholderTextColor={BrandColors.grey}
    style={styles.input}
    textContentType="oneTimeCode"
    value={value}
  />
);

const styles = StyleSheet.create({
  input: {
    backgroundColor: BrandColors.lightGray,
    borderRadius: BorderRadius.md,
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 22,
    letterSpacing: 8,
    marginTop: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    textAlign: 'center',
  },
});

import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';

type Props = {
  readonly onCheck: () => void;
  readonly isChecking: boolean;
  readonly disabled?: boolean;
  readonly lastCheckText?: string | null;
  readonly errorText?: string | null;
};

/**
 * Presentational trigger for the merchant's authorized settlement check.
 * Owns no business logic: the parent shell resolves identity, runs the check
 * through the settlement hook, and refreshes reconciled state. While checking,
 * an indicator replaces the label; the last reconciler-owned result renders
 * below without ever claiming settlement itself.
 */
export const SettlementCheckButton = ({ onCheck, isChecking, disabled, lastCheckText, errorText }: Props) => {
  const isDisabled = disabled === true || isChecking;
  return (
    <View style={styles.block}>
      <Pressable
        accessibilityLabel="Check settlement status"
        accessibilityRole="button"
        disabled={isDisabled}
        onPress={onCheck}
        style={[styles.button, isDisabled && styles.buttonDisabled]}
      >
        {isChecking ? (
          <ActivityIndicator color="#FFFFFF" size="small" />
        ) : (
          <ThemedText style={styles.buttonText}>Check settlement status</ThemedText>
        )}
      </Pressable>
      {lastCheckText ? <ThemedText style={styles.helper}>{lastCheckText}</ThemedText> : null}
      {errorText ? <ThemedText style={styles.error}>{errorText}</ThemedText> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  block: { gap: Spacing.two },
  button: {
    alignItems: 'center',
    backgroundColor: BrandColors.navy,
    borderRadius: BorderRadius.xl,
    padding: Spacing.three,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#FFFFFF', fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15 },
  helper: { color: BrandColors.grey, fontFamily: 'PlusJakartaSans_500Medium', fontSize: 12, lineHeight: 17 },
  error: { color: '#C0392B', fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 12 },
});

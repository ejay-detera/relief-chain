import { FontAwesome } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import { requestPaymentApproval, type ApprovalMethod } from '@/utils/biometric-auth';

const METHOD_LABEL: Record<ApprovalMethod, string> = {
  biometric: 'Biometrics are ready to approve payments.',
  device_credential: 'Your device passcode is ready as a secure fallback.',
  explicit_confirmation: 'On-screen confirmation is available.',
};

/**
 * Explains how beneficiary payment approval works — device biometrics with an
 * accessible secure fallback (Requirements 20.3, 20.4) — and lets the user run a
 * no-op check so they know approval is set up before they need to pay. This test
 * signs nothing and moves no value; the wallet signature over the exact prepared
 * transaction remains the real control.
 */
export const BiometricFallbackNote = () => {
  const [result, setResult] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const runCheck = async () => {
    setChecking(true);
    setResult(null);
    const outcome = await requestPaymentApproval('Verify device authentication');
    if (outcome.ok) {
      setResult(METHOD_LABEL[outcome.method]);
    } else if (outcome.reason === 'unenrolled') {
      setResult(
        'No biometrics or device passcode found. Payments will ask for an explicit on-screen confirmation instead.',
      );
    } else {
      setResult(outcome.message);
    }
    setChecking(false);
  };

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <FontAwesome color={BrandColors.navy} name="hand-pointer-o" size={16} />
        <ThemedText style={styles.title}>Approving payments</ThemedText>
      </View>
      <ThemedText style={styles.body}>
        When you pay, your device asks for your fingerprint or face. If biometrics aren’t set up,
        it falls back to your device passcode. Either way, you review and approve every payment
        before your wallet authorizes it.
      </ThemedText>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: checking }}
        disabled={checking}
        onPress={runCheck}
        style={({ pressed }) => [styles.action, (checking || pressed) && styles.actionDisabled]}
      >
        <ThemedText style={styles.actionLabel}>
          {checking ? 'Checking…' : 'Test device authentication'}
        </ThemedText>
      </Pressable>

      {result ? <ThemedText style={styles.result}>{result}</ThemedText> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  card: { backgroundColor: '#FFFFFF', borderRadius: BorderRadius.lg, gap: Spacing.two, padding: Spacing.four, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' },
  headerRow: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two },
  title: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 16 },
  body: { color: BrandColors.grey, fontFamily: 'PlusJakartaSans_400Regular', fontSize: 13, lineHeight: 19 },
  action: {
    alignItems: 'center',
    backgroundColor: BrandColors.lightGray,
    borderRadius: BorderRadius.full,
    marginTop: Spacing.one,
    paddingVertical: Spacing.two,
  },
  actionDisabled: { opacity: 0.6 },
  actionLabel: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13 },
  result: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_500Medium', fontSize: 12, lineHeight: 17 },
});

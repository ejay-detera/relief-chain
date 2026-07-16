import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import { CodeInput } from './CodeInput';

type Props = {
  visible: boolean;
  /** The financial action awaiting step-up, e.g. "authorize this disbursement". */
  actionDescription: string;
  isVerifying: boolean;
  /** True when the user has no verified factor and must enroll first. */
  requiresEnrollment: boolean;
  errorMessage: string | null;
  onSubmitCode: (code: string) => void;
  onEnrollInstead: () => void;
  onCancel: () => void;
};

/**
 * Prompts for a fresh step-up before a sensitive financial action (Requirement
 * 20.2). Verifying refreshes the recent-step-up window; cancelling leaves the
 * action un-attempted so no value moves. When no factor is enrolled it routes the
 * user to enrollment instead of failing silently.
 */
export const StepUpModal = ({
  visible,
  actionDescription,
  isVerifying,
  requiresEnrollment,
  errorMessage,
  onSubmitCode,
  onEnrollInstead,
  onCancel,
}: Props) => {
  const [code, setCode] = useState('');

  useEffect(() => {
    if (!visible) setCode('');
  }, [visible]);

  return (
    <Modal animationType="fade" onRequestClose={onCancel} transparent visible={visible}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <ThemedText style={styles.title}>Confirm it’s you</ThemedText>
          <ThemedText style={styles.subtitle}>
            For your security, re-verify with your authenticator app to {actionDescription}.
          </ThemedText>

          {requiresEnrollment ? (
            <>
              <ThemedText style={styles.notice}>
                You don’t have an authenticator set up yet. Add one to authorize financial actions.
              </ThemedText>
              <Pressable accessibilityRole="button" onPress={onEnrollInstead} style={styles.primary}>
                <ThemedText style={styles.primaryLabel}>Set up authenticator</ThemedText>
              </Pressable>
            </>
          ) : (
            <>
              <CodeInput onChange={setCode} value={code} />
              {errorMessage ? <ThemedText style={styles.error}>{errorMessage}</ThemedText> : null}
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: isVerifying }}
                disabled={isVerifying}
                onPress={() => onSubmitCode(code)}
                style={({ pressed }) => [styles.primary, (isVerifying || pressed) && styles.primaryDisabled]}
              >
                {isVerifying ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <ThemedText style={styles.primaryLabel}>Verify</ThemedText>
                )}
              </Pressable>
            </>
          )}

          <Pressable accessibilityRole="button" onPress={onCancel} style={styles.cancel}>
            <ThemedText style={styles.cancelLabel}>Cancel</ThemedText>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { alignItems: 'center', backgroundColor: 'rgba(17,46,88,0.45)', flex: 1, justifyContent: 'center', padding: Spacing.four },
  card: { backgroundColor: '#FFFFFF', borderRadius: BorderRadius.xl, gap: Spacing.two, padding: Spacing.four, width: '100%' },
  title: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 20 },
  subtitle: { color: BrandColors.grey, fontFamily: 'PlusJakartaSans_400Regular', fontSize: 13, lineHeight: 18 },
  notice: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_500Medium', fontSize: 13, lineHeight: 18, marginTop: Spacing.two },
  error: { color: '#C0392B', fontFamily: 'PlusJakartaSans_500Medium', fontSize: 12 },
  primary: {
    alignItems: 'center',
    backgroundColor: BrandColors.navy,
    borderRadius: BorderRadius.full,
    marginTop: Spacing.two,
    paddingVertical: Spacing.three,
  },
  primaryDisabled: { opacity: 0.6 },
  primaryLabel: { color: '#FFFFFF', fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15 },
  cancel: { alignItems: 'center', paddingVertical: Spacing.two },
  cancelLabel: { color: BrandColors.grey, fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 14 },
});

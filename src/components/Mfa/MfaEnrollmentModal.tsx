import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import type { MfaEnrollmentTicket } from '@/types/mfa';
import { CodeInput } from './CodeInput';

type Props = {
  visible: boolean;
  /** The enrollment material once `enroll` succeeds; null while it is loading. */
  ticket: MfaEnrollmentTicket | null;
  isVerifying: boolean;
  /** Server/user-safe error from the last verify attempt, if any. */
  errorMessage: string | null;
  onSubmitCode: (code: string) => void;
  onClose: () => void;
};

/**
 * Self-contained TOTP enrollment modal. It renders the authenticator QR (from the
 * standard otpauth URI), offers the secret for manual entry, and verifies a code
 * to finish enrollment (Requirement 20.1). It owns only its input state; the
 * parent orchestrates the Supabase enroll/verify calls.
 */
export const MfaEnrollmentModal = ({
  visible,
  ticket,
  isVerifying,
  errorMessage,
  onSubmitCode,
  onClose,
}: Props) => {
  const [code, setCode] = useState('');

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      onShow={() => setCode('')}
      transparent
      visible={visible}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <ThemedText style={styles.title}>Set up authenticator app</ThemedText>
          <ThemedText style={styles.subtitle}>
            Scan this QR code with an authenticator app, then enter the 6-digit code to finish.
          </ThemedText>

          {ticket ? (
            <>
              <View style={styles.qrWrap}>
                <QRCode backgroundColor="#FFFFFF" color={BrandColors.navy} size={188} value={ticket.uri} />
              </View>
              <ThemedText style={styles.secretLabel}>Can’t scan? Enter this key manually</ThemedText>
              <ThemedText selectable style={styles.secret}>{ticket.secret}</ThemedText>

              <CodeInput onChange={setCode} value={code} />
              {errorMessage ? <ThemedText style={styles.error}>{errorMessage}</ThemedText> : null}

              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: isVerifying }}
                disabled={isVerifying}
                onPress={() => onSubmitCode(code)}
                style={({ pressed }) => [styles.verify, (isVerifying || pressed) && styles.verifyDisabled]}
              >
                {isVerifying ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <ThemedText style={styles.verifyLabel}>Verify and enable</ThemedText>
                )}
              </Pressable>
            </>
          ) : (
            <View style={styles.loading}>
              <ActivityIndicator color={BrandColors.navy} size="large" />
              <ThemedText style={styles.loadingText}>Preparing authenticator setup…</ThemedText>
            </View>
          )}

          <Pressable accessibilityRole="button" onPress={onClose} style={styles.cancel}>
            <ThemedText style={styles.cancelLabel}>Cancel</ThemedText>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(17,46,88,0.45)', flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    gap: Spacing.two,
    padding: Spacing.four,
  },
  title: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 20 },
  subtitle: { color: BrandColors.grey, fontFamily: 'PlusJakartaSans_400Regular', fontSize: 13, lineHeight: 18 },
  qrWrap: { alignItems: 'center', alignSelf: 'center', backgroundColor: '#FFFFFF', borderRadius: BorderRadius.lg, marginTop: Spacing.two, padding: Spacing.three },
  secretLabel: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 12, marginTop: Spacing.two },
  secret: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_500Medium', fontSize: 15, letterSpacing: 1 },
  error: { color: '#C0392B', fontFamily: 'PlusJakartaSans_500Medium', fontSize: 12 },
  loading: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.five },
  loadingText: { color: BrandColors.grey, fontFamily: 'PlusJakartaSans_400Regular', fontSize: 13 },
  verify: {
    alignItems: 'center',
    backgroundColor: BrandColors.green,
    borderRadius: BorderRadius.full,
    marginTop: Spacing.two,
    paddingVertical: Spacing.three,
  },
  verifyDisabled: { opacity: 0.6 },
  verifyLabel: { color: '#FFFFFF', fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15 },
  cancel: { alignItems: 'center', paddingVertical: Spacing.three },
  cancelLabel: { color: BrandColors.grey, fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 14 },
});

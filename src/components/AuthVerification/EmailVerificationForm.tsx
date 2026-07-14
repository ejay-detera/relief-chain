import { FontAwesome } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';

import { authVerificationStyles as styles } from './styles';

type EmailVerificationFormProps = {
  code: string[];
  countdown: string | null;
  email: string;
  isResending: boolean;
  isVerifying: boolean;
  onChangeCode: (index: number, value: string) => void;
  onClose: () => void;
  onResend: () => void;
  onVerify: () => void;
};

export function EmailVerificationForm({
  code,
  countdown,
  email,
  isResending,
  isVerifying,
  onChangeCode,
  onClose,
  onResend,
  onVerify,
}: EmailVerificationFormProps) {
  const isResendUnavailable = Boolean(countdown) || isResending;

  return (
    <View style={styles.verificationContent}>
      <Pressable accessibilityLabel="Close" onPress={onClose} style={styles.closeButton}>
        <FontAwesome color="#111111" name="close" size={36} />
      </Pressable>
      <ThemedText style={styles.title}>Verify Email</ThemedText>
      <ThemedText style={styles.message}>Check your email. We sent a 6-digit verification code to:</ThemedText>
      <ThemedText style={styles.email}>{email}</ThemedText>
      <View style={styles.emailIcon}>
        <FontAwesome color="#FFFFFF" name="envelope" size={58} />
      </View>
      <ThemedText style={styles.verificationHint}>Enter the code below to continue.</ThemedText>
      <View style={styles.codeRow}>
        {code.map((digit, index) => (
          <TextInput
            key={index}
            accessibilityLabel={`Verification code digit ${index + 1}`}
            autoFocus={index === 0}
            keyboardType="number-pad"
            maxLength={1}
            onChangeText={(value) => onChangeCode(index, value.replace(/\D/g, '').slice(-1))}
            style={styles.codeInput}
            value={digit}
          />
        ))}
      </View>
      <Pressable
        disabled={isVerifying}
        onPress={onVerify}
        style={[styles.primaryButton, isVerifying && styles.buttonDisabled]}
      >
        {isVerifying ? <ActivityIndicator color="#FFFFFF" /> : <ThemedText style={styles.buttonText}>Verify</ThemedText>}
      </Pressable>
      <Pressable
        disabled={isResendUnavailable}
        onPress={onResend}
        style={[styles.secondaryButton, isResendUnavailable && styles.buttonDisabled]}
      >
        {isResending ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <ThemedText style={styles.buttonText}>
            {countdown ? `Resend code in ${countdown}` : 'Resend Code'}
          </ThemedText>
        )}
      </Pressable>
      <ThemedText style={styles.resendHint}>
        Didn’t receive the email?{`\n`}Check your spam folder or resend the code.
      </ThemedText>
    </View>
  );
}

import { FontAwesome } from '@expo/vector-icons';
import { useRef } from 'react';
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import type { PasswordRecoveryCode, PasswordRecoveryCodeIndex } from '@/types/auth';

import { passwordRecoveryStyles as styles } from './styles';

const OTP_ROW_LENGTH = 4;

type RecoveryCodeStepProps = {
  code: PasswordRecoveryCode;
  email: string;
  expiresIn: string | null;
  isResending: boolean;
  isVerifying: boolean;
  onChangeCode: (index: PasswordRecoveryCodeIndex, value: string) => void;
  onClose: () => void;
  onPasteCode: (index: PasswordRecoveryCodeIndex, value: string) => void;
  onResend: () => void;
  onVerify: () => void;
};

export const RecoveryCodeStep = ({
  code,
  email,
  expiresIn,
  isResending,
  isVerifying,
  onChangeCode,
  onClose,
  onPasteCode,
  onResend,
  onVerify,
}: RecoveryCodeStepProps) => {
  const inputRefs = useRef<(TextInput | null)[]>([]);
  const isCodeComplete = code.every(Boolean);
  const codeRows = [code.slice(0, OTP_ROW_LENGTH), code.slice(OTP_ROW_LENGTH)];

  const handleCodeChange = (index: PasswordRecoveryCodeIndex, value: string) => {
    const digits = value.replace(/\D/g, '');

    if (digits.length > 1) {
      onPasteCode(index, digits);
      inputRefs.current[Math.min(index + digits.length, code.length - 1)]?.focus();
      return;
    }

    const digit = digits.slice(-1);
    onChangeCode(index, digit);

    if (digit && index < code.length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  return (
    <View style={styles.content}>
      <Pressable accessibilityLabel="Close password recovery" onPress={onClose} style={styles.closeButton}>
        <FontAwesome color="#111111" name="close" size={34} />
      </Pressable>

      <ThemedText style={styles.heading}>Password Recovery</ThemedText>
      <ThemedText style={styles.recoveryMessage}>An 8-digit verification code has been sent to:</ThemedText>
      <ThemedText numberOfLines={1} style={styles.email}>{email}</ThemedText>

      <View style={styles.iconCircle}>
        <FontAwesome color="#FFFFFF" name="envelope-o" size={60} />
      </View>

      {expiresIn ? <ThemedText style={styles.codeExpiry}>Code expires in {expiresIn}</ThemedText> : null}

      <View style={[styles.codeRows, expiresIn && styles.codeRowsWithExpiry]}>
        {codeRows.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.codeRow}>
            {row.map((digit, digitIndex) => {
              const index = rowIndex * OTP_ROW_LENGTH + digitIndex;

              return (
                <TextInput
                  key={index}
                  ref={(input) => { inputRefs.current[index] = input; }}
                  accessibilityLabel={`Verification code digit ${index + 1}`}
                  autoComplete="one-time-code"
                  autoFocus={index === 0}
                  editable={!isVerifying}
                  keyboardType="number-pad"
                  onChangeText={(value) => handleCodeChange(index, value)}
                  onKeyPress={({ nativeEvent }) => {
                    if (nativeEvent.key === 'Backspace' && !digit && index > 0) {
                      inputRefs.current[index - 1]?.focus();
                    }
                  }}
                  style={[styles.codeInput, digit && styles.codeInputFilled]}
                  textContentType="oneTimeCode"
                  value={digit}
                />
              );
            })}
          </View>
        ))}
      </View>

      <Pressable
        accessibilityRole="button"
        disabled={!isCodeComplete || isVerifying}
        onPress={onVerify}
        style={[styles.primaryButton, (!isCodeComplete || isVerifying) && styles.buttonDisabled]}
      >
        {isVerifying ? <ActivityIndicator color="#FFFFFF" /> : <ThemedText style={styles.buttonText}>Verify</ThemedText>}
      </Pressable>
      <Pressable
        accessibilityRole="button"
        disabled={isResending || isVerifying}
        onPress={onResend}
        style={[styles.secondaryButton, (isResending || isVerifying) && styles.buttonDisabled]}
      >
        {isResending ? <ActivityIndicator color="#FFFFFF" /> : <ThemedText style={styles.buttonText}>Resend Code</ThemedText>}
      </Pressable>
      <ThemedText style={styles.resendHint}>
        Didn’t receive the email?{`\n`}Check your spam folder or resend the code.
      </ThemedText>
    </View>
  );
};

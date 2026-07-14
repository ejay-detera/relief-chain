import { FontAwesome } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';

import { passwordRecoveryStyles as styles } from './styles';

type ResetPasswordStepProps = {
  confirmPassword: string;
  isPasswordValid: boolean;
  isUpdating: boolean;
  newPassword: string;
  onClose: () => void;
  onConfirmPasswordChange: (value: string) => void;
  onNewPasswordChange: (value: string) => void;
  onSubmit: () => void;
};

export const ResetPasswordStep = ({
  confirmPassword,
  isPasswordValid,
  isUpdating,
  newPassword,
  onClose,
  onConfirmPasswordChange,
  onNewPasswordChange,
  onSubmit,
}: ResetPasswordStepProps) => {
  return (
    <View style={styles.content}>
      <Pressable accessibilityLabel="Close password recovery" disabled={isUpdating} onPress={onClose} style={styles.closeButton}>
        <FontAwesome color="#111111" name="close" size={34} />
      </Pressable>

      <ThemedText style={styles.heading}>Reset your password</ThemedText>
      <ThemedText style={styles.resetMessage}>Please enter your new password</ThemedText>

      <View style={styles.iconCircle}>
        <FontAwesome color="#FFFFFF" name="lock" size={47} />
      </View>

      <View style={styles.passwordForm}>
        <ThemedText style={styles.inputLabel}>New Password</ThemedText>
        <TextInput
          autoComplete="new-password"
          editable={!isUpdating}
          onChangeText={onNewPasswordChange}
          secureTextEntry
          style={styles.passwordInput}
          value={newPassword}
        />

        <ThemedText style={styles.inputLabel}>Confirm password</ThemedText>
        <TextInput
          autoComplete="new-password"
          editable={!isUpdating}
          onChangeText={onConfirmPasswordChange}
          secureTextEntry
          style={styles.passwordInput}
          value={confirmPassword}
        />

        <Pressable
          accessibilityRole="button"
          disabled={!isPasswordValid || isUpdating}
          onPress={onSubmit}
          style={[styles.primaryButton, (!isPasswordValid || isUpdating) && styles.buttonDisabled]}
        >
          {isUpdating ? <ActivityIndicator color="#FFFFFF" /> : <ThemedText style={styles.buttonText}>Done</ThemedText>}
        </Pressable>

        <View style={styles.requirements}>
          <View style={styles.requirementRow}>
            <FontAwesome color="#112E58" name="check-circle-o" size={18} />
            <ThemedText style={styles.requirementText}>Minimum of 8 characters</ThemedText>
          </View>
          <View style={styles.requirementRow}>
            <FontAwesome color="#112E58" name="check-circle-o" size={18} />
            <ThemedText style={styles.requirementText}>Must include letters and numbers</ThemedText>
          </View>
        </View>
      </View>
    </View>
  );
};

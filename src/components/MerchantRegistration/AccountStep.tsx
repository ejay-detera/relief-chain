import { FontAwesome } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import type { MerchantRegistrationData } from '@/types/merchant-registration';

import { PasswordCriteria } from './PasswordCriteria';
import { RegistrationField } from './RegistrationField';
import { merchantRegistrationStyles as styles } from './styles';

type AccountStepProps = {
  data: MerchantRegistrationData;
  isSubmitting: boolean;
  onChange: (values: Partial<MerchantRegistrationData>) => void;
  onSubmit: () => void;
};

export function AccountStep({ data, isSubmitting, onChange, onSubmit }: AccountStepProps) {
  const router = useRouter();
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] = useState(false);

  return (
    <View style={styles.form}>
      <RegistrationField
        label="Password"
        onChangeText={(password) => onChange({ password })}
        onToggleSecureTextEntry={() => setIsPasswordVisible((visible) => !visible)}
        placeholder="Create a password"
        required
        secureTextEntry={!isPasswordVisible}
        value={data.password}
      />
      <PasswordCriteria password={data.password} />
      <RegistrationField
        label="Confirm Password"
        onChangeText={(confirmPassword) => onChange({ confirmPassword })}
        onToggleSecureTextEntry={() => setIsConfirmPasswordVisible((visible) => !visible)}
        placeholder="Re-enter your password"
        required
        secureTextEntry={!isConfirmPasswordVisible}
        value={data.confirmPassword}
      />

      <View style={styles.termsRow}>
        <Pressable
          onPress={() => onChange({ agreesToTerms: !data.agreesToTerms })}
          style={[styles.termsCheckbox, data.agreesToTerms && styles.checkboxChecked]}
        >
          {data.agreesToTerms && <FontAwesome color="#FFFFFF" name="check" size={11} />}
        </Pressable>
        <ThemedText style={styles.termsText}>
          I agree to the{' '}
          <ThemedText accessibilityRole="link" onPress={() => router.push('/(auth)/terms-and-conditions')} style={styles.termsLink}>
            Terms &amp; Conditions
          </ThemedText>
        </ThemedText>
      </View>

      <Pressable
        disabled={isSubmitting}
        onPress={onSubmit}
        style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
      >
        {isSubmitting ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <ThemedText style={styles.nextButtonText}>Create Account</ThemedText>
        )}
      </Pressable>
    </View>
  );
}

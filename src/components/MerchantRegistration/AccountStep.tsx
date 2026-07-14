import { FontAwesome } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import type { MerchantRegistrationData } from '@/types/merchant-registration';

import { RegistrationField } from './RegistrationField';
import { merchantRegistrationStyles as styles } from './styles';

type AccountStepProps = {
  data: MerchantRegistrationData;
  isSubmitting: boolean;
  onChange: (values: Partial<MerchantRegistrationData>) => void;
  onSubmit: () => void;
};

export function AccountStep({ data, isSubmitting, onChange, onSubmit }: AccountStepProps) {
  return (
    <View style={styles.form}>
      <RegistrationField
        label="Password"
        onChangeText={(password) => onChange({ password })}
        secureTextEntry
        value={data.password}
      />
      <RegistrationField
        label="Confirm Password"
        onChangeText={(confirmPassword) => onChange({ confirmPassword })}
        secureTextEntry
        value={data.confirmPassword}
      />

      <Pressable
        onPress={() => onChange({ agreesToTerms: !data.agreesToTerms })}
        style={styles.termsRow}
      >
        <View style={[styles.termsCheckbox, data.agreesToTerms && styles.checkboxChecked]}>
          {data.agreesToTerms && <FontAwesome color="#FFFFFF" name="check" size={11} />}
        </View>
        <ThemedText style={styles.termsText}>I agree to the </ThemedText>
        <ThemedText style={styles.termsLink}>Terms &amp; Conditions</ThemedText>
      </Pressable>

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

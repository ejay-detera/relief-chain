import { FontAwesome } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';

import { registrationStyles as styles } from './styles';

type RegistrationTermsRowProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
};

export const RegistrationTermsRow = ({ checked, onChange }: RegistrationTermsRowProps) => {
  const router = useRouter();

  return (
    <View style={styles.terms}>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={() => onChange(!checked)} style={[styles.checkbox, checked && styles.checkboxChecked]}>
        {checked && <FontAwesome color="#FFFFFF" name="check" size={12} />}
      </Pressable>
      <ThemedText style={styles.termsText}>
        I agree to the{' '}
        <ThemedText accessibilityRole="link" onPress={() => router.push('/(auth)/terms-and-conditions')} style={styles.termsLink}>
          Terms &amp; Conditions
        </ThemedText>
      </ThemedText>
    </View>
  );
};

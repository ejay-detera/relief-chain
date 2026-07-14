import { FontAwesome } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';

import { registrationStyles as styles } from './styles';

type RegistrationTermsRowProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
};

export const RegistrationTermsRow = ({ checked, onChange }: RegistrationTermsRowProps) => (
  <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={() => onChange(!checked)} style={styles.terms}>
    <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
      {checked && <FontAwesome color="#FFFFFF" name="check" size={12} />}
    </View>
    <ThemedText style={styles.termsText}>I agree to the <ThemedText style={styles.termsLink}>Terms &amp; Conditions</ThemedText></ThemedText>
  </Pressable>
);

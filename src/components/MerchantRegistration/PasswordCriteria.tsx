import { FontAwesome } from '@expo/vector-icons';
import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { getPasswordCriteria } from '@/utils/password-validation';

import { merchantRegistrationStyles as styles } from './styles';

type PasswordCriteriaProps = {
  password: string;
};

type Criterion = {
  key: keyof ReturnType<typeof getPasswordCriteria>;
  label: string;
};

const criteria: Criterion[] = [
  { key: 'meetsMinimumLength', label: 'At least 8 characters' },
  { key: 'hasUppercase', label: 'One uppercase letter' },
  { key: 'hasLowercase', label: 'One lowercase letter' },
  { key: 'hasNumber', label: 'One number' },
  { key: 'hasSpecialCharacter', label: 'One special character' },
  { key: 'hasNoSpaces', label: 'No spaces' },
];

export function PasswordCriteria({ password }: PasswordCriteriaProps) {
  const passwordCriteria = getPasswordCriteria(password);

  return (
    <View style={styles.passwordCriteria}>
      <ThemedText style={styles.criteriaTitle}>Password must have:</ThemedText>
      {criteria.map(({ key, label }) => {
        const isMet = passwordCriteria[key];

        return (
          <View key={key} style={styles.criteriaRow}>
            <FontAwesome
              color={isMet ? '#2E9B45' : '#979797'}
              name={isMet ? 'check-circle' : 'circle-o'}
              size={13}
            />
            <ThemedText style={[styles.criteriaText, isMet && styles.criteriaTextMet]}>
              {label}
            </ThemedText>
          </View>
        );
      })}
    </View>
  );
}

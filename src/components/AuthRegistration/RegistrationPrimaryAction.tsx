import { ActivityIndicator, Pressable } from 'react-native';

import { ThemedText } from '@/components/themed-text';

import { registrationStyles as styles } from './styles';

type RegistrationPrimaryActionProps = {
  isLoading?: boolean;
  label: string;
  onPress: () => void;
};

export const RegistrationPrimaryAction = ({ isLoading = false, label, onPress }: RegistrationPrimaryActionProps) => (
  <Pressable accessibilityRole="button" disabled={isLoading} onPress={onPress} style={[styles.button, isLoading && styles.buttonDisabled]}>
    {isLoading ? <ActivityIndicator color="#FFFFFF" /> : <ThemedText style={styles.buttonText}>{label}</ThemedText>}
  </Pressable>
);

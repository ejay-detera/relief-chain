import type { KeyboardTypeOptions } from 'react-native';
import { StyleProp, TextInput, ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';

import { merchantRegistrationStyles as styles } from './styles';

type RegistrationFieldProps = {
  keyboardType?: KeyboardTypeOptions;
  label: string;
  onChangeText: (value: string) => void;
  secureTextEntry?: boolean;
  style?: StyleProp<ViewStyle>;
  value: string;
};

export function RegistrationField({
  keyboardType,
  label,
  onChangeText,
  secureTextEntry = false,
  style,
  value,
}: RegistrationFieldProps) {
  return (
    <>
      <ThemedText style={styles.fieldLabel}>{label}</ThemedText>
      <TextInput
        autoCapitalize="none"
        keyboardType={keyboardType}
        onChangeText={onChangeText}
        secureTextEntry={secureTextEntry}
        style={[styles.fieldInput, style]}
        value={value}
      />
    </>
  );
}

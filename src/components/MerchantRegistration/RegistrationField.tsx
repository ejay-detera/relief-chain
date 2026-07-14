import { FontAwesome } from '@expo/vector-icons';
import type { KeyboardTypeOptions, StyleProp, TextStyle } from 'react-native';
import { Pressable, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';

import { merchantRegistrationStyles as styles } from './styles';

type RegistrationFieldProps = {
  keyboardType?: KeyboardTypeOptions;
  label: string;
  onChangeText: (value: string) => void;
  onToggleSecureTextEntry?: () => void;
  placeholder?: string;
  required?: boolean;
  secureTextEntry?: boolean;
  style?: StyleProp<TextStyle>;
  value: string;
};

export function RegistrationField({
  keyboardType,
  label,
  onChangeText,
  onToggleSecureTextEntry,
  placeholder,
  required = false,
  secureTextEntry = false,
  style,
  value,
}: RegistrationFieldProps) {
  const hasSecureTextToggle = Boolean(onToggleSecureTextEntry);

  return (
    <>
      <View style={styles.fieldLabelRow}>
        <ThemedText style={styles.fieldLabel}>{label}</ThemedText>
        {required && <ThemedText style={styles.requiredMarker}>*</ThemedText>}
      </View>
      <View style={styles.fieldInputContainer}>
        <TextInput
          autoCapitalize="none"
          keyboardType={keyboardType}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#979797"
          secureTextEntry={secureTextEntry}
          style={[styles.fieldInput, hasSecureTextToggle && styles.fieldInputWithAction, style]}
          value={value}
        />
        {onToggleSecureTextEntry && (
          <Pressable
            accessibilityLabel={secureTextEntry ? 'Show password' : 'Hide password'}
            accessibilityRole="button"
            hitSlop={8}
            onPress={onToggleSecureTextEntry}
            style={styles.fieldAction}
          >
            <FontAwesome color="#112E58" name={secureTextEntry ? 'eye-slash' : 'eye'} size={18} />
          </Pressable>
        )}
      </View>
    </>
  );
}

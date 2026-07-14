import { FontAwesome } from '@expo/vector-icons';
import type { KeyboardTypeOptions } from 'react-native';
import { Pressable, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';

import { registrationStyles as styles } from './styles';

type RegistrationFieldProps = {
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  keyboardType?: KeyboardTypeOptions;
  label: string;
  maxLength?: number;
  multiline?: boolean;
  onChangeText: (value: string) => void;
  onToggleSecure?: () => void;
  placeholder?: string;
  required?: boolean;
  secureTextEntry?: boolean;
  value: string;
};

export const RegistrationField = ({
  autoCapitalize = 'sentences', keyboardType, label, maxLength, multiline = false, onChangeText,
  onToggleSecure, placeholder, required = false, secureTextEntry = false, value,
}: RegistrationFieldProps) => (
  <View>
    <View style={styles.fieldLabelRow}>
      <ThemedText style={styles.fieldLabel}>{label}</ThemedText>
      {required && <ThemedText style={styles.required}>*</ThemedText>}
    </View>
    <View style={styles.inputWrap}>
      <TextInput
        autoCapitalize={autoCapitalize}
        keyboardType={keyboardType}
        maxLength={maxLength}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#979797"
        secureTextEntry={secureTextEntry}
        style={[styles.input, multiline && styles.multilineInput]}
        value={value}
      />
      {onToggleSecure && (
        <Pressable accessibilityLabel={secureTextEntry ? 'Show password' : 'Hide password'} accessibilityRole="button" onPress={onToggleSecure} style={styles.inputAction}>
          <FontAwesome color="#112E58" name={secureTextEntry ? 'eye-slash' : 'eye'} size={18} />
        </Pressable>
      )}
    </View>
  </View>
);

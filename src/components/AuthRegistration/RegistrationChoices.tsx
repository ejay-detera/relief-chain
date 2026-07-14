import { FontAwesome } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';

import { registrationStyles as styles } from './styles';

type Choice<T extends string> = { label: string; value: T };
type RegistrationChoicesProps<T extends string> = {
  columns?: 1 | 2;
  label: string;
  onChange: (value: T) => void;
  options: Choice<T>[];
  required?: boolean;
  value: T | null;
};

export const RegistrationChoices = <T extends string>({ columns = 2, label, onChange, options, required = false, value }: RegistrationChoicesProps<T>) => (
  <View>
    <View style={styles.fieldLabelRow}>
      <ThemedText style={styles.fieldLabel}>{label}</ThemedText>
      {required && <ThemedText style={styles.required}>*</ThemedText>}
    </View>
    <View style={styles.choices}>
      {options.map((option) => {
        const isSelected = value === option.value;
        return (
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ checked: isSelected }}
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[styles.choice, columns === 1 && styles.choiceFull]}
          >
            <View style={[styles.choiceIndicator, isSelected && styles.choiceIndicatorSelected]}>
              {isSelected && <FontAwesome color="#FFFFFF" name="check" size={10} />}
            </View>
            <ThemedText style={styles.choiceText}>{option.label}</ThemedText>
          </Pressable>
        );
      })}
    </View>
  </View>
);

type UploadPlaceholderProps = { label: string; onPress: () => void };
export const UploadPlaceholder = ({ label, onPress }: UploadPlaceholderProps) => (
  <Pressable accessibilityRole="button" onPress={onPress} style={styles.upload}>
    <FontAwesome color="#979797" name="file-image-o" size={24} />
    <ThemedText style={styles.uploadText}>{label}</ThemedText>
  </Pressable>
);

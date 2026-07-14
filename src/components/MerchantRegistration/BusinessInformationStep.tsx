import { FontAwesome } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import type { MerchantBusinessType, MerchantRegistrationData } from '@/types/merchant-registration';

import { RegistrationField } from './RegistrationField';
import { merchantRegistrationStyles as styles } from './styles';

type BusinessInformationStepProps = {
  data: MerchantRegistrationData;
  onChange: (values: Partial<MerchantRegistrationData>) => void;
  onNext: () => void;
};

type BusinessOption = {
  label: string;
  type: MerchantBusinessType;
  wide?: boolean;
};

const businessOptions: BusinessOption[] = [
  { label: 'Grocery', type: 'grocery' },
  { label: 'Convenience Store', type: 'convenienceStore', wide: true },
  { label: 'Pharmacy', type: 'pharmacy' },
  { label: 'Others', type: 'other', wide: true },
];

export function BusinessInformationStep({ data, onChange, onNext }: BusinessInformationStepProps) {
  const toggleBusinessType = (businessType: MerchantBusinessType) => {
    const isSelected = data.businessTypes.includes(businessType);
    const businessTypes = isSelected
      ? data.businessTypes.filter((item) => item !== businessType)
      : [...data.businessTypes, businessType];

    onChange({ businessTypes });
  };

  return (
    <View style={styles.form}>
      <RegistrationField
        label="Business Name"
        onChangeText={(businessName) => onChange({ businessName })}
        placeholder="Juan's Grocery"
        required
        value={data.businessName}
      />

      <View>
        <View style={styles.fieldLabelRow}>
          <ThemedText style={styles.optionLabel}>Business Type:</ThemedText>
          <ThemedText style={styles.requiredMarker}>*</ThemedText>
        </View>
        <View style={styles.businessOptions}>
          {businessOptions.map(({ label, type, wide }) => {
            const isSelected = data.businessTypes.includes(type);

            return (
              <Pressable
                key={type}
                onPress={() => toggleBusinessType(type)}
                style={[styles.businessOption, wide && styles.businessOptionWide]}
              >
                <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
                  {isSelected && <FontAwesome color="#FFFFFF" name="check" size={11} />}
                </View>
                <ThemedText style={styles.optionLabel}>{label}</ThemedText>
              </Pressable>
            );
          })}
        </View>
      </View>

      <RegistrationField
        label="Address"
        onChangeText={(address) => onChange({ address })}
        placeholder="123 Main Street, Quezon City"
        required
        value={data.address}
      />

      <Pressable onPress={onNext} style={styles.nextButton}>
        <ThemedText style={styles.nextButtonText}>Next</ThemedText>
      </Pressable>
    </View>
  );
}

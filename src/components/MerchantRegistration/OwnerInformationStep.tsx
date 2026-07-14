import { Pressable, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import type { MerchantRegistrationData } from '@/types/merchant-registration';

import { RegistrationField } from './RegistrationField';
import { merchantRegistrationStyles as styles } from './styles';

type OwnerInformationStepProps = {
  data: MerchantRegistrationData;
  onChange: (values: Partial<MerchantRegistrationData>) => void;
  onNext: () => void;
};

export function OwnerInformationStep({ data, onChange, onNext }: OwnerInformationStepProps) {
  return (
    <View style={styles.form}>
      <View style={styles.ownerNameRow}>
        <View style={styles.lastNameField}>
          <View style={styles.fieldLabelRow}>
            <ThemedText style={styles.compactFieldLabel}>Last Name</ThemedText>
            <ThemedText style={styles.requiredMarker}>*</ThemedText>
          </View>
          <TextInput
            autoCapitalize="words"
            onChangeText={(lastName) => onChange({ lastName })}
            placeholder="Dela Cruz"
            placeholderTextColor="#979797"
            style={styles.compactFieldInput}
            value={data.lastName}
          />
        </View>
        <View style={styles.firstNameField}>
          <View style={styles.fieldLabelRow}>
            <ThemedText style={styles.compactFieldLabel}>First Name</ThemedText>
            <ThemedText style={styles.requiredMarker}>*</ThemedText>
          </View>
          <TextInput
            autoCapitalize="words"
            onChangeText={(firstName) => onChange({ firstName })}
            placeholder="John"
            placeholderTextColor="#979797"
            style={styles.compactFieldInput}
            value={data.firstName}
          />
        </View>
        <View style={styles.middleInitialField}>
          <ThemedText style={styles.compactFieldLabel}>M.I</ThemedText>
          <TextInput
            autoCapitalize="characters"
            maxLength={1}
            onChangeText={(middleInitial) => onChange({ middleInitial })}
            placeholder="A"
            placeholderTextColor="#979797"
            style={styles.compactFieldInput}
            value={data.middleInitial}
          />
        </View>
      </View>

      <RegistrationField
        keyboardType="phone-pad"
        label="Mobile Number"
        onChangeText={(mobileNumber) => onChange({ mobileNumber: mobileNumber.replace(/\D/g, '').slice(0, 11) })}
        placeholder="09171234567"
        required
        value={data.mobileNumber}
      />

      <RegistrationField
        keyboardType="email-address"
        label="Email"
        onChangeText={(email) => onChange({ email })}
        placeholder="john@example.com"
        required
        value={data.email}
      />

      <Pressable onPress={onNext} style={styles.nextButton}>
        <ThemedText style={styles.nextButtonText}>Next</ThemedText>
      </Pressable>
    </View>
  );
}

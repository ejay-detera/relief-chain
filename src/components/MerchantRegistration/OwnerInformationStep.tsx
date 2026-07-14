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
          <ThemedText style={styles.compactFieldLabel}>Last Name</ThemedText>
          <TextInput
            onChangeText={(lastName) => onChange({ lastName })}
            style={styles.compactFieldInput}
            value={data.lastName}
          />
        </View>
        <View style={styles.firstNameField}>
          <ThemedText style={styles.compactFieldLabel}>First Name</ThemedText>
          <TextInput
            onChangeText={(firstName) => onChange({ firstName })}
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
            style={styles.compactFieldInput}
            value={data.middleInitial}
          />
        </View>
      </View>

      <RegistrationField
        keyboardType="phone-pad"
        label="Mobile Number"
        onChangeText={(mobileNumber) => onChange({ mobileNumber })}
        value={data.mobileNumber}
      />

      <RegistrationField
        keyboardType="email-address"
        label="Email"
        onChangeText={(email) => onChange({ email })}
        value={data.email}
      />

      <Pressable onPress={onNext} style={styles.nextButton}>
        <ThemedText style={styles.nextButtonText}>Next</ThemedText>
      </Pressable>
    </View>
  );
}

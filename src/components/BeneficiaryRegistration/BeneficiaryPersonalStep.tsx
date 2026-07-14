import { View } from 'react-native';

import { RegistrationField } from '@/components/AuthRegistration/RegistrationField';
import { RegistrationPrimaryAction } from '@/components/AuthRegistration/RegistrationPrimaryAction';
import { registrationStyles as styles } from '@/components/AuthRegistration/styles';
import type { BeneficiaryRegistrationData } from '@/types/beneficiary-registration';

type Props = { data: BeneficiaryRegistrationData; onChange: (values: Partial<BeneficiaryRegistrationData>) => void; onNext: () => void };

export const BeneficiaryPersonalStep = ({ data, onChange, onNext }: Props) => (
  <View style={styles.form}>
    <RegistrationField keyboardType="phone-pad" label="Mobile Number" onChangeText={(mobileNumber) => onChange({ mobileNumber: mobileNumber.replace(/\D/g, '').slice(0, 11) })} required value={data.mobileNumber} />
    <RegistrationField autoCapitalize="none" keyboardType="email-address" label="Email" onChangeText={(email) => onChange({ email })} required value={data.email} />
    <View style={styles.row}>
      <View style={styles.flexField}><RegistrationField label="Complete Address" onChangeText={(completeAddress) => onChange({ completeAddress })} required value={data.completeAddress} /></View>
      <View style={styles.flexField}><RegistrationField label="Municipality / City" onChangeText={(municipalityCity) => onChange({ municipalityCity })} required value={data.municipalityCity} /></View>
    </View>
    <RegistrationPrimaryAction label="Next" onPress={onNext} />
  </View>
);

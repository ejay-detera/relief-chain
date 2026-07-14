import { View } from 'react-native';

import { RegistrationChoices } from '@/components/AuthRegistration/RegistrationChoices';
import { RegistrationField } from '@/components/AuthRegistration/RegistrationField';
import { RegistrationNameRow } from '@/components/AuthRegistration/RegistrationNameRow';
import { RegistrationPasswordFields } from '@/components/AuthRegistration/RegistrationPasswordFields';
import { RegistrationPrimaryAction } from '@/components/AuthRegistration/RegistrationPrimaryAction';
import { registrationStyles as styles } from '@/components/AuthRegistration/styles';
import type { OrganizationCivilStatus, OrganizationRegistrationData, OrganizationSex } from '@/types/organization-registration';

type Props = { data: OrganizationRegistrationData; onChange: (values: Partial<OrganizationRegistrationData>) => void; onNext: () => void };
const sexOptions: { label: string; value: OrganizationSex }[] = [{ label: 'Female', value: 'female' }, { label: 'Male', value: 'male' }];
const civilOptions: { label: string; value: OrganizationCivilStatus }[] = [
  { label: 'Single', value: 'single' }, { label: 'Married', value: 'married' },
  { label: 'Widow/er', value: 'widowed' }, { label: 'Separated', value: 'separated' },
];

export const OrganizationAccountStep = ({ data, onChange, onNext }: Props) => (
  <View style={styles.form}>
    <RegistrationNameRow firstName={data.firstName} lastName={data.lastName} middleInitial={data.middleInitial} onChange={onChange} />
    <View style={styles.row}>
      <View style={styles.flexField}><RegistrationField label="Position" onChangeText={(position) => onChange({ position })} required value={data.position} /></View>
      <View style={styles.flexField}><RegistrationField autoCapitalize="none" keyboardType="email-address" label="Email" onChangeText={(email) => onChange({ email })} required value={data.email} /></View>
    </View>
    <View style={styles.demographicRow}>
      <View style={styles.demographicSex}><RegistrationChoices columns={1} label="Sex" onChange={(sex) => onChange({ sex })} options={sexOptions} required value={data.sex} /></View>
      <View style={styles.demographicCivil}><RegistrationChoices label="Civil Status" onChange={(civilStatus) => onChange({ civilStatus })} options={civilOptions} required value={data.civilStatus} /></View>
    </View>
    <RegistrationField keyboardType="phone-pad" label="Mobile Number" onChangeText={(mobileNumber) => onChange({ mobileNumber: mobileNumber.replace(/\D/g, '').slice(0, 11) })} required value={data.mobileNumber} />
    <RegistrationPasswordFields confirmPassword={data.confirmPassword} layout="row" onChange={onChange} password={data.password} />
    <RegistrationPrimaryAction label="Next" onPress={onNext} />
  </View>
);

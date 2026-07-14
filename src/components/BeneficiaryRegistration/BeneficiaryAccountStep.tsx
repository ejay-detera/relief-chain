import { View } from 'react-native';

import { RegistrationChoices } from '@/components/AuthRegistration/RegistrationChoices';
import { RegistrationDateField } from '@/components/AuthRegistration/RegistrationDateField';
import { RegistrationNameRow } from '@/components/AuthRegistration/RegistrationNameRow';
import { RegistrationPrimaryAction } from '@/components/AuthRegistration/RegistrationPrimaryAction';
import { registrationStyles as styles } from '@/components/AuthRegistration/styles';
import type { BeneficiaryCivilStatus, BeneficiaryRegistrationData, BeneficiarySex } from '@/types/beneficiary-registration';

type Props = { data: BeneficiaryRegistrationData; onChange: (values: Partial<BeneficiaryRegistrationData>) => void; onNext: () => void };
const sexOptions: { label: string; value: BeneficiarySex }[] = [{ label: 'Female', value: 'female' }, { label: 'Male', value: 'male' }];
const civilOptions: { label: string; value: BeneficiaryCivilStatus }[] = [
  { label: 'Single', value: 'single' }, { label: 'Married', value: 'married' },
  { label: 'Widow/er', value: 'widowed' }, { label: 'Separated', value: 'separated' },
];

export const BeneficiaryAccountStep = ({ data, onChange, onNext }: Props) => (
  <View style={styles.form}>
    <RegistrationNameRow firstName={data.firstName} lastName={data.lastName} middleInitial={data.middleInitial} onChange={onChange} />
    <RegistrationDateField label="Birthdate" onChange={(birthdate) => onChange({ birthdate })} value={data.birthdate} />
    <View style={styles.demographicRow}>
      <View style={styles.demographicSex}><RegistrationChoices columns={1} label="Sex" onChange={(sex) => onChange({ sex })} options={sexOptions} required value={data.sex} /></View>
      <View style={styles.demographicCivil}><RegistrationChoices label="Civil Status" onChange={(civilStatus) => onChange({ civilStatus })} options={civilOptions} required value={data.civilStatus} /></View>
    </View>
    <RegistrationPrimaryAction label="Next" onPress={onNext} />
  </View>
);

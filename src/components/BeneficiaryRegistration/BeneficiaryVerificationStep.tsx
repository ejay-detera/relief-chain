import { View } from 'react-native';

import { RegistrationField } from '@/components/AuthRegistration/RegistrationField';
import { RegistrationPrimaryAction } from '@/components/AuthRegistration/RegistrationPrimaryAction';
import { RegistrationUploadField } from '@/components/AuthRegistration/RegistrationUploadField';
import { registrationStyles as styles } from '@/components/AuthRegistration/styles';
import type { BeneficiaryRegistrationData } from '@/types/beneficiary-registration';

type Props = { data: BeneficiaryRegistrationData; onChange: (values: Partial<BeneficiaryRegistrationData>) => void; onNext: () => void };

export const BeneficiaryVerificationStep = ({ data, onChange, onNext }: Props) => (
  <View style={styles.form}>
    <RegistrationField label="Government ID Number" onChangeText={(governmentIdNumber) => onChange({ governmentIdNumber })} placeholder="Government-issued ID number" required value={data.governmentIdNumber} />
    <RegistrationUploadField asset={data.governmentIdDocument} label="Upload Government ID" onSelect={(governmentIdDocument) => onChange({ governmentIdDocument })} required />
    <RegistrationPrimaryAction label="Next" onPress={onNext} />
  </View>
);

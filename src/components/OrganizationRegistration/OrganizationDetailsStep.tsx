import { View } from 'react-native';

import { RegistrationField } from '@/components/AuthRegistration/RegistrationField';
import { RegistrationPrimaryAction } from '@/components/AuthRegistration/RegistrationPrimaryAction';
import { registrationStyles as styles } from '@/components/AuthRegistration/styles';
import type { OrganizationRegistrationData } from '@/types/organization-registration';

type Props = { data: OrganizationRegistrationData; onChange: (values: Partial<OrganizationRegistrationData>) => void; onNext: () => void };

export const OrganizationDetailsStep = ({ data, onChange, onNext }: Props) => (
  <View style={styles.form}>
    <RegistrationField label="Organization Name" onChangeText={(organizationName) => onChange({ organizationName })} placeholder="Organization name" required value={data.organizationName} />
    <RegistrationField label="Organization Type" onChangeText={(organizationType) => onChange({ organizationType })} required value={data.organizationType} />
    <RegistrationField label="Region/Province/City" onChangeText={(regionProvinceCity) => onChange({ regionProvinceCity })} required value={data.regionProvinceCity} />
    <RegistrationPrimaryAction label="Next" onPress={onNext} />
  </View>
);

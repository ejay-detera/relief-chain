import { useState } from 'react';
import { Alert, View } from 'react-native';

import { RegistrationField } from '@/components/AuthRegistration/RegistrationField';
import { RegistrationNameRow } from '@/components/AuthRegistration/RegistrationNameRow';
import { RegistrationPrimaryAction } from '@/components/AuthRegistration/RegistrationPrimaryAction';
import { registrationStyles } from '@/components/AuthRegistration/styles';
import { ThemedText } from '@/components/themed-text';

import { getResubmitFormError, initialResubmitFormData, type ResubmitFormData } from './resubmitValidation';
import { applicationReviewStyles as styles } from './styles';

type ResubmitFormProps = {
  initialData?: ResubmitFormData;
  isSubmitting?: boolean;
  /**
   * Called only after client-side validation passes (Task 13.2). The screen
   * (`application-review.tsx`) wires this callback to
   * `registrationService.resubmitRegistration` and navigates/surfaces
   * errors on completion (Task 16) — `ResubmitForm` itself only gates the
   * call on a successful validation result.
   */
  onResubmit: (data: ResubmitFormData) => void;
};

export const ResubmitForm = ({ initialData = initialResubmitFormData, isSubmitting = false, onResubmit }: ResubmitFormProps) => {
  const [data, setData] = useState<ResubmitFormData>(initialData);

  const update = (values: Partial<ResubmitFormData>) => setData((current) => ({ ...current, ...values }));

  const handleSubmit = () => {
    const message = getResubmitFormError(data);
    if (message) {
      Alert.alert('Check your details', message);
      return;
    }
    onResubmit(data);
  };

  return (
    <View style={registrationStyles.form}>
      <ThemedText style={styles.formSectionTitle}>Update your application</ThemedText>
      <RegistrationField label="Organization Name" onChangeText={(organizationName) => update({ organizationName })} placeholder="Organization name" required value={data.organizationName} />
      <RegistrationField label="Organization Type" onChangeText={(organizationType) => update({ organizationType })} required value={data.organizationType} />
      <RegistrationField label="Region/Province/City" onChangeText={(regionProvinceCity) => update({ regionProvinceCity })} required value={data.regionProvinceCity} />
      <RegistrationNameRow firstName={data.firstName} lastName={data.lastName} middleInitial={data.middleInitial} onChange={update} />
      <RegistrationField label="Position" onChangeText={(position) => update({ position })} required value={data.position} />
      <RegistrationPrimaryAction isLoading={isSubmitting} label="Resubmit Application" onPress={handleSubmit} />
    </View>
  );
};

import { View } from 'react-native';

import { RegistrationField } from '@/components/AuthRegistration/RegistrationField';
import { RegistrationPrimaryAction } from '@/components/AuthRegistration/RegistrationPrimaryAction';
import { RegistrationTermsRow } from '@/components/AuthRegistration/RegistrationTermsRow';
import { RegistrationUploadField } from '@/components/AuthRegistration/RegistrationUploadField';
import { registrationStyles as styles } from '@/components/AuthRegistration/styles';
import type { OrganizationRegistrationData } from '@/types/organization-registration';

type Props = { data: OrganizationRegistrationData; isSubmitting: boolean; onChange: (values: Partial<OrganizationRegistrationData>) => void; onSubmit: () => void };

export const OrganizationVerificationStep = ({ data, isSubmitting, onChange, onSubmit }: Props) => (
  <View style={styles.form}>
    <RegistrationField autoCapitalize="characters" label="Stellar Wallet Address" onChangeText={(stellarWalletAddress) => onChange({ stellarWalletAddress })} placeholder="G..." required value={data.stellarWalletAddress} />
    <RegistrationUploadField asset={data.verificationDocument} label="Upload Org ID / Accreditation" onSelect={(verificationDocument) => onChange({ verificationDocument })} required />
    <RegistrationTermsRow checked={data.agreesToTerms} onChange={(agreesToTerms) => onChange({ agreesToTerms })} />
    <RegistrationPrimaryAction isLoading={isSubmitting} label="Create Organization Account" onPress={onSubmit} />
  </View>
);

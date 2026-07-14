import { View } from 'react-native';

import { RegistrationField } from '@/components/AuthRegistration/RegistrationField';
import { RegistrationPasswordFields } from '@/components/AuthRegistration/RegistrationPasswordFields';
import { RegistrationPrimaryAction } from '@/components/AuthRegistration/RegistrationPrimaryAction';
import { RegistrationTermsRow } from '@/components/AuthRegistration/RegistrationTermsRow';
import { registrationStyles as styles } from '@/components/AuthRegistration/styles';
import type { BeneficiaryRegistrationData } from '@/types/beneficiary-registration';

type Props = { data: BeneficiaryRegistrationData; isSubmitting: boolean; onChange: (values: Partial<BeneficiaryRegistrationData>) => void; onSubmit: () => void };

export const BeneficiaryWalletStep = ({ data, isSubmitting, onChange, onSubmit }: Props) => (
  <View style={styles.form}>
    <RegistrationField autoCapitalize="characters" label="Stellar Wallet Address" onChangeText={(stellarWalletAddress) => onChange({ stellarWalletAddress })} placeholder="G..." required value={data.stellarWalletAddress} />
    <RegistrationPasswordFields confirmPassword={data.confirmPassword} onChange={onChange} password={data.password} />
    <RegistrationTermsRow checked={data.agreesToTerms} onChange={(agreesToTerms) => onChange({ agreesToTerms })} />
    <RegistrationPrimaryAction isLoading={isSubmitting} label="Create Account" onPress={onSubmit} />
  </View>
);

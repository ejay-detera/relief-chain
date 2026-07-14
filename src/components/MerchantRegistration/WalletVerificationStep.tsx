import { Pressable, View } from 'react-native';

import { RegistrationUploadField } from '@/components/AuthRegistration/RegistrationUploadField';
import { ThemedText } from '@/components/themed-text';
import type { MerchantRegistrationData } from '@/types/merchant-registration';

import { RegistrationField } from './RegistrationField';
import { merchantRegistrationStyles as styles } from './styles';

type Props = {
  data: MerchantRegistrationData;
  onChange: (values: Partial<MerchantRegistrationData>) => void;
  onNext: () => void;
};

export const WalletVerificationStep = ({ data, onChange, onNext }: Props) => (
  <View style={styles.form}>
    <RegistrationField label="Stellar Wallet Address (Optional)" onChangeText={(stellarWalletAddress) => onChange({ stellarWalletAddress })} placeholder="G..." value={data.stellarWalletAddress} />
    <RegistrationUploadField asset={data.permitDocument} label="Business Permit" onSelect={(permitDocument) => onChange({ permitDocument })} />
    <Pressable onPress={onNext} style={styles.nextButton}>
      <ThemedText style={styles.nextButtonText}>Next</ThemedText>
    </Pressable>
  </View>
);

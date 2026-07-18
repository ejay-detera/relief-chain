import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { StrKey } from '@stellar/stellar-sdk';

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

export const WalletVerificationStep = ({ data, onChange, onNext }: Props) => {
  const [walletError, setWalletError] = useState<string | null>(null);

  const handleAddressChange = (stellarWalletAddress: string) => {
    onChange({ stellarWalletAddress });
    if (stellarWalletAddress.trim() && !StrKey.isValidEd25519PublicKey(stellarWalletAddress.trim())) {
      setWalletError('Invalid Stellar address. Must start with G and be 56 characters.');
    } else {
      setWalletError(null);
    }
  };

  const canProceed = !walletError;

  return (
    <View style={styles.form}>
      <RegistrationField
        label="Stellar Wallet Address (Optional)"
        onChangeText={handleAddressChange}
        placeholder="G..."
        value={data.stellarWalletAddress}
      />
      {walletError && (
        <ThemedText style={{ color: '#C0392B', fontSize: 12, marginTop: -8 }}>{walletError}</ThemedText>
      )}
      <RegistrationUploadField
        asset={data.permitDocument}
        label="Business Permit"
        onSelect={(permitDocument) => onChange({ permitDocument })}
      />
      <Pressable
        onPress={onNext}
        style={[styles.nextButton, !canProceed && { opacity: 0.4 }]}
        disabled={!canProceed}
      >
        <ThemedText style={styles.nextButtonText}>Next</ThemedText>
      </Pressable>
    </View>
  );
};

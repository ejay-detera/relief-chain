import { FontAwesome } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import type { MerchantRegistrationData } from '@/types/merchant-registration';

import { RegistrationField } from './RegistrationField';
import { merchantRegistrationStyles as styles } from './styles';

type WalletVerificationStepProps = {
  data: MerchantRegistrationData;
  onChange: (values: Partial<MerchantRegistrationData>) => void;
  onNext: () => void;
  onUploadPermit: () => void;
};

export function WalletVerificationStep({
  data,
  onChange,
  onNext,
  onUploadPermit,
}: WalletVerificationStepProps) {
  return (
    <View style={styles.form}>
      <RegistrationField
        label="Stellar Wallet Address"
        onChangeText={(stellarWalletAddress) => onChange({ stellarWalletAddress })}
        value={data.stellarWalletAddress}
      />

      <View>
        <ThemedText style={styles.fieldLabel}>Upload Business Permit</ThemedText>
        <Pressable onPress={onUploadPermit} style={styles.permitInput}>
          <FontAwesome color="rgba(151, 151, 151, 0.5)" name="file-image-o" size={22} />
        </Pressable>
      </View>

      <Pressable onPress={onNext} style={styles.nextButton}>
        <ThemedText style={styles.nextButtonText}>Next</ThemedText>
      </Pressable>
    </View>
  );
}

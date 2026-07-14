import { useState } from 'react';
import { View } from 'react-native';

import { RegistrationField } from './RegistrationField';
import { RegistrationPasswordCriteria } from './RegistrationPasswordCriteria';
import { registrationStyles as styles } from './styles';

type Props = {
  confirmPassword: string;
  layout?: 'column' | 'row';
  onChange: (values: { password?: string; confirmPassword?: string }) => void;
  password: string;
};

export const RegistrationPasswordFields = ({ confirmPassword, layout = 'column', onChange, password }: Props) => {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const passwordField = (
    <RegistrationField label="Password" onChangeText={(value) => onChange({ password: value })} onToggleSecure={() => setShowPassword((current) => !current)} required secureTextEntry={!showPassword} value={password} />
  );
  const confirmationField = (
    <RegistrationField label="Confirm Password" onChangeText={(value) => onChange({ confirmPassword: value })} onToggleSecure={() => setShowConfirmation((current) => !current)} required secureTextEntry={!showConfirmation} value={confirmPassword} />
  );

  const criteria = <RegistrationPasswordCriteria password={password} />;

  if (layout === 'row') {
    return (
      <View style={styles.passwordRow}>
        <View style={styles.flexField}>{passwordField}{criteria}</View>
        <View style={styles.flexField}>{confirmationField}</View>
      </View>
    );
  }

  return <>{passwordField}{criteria}{confirmationField}</>;
};

import { View } from 'react-native';

import { RegistrationField } from './RegistrationField';
import { registrationStyles as styles } from './styles';

type RegistrationNameRowProps = {
  firstName: string;
  lastName: string;
  middleInitial: string;
  onChange: (values: { firstName?: string; lastName?: string; middleInitial?: string }) => void;
};

export const RegistrationNameRow = ({ firstName, lastName, middleInitial, onChange }: RegistrationNameRowProps) => (
  <View style={styles.nameRow}>
    <View style={styles.nameField}>
      <RegistrationField autoCapitalize="words" label="Last Name" onChangeText={(value) => onChange({ lastName: value })} required value={lastName} />
    </View>
    <View style={styles.nameField}>
      <RegistrationField autoCapitalize="words" label="First Name" onChangeText={(value) => onChange({ firstName: value })} required value={firstName} />
    </View>
    <View style={styles.initialField}>
      <RegistrationField autoCapitalize="characters" label="M.I." maxLength={1} onChangeText={(value) => onChange({ middleInitial: value })} value={middleInitial} />
    </View>
  </View>
);

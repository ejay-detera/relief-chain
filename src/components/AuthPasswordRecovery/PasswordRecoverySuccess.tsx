import { Pressable, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';

import { passwordRecoveryStyles as styles } from './styles';

type PasswordRecoverySuccessProps = {
  onBack: () => void;
};

export const PasswordRecoverySuccess = ({ onBack }: PasswordRecoverySuccessProps) => (
  <Pressable
    accessibilityHint="Returns to the sign-in page"
    accessibilityRole="button"
    onPress={onBack}
    style={styles.successContent}
  >
    <View>
      <ThemedText style={styles.successHeading}>Password changed{`\n`}successfully!</ThemedText>
      <ThemedText style={styles.successMessage}>
        You can now go back to the login page and sign in with your new password.
      </ThemedText>
    </View>
  </Pressable>
);

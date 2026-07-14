import { FontAwesome } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BrandColors } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';

export const LogoutButton = () => {
  const { signOut } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const confirmLogout = () => {
    Alert.alert('Log out?', 'You will need to sign in again to access your account.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: () => {
          setIsSigningOut(true);
          void signOut()
            .then((error) => {
              if (error) Alert.alert('Unable to log out', error.message);
            })
            .catch((error: unknown) => {
              const message = error instanceof Error ? error.message : 'Please try again.';
              Alert.alert('Unable to log out', message);
            })
            .finally(() => setIsSigningOut(false));
        },
      },
    ]);
  };

  return (
    <Pressable
      accessibilityLabel="Log out of Relief Chain"
      accessibilityRole="button"
      disabled={isSigningOut}
      onPress={confirmLogout}
      style={({ pressed }) => [styles.button, (pressed || isSigningOut) && styles.buttonPressed]}
    >
      {isSigningOut ? <ActivityIndicator color="#FFFFFF" /> : <FontAwesome color="#FFFFFF" name="sign-out" size={20} />}
      <ThemedText style={styles.label}>{isSigningOut ? 'Logging out…' : 'Log out'}</ThemedText>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  button: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', columnGap: 10, backgroundColor: BrandColors.navy, borderRadius: 20, paddingHorizontal: 24 },
  buttonPressed: { opacity: 0.7 },
  label: { color: '#FFFFFF', fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15 },
});

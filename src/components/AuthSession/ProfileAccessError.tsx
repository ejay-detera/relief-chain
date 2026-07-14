import { FontAwesome } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LogoutButton } from '@/components/shared/LogoutButton';
import { ThemedText } from '@/components/themed-text';
import { BrandColors, Spacing } from '@/constants/theme';

export const ProfileAccessError = () => (
  <SafeAreaView style={styles.safeArea}>
    <View style={styles.content}>
      <View style={styles.icon}>
        <FontAwesome color="#FFFFFF" name="user-times" size={32} />
      </View>
      <ThemedText style={styles.title}>Profile unavailable</ThemedText>
      <ThemedText style={styles.message}>
        We could not verify the profile linked to this account. Log out and sign in again, or contact support if the issue continues.
      </ThemedText>
      <LogoutButton />
    </View>
  </SafeAreaView>
);

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FFFFFF' },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: Spacing.four },
  icon: { width: 64, height: 64, alignItems: 'center', alignSelf: 'center', justifyContent: 'center', backgroundColor: BrandColors.navy, borderRadius: 32 },
  title: { marginTop: Spacing.four, color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 24, textAlign: 'center' },
  message: { marginBottom: Spacing.four, marginTop: Spacing.two, color: BrandColors.navy, fontFamily: 'PlusJakartaSans_400Regular', fontSize: 14, lineHeight: 21, textAlign: 'center' },
});
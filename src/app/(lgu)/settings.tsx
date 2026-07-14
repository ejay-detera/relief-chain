import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LogoutButton } from '@/components/shared/LogoutButton';
import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, BrandColors, Spacing } from '@/constants/theme';

const SettingsScreen = () => (
  <SafeAreaView style={styles.safeArea}>
    <View style={styles.container}>
      <ThemedText style={styles.title}>Settings</ThemedText>
      <View style={styles.content}>
        <ThemedText style={styles.description}>Manage your organization account and secure session.</ThemedText>
        <LogoutButton />
      </View>
    </View>
  </SafeAreaView>
);

export default SettingsScreen;

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FFFFFF' },
  container: { flex: 1, paddingHorizontal: Spacing.four, paddingTop: Spacing.four, paddingBottom: BottomTabInset + Spacing.four },
  title: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 24 },
  content: { flex: 1, justifyContent: 'space-between', paddingTop: Spacing.four },
  description: { color: BrandColors.grey, fontFamily: 'PlusJakartaSans_400Regular', fontSize: 14 },
});

import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LogoutButton } from '@/components/shared/LogoutButton';
import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, BrandColors, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';

const MerchantProfileScreen = () => {
  const { profile } = useAuth();

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View>
          <ThemedText style={styles.title}>Merchant Profile</ThemedText>
          <ThemedText style={styles.name}>{profile?.full_name ?? 'Merchant account'}</ThemedText>
          <ThemedText style={styles.detail}>{profile?.location ?? 'Location not set'}</ThemedText>
        </View>
        <LogoutButton />
      </View>
    </SafeAreaView>
  );
};

export default MerchantProfileScreen;

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FFFFFF' },
  container: { flex: 1, justifyContent: 'space-between', paddingHorizontal: Spacing.four, paddingTop: Spacing.four, paddingBottom: BottomTabInset + Spacing.four },
  title: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 24 },
  name: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 18, marginTop: Spacing.four },
  detail: { color: BrandColors.grey, fontFamily: 'PlusJakartaSans_400Regular', fontSize: 14, marginTop: Spacing.one },
});

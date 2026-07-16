import { FontAwesome } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LogoutButton } from '@/components/shared/LogoutButton';
import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BottomTabInset, BrandColors, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';

const SettingsScreen = () => {
  const router = useRouter();
  const { profile } = useAuth();

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <ThemedText style={styles.title}>Settings</ThemedText>
        <View style={styles.content}>
          <View>
            <ThemedText style={styles.description}>Manage your organization account and secure session.</ThemedText>

            <Pressable onPress={() => router.push('/(lgu)/edit-profile' as any)} style={styles.menuRow}>
              <View style={styles.menuRowLeft}>
                <View style={styles.menuIconCircle}>
                  <FontAwesome color={BrandColors.navy} name="user" size={16} />
                </View>
                <View>
                  <ThemedText style={styles.menuRowTitle}>Edit Profile</ThemedText>
                  <ThemedText style={styles.menuRowSubtitle}>{profile?.full_name ?? 'Organization account'}</ThemedText>
                </View>
              </View>
              <FontAwesome color={BrandColors.grey} name="chevron-right" size={14} />
            </Pressable>

            <Pressable onPress={() => router.push('/(lgu)/security' as any)} style={[styles.menuRow, styles.menuRowSpacing]}>
              <View style={styles.menuRowLeft}>
                <View style={styles.menuIconCircle}>
                  <FontAwesome color={BrandColors.navy} name="shield" size={16} />
                </View>
                <View>
                  <ThemedText style={styles.menuRowTitle}>Security & MFA</ThemedText>
                  <ThemedText style={styles.menuRowSubtitle}>Authenticator and step-up for financial actions</ThemedText>
                </View>
              </View>
              <FontAwesome color={BrandColors.grey} name="chevron-right" size={14} />
            </Pressable>
          </View>

          <LogoutButton />
        </View>
      </View>
    </SafeAreaView>
  );
};

export default SettingsScreen;

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FFFFFF' },
  container: { flex: 1, paddingHorizontal: Spacing.four, paddingTop: Spacing.four, paddingBottom: BottomTabInset + Spacing.four },
  title: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 24 },
  content: { flex: 1, justifyContent: 'space-between', paddingTop: Spacing.four },
  description: { color: BrandColors.grey, fontFamily: 'PlusJakartaSans_400Regular', fontSize: 14, marginBottom: Spacing.four },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: BrandColors.lightGray,
    borderRadius: BorderRadius.lg,
    padding: Spacing.three,
  },
  menuRowSpacing: {
    marginTop: Spacing.three,
  },
  menuRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  menuIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuRowTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
    color: BrandColors.navy,
  },
  menuRowSubtitle: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 12,
    color: BrandColors.grey,
    marginTop: 2,
  },
});

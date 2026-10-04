import { FontAwesome } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FadeInView } from '@/components/shared/FadeInView';
import { LogoutButton } from '@/components/shared/LogoutButton';
import { UserAvatar } from '@/components/shared/UserAvatar';
import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BottomTabInset, BrandColors, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';

const SettingsScreen = () => {
  const router = useRouter();
  const { profile } = useAuth();

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <FadeInView delay={0}>
          <ThemedText style={styles.title}>Settings</ThemedText>
        </FadeInView>
        <View style={styles.content}>
          <View>
            <FadeInView delay={40}>
              <ThemedText style={styles.description}>Manage your organization account and secure session.</ThemedText>
            </FadeInView>

            <FadeInView delay={80}>
              <Pressable onPress={() => router.push('/(lgu)/edit-profile' as any)} style={styles.menuRow}>
                <View style={styles.menuRowLeft}>
                  <UserAvatar id={profile?.id} name={profile?.full_name} role="lgu" size={38} />
                  <ThemedText style={styles.menuRowTitle}>Edit Profile</ThemedText>
                </View>
                <FontAwesome color={BrandColors.grey} name="chevron-right" size={14} />
              </Pressable>
            </FadeInView>

            <FadeInView delay={120}>
              <Pressable onPress={() => router.push('/(lgu)/security' as any)} style={[styles.menuRow, styles.menuRowSpacing]}>
                <View style={styles.menuRowLeft}>
                  <View style={styles.menuIconCircle}>
                    <FontAwesome color={BrandColors.navy} name="shield" size={16} />
                  </View>
                  <ThemedText style={styles.menuRowTitle}>Security & MFA</ThemedText>
                </View>
                <FontAwesome color={BrandColors.grey} name="chevron-right" size={14} />
              </Pressable>
            </FadeInView>

            <FadeInView delay={160}>
              <Pressable
                accessibilityLabel="Audit & Compliance Reports"
                accessibilityRole="button"
                onPress={() => router.push('/(lgu)/reports' as any)}
                style={[styles.menuRow, styles.menuRowSpacing]}
              >
                <View style={styles.menuRowLeft}>
                  <View style={styles.menuIconCircle}>
                    <FontAwesome color={BrandColors.navy} name="file-text" size={16} />
                  </View>
                  <ThemedText style={styles.menuRowTitle}>Audit & Compliance Reports</ThemedText>
                </View>
                <FontAwesome color={BrandColors.grey} name="chevron-right" size={14} />
              </Pressable>
            </FadeInView>
            <FadeInView delay={200}>
              <Pressable
                accessibilityLabel="Transfer Organization Funds"
                accessibilityRole="button"
                onPress={() => router.push('/(lgu)/transfer-funds' as any)}
                style={[styles.menuRow, styles.menuRowSpacing]}
              >
                <View style={styles.menuRowLeft}>
                  <View style={styles.menuIconCircle}>
                    <FontAwesome color={BrandColors.navy} name="exchange" size={16} />
                  </View>
                  <ThemedText style={styles.menuRowTitle}>Transfer Organization Funds</ThemedText>
                </View>
                <FontAwesome color={BrandColors.grey} name="chevron-right" size={14} />
              </Pressable>
            </FadeInView>
          </View>

          <FadeInView delay={240}>
            <LogoutButton />
          </FadeInView>
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
});

import { FontAwesome, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { MerchantBottomNavigation } from '@/components/MerchantDashboard/MerchantBottomNavigation';
import { MerchantProfileContent } from '@/components/MerchantProfile/MerchantProfileContent';
import { FadeInView } from '@/components/shared/FadeInView';
import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, FloatingTabBarGap, FloatingTabBarHeight, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { extractMerchantMetadata } from '@/services/profileService';

const metadataString = (metadata: unknown, key: string): string | null => {
  if (!metadata || typeof metadata !== 'object') return null;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
};

const createHandle = (name: string) => {
  const slug = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 24);
  return `@${slug || 'merchant'}`;
};

const MerchantProfileScreen = () => {
  const router = useRouter();
  const { profile, session } = useAuth();
  const insets = useSafeAreaInsets();
  const metadata: unknown = session?.user?.user_metadata;
  const extracted = extractMerchantMetadata(metadata);

  const profileName = [profile?.first_name, profile?.last_name].filter((part): part is string => Boolean(part)).join(' ');
  const ownerName = extracted.contactPerson || profile?.full_name?.trim() || metadataString(metadata, 'full_name') || profileName || 'Merchant Account';
  const businessName = extracted.businessName || metadataString(metadata, 'business_name');
  const displayName = businessName || ownerName;

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <View style={styles.screen}>
        <ScrollView
          contentContainerStyle={{
            paddingBottom: insets.bottom + FloatingTabBarGap + FloatingTabBarHeight + Spacing.four,
          }}
          showsVerticalScrollIndicator={false}
        >
          <FadeInView delay={0}>
            <MerchantProfileContent
              businessName={businessName}
              fullName={ownerName}
              handle={createHandle(displayName)}
              onEditPress={() => router.push('/(merchant)/edit-profile' as never)}
            >
              {/* Edit Business Profile Action */}
              <Pressable
                accessibilityLabel="Edit Business Profile"
                accessibilityRole="button"
                onPress={() => router.push('/(merchant)/edit-profile' as never)}
                style={styles.actionRow}
              >
                <View style={styles.actionRowLeft}>
                  <View style={styles.actionIconWrap}>
                    <MaterialCommunityIcons color={BrandColors.navy} name="store-edit-outline" size={18} />
                  </View>
                  <View style={styles.actionTextWrap}>
                    <ThemedText style={styles.actionTitle}>Edit Business Profile</ThemedText>
                    <ThemedText style={styles.actionSubtitle}>
                      Business name, owner, address, contacts & credentials
                    </ThemedText>
                  </View>
                </View>
                <FontAwesome color={BrandColors.grey} name="chevron-right" size={14} />
              </Pressable>

              {/* Wallet & Recovery */}
              <Pressable
                accessibilityLabel="Wallet and recovery settings"
                accessibilityRole="button"
                onPress={() => router.push('/(merchant)/wallet-recovery' as never)}
                style={styles.actionRow}
              >
                <View style={styles.actionRowLeft}>
                  <View style={styles.actionIconWrap}>
                    <FontAwesome color={BrandColors.navy} name="refresh" size={16} />
                  </View>
                  <View style={styles.actionTextWrap}>
                    <ThemedText style={styles.actionTitle}>Wallet & recovery</ThemedText>
                    <ThemedText style={styles.actionSubtitle}>
                      Replace a lost signer and activate settlement
                    </ThemedText>
                  </View>
                </View>
                <FontAwesome color={BrandColors.grey} name="chevron-right" size={14} />
              </Pressable>

              {/* Security & MFA */}
              <Pressable
                accessibilityLabel="Security and MFA settings"
                accessibilityRole="button"
                onPress={() => router.push('/(merchant)/security' as never)}
                style={styles.actionRow}
              >
                <View style={styles.actionRowLeft}>
                  <View style={styles.actionIconWrap}>
                    <FontAwesome color={BrandColors.navy} name="shield" size={16} />
                  </View>
                  <View style={styles.actionTextWrap}>
                    <ThemedText style={styles.actionTitle}>Security & MFA</ThemedText>
                    <ThemedText style={styles.actionSubtitle}>
                      Authenticator and step-up for financial actions
                    </ThemedText>
                  </View>
                </View>
                <FontAwesome color={BrandColors.grey} name="chevron-right" size={14} />
              </Pressable>
            </MerchantProfileContent>
          </FadeInView>
        </ScrollView>
        <MerchantBottomNavigation active="profile" />
      </View>
    </SafeAreaView>
  );
};

export default MerchantProfileScreen;

const styles = StyleSheet.create({
  safeArea: { backgroundColor: '#FFFFFF', flex: 1 },
  screen: { flex: 1 },
  actionRow: {
    alignItems: 'center',
    backgroundColor: BrandColors.lightGray,
    borderRadius: BorderRadius.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: Spacing.three,
  },
  actionRowLeft: { alignItems: 'center', columnGap: 12, flex: 1, flexDirection: 'row', marginRight: Spacing.two },
  actionIconWrap: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.full,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  actionTextWrap: {
    flex: 1,
  },
  actionTitle: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14 },
  actionSubtitle: { color: BrandColors.grey, fontFamily: 'PlusJakartaSans_400Regular', fontSize: 12, marginTop: 2 },
});

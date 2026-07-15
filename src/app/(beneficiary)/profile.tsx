import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LogoHeader } from '@/components/LogoHeader/LogoHeader';
import { ProfileDetailRow } from '@/components/beneficiary/Profile/profile-detail-row';
import { ProfileHeader } from '@/components/beneficiary/Profile/profile-header';
import { QrModal } from '@/components/beneficiary/shared/qr-modal';
import { LogoutButton } from '@/components/shared/LogoutButton';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BorderRadius, BottomTabInset, BrandColors, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useStellarWallet } from '@/hooks/use-stellar-wallet';
import { FontAwesome } from '@expo/vector-icons';
import { useState } from 'react';

export default function ProfileScreen() {
  const { wallet } = useStellarWallet();
  const { profile, session } = useAuth();
  const [isQrVisible, setIsQrVisible] = useState(false);

  const mobileNumber = typeof session?.user?.user_metadata?.mobile_number === 'string'
    ? session.user.user_metadata.mobile_number
    : 'Not set';

  const truncatedWallet = wallet?.publicKey
    ? `${wallet.publicKey.slice(0, 6)}...${wallet.publicKey.slice(-6)}`
    : 'Loading...';

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <LogoHeader />

          <ProfileHeader fullName={profile?.full_name ?? null} />

          <View style={styles.panel}>
            <ProfileDetailRow iconName="id-card" label="Government ID" value={profile?.gov_id || 'Not verified'} />
            <ProfileDetailRow iconName="link" label="Stellar Wallet Address" value={truncatedWallet} />
            <ProfileDetailRow iconName="phone" label="Mobile Number" value={mobileNumber} />

            <Pressable onPress={() => setIsQrVisible(true)} style={styles.qrButton}>
              <FontAwesome color="white" name="qrcode" size={16} />
              <ThemedText style={styles.qrButtonText}>Show my QR</ThemedText>
            </Pressable>
          </View>

          <LogoutButton />
        </ScrollView>
      </SafeAreaView>

      <QrModal onClose={() => setIsQrVisible(false)} publicKey={wallet?.publicKey} visible={isQrVisible} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFC',
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.six,
  },
  panel: {
    backgroundColor: 'white',
    borderRadius: BorderRadius.lg,
    padding: Spacing.four,
    marginBottom: Spacing.four,
    boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
  },
  qrButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    columnGap: 8,
    backgroundColor: BrandColors.green,
    borderRadius: BorderRadius.full,
    paddingVertical: 12,
    marginTop: Spacing.two,
  },
  qrButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
});

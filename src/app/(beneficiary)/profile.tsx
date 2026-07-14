import { LogoutButton } from '@/components/shared/LogoutButton';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BorderRadius, BottomTabInset, BrandColors, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useStellarWallet } from '@/hooks/use-stellar-wallet';
import { FontAwesome } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ProfileScreen() {
  const { wallet } = useStellarWallet();
  const { profile } = useAuth();

  const handleCopy = async () => {
    if (wallet?.publicKey) {
      await Clipboard.setStringAsync(wallet.publicKey);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <ThemedText style={styles.title}>Profile</ThemedText>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.card}>
            <View style={styles.avatarPlaceholder}>
              <FontAwesome name="user" size={40} color="white" />
            </View>
            <ThemedText style={styles.name}>{profile?.full_name || 'Loading...'}</ThemedText>
            
            <View style={styles.verifiedBadge}>
              <FontAwesome name="check-circle" size={14} color={BrandColors.green} />
              <ThemedText style={styles.verifiedText}>Verified Beneficiary</ThemedText>
            </View>
          </View>

          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>Connected Wallet</ThemedText>
            <View style={styles.walletCard}>
              <View style={styles.walletInfo}>
                <ThemedText style={styles.walletLabel}>Stellar Address (Testnet)</ThemedText>
                <ThemedText style={styles.walletAddress} numberOfLines={1}>{wallet?.publicKey || 'Loading...'}</ThemedText>
              </View>
              <Pressable onPress={handleCopy} style={styles.copyButton}>
                <FontAwesome name="copy" size={20} color={BrandColors.navy} />
              </Pressable>
            </View>
          </View>
          
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>Personal Information</ThemedText>
            <View style={styles.infoCard}>
              <View style={styles.infoRow}>
                <ThemedText style={styles.infoLabel}>Location</ThemedText>
                <ThemedText style={styles.infoValue}>{profile?.location || 'Not set'}</ThemedText>
              </View>
              <View style={styles.infoRow}>
                <ThemedText style={styles.infoLabel}>Gov ID</ThemedText>
                <ThemedText style={styles.infoValue}>{profile?.gov_id || 'Not verified'}</ThemedText>
              </View>
            </View>
          </View>

          <LogoutButton />
        </ScrollView>
      </SafeAreaView>
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
  header: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.six,
    paddingBottom: Spacing.four,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: BrandColors.navy,
  },
  scrollContent: {
    paddingHorizontal: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.six,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: BorderRadius.lg,
    padding: Spacing.six,
    alignItems: 'center',
    marginBottom: Spacing.four,
    boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
  },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: BrandColors.lightGray,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.three,
  },
  name: {
    fontSize: 20,
    fontWeight: 'bold',
    color: BrandColors.navy,
    marginBottom: Spacing.one,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  verifiedText: {
    fontSize: 12,
    fontWeight: '600',
    color: BrandColors.green,
  },
  section: {
    marginBottom: Spacing.four,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: BrandColors.navy,
    marginBottom: Spacing.three,
  },
  walletCard: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderRadius: BorderRadius.lg,
    padding: Spacing.four,
    alignItems: 'center',
    boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
  },
  walletInfo: {
    flex: 1,
    marginRight: Spacing.three,
  },
  walletLabel: {
    fontSize: 12,
    color: BrandColors.grey,
    marginBottom: 4,
  },
  walletAddress: {
    fontSize: 13,
    color: BrandColors.navy,
    fontWeight: '500',
  },
  copyButton: {
    padding: Spacing.two,
  },
  infoCard: {
    backgroundColor: 'white',
    borderRadius: BorderRadius.lg,
    padding: Spacing.four,
    boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  infoLabel: {
    fontSize: 14,
    color: BrandColors.grey,
  },
  infoValue: {
    fontSize: 14,
    color: BrandColors.navy,
    fontWeight: '500',
  },
});

import React from 'react';
import { StyleSheet, View, Pressable, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { FontAwesome } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { ThemedText } from '@/components/themed-text';
import { BrandColors, Spacing, BorderRadius } from '@/constants/theme';
import { StellarWallet } from '@/types/wallet';

type Props = {
  wallet: StellarWallet | null;
  isLoading: boolean;
};

export function WalletBalanceCard({ wallet, isLoading }: Props) {
  const handleCopy = async () => {
    if (wallet?.publicKey) {
      await Clipboard.setStringAsync(wallet.publicKey);
    }
  };

  const truncateKey = (key: string) => {
    if (!key) return '';
    return `${key.slice(0, 5)}...${key.slice(-4)}`;
  };

  return (
    <LinearGradient
      colors={[BrandColors.navy, '#1a4b8c']}
      style={styles.card}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      <ThemedText style={styles.title}>Current Wallet Balance</ThemedText>
      
      {isLoading ? (
        <ActivityIndicator color="white" style={styles.loader} />
      ) : (
        <View style={styles.balanceContainer}>
          <ThemedText style={styles.xlmBalance}>{wallet?.xlmBalance || '0.00'} XLM</ThemedText>
          <ThemedText style={styles.fiatBalance}>≈ ₱{(Number(wallet?.xlmBalance || 0) * 5.6).toFixed(2)}</ThemedText>
        </View>
      )}

      {wallet?.isActivated === false && !isLoading && (
        <View style={styles.unfundedBadge}>
          <ThemedText style={styles.unfundedText}>Account Unfunded (Testnet)</ThemedText>
        </View>
      )}

      <View style={styles.footer}>
        <View style={styles.addressContainer}>
          <ThemedText style={styles.addressLabel}>Address:</ThemedText>
          <ThemedText style={styles.address}>{truncateKey(wallet?.publicKey || '')}</ThemedText>
        </View>
        <Pressable onPress={handleCopy} style={styles.copyButton}>
          <FontAwesome name="copy" size={16} color="white" />
        </Pressable>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.four,
    marginHorizontal: Spacing.four,
    marginBottom: Spacing.three,
  },
  title: {
    color: '#rgba(255,255,255,0.8)',
    fontSize: 14,
    marginBottom: Spacing.two,
  },
  loader: {
    marginVertical: Spacing.four,
    alignItems: 'flex-start',
  },
  balanceContainer: {
    marginBottom: Spacing.three,
  },
  xlmBalance: {
    color: 'white',
    fontSize: 32,
    fontWeight: 'bold',
  },
  fiatBalance: {
    color: BrandColors.green,
    fontSize: 16,
    fontWeight: '600',
    marginTop: 4,
  },
  unfundedBadge: {
    backgroundColor: '#rgba(231, 76, 60, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginBottom: Spacing.three,
  },
  unfundedText: {
    color: '#ffcccc',
    fontSize: 12,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#rgba(255,255,255,0.1)',
    padding: Spacing.two,
    borderRadius: BorderRadius.md,
  },
  addressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  addressLabel: {
    color: '#rgba(255,255,255,0.7)',
    fontSize: 12,
  },
  address: {
    color: 'white',
    fontSize: 14,
    fontWeight: '500',
  },
  copyButton: {
    padding: Spacing.one,
  },
});

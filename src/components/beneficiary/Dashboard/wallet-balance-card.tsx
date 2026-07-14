import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import { FontAwesome } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View } from 'react-native';

type Props = {
  voucherBalance: string; // e.g. "₱10,000.00", pre-formatted voucher-style total
  onWithdraw: () => void;
  onSend: () => void;
};

export function WalletBalanceCard({ voucherBalance, onWithdraw, onSend }: Props) {
  return (
    <LinearGradient
      colors={[BrandColors.green, '#4A90D9']}
      style={styles.card}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      <ThemedText style={styles.title}>Current Wallet Balance</ThemedText>
      <ThemedText style={styles.balance}>{voucherBalance}</ThemedText>

      <View style={styles.actionsRow}>
        <Pressable onPress={onWithdraw} style={styles.withdrawButton}>
          <FontAwesome name="credit-card" size={14} color="white" />
          <ThemedText style={styles.actionText}>Withdraw</ThemedText>
        </Pressable>
        <Pressable onPress={onSend} style={styles.sendButton}>
          <FontAwesome name="paper-plane" size={14} color="white" />
          <ThemedText style={styles.actionText}>Send</ThemedText>
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
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    marginBottom: Spacing.two,
  },
  balance: {
    color: 'white',
    fontSize: 30,
    fontWeight: 'bold',
    marginBottom: Spacing.three,
  },
  actionsRow: {
    flexDirection: 'row',
    columnGap: Spacing.two,
  },
  withdrawButton: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 6,
    backgroundColor: BrandColors.navy,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: BorderRadius.md,
  },
  sendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 6,
    backgroundColor: BrandColors.green,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: BorderRadius.md,
  },
  actionText: {
    color: 'white',
    fontSize: 13,
    fontWeight: '600',
  },
});

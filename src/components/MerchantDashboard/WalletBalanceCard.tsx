import { FontAwesome } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import type { StroopAmount } from '@/types/blockchain';
import { formatStroops } from '@/utils/format-stroops';

type WalletBalanceCardProps = {
  balance: StroopAmount;
  onWithdrawPress: () => void;
  onSyncPress?: () => void;
  isSyncing?: boolean;
  onSettlementsPress?: () => void;
};

export const WalletBalanceCard = ({
  balance,
  onWithdrawPress,
  onSyncPress,
  isSyncing = false,
  onSettlementsPress,
}: WalletBalanceCardProps) => (
  <LinearGradient colors={[BrandColors.green, '#6C97D4']} end={{ x: 0.65, y: 1 }} start={{ x: 0.3, y: 0 }} style={styles.card}>
    <View style={styles.topRow}>
      <ThemedText style={styles.label}>Wallet Balance</ThemedText>
      {onSyncPress && (
        <Pressable
          accessibilityLabel="Sync ledger settlements"
          accessibilityRole="button"
          disabled={isSyncing}
          onPress={onSyncPress}
          style={[styles.syncButton, isSyncing && styles.syncButtonDisabled]}
        >
          {isSyncing ? (
            <ActivityIndicator color="#FFFFFF" size={9} />
          ) : (
            <FontAwesome color="#FFFFFF" name="refresh" size={10} />
          )}
          <ThemedText style={styles.syncText}>{isSyncing ? 'Syncing…' : 'Sync Ledger'}</ThemedText>
        </Pressable>
      )}
    </View>
    <ThemedText style={styles.balance}>{formatStroops(balance, { minimumFractionDigits: 2 })} RCPHP</ThemedText>
    <View style={styles.actions}>
      <Pressable accessibilityRole="button" onPress={onWithdrawPress} style={[styles.action, styles.withdraw]}>
        <FontAwesome color="#FFFFFF" name="bank" size={11} /><ThemedText style={styles.actionText}>Withdraw</ThemedText>
      </Pressable>
      {onSettlementsPress && (
        <Pressable accessibilityRole="button" onPress={onSettlementsPress} style={[styles.action, styles.settlements]}>
          <FontAwesome color="#FFFFFF" name="list" size={11} /><ThemedText style={styles.actionText}>Settlements</ThemedText>
        </Pressable>
      )}
    </View>
  </LinearGradient>
);

const styles = StyleSheet.create({
  card: { borderRadius: BorderRadius.xl, minHeight: 103, padding: Spacing.three },
  topRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  label: { color: '#FFFFFF', fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13 },
  syncButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    borderRadius: BorderRadius.full,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: Spacing.two,
    paddingVertical: 3,
  },
  syncButtonDisabled: { opacity: 0.7 },
  syncText: { color: '#FFFFFF', fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 9 },
  balance: { color: '#FFFFFF', fontFamily: 'PlusJakartaSans_700Bold', fontSize: 23, lineHeight: 30, marginTop: Spacing.one },
  actions: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.three },
  action: { alignItems: 'center', borderRadius: BorderRadius.md, flexDirection: 'row', gap: 4, height: 22, justifyContent: 'center', paddingHorizontal: Spacing.two },
  withdraw: { backgroundColor: BrandColors.navy },
  settlements: { backgroundColor: BrandColors.green },
  actionText: { color: '#FFFFFF', fontFamily: 'PlusJakartaSans_700Bold', fontSize: 8 },
});

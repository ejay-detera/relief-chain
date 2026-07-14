import { FontAwesome } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';

type WalletBalanceCardProps = { onSettlementsPress: () => void; onWithdrawPress: () => void };

export const WalletBalanceCard = ({ onSettlementsPress, onWithdrawPress }: WalletBalanceCardProps) => (
  <LinearGradient colors={[BrandColors.green, '#6C97D4']} end={{ x: 0.65, y: 1 }} start={{ x: 0.3, y: 0 }} style={styles.card}>
    <ThemedText style={styles.label}>Wallet Balance</ThemedText>
    <ThemedText style={styles.balance}>₱24,500.00</ThemedText>
    <View style={styles.actions}>
      <Pressable accessibilityRole="button" onPress={onWithdrawPress} style={[styles.action, styles.withdraw]}>
        <FontAwesome color="#FFFFFF" name="bank" size={11} /><ThemedText style={styles.actionText}>Withdraw</ThemedText>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={onSettlementsPress} style={[styles.action, styles.settlements]}>
        <FontAwesome color="#FFFFFF" name="list" size={11} /><ThemedText style={styles.actionText}>Settlements</ThemedText>
      </Pressable>
    </View>
  </LinearGradient>
);

const styles = StyleSheet.create({
  card: { borderRadius: BorderRadius.xl, minHeight: 103, padding: Spacing.three },
  label: { color: '#FFFFFF', fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13 },
  balance: { color: '#FFFFFF', fontFamily: 'PlusJakartaSans_700Bold', fontSize: 23, lineHeight: 30, marginTop: Spacing.one },
  actions: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.three },
  action: { alignItems: 'center', borderRadius: BorderRadius.md, flexDirection: 'row', gap: 4, height: 22, justifyContent: 'center', paddingHorizontal: Spacing.two },
  withdraw: { backgroundColor: BrandColors.navy },
  settlements: { backgroundColor: BrandColors.green },
  actionText: { color: '#FFFFFF', fontFamily: 'PlusJakartaSans_700Bold', fontSize: 8 },
});

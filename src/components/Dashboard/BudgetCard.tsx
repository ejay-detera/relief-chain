import { FontAwesome } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import { useOrganizationTreasury, type TreasuryBalances } from '@/hooks/use-organization-treasury';

export type BudgetCardProps = {
  balances?: TreasuryBalances | null;
  isLoading?: boolean;
  onSyncPress?: () => void;
  isSyncing?: boolean;
};

export const BudgetCard = ({
  balances: propBalances,
  isLoading: propIsLoading,
  onSyncPress,
  isSyncing = false,
}: BudgetCardProps = {}) => {
  const treasuryHook = useOrganizationTreasury();
  const balances = propBalances !== undefined ? propBalances : treasuryHook.balances;
  const isLoading = propIsLoading !== undefined ? propIsLoading : treasuryHook.isLoading;

  const formatRCPHP = (stroops: bigint) => {
    const value = Number(stroops) / 10000000;
    return `${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} RCPHP`;
  };

  const total = balances ? formatRCPHP(balances.totalStroops) : '0.00 RCPHP';
  const reserved = balances ? formatRCPHP(balances.reservedStroops) : '0.00 RCPHP';
  const available = balances ? formatRCPHP(balances.availableStroops) : '0.00 RCPHP';

  return (
    <LinearGradient
      colors={[BrandColors.green, BrandColors.budgetGradientEnd]}
      style={styles.container}>
      <View style={styles.topRow}>
        <ThemedText style={styles.title}>Total Program Budget</ThemedText>
        {onSyncPress && (
          <Pressable
            accessibilityLabel="Reconcile Stellar ledger"
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
            <ThemedText style={styles.syncText}>{isSyncing ? 'Syncing…' : 'Reconcile'}</ThemedText>
          </Pressable>
        )}
      </View>
      <ThemedText style={styles.amount}>{isLoading ? 'Loading...' : total}</ThemedText>

      <View style={styles.badgesContainer}>
        <View style={styles.badge}>
          <ThemedText style={styles.badgeTitle}>Reserved</ThemedText>
          <ThemedText style={styles.badgeValue}>{isLoading ? '-' : reserved}</ThemedText>
        </View>
        <View style={styles.badge}>
          <ThemedText style={styles.badgeTitle}>Available</ThemedText>
          <ThemedText style={styles.badgeValue}>{isLoading ? '-' : available}</ThemedText>
        </View>
      </View>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 20,
    padding: Spacing.four,
    marginHorizontal: Spacing.four,
    marginTop: Spacing.three,
    marginBottom: Spacing.four,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.half,
  },
  title: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },
  syncButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    borderRadius: BorderRadius.full,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: Spacing.two,
    paddingVertical: 3,
  },
  syncButtonDisabled: {
    opacity: 0.7,
  },
  syncText: {
    color: '#FFFFFF',
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 9,
  },
  amount: {
    color: 'white',
    fontSize: 30,
    fontWeight: '700',
    marginBottom: Spacing.four,
  },
  badgesContainer: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  badge: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderColor: 'rgba(151, 151, 151, 0.2)',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 12,
    minWidth: 80,
  },
  badgeTitle: {
    color: 'white',
    fontSize: 10,
    fontWeight: '600',
  },
  badgeValue: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
});

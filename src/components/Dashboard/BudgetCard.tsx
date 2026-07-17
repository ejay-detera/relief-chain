import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { View, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BrandColors, Spacing } from '@/constants/theme';
import { useOrganizationTreasury } from '@/hooks/use-organization-treasury';

export const BudgetCard = () => {
  const { balances, isLoading } = useOrganizationTreasury();

  const formatRCPHP = (stroops: bigint) => {
    const value = Number(stroops) / 10000000;
    return `₱${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const total = balances ? formatRCPHP(balances.totalStroops) : '₱0.00';
  const reserved = balances ? formatRCPHP(balances.reservedStroops) : '₱0.00';
  const available = balances ? formatRCPHP(balances.availableStroops) : '₱0.00';

  return (
    <LinearGradient
      colors={[BrandColors.green, BrandColors.budgetGradientEnd]}
      style={styles.container}>
      <ThemedText style={styles.title}>Total Program Budget</ThemedText>
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
  title: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: Spacing.half,
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

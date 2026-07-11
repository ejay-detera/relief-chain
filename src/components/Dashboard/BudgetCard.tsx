import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { View, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BrandColors, Spacing } from '@/constants/theme';

export const BudgetCard = () => {
  return (
    <LinearGradient
      colors={[BrandColors.green, BrandColors.budgetGradientEnd]}
      style={styles.container}>
      <ThemedText style={styles.title}>Total Program Budget</ThemedText>
      <ThemedText style={styles.amount}>₱8,500,000.00</ThemedText>

      <View style={styles.badgesContainer}>
        <View style={styles.badge}>
          <ThemedText style={styles.badgeTitle}>Reserved</ThemedText>
          <ThemedText style={styles.badgeValue}>₱6.5 M</ThemedText>
        </View>
        <View style={styles.badge}>
          <ThemedText style={styles.badgeTitle}>Available</ThemedText>
          <ThemedText style={styles.badgeValue}>₱2.0 M</ThemedText>
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

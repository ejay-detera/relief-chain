import React from 'react';
import { StyleSheet, View } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';
import { BrandColors, Spacing, BorderRadius } from '@/constants/theme';

type Props = {
  totalAmount: string; // e.g. "₱6,500"
};

export function AvailableAssistanceBanner({ totalAmount }: Props) {
  return (
    <View style={styles.banner}>
      <View style={styles.iconContainer}>
        <FontAwesome name="check-circle" size={20} color="white" />
      </View>
      <View style={styles.textContainer}>
        <ThemedText style={styles.label}>Available Assistance</ThemedText>
        <ThemedText style={styles.amount}>{totalAmount}</ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    backgroundColor: '#E8F5E9',
    borderRadius: BorderRadius.md,
    padding: Spacing.three,
    marginHorizontal: Spacing.four,
    marginBottom: Spacing.three,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#C8E6C9',
  },
  iconContainer: {
    backgroundColor: BrandColors.green,
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.three,
  },
  textContainer: {
    flex: 1,
  },
  label: {
    color: BrandColors.navy,
    fontSize: 12,
    fontWeight: '600',
  },
  amount: {
    color: BrandColors.green,
    fontSize: 18,
    fontWeight: 'bold',
  },
});

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { BrandColors } from '@/constants/theme';

type Props = {
  category: 'Food' | 'Medicine' | 'School Supplies' | 'Cash';
};

export function VoucherCategoryBadge({ category }: Props) {
  const getColors = () => {
    switch (category) {
      case 'Food': return { bg: '#E8F5E9', text: BrandColors.green };
      case 'Medicine': return { bg: '#FFEBEE', text: '#E74C3C' };
      case 'School Supplies': return { bg: '#E3F2FD', text: '#3498DB' };
      case 'Cash': return { bg: '#E8EAF6', text: BrandColors.navy };
      default: return { bg: '#f5f5f5', text: BrandColors.grey };
    }
  };

  const colors = getColors();

  return (
    <View style={[styles.badge, { backgroundColor: colors.bg }]}>
      <ThemedText style={[styles.text, { color: colors.text }]}>{category}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  text: {
    fontSize: 10,
    fontWeight: '600',
  },
});

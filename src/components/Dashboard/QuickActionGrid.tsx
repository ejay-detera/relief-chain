import { FontAwesome } from '@expo/vector-icons';
import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BrandColors, Spacing } from '@/constants/theme';
import { QuickAction } from '@/types/dashboard';

type QuickActionGridProps = {
  actions: QuickAction[];
};

export const QuickActionGrid = ({ actions }: QuickActionGridProps) => {
  return (
    <View style={styles.gridContainer}>
      {actions.map((action) => (
        <Pressable
          key={action.id}
          style={styles.card}
          onPress={action.onPress}>
          <View style={styles.iconCircle}>
            <FontAwesome name={action.iconName} size={24} color="white" />
          </View>
          <ThemedText style={styles.label}>{action.label}</ThemedText>
        </Pressable>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
    justifyContent: 'space-between',
    marginBottom: Spacing.five,
  },
  card: {
    backgroundColor: 'white',
    width: '47%',
    height: 140,
    borderRadius: 10,
    padding: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 15,
    elevation: 3,
    borderWidth: 1,
    borderColor: 'rgba(151, 151, 151, 0.2)',
  },
  iconCircle: {
    width: 65,
    height: 65,
    borderRadius: 32.5,
    backgroundColor: BrandColors.navy,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.three,
  },
  label: {
    color: BrandColors.navy,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
});

import { FontAwesome } from '@expo/vector-icons';
import React from 'react';
import { View, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BrandColors, Spacing } from '@/constants/theme';
import { ActivityItem } from '@/types/dashboard';

type ActivityRowProps = {
  item: ActivityItem;
};

export const ActivityRow = ({ item }: ActivityRowProps) => {
  const isPerson = item.avatarVariant === 'person';
  
  return (
    <View style={styles.card}>
      <View style={styles.avatarCircle}>
        <FontAwesome 
          name={isPerson ? 'user' : 'money'} 
          size={24} 
          color={isPerson ? BrandColors.navy : BrandColors.yellow} 
        />
      </View>
      <View style={styles.textContainer}>
        <ThemedText style={styles.actionText}>{item.action}</ThemedText>
        <ThemedText style={styles.timestamp}>{item.timestamp}</ThemedText>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderWidth: 0.5,
    borderColor: 'rgba(151,151,151,0.5)',
    borderRadius: 20,
    padding: Spacing.three,
    marginHorizontal: Spacing.four,
    marginBottom: Spacing.three,
  },
  avatarCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#F0F0F3', // Light grey approx
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.three,
  },
  textContainer: {
    flex: 1,
  },
  actionText: {
    color: '#0D1282', // slightly different navy in Figma for activity
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  timestamp: {
    color: BrandColors.navy,
    fontSize: 10,
  },
});

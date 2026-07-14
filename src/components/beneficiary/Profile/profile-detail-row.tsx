import { FontAwesome } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';

type Props = {
  iconName: React.ComponentProps<typeof FontAwesome>['name'];
  label: string;
  value: string;
};

export function ProfileDetailRow({ iconName, label, value }: Props) {
  return (
    <View style={styles.row}>
      <FontAwesome color={BrandColors.grey} name={iconName} size={16} style={styles.icon} />
      <View style={styles.textContainer}>
        <ThemedText style={styles.label}>{label}</ThemedText>
        <ThemedText numberOfLines={1} style={styles.value}>{value}</ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(17, 46, 88, 0.06)',
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    marginBottom: Spacing.two,
  },
  icon: {
    marginRight: Spacing.three,
  },
  textContainer: {
    flex: 1,
  },
  label: {
    fontSize: 10,
    color: BrandColors.grey,
  },
  value: {
    fontSize: 13,
    color: BrandColors.navy,
    fontWeight: '600',
  },
});

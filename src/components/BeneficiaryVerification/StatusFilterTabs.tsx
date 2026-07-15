import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BrandColors, Spacing } from '@/constants/theme';

export type FilterStatus = 'All' | 'Pending' | 'Verified' | 'Rejected';

type Props = {
  selected: FilterStatus;
  onSelect: (status: FilterStatus) => void;
};

export const StatusFilterTabs = ({ selected, onSelect }: Props) => {
  const statuses: FilterStatus[] = ['All', 'Pending', 'Verified', 'Rejected'];

  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {statuses.map((status) => {
          const isSelected = selected === status;
          return (
            <Pressable
              key={status}
              onPress={() => onSelect(status)}
              style={[styles.tab, isSelected && styles.tabActive]}
            >
              <ThemedText style={[styles.tabText, isSelected && styles.tabTextActive]}>
                {status}
              </ThemedText>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BrandColors.lightGray,
    backgroundColor: 'white',
  },
  scroll: {
    paddingHorizontal: Spacing.four,
    gap: Spacing.two,
  },
  tab: {
    paddingHorizontal: Spacing.four,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
  },
  tabActive: {
    backgroundColor: BrandColors.navy,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: BrandColors.grey,
  },
  tabTextActive: {
    color: 'white',
  },
});

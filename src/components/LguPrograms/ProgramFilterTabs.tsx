import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BrandColors, BorderRadius, Spacing } from '@/constants/theme';

export type ProgramFilterType = 'All' | 'Active' | 'Scheduled' | 'Completed';

interface ProgramFilterTabsProps {
  selectedTab: ProgramFilterType;
  onChangeTab: (tab: ProgramFilterType) => void;
}

export const ProgramFilterTabs = ({ selectedTab, onChangeTab }: ProgramFilterTabsProps) => {
  const tabs: ProgramFilterType[] = ['All', 'Active', 'Scheduled', 'Completed'];

  return (
    <View style={styles.tabContainer}>
      {tabs.map((tab) => {
        const isActive = selectedTab === tab;
        return (
          <TouchableOpacity
            key={tab}
            style={[styles.tabButton, isActive && styles.activeTabButton]}
            onPress={() => onChangeTab(tab)}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, isActive && styles.activeTabText]}>
              {tab}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  tabContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: BrandColors.lightGray,
  },
  tabButton: {
    paddingVertical: 6,
    paddingHorizontal: Spacing.three,
    borderRadius: BorderRadius.full,
    marginRight: Spacing.two,
    backgroundColor: 'transparent',
  },
  activeTabButton: {
    backgroundColor: BrandColors.lightGray,
  },
  tabText: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#8E9AA8', // Muted text
  },
  activeTabText: {
    color: BrandColors.navy,
  },
});

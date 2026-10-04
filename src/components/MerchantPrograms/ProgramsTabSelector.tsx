import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';

type Props = {
  activeTab: 'accepted' | 'available';
  onTabChange: (tab: 'accepted' | 'available') => void;
  acceptedCount: number;
  availableCount: number;
};

export const ProgramsTabSelector = ({
  activeTab,
  onTabChange,
  acceptedCount,
  availableCount,
}: Props) => {
  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="tab"
        accessibilityState={{ selected: activeTab === 'accepted' }}
        onPress={() => onTabChange('accepted')}
        style={[styles.tab, activeTab === 'accepted' && styles.activeTab]}
      >
        <ThemedText style={[styles.tabText, activeTab === 'accepted' && styles.activeTabText]}>
          Accepted Programs
        </ThemedText>
        <View style={[styles.badge, activeTab === 'accepted' && styles.activeBadge]}>
          <Text style={[styles.badgeText, activeTab === 'accepted' && styles.activeBadgeText]}>
            {acceptedCount}
          </Text>
        </View>
      </Pressable>

      <Pressable
        accessibilityRole="tab"
        accessibilityState={{ selected: activeTab === 'available' }}
        onPress={() => onTabChange('available')}
        style={[styles.tab, activeTab === 'available' && styles.activeTab]}
      >
        <ThemedText style={[styles.tabText, activeTab === 'available' && styles.activeTabText]}>
          Available to Apply
        </ThemedText>
        <View style={[styles.badge, activeTab === 'available' && styles.activeBadge]}>
          <Text style={[styles.badgeText, activeTab === 'available' && styles.activeBadgeText]}>
            {availableCount}
          </Text>
        </View>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#F3F4F6',
    borderRadius: BorderRadius.lg,
    flexDirection: 'row',
    marginBottom: Spacing.three,
    padding: 4,
  },
  tab: {
    alignItems: 'center',
    borderRadius: BorderRadius.md,
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: Spacing.two,
    gap: Spacing.one,
  },
  activeTab: {
    backgroundColor: '#FFFFFF',
    elevation: 2,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  tabText: {
    color: BrandColors.grey,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
  },
  activeTabText: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_700Bold',
  },
  badge: {
    backgroundColor: '#E5E7EB',
    borderRadius: BorderRadius.full,
    minWidth: 20,
    paddingHorizontal: 6,
    paddingVertical: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeBadge: {
    backgroundColor: BrandColors.navy,
  },
  badgeText: {
    color: BrandColors.grey,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 10,
  },
  activeBadgeText: {
    color: '#FFFFFF',
  },
});

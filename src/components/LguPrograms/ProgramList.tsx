import React from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { BrandColors, Spacing } from '@/constants/theme';
import { ProgramCard, ProgramItem, resolveProgramStatus } from './ProgramCard';
import { ProgramFilterType } from './ProgramFilterTabs';

interface ProgramListProps {
  programs: ProgramItem[];
  selectedTab: ProgramFilterType;
  onCardPress: (program: ProgramItem) => void;
  onOpenMenu: (program: ProgramItem) => void;
  refreshing: boolean;
  onRefresh: () => void;
}

export const ProgramList = ({
  programs,
  selectedTab,
  onCardPress,
  onOpenMenu,
  refreshing,
  onRefresh,
}: ProgramListProps) => {
  // Filter programs based on selectedTab
  const filteredPrograms = programs.filter((program) => {
    const status = resolveProgramStatus(program.status, program.startDate);
    if (selectedTab === 'All') return true;
    return status.toLowerCase() === selectedTab.toLowerCase();
  });

  const getEmptyStateText = () => {
    switch (selectedTab) {
      case 'Active':
        return {
          title: 'No Active Programs',
          subtitle: 'There are no programs currently active.',
        };
      case 'Scheduled':
        return {
          title: 'No Scheduled Programs',
          subtitle: 'There are no future programs scheduled.',
        };
      case 'Completed':
        return {
          title: 'No Completed Programs',
          subtitle: 'No programs have been completed yet.',
        };
      default:
        return {
          title: 'No Programs Found',
          subtitle: 'Click the button below to create your first aid program.',
        };
    }
  };

  const emptyState = getEmptyStateText();

  return (
    <FlatList
      data={filteredPrograms}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <ProgramCard
          program={item}
          onPress={onCardPress}
          onOpenMenu={onOpenMenu}
        />
      )}
      contentContainerStyle={styles.listContainer}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={[BrandColors.green]}
          tintColor={BrandColors.green}
        />
      }
      ListEmptyComponent={
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>📦</Text>
          <Text style={styles.emptyTitle}>{emptyState.title}</Text>
          <Text style={styles.emptySubtitle}>{emptyState.subtitle}</Text>
        </View>
      }
    />
  );
};

const styles = StyleSheet.create({
  listContainer: {
    padding: Spacing.four,
    paddingBottom: 120, // ensure FAB is not blocking
  },
  emptyContainer: {
    padding: Spacing.six,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginTop: Spacing.six,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: Spacing.three,
    textAlign: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: BrandColors.navy,
    marginBottom: Spacing.one,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: '#8E9AA8',
    textAlign: 'center',
    lineHeight: 20,
  },
});

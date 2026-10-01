import React from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import { ApplicationStatusDetails } from '@/types/application-status';

interface Props {
  applications: ApplicationStatusDetails[];
  selectedEnrollmentId?: string;
  onSelectApplication: (item: ApplicationStatusDetails) => void;
}

export function ApplicationStatusList({
  applications,
  selectedEnrollmentId,
  onSelectApplication,
}: Props) {
  if (applications.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <FontAwesome name="file-text-o" size={40} color={BrandColors.grey} />
        <ThemedText style={styles.emptyTitle}>No Applications Found</ThemedText>
        <ThemedText style={styles.emptySubtitle}>
          You have not submitted any assistance applications yet.
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ThemedText style={styles.heading}>Your Applications</ThemedText>
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={applications}
        keyExtractor={(item) => item.enrollmentId}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const isSelected = item.enrollmentId === selectedEnrollmentId;
          const isRejected = item.approvalStatus === 'Rejected';
          const isApproved = item.approvalStatus === 'Approved';

          return (
            <Pressable
              style={[
                styles.itemChip,
                isSelected && styles.itemChipSelected,
              ]}
              onPress={() => onSelectApplication(item)}
            >
              <ThemedText
                style={[
                  styles.itemTitle,
                  isSelected && styles.itemTitleSelected,
                ]}
                numberOfLines={1}
              >
                {item.programName}
              </ThemedText>

              <View
                style={[
                  styles.badge,
                  isApproved && styles.badgeApproved,
                  isRejected && styles.badgeRejected,
                  !isApproved && !isRejected && styles.badgePending,
                ]}
              >
                <ThemedText
                  style={[
                    styles.badgeText,
                    isApproved && styles.badgeTextApproved,
                    isRejected && styles.badgeTextRejected,
                    !isApproved && !isRejected && styles.badgeTextPending,
                  ]}
                >
                  {item.currentStageLabel}
                </ThemedText>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.four,
  },
  heading: {
    fontSize: 14,
    fontWeight: '700',
    color: BrandColors.navy,
    marginBottom: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  listContent: {
    paddingHorizontal: Spacing.four,
    columnGap: Spacing.two,
  },
  itemChip: {
    backgroundColor: 'white',
    borderRadius: BorderRadius.md,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    minWidth: 140,
    maxWidth: 200,
  },
  itemChipSelected: {
    borderColor: BrandColors.navy,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
  },
  itemTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2D3748',
    marginBottom: 6,
  },
  itemTitleSelected: {
    color: BrandColors.navy,
    fontWeight: '700',
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  badgeApproved: {
    backgroundColor: '#E8F5E9',
  },
  badgePending: {
    backgroundColor: '#FFF8E1',
  },
  badgeRejected: {
    backgroundColor: '#FDE8E8',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  badgeTextApproved: {
    color: BrandColors.green,
  },
  badgeTextPending: {
    color: '#B8860B',
  },
  badgeTextRejected: {
    color: '#D9383A',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.six,
    backgroundColor: 'white',
    borderRadius: BorderRadius.lg,
    marginHorizontal: Spacing.four,
    marginBottom: Spacing.four,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: BrandColors.navy,
    marginTop: Spacing.two,
  },
  emptySubtitle: {
    fontSize: 12,
    color: BrandColors.grey,
    textAlign: 'center',
    marginTop: 4,
  },
});

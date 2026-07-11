import { FontAwesome } from '@expo/vector-icons';
import React from 'react';
import { View, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BrandColors, Spacing } from '@/constants/theme';
import { Program } from '@/types/dashboard';

type ProgramCardProps = {
  program: Program;
};

export const ProgramCard = ({ program }: ProgramCardProps) => {
  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <ThemedText style={styles.title}>{program.title}</ThemedText>
        <FontAwesome name="external-link" size={16} color={BrandColors.navy} />
      </View>
      
      <View style={styles.badge}>
        <ThemedText style={styles.badgeText}>{program.status}</ThemedText>
      </View>
      
      <View style={styles.progressRow}>
        <ThemedText style={styles.progressLabel}>Program Completion</ThemedText>
        <ThemedText style={styles.progressPercent}>{program.completion} %</ThemedText>
      </View>
      
      <View style={styles.progressBarContainer}>
        <View style={[styles.progressFill, { width: `${program.completion}%` }]} />
      </View>
      
      <View style={styles.statsContainer}>
        <View style={styles.statRow}>
          <View style={styles.iconCircle}>
            <FontAwesome name="dollar" size={14} color="white" />
          </View>
          <View>
            <ThemedText style={styles.statLabel}>Budget Utilized</ThemedText>
            <ThemedText style={styles.statValue}>{program.budgetUsed} / {program.budgetTotal}</ThemedText>
          </View>
        </View>

        <View style={styles.statRow}>
          <View style={styles.iconCircle}>
            <FontAwesome name="users" size={14} color="white" />
          </View>
          <View>
            <ThemedText style={styles.statLabel}>Served</ThemedText>
            <ThemedText style={styles.statValue}>{program.served}</ThemedText>
          </View>
        </View>

        <View style={styles.statRow}>
          <View style={styles.iconCircle}>
            <FontAwesome name="calendar" size={14} color="white" />
          </View>
          <View>
            <ThemedText style={styles.statLabel}>Est. Completion</ThemedText>
            <ThemedText style={styles.statValue}>{program.estCompletion}</ThemedText>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: Spacing.four,
    marginHorizontal: Spacing.four,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 15,
    elevation: 3,
    marginBottom: Spacing.four,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.two,
  },
  title: {
    color: BrandColors.navy,
    fontSize: 16,
    fontWeight: '500',
    maxWidth: '80%',
  },
  badge: {
    backgroundColor: BrandColors.yellow,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    alignSelf: 'flex-start',
    marginBottom: Spacing.three,
  },
  badgeText: {
    color: BrandColors.navy,
    fontSize: 10,
    fontWeight: '700',
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.two,
  },
  progressLabel: {
    color: BrandColors.grey,
    fontSize: 12,
  },
  progressPercent: {
    color: BrandColors.green,
    fontSize: 12,
    fontWeight: '800',
  },
  progressBarContainer: {
    height: 12,
    backgroundColor: BrandColors.grey,
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: Spacing.four,
  },
  progressFill: {
    height: '100%',
    backgroundColor: BrandColors.green,
  },
  statsContainer: {
    gap: Spacing.three,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  iconCircle: {
    width: 35,
    height: 35,
    borderRadius: 17.5,
    backgroundColor: '#A5D6A7', // Light green as seen in Figma approx
    alignItems: 'center',
    justifyContent: 'center',
  },
  statLabel: {
    color: BrandColors.navy,
    fontSize: 13,
  },
  statValue: {
    color: BrandColors.navy,
    fontSize: 10,
    fontWeight: '600',
  },
});

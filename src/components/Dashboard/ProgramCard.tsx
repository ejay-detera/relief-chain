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
        <ThemedText style={styles.progressLabel}>Program Progress</ThemedText>
        <ThemedText style={styles.progressPercent}>{program.completion} %</ThemedText>
      </View>
      
      <View style={styles.progressBarContainer}>
        <View style={[styles.progressFill, { width: `${program.completion}%` }]} />
      </View>

      {/* Stepper timeline tracker (ORG-06: monitoring program stages) */}
      <View style={styles.trackerRow}>
        {(['Created', 'Funded', 'Enrolling', 'Distributing', 'Completed'] as const).map((stage, idx) => {
          const isDone = program.completion >= (idx + 1) * 20 || program.status === 'Completed';
          const isCurrent = !isDone && (program.completion >= idx * 20 || idx === 0);
          return (
            <React.Fragment key={stage}>
              <View style={styles.stepCol}>
                <View
                  style={[
                    styles.stepDot,
                    isDone && styles.stepDotDone,
                    isCurrent && styles.stepDotCurrent,
                  ]}
                >
                  {isDone ? (
                    <FontAwesome name="check" size={7} color="white" />
                  ) : (
                    <View
                      style={[
                        styles.stepInnerDot,
                        isCurrent && styles.stepInnerDotCurrent,
                      ]}
                    />
                  )}
                </View>
                <ThemedText
                  style={[
                    styles.stepLabel,
                    isCurrent && styles.stepLabelCurrent,
                    isDone && styles.stepLabelDone,
                  ]}
                  numberOfLines={1}
                >
                  {stage}
                </ThemedText>
              </View>
              {idx < 4 && (
                <View
                  style={[
                    styles.stepLine,
                    isDone && styles.stepLineDone,
                  ]}
                />
              )}
            </React.Fragment>
          );
        })}
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
  trackerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.four,
    paddingHorizontal: 2,
  },
  stepCol: {
    alignItems: 'center',
    width: 48,
  },
  stepDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  stepDotDone: {
    backgroundColor: BrandColors.green,
  },
  stepDotCurrent: {
    backgroundColor: BrandColors.navy,
    borderWidth: 2,
    borderColor: '#D4E2F4',
  },
  stepInnerDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#94A3B8',
  },
  stepInnerDotCurrent: {
    backgroundColor: 'white',
  },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: '#CBD5E1',
    marginHorizontal: 2,
    marginBottom: 16,
  },
  stepLineDone: {
    backgroundColor: BrandColors.green,
  },
  stepLabel: {
    fontSize: 9,
    color: '#94A3B8',
    textAlign: 'center',
    fontWeight: '500',
  },
  stepLabelCurrent: {
    color: BrandColors.navy,
    fontWeight: '700',
  },
  stepLabelDone: {
    color: BrandColors.green,
    fontWeight: '600',
  },
});

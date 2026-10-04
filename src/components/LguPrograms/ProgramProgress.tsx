import React, { useEffect, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import { ProgramItem } from './ProgramCard';
import { ProgramProgressMetrics } from '@/types/program-progress';
import {
  computeProgramProgressMetrics,
  fetchProgramProgress,
  subscribeToProgramProgress,
} from '@/services/program-progress-service';

interface ProgramProgressProps {
  program: ProgramItem;
  initiallyExpanded?: boolean;
}

export function ProgramProgress({
  program,
  initiallyExpanded = false,
}: ProgramProgressProps) {
  const [liveMetrics, setLiveMetrics] = useState<ProgramProgressMetrics | null>(null);
  const [expanded, setExpanded] = useState(initiallyExpanded);

  // Fallback metrics computed purely from program props
  const metrics = liveMetrics ?? computeProgramProgressMetrics(program);

  // Sync state if program prop changes & perform async database query
  useEffect(() => {
    let isMounted = true;

    // Fetch live database counts
    fetchProgramProgress(program)
      .then((data) => {
        if (isMounted) setLiveMetrics(data);
      })
      .catch((err) => {
        console.warn('Could not fetch program progress metrics:', err);
      });

    // Subscribe to live Postgres changes on enrollments & distribution_jobs
    const unsubscribe = subscribeToProgramProgress(program.id, () => {
      fetchProgramProgress(program)
        .then((data) => {
          if (isMounted) setLiveMetrics(data);
        })
        .catch((err) => {
          console.warn('Realtime refresh error:', err);
        });
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [program]);

  const formatCurrency = (val: number) => {
    return `₱${val.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })}`;
  };

  const getStageBadgeStyle = (stage: string) => {
    switch (stage) {
      case 'completed':
        return { bg: '#E8F5E9', text: BrandColors.green };
      case 'distributing':
        return { bg: '#EBF4FF', text: '#2B6CB0' };
      case 'enrolling':
        return { bg: '#FFF8E1', text: '#B8860B' };
      case 'funded':
        return { bg: '#EDE9FE', text: '#6D28D9' };
      default:
        return { bg: '#F1F5F9', text: '#64748B' };
    }
  };

  const stageBadge = getStageBadgeStyle(metrics.currentStage);

  return (
    <View style={styles.container}>
      {/* Header Row: Section Title, Current Stage Badge, and Completion % */}
      <View style={styles.headerRow}>
        <View style={styles.titleWithBadge}>
          <Text style={styles.sectionTitle}>Program Progress</Text>
          <View style={[styles.stageBadge, { backgroundColor: stageBadge.bg }]}>
            <Text style={[styles.stageBadgeText, { color: stageBadge.text }]}>
              {metrics.currentStageLabel}
            </Text>
          </View>
        </View>

        <Text style={styles.progressPercent}>{metrics.distributionCompletionPercent}%</Text>
      </View>

      {/* Progress Bar */}
      <View style={styles.progressBarBg}>
        <View
          style={[
            styles.progressBarFill,
            { width: `${metrics.distributionCompletionPercent}%` },
          ]}
        />
      </View>

      {/* Horizontal Mini-Stepper (Created -> Funded -> Enrolling -> Distributing -> Completed) */}
      <View style={styles.miniStepperContainer}>
        {metrics.timeline.map((entry, index) => {
          const isLast = index === metrics.timeline.length - 1;
          return (
            <React.Fragment key={entry.stage}>
              <View style={styles.miniStepItem}>
                <View
                  style={[
                    styles.miniStepDot,
                    entry.isCompleted && styles.miniStepDotCompleted,
                    entry.isCurrent && styles.miniStepDotCurrent,
                  ]}
                >
                  {entry.isCompleted ? (
                    <FontAwesome name="check" size={8} color="white" />
                  ) : (
                    <View
                      style={[
                        styles.miniStepInnerDot,
                        entry.isCurrent && styles.miniStepInnerDotCurrent,
                      ]}
                    />
                  )}
                </View>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.miniStepLabel,
                    entry.isCurrent && styles.miniStepLabelCurrent,
                    entry.isCompleted && styles.miniStepLabelCompleted,
                  ]}
                >
                  {entry.stage === 'created'
                    ? 'Created'
                    : entry.stage === 'funded'
                    ? 'Funded'
                    : entry.stage === 'enrolling'
                    ? 'Enrolling'
                    : entry.stage === 'distributing'
                    ? 'Distributing'
                    : 'Done'}
                </Text>
              </View>
              {!isLast && (
                <View
                  style={[
                    styles.miniStepLine,
                    entry.isCompleted && styles.miniStepLineCompleted,
                  ]}
                />
              )}
            </React.Fragment>
          );
        })}
      </View>

      {/* ORG-06 Real-time Monitoring KPI Grid */}
      <View style={styles.kpiContainer}>
        {/* Budget KPI: Distributed vs Remaining */}
        <View style={styles.kpiCard}>
          <View style={styles.kpiLabelRow}>
            <FontAwesome name="money" size={11} color={BrandColors.navy} />
            <Text style={styles.kpiLabel}>Budget Health</Text>
          </View>
          <Text style={styles.kpiMainValue}>{formatCurrency(metrics.distributedBudget)}</Text>
          <Text style={styles.kpiSubValue}>
            of {formatCurrency(metrics.totalBudget)} ({formatCurrency(metrics.remainingBudget)} left)
          </Text>
        </View>

        {/* Beneficiary KPI: Approved vs Max */}
        <View style={styles.kpiCard}>
          <View style={styles.kpiLabelRow}>
            <FontAwesome name="users" size={11} color={BrandColors.navy} />
            <Text style={styles.kpiLabel}>Beneficiaries</Text>
          </View>
          <Text style={styles.kpiMainValue}>
            {metrics.approvedCount.toLocaleString()}{' '}
            <Text style={styles.kpiUnit}>approved</Text>
          </Text>
          <Text style={styles.kpiSubValue}>
            {metrics.enrolledCount.toLocaleString()} enrolled • {metrics.remainingBeneficiaries.toLocaleString()} slots left
          </Text>
        </View>
      </View>

      {/* Aid Type breakdown chips if available */}
      {metrics.voucherTypes && metrics.voucherTypes.length > 0 && (
        <View style={styles.voucherTypesRow}>
          <Text style={styles.voucherTypesLabel}>Aid Category:</Text>
          <View style={styles.voucherChipsWrap}>
            {metrics.voucherTypes.map((type, idx) => (
              <View key={idx} style={styles.voucherChip}>
                <FontAwesome name="tag" size={9} color={BrandColors.navy} />
                <Text style={styles.voucherChipText}>
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Toggle Button for Full Beneficiary-Style Timeline */}
      <Pressable
        onPress={() => setExpanded((prev) => !prev)}
        style={styles.expandToggle}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={styles.expandToggleText}>
          {expanded ? 'Hide Timeline' : 'View Progress Timeline'}
        </Text>
        <FontAwesome
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={10}
          color={BrandColors.navy}
        />
      </Pressable>

      {/* Detailed Chronological Vertical Stepper (Mirrors Beneficiary `status-timeline.tsx`) */}
      {expanded && (
        <View style={styles.detailedTimelineContainer}>
          {metrics.timeline.map((entry, index) => {
            const isLast = index === metrics.timeline.length - 1;

            return (
              <View key={entry.stage} style={styles.timelineRow}>
                {/* Stepper indicator column */}
                <View style={styles.indicatorColumn}>
                  <View
                    style={[
                      styles.circle,
                      entry.isCompleted && styles.circleCompleted,
                      entry.isCurrent && styles.circleCurrent,
                    ]}
                  >
                    {entry.isCompleted ? (
                      <FontAwesome name="check" size={10} color="white" />
                    ) : (
                      <View
                        style={[
                          styles.dot,
                          entry.isCurrent && styles.dotCurrent,
                        ]}
                      />
                    )}
                  </View>
                  {!isLast && (
                    <View
                      style={[
                        styles.connectingLine,
                        entry.isCompleted && styles.connectingLineCompleted,
                      ]}
                    />
                  )}
                </View>

                {/* Content column */}
                <View
                  style={[
                    styles.contentColumn,
                    !isLast && styles.contentColumnPadded,
                  ]}
                >
                  <View style={styles.stageLabelRow}>
                    <Text
                      style={[
                        styles.stageLabel,
                        entry.isCurrent && styles.stageLabelCurrent,
                      ]}
                    >
                      {entry.label}
                    </Text>
                    {entry.isCurrent && (
                      <View style={styles.activeBadge}>
                        <Text style={styles.activeBadgeText}>
                          {entry.stage === 'completed' ? 'Completed' : 'Current'}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.stageDescription}>{entry.description}</Text>
                  <Text style={styles.timestamp}>
                    {entry.timestamp ? `Milestone: ${entry.timestamp}` : 'Pending stage'}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#F8FAFC',
    borderRadius: BorderRadius.md,
    padding: Spacing.three,
    marginBottom: Spacing.three,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  titleWithBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 8,
    flexWrap: 'wrap',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: BrandColors.navy,
  },
  stageBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  stageBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  progressPercent: {
    fontSize: 13,
    fontWeight: '800',
    color: BrandColors.green,
  },
  progressBarBg: {
    height: 8,
    backgroundColor: '#E2E8F0',
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
    marginBottom: Spacing.three,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: BrandColors.green,
    borderRadius: BorderRadius.full,
  },
  miniStepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.three,
    paddingHorizontal: 2,
  },
  miniStepItem: {
    alignItems: 'center',
    width: 48,
  },
  miniStepDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  miniStepDotCompleted: {
    backgroundColor: BrandColors.green,
  },
  miniStepDotCurrent: {
    backgroundColor: BrandColors.navy,
    borderWidth: 2,
    borderColor: '#D4E2F4',
  },
  miniStepInnerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#94A3B8',
  },
  miniStepInnerDotCurrent: {
    backgroundColor: 'white',
  },
  miniStepLine: {
    flex: 1,
    height: 2,
    backgroundColor: '#CBD5E1',
    marginHorizontal: 2,
    marginBottom: 16,
  },
  miniStepLineCompleted: {
    backgroundColor: BrandColors.green,
  },
  miniStepLabel: {
    fontSize: 9,
    color: '#94A3B8',
    textAlign: 'center',
    fontWeight: '500',
  },
  miniStepLabelCurrent: {
    color: BrandColors.navy,
    fontWeight: '700',
  },
  miniStepLabelCompleted: {
    color: BrandColors.green,
    fontWeight: '600',
  },
  kpiContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: Spacing.two,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.sm,
    padding: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  kpiLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 4,
    marginBottom: 4,
  },
  kpiLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: BrandColors.grey,
    textTransform: 'uppercase',
  },
  kpiMainValue: {
    fontSize: 13,
    fontWeight: '700',
    color: BrandColors.navy,
    marginBottom: 2,
  },
  kpiUnit: {
    fontSize: 11,
    fontWeight: '500',
    color: BrandColors.grey,
  },
  kpiSubValue: {
    fontSize: 10,
    color: '#64748B',
    lineHeight: 14,
  },
  voucherTypesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 6,
    marginTop: 2,
    marginBottom: Spacing.two,
  },
  voucherTypesLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: BrandColors.grey,
  },
  voucherChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  voucherChip: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 4,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  voucherChipText: {
    fontSize: 10,
    color: BrandColors.navy,
    fontWeight: '600',
  },
  expandToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    columnGap: 6,
    paddingVertical: 6,
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 4,
  },
  expandToggleText: {
    fontSize: 11,
    fontWeight: '700',
    color: BrandColors.navy,
  },
  detailedTimelineContainer: {
    marginTop: Spacing.three,
    paddingTop: Spacing.three,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingLeft: Spacing.one,
  },
  timelineRow: {
    flexDirection: 'row',
  },
  indicatorColumn: {
    alignItems: 'center',
    width: 24,
  },
  circle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  circleCompleted: {
    backgroundColor: BrandColors.green,
  },
  circleCurrent: {
    backgroundColor: BrandColors.navy,
    borderWidth: 2,
    borderColor: '#D4E2F4',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#A0AEC0',
  },
  dotCurrent: {
    backgroundColor: 'white',
  },
  connectingLine: {
    width: 2,
    flex: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 4,
  },
  connectingLineCompleted: {
    backgroundColor: BrandColors.green,
  },
  contentColumn: {
    flex: 1,
    paddingLeft: Spacing.two,
  },
  contentColumnPadded: {
    paddingBottom: Spacing.three,
  },
  stageLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  stageLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4A5568',
  },
  stageLabelCurrent: {
    color: BrandColors.navy,
    fontWeight: '700',
  },
  activeBadge: {
    backgroundColor: '#EBF4FF',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
  },
  activeBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: BrandColors.navy,
  },
  stageDescription: {
    fontSize: 11,
    color: '#718096',
    lineHeight: 16,
    marginTop: 1,
  },
  timestamp: {
    fontSize: 10,
    color: '#A0AEC0',
    marginTop: 2,
    fontStyle: 'italic',
  },
});

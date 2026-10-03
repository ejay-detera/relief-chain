import React from 'react';
import { StyleSheet, View } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import { StatusHistoryEntry } from '@/types/application-status';

interface Props {
  timeline: StatusHistoryEntry[];
}

export function StatusTimeline({ timeline }: Props) {
  const formatTimestamp = (raw: string | null): string => {
    if (!raw) return 'Pending stage';
    try {
      const d = new Date(raw);
      if (isNaN(d.getTime())) return 'Pending stage';
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    } catch {
      return 'Pending stage';
    }
  };

  return (
    <View style={styles.container}>
      <ThemedText style={styles.sectionTitle}>Application Progress</ThemedText>
      <View style={styles.timelineList}>
        {timeline.map((entry, index) => {
          const isLast = index === timeline.length - 1;
          const isRejected = entry.stage === 'rejected';

          return (
            <View key={entry.stage} style={styles.row}>
              {/* Stepper column */}
              <View style={styles.indicatorColumn}>
                <View
                  style={[
                    styles.circle,
                    entry.isCompleted && styles.circleCompleted,
                    entry.isCurrent && !isRejected && styles.circleCurrent,
                    isRejected && styles.circleRejected,
                  ]}
                >
                  {isRejected ? (
                    <FontAwesome name="times" size={12} color="white" />
                  ) : entry.isCompleted ? (
                    <FontAwesome name="check" size={12} color="white" />
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
              <View style={[styles.contentColumn, !isLast && styles.contentColumnPadded]}>
                <View style={styles.labelRow}>
                  <ThemedText
                    style={[
                      styles.stageLabel,
                      entry.isCurrent && styles.stageLabelCurrent,
                      isRejected && styles.stageLabelRejected,
                    ]}
                  >
                    {entry.label}
                  </ThemedText>
                  {entry.isCurrent && (
                    <View
                      style={[
                        styles.activeBadge,
                        isRejected && styles.activeBadgeRejected,
                      ]}
                    >
                      <ThemedText
                        style={[
                          styles.activeBadgeText,
                          isRejected && styles.activeBadgeTextRejected,
                        ]}
                      >
                        {isRejected ? 'Declined' : 'Current'}
                      </ThemedText>
                    </View>
                  )}
                </View>
                <ThemedText style={styles.description}>{entry.description}</ThemedText>
                <ThemedText style={styles.timestamp}>
                  {formatTimestamp(entry.timestamp)}
                </ThemedText>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'white',
    borderRadius: BorderRadius.lg,
    padding: Spacing.four,
    marginBottom: Spacing.four,
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: BrandColors.navy,
    marginBottom: Spacing.three,
  },
  timelineList: {
    paddingLeft: Spacing.one,
  },
  row: {
    flexDirection: 'row',
  },
  indicatorColumn: {
    alignItems: 'center',
    width: 28,
  },
  circle: {
    width: 24,
    height: 24,
    borderRadius: 12,
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
    borderWidth: 3,
    borderColor: '#D4E2F4',
  },
  circleRejected: {
    backgroundColor: '#D9383A',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
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
    paddingLeft: Spacing.three,
  },
  contentColumnPadded: {
    paddingBottom: Spacing.four,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  stageLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4A5568',
  },
  stageLabelCurrent: {
    color: BrandColors.navy,
    fontWeight: '700',
  },
  stageLabelRejected: {
    color: '#D9383A',
    fontWeight: '700',
  },
  activeBadge: {
    backgroundColor: '#EBF4FF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  activeBadgeRejected: {
    backgroundColor: '#FDE8E8',
  },
  activeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: BrandColors.navy,
  },
  activeBadgeTextRejected: {
    fontSize: 10,
    fontWeight: '700',
    color: '#D9383A',
  },
  description: {
    fontSize: 12,
    color: '#718096',
    lineHeight: 18,
    marginTop: 2,
  },
  timestamp: {
    fontSize: 11,
    color: '#A0AEC0',
    marginTop: 4,
    fontStyle: 'italic',
  },
});

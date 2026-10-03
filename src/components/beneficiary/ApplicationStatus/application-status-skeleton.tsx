import React from 'react';
import { StyleSheet, View } from 'react-native';
import { BorderRadius, Spacing } from '@/constants/theme';

export function ApplicationStatusSkeleton() {
  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.header}>
          <View style={styles.titlePlaceholder} />
          <View style={styles.badgePlaceholder} />
        </View>
        <View style={styles.textLinePlaceholder} />
        <View style={styles.metaRow}>
          <View style={styles.metaBox} />
          <View style={styles.metaBox} />
        </View>
      </View>

      <View style={styles.timelineCard}>
        <View style={styles.sectionHeaderPlaceholder} />
        {[1, 2, 3, 4].map((i) => (
          <View key={i} style={styles.timelineRow}>
            <View style={styles.circlePlaceholder} />
            <View style={styles.timelineTextColumn}>
              <View style={styles.stepTitlePlaceholder} />
              <View style={styles.stepDescPlaceholder} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.four,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: BorderRadius.lg,
    padding: Spacing.four,
    marginBottom: Spacing.four,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.three,
  },
  titlePlaceholder: {
    width: '60%',
    height: 18,
    borderRadius: 4,
    backgroundColor: '#E2E8F0',
  },
  badgePlaceholder: {
    width: 70,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#E2E8F0',
  },
  textLinePlaceholder: {
    width: '40%',
    height: 12,
    borderRadius: 4,
    backgroundColor: '#EDF2F7',
    marginBottom: Spacing.three,
  },
  metaRow: {
    flexDirection: 'row',
    columnGap: Spacing.three,
    paddingTop: Spacing.two,
    borderTopWidth: 1,
    borderTopColor: '#F7FAFC',
  },
  metaBox: {
    flex: 1,
    height: 28,
    borderRadius: 4,
    backgroundColor: '#EDF2F7',
  },
  timelineCard: {
    backgroundColor: 'white',
    borderRadius: BorderRadius.lg,
    padding: Spacing.four,
  },
  sectionHeaderPlaceholder: {
    width: 140,
    height: 16,
    borderRadius: 4,
    backgroundColor: '#E2E8F0',
    marginBottom: Spacing.four,
  },
  timelineRow: {
    flexDirection: 'row',
    marginBottom: Spacing.four,
    columnGap: Spacing.three,
  },
  circlePlaceholder: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#E2E8F0',
  },
  timelineTextColumn: {
    flex: 1,
    rowGap: 6,
  },
  stepTitlePlaceholder: {
    width: '50%',
    height: 14,
    borderRadius: 4,
    backgroundColor: '#E2E8F0',
  },
  stepDescPlaceholder: {
    width: '80%',
    height: 10,
    borderRadius: 4,
    backgroundColor: '#EDF2F7',
  },
});

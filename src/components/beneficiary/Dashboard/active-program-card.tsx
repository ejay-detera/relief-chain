import { FontAwesome } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import { EnrolledProgram } from '@/types/wallet';

type Props = {
  program: EnrolledProgram;
  onPress?: () => void;
};

export function ActiveProgramCard({ program, onPress }: Props) {
  return (
    <View style={styles.container}>
      <ThemedText style={styles.sectionTitle}>Active Program</ThemedText>

      <View style={styles.card}>
        <View style={styles.headerRow}>
          <ThemedText style={styles.name} numberOfLines={1}>{program.name}</ThemedText>
          <Pressable accessibilityLabel="View program details" onPress={onPress}>
            <FontAwesome name="external-link" size={16} color={BrandColors.navy} />
          </Pressable>
        </View>

        <View style={styles.progressRow}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${program.progressPercent}%` }]} />
          </View>
          <ThemedText style={styles.progressLabel}>{program.progressPercent}%</ThemedText>
        </View>

        <View style={styles.disbursementPill}>
          <FontAwesome name="calendar" size={12} color={BrandColors.navy} />
          <ThemedText style={styles.disbursementText}>Next Disbursement: {program.nextDisbursementDate}</ThemedText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: Spacing.four,
    marginBottom: Spacing.four,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: BrandColors.navy,
    marginBottom: Spacing.two,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: BorderRadius.lg,
    padding: Spacing.four,
    boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.one,
  },
  name: {
    fontSize: 14,
    fontWeight: '600',
    color: BrandColors.navy,
    flex: 1,
    marginRight: Spacing.two,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: Spacing.two,
    marginTop: Spacing.two,
    marginBottom: Spacing.three,
  },
  progressTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: BrandColors.lightGray,
    overflow: 'hidden',
  },
  progressFill: {
    height: 8,
    borderRadius: 4,
    backgroundColor: BrandColors.green,
  },
  progressLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: BrandColors.green,
  },
  disbursementPill: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: Spacing.two,
    backgroundColor: 'rgba(17, 46, 88, 0.08)',
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    alignSelf: 'flex-start',
  },
  disbursementText: {
    fontSize: 12,
    fontWeight: '600',
    color: BrandColors.navy,
  },
});

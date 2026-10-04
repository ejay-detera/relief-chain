import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import type { ReportKpi } from '@/types/reports';

interface Props {
  kpis: ReportKpi[];
}

export const ReportKpiSection = ({ kpis }: Props) => {
  if (!kpis || kpis.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.grid}>
        {kpis.map((kpi) => (
          <View
            key={kpi.id}
            style={[styles.card, kpi.highlight && styles.cardHighlight]}
          >
            <ThemedText style={styles.label}>{kpi.label}</ThemedText>
            <ThemedText numberOfLines={1} style={[styles.value, kpi.highlight && styles.valueHighlight]}>
              {kpi.value}
            </ThemedText>
            {kpi.subtext ? (
              <ThemedText style={styles.subtext}>{kpi.subtext}</ThemedText>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.four,
    marginBottom: Spacing.three,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  card: {
    flex: 1,
    minWidth: '46%',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: BorderRadius.md,
    padding: Spacing.three,
  },
  cardHighlight: {
    borderColor: BrandColors.navy,
    backgroundColor: '#F8FAFC',
  },
  label: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 11,
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  value: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 18,
    color: BrandColors.navy,
    marginTop: 4,
  },
  valueHighlight: {
    color: BrandColors.navy,
  },
  subtext: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 10,
    color: BrandColors.green,
    marginTop: 2,
  },
});

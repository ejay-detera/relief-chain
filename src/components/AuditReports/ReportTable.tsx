import { ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import type { ReportColumn } from '@/types/reports';

interface Props {
  columns: ReportColumn[];
  rows: Record<string, any>[];
  totalRecords: number;
}

export const ReportTable = ({ columns, rows, totalRecords }: Props) => {
  if (rows.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <ThemedText style={styles.emptyTitle}>No matching records found</ThemedText>
        <ThemedText style={styles.emptySubtitle}>
          Try adjusting the date range or selecting a different program scope.
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.tableHeader}>
        <ThemedText style={styles.tableTitle}>Records ({totalRecords})</ThemedText>
        <ThemedText style={styles.scrollHint}>Swipe horizontally for details →</ThemedText>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={true}>
        <View style={styles.table}>
          {/* Header Row */}
          <View style={styles.rowHeader}>
            {columns.map((col) => (
              <View
                key={col.key}
                style={[
                  styles.cell,
                  col.align === 'right' && styles.cellRight,
                  col.align === 'center' && styles.cellCenter,
                ]}
              >
                <ThemedText style={styles.headerCellText}>{col.label}</ThemedText>
              </View>
            ))}
          </View>

          {/* Data Rows */}
          {rows.map((row, idx) => (
            <View
              key={idx}
              style={[styles.row, idx % 2 === 1 && styles.rowAlternate]}
            >
              {columns.map((col) => {
                const val = row[col.key] ?? '—';
                return (
                  <View
                    key={col.key}
                    style={[
                      styles.cell,
                      col.align === 'right' && styles.cellRight,
                      col.align === 'center' && styles.cellCenter,
                    ]}
                  >
                    {col.format === 'status' ? (
                      <View style={styles.statusPill}>
                        <ThemedText style={styles.statusPillText}>{String(val)}</ThemedText>
                      </View>
                    ) : (
                      <ThemedText
                        numberOfLines={2}
                        style={[
                          styles.cellText,
                          col.format === 'hash' && styles.hashText,
                          col.format === 'currency' && styles.currencyText,
                        ]}
                      >
                        {String(val)}
                      </ThemedText>
                    )}
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.four,
    marginBottom: Spacing.four,
  },
  tableHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.two,
  },
  tableTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
    color: BrandColors.navy,
  },
  scrollHint: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 11,
    color: '#94A3B8',
  },
  table: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
  rowHeader: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 2,
    borderBottomColor: '#E2E8F0',
  },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  rowAlternate: {
    backgroundColor: '#FAFAFC',
  },
  cell: {
    width: 140,
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  cellRight: {
    alignItems: 'flex-end',
  },
  cellCenter: {
    alignItems: 'center',
  },
  headerCellText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 11,
    color: '#475569',
    textTransform: 'uppercase',
  },
  cellText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12,
    color: '#1E293B',
  },
  hashText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 11,
    color: '#64748B',
  },
  currencyText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    color: BrandColors.navy,
  },
  statusPill: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
  },
  statusPillText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 10,
    color: '#0369A1',
  },
  emptyContainer: {
    padding: Spacing.six,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: BorderRadius.md,
    marginHorizontal: Spacing.four,
    marginBottom: Spacing.four,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#CBD5E1',
  },
  emptyTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
    color: BrandColors.navy,
    marginBottom: 4,
  },
  emptySubtitle: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
  },
});

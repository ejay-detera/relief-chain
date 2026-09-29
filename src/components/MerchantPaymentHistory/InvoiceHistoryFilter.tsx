import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import type {
    MerchantPaymentHistoryFilter,
    MerchantPaymentHistorySummary,
    PaymentHistorySortOrder,
} from '@/types/merchant-payment-history';

type Props = {
  activeFilter: MerchantPaymentHistoryFilter;
  onSelectFilter: (filter: MerchantPaymentHistoryFilter) => void;
  summary: MerchantPaymentHistorySummary;
  sortOrder: PaymentHistorySortOrder;
  onToggleSort: () => void;
};

type FilterOption = {
  key: MerchantPaymentHistoryFilter;
  label: string;
  count?: number;
};

export const InvoiceHistoryFilter = ({
  activeFilter,
  onSelectFilter,
  summary,
  sortOrder,
  onToggleSort,
}: Props) => {
  const options: FilterOption[] = [
    { key: 'all', label: 'All', count: summary.settledCount + summary.activeCount + summary.expiredCount },
    { key: 'active', label: 'Active', count: summary.activeCount },
    { key: 'settled', label: 'Settled', count: summary.settledCount },
    { key: 'expired', label: 'Expired', count: summary.expiredCount },
  ];

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        {options.map((opt) => {
          const isSelected = activeFilter === opt.key;
          return (
            <Pressable
              accessibilityRole="button"
              key={opt.key}
              onPress={() => onSelectFilter(opt.key)}
              style={[styles.pill, isSelected ? styles.pillSelected : styles.pillDefault]}
            >
              <ThemedText style={[styles.pillText, isSelected && styles.pillTextSelected]}>
                {opt.label}
              </ThemedText>
              {opt.count !== undefined && (
                <View style={[styles.countBadge, isSelected ? styles.badgeSelected : styles.badgeDefault]}>
                  <ThemedText style={[styles.countText, isSelected && styles.countTextSelected]}>
                    {opt.count}
                  </ThemedText>
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>

      <Pressable
        accessibilityLabel={`Sort by ${sortOrder === 'newest' ? 'oldest' : 'newest'}`}
        accessibilityRole="button"
        hitSlop={8}
        onPress={onToggleSort}
        style={styles.sortButton}
      >
        <MaterialCommunityIcons
          color={BrandColors.navy}
          name={sortOrder === 'newest' ? 'sort-clock-descending-outline' : 'sort-clock-ascending-outline'}
          size={18}
        />
        <ThemedText style={styles.sortText}>
          {sortOrder === 'newest' ? 'Newest' : 'Oldest'}
        </ThemedText>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.two,
    justifyContent: 'space-between',
    paddingVertical: Spacing.one,
  },
  scrollContent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.one,
    paddingRight: Spacing.two,
  },
  pill: {
    alignItems: 'center',
    borderRadius: BorderRadius.full,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: Spacing.three,
    paddingVertical: 7,
  },
  pillDefault: {
    backgroundColor: '#F0F3F8',
  },
  pillSelected: {
    backgroundColor: BrandColors.navy,
  },
  pillText: {
    color: '#4A5568',
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
  },
  pillTextSelected: {
    color: '#FFFFFF',
    fontFamily: 'PlusJakartaSans_700Bold',
  },
  countBadge: {
    borderRadius: BorderRadius.full,
    minWidth: 18,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  badgeDefault: {
    backgroundColor: '#E2E8F0',
  },
  badgeSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  countText: {
    color: '#4A5568',
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 10,
    textAlign: 'center',
  },
  countTextSelected: {
    color: '#FFFFFF',
  },
  sortButton: {
    alignItems: 'center',
    backgroundColor: '#F0F3F8',
    borderRadius: BorderRadius.md,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: Spacing.two,
    paddingVertical: 7,
  },
  sortText: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 11,
  },
});

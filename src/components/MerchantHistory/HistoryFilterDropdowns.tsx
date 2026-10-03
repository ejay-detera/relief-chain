import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import type { DateRangePreset } from '@/hooks/use-merchant-transactions';
import type { MerchantTransactionFilter } from '@/types/merchant-transaction';

export type HistoryFilterDropdownsProps = {
  datePreset: DateRangePreset;
  filter: MerchantTransactionFilter;
  onSelectDatePreset: (preset: DateRangePreset) => void;
  onSelectFilter: (kind: MerchantTransactionFilter) => void;
  typeCounts: {
    all: number;
    directCash: number;
    vouchers: number;
  };
};

type TypeOption = {
  count: number;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  id: MerchantTransactionFilter;
  label: string;
};

type DateOption = {
  description: string;
  id: DateRangePreset;
  label: string;
};

const DATE_OPTIONS: readonly DateOption[] = [
  { id: 'all', label: 'All Time', description: 'Show all recorded transactions' },
  { id: 'today', label: 'Today', description: 'Transactions processed today' },
  { id: '7d', label: 'Last 7 Days', description: 'Past 7 calendar days' },
  { id: '30d', label: 'Last 30 Days', description: 'Past 30 calendar days' },
];

export const HistoryFilterDropdowns = ({
  filter,
  onSelectFilter,
  typeCounts,
  datePreset,
  onSelectDatePreset,
}: HistoryFilterDropdownsProps) => {
  const [activeMenu, setActiveMenu] = useState<'type' | 'date' | null>(null);

  const typeOptions: readonly TypeOption[] = [
    { id: 'all', label: 'All Types', count: typeCounts.all, icon: 'receipt-text-outline' },
    { id: 'cash_payment', label: 'Direct Cash', count: typeCounts.directCash, icon: 'cash-fast' },
    { id: 'voucher_redemption', label: 'Vouchers', count: typeCounts.vouchers, icon: 'ticket-percent-outline' },
  ];

  // Dynamic label for type pill
  const activeTypeOption = typeOptions.find((opt) => opt.id === filter);
  const typePillLabel = activeTypeOption
    ? `${activeTypeOption.label} (${activeTypeOption.count})`
    : `All (${typeCounts.all})`;

  // Dynamic label for date pill
  const activeDateOption = DATE_OPTIONS.find((opt) => opt.id === datePreset);
  const datePillLabel = activeDateOption ? activeDateOption.label : 'All Time';

  const isTypeActive = filter !== 'all';
  const isDateActive = datePreset !== 'all';

  return (
    <View style={styles.container}>
      {/* Type Dropdown Trigger Pill */}
      <Pressable
        accessibilityHint="Opens payment type selector"
        accessibilityLabel={`Payment type filter, currently ${typePillLabel}`}
        accessibilityRole="button"
        hitSlop={4}
        onPress={() => setActiveMenu('type')}
        style={[styles.dropdownPill, isTypeActive && styles.dropdownPillActive]}
      >
        <MaterialCommunityIcons
          color={isTypeActive ? BrandColors.navy : BrandColors.grey}
          name="filter-variant"
          size={15}
        />
        <ThemedText
          numberOfLines={1}
          style={[styles.dropdownPillText, isTypeActive && styles.dropdownPillTextActive]}
        >
          {typePillLabel}
        </ThemedText>
        <MaterialCommunityIcons
          color={isTypeActive ? BrandColors.navy : BrandColors.grey}
          name="chevron-down"
          size={16}
        />
      </Pressable>

      {/* Date Dropdown Trigger Pill */}
      <Pressable
        accessibilityHint="Opens date range selector"
        accessibilityLabel={`Date range filter, currently ${datePillLabel}`}
        accessibilityRole="button"
        hitSlop={4}
        onPress={() => setActiveMenu('date')}
        style={[styles.dropdownPill, isDateActive && styles.dropdownPillActive]}
      >
        <MaterialCommunityIcons
          color={isDateActive ? BrandColors.navy : BrandColors.grey}
          name="calendar-clock-outline"
          size={15}
        />
        <ThemedText
          numberOfLines={1}
          style={[styles.dropdownPillText, isDateActive && styles.dropdownPillTextActive]}
        >
          {datePillLabel}
        </ThemedText>
        <MaterialCommunityIcons
          color={isDateActive ? BrandColors.navy : BrandColors.grey}
          name="chevron-down"
          size={16}
        />
      </Pressable>

      {/* Selection Modal Sheet */}
      <Modal
        animationType="fade"
        onRequestClose={() => setActiveMenu(null)}
        transparent
        visible={activeMenu !== null}
      >
        <Pressable onPress={() => setActiveMenu(null)} style={styles.modalOverlay}>
          <Pressable onPress={(e) => e.stopPropagation()} style={styles.modalSheet}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitleGroup}>
                <MaterialCommunityIcons
                  color={BrandColors.navy}
                  name={activeMenu === 'type' ? 'filter-variant' : 'calendar-clock-outline'}
                  size={20}
                />
                <ThemedText style={styles.modalTitle}>
                  {activeMenu === 'type' ? 'Filter by Payment Type' : 'Filter by Date Range'}
                </ThemedText>
              </View>
              <Pressable
                accessibilityLabel="Close filter menu"
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => setActiveMenu(null)}
              >
                <MaterialCommunityIcons color={BrandColors.grey} name="close" size={20} />
              </Pressable>
            </View>

            {/* Modal Options List */}
            <View style={styles.modalOptionsList}>
              {activeMenu === 'type' &&
                typeOptions.map((opt) => {
                  const isSelected = filter === opt.id;
                  return (
                    <Pressable
                      accessibilityRole="button"
                      key={opt.id}
                      onPress={() => {
                        onSelectFilter(opt.id);
                        setActiveMenu(null);
                      }}
                      style={[styles.optionRow, isSelected && styles.optionRowSelected]}
                    >
                      <View style={styles.optionLeft}>
                        <View style={[styles.optionIconBox, isSelected && styles.optionIconBoxSelected]}>
                          <MaterialCommunityIcons
                            color={isSelected ? BrandColors.navy : BrandColors.grey}
                            name={opt.icon}
                            size={18}
                          />
                        </View>
                        <ThemedText style={[styles.optionLabel, isSelected && styles.optionLabelSelected]}>
                          {opt.label}
                        </ThemedText>
                        <View style={[styles.optionBadge, isSelected && styles.optionBadgeSelected]}>
                          <ThemedText
                            style={[styles.optionBadgeText, isSelected && styles.optionBadgeTextSelected]}
                          >
                            {opt.count}
                          </ThemedText>
                        </View>
                      </View>
                      {isSelected && (
                        <MaterialCommunityIcons color={BrandColors.navy} name="check-circle" size={20} />
                      )}
                    </Pressable>
                  );
                })}

              {activeMenu === 'date' &&
                DATE_OPTIONS.map((opt) => {
                  const isSelected = datePreset === opt.id;
                  return (
                    <Pressable
                      accessibilityRole="button"
                      key={opt.id}
                      onPress={() => {
                        onSelectDatePreset(opt.id);
                        setActiveMenu(null);
                      }}
                      style={[styles.optionRow, isSelected && styles.optionRowSelected]}
                    >
                      <View style={styles.optionDateGroup}>
                        <ThemedText style={[styles.optionLabel, isSelected && styles.optionLabelSelected]}>
                          {opt.label}
                        </ThemedText>
                        <ThemedText style={styles.optionDescription}>{opt.description}</ThemedText>
                      </View>
                      {isSelected && (
                        <MaterialCommunityIcons color={BrandColors.navy} name="check-circle" size={20} />
                      )}
                    </Pressable>
                  );
                })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  dropdownPill: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(151,151,151,0.25)',
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: 7,
  },
  dropdownPillActive: {
    backgroundColor: 'rgba(17,46,88,0.06)',
    borderColor: BrandColors.navy,
  },
  dropdownPillText: {
    color: BrandColors.grey,
    flex: 1,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
  },
  dropdownPillTextActive: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_700Bold',
  },
  modalOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    flex: 1,
    justifyContent: 'flex-end',
    padding: Spacing.three,
  },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.xl,
    gap: Spacing.three,
    maxWidth: 420,
    padding: Spacing.four,
    width: '100%',
  },
  modalHeader: {
    alignItems: 'center',
    borderBottomColor: '#F3F4F6',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: Spacing.two,
  },
  modalHeaderTitleGroup: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.two,
  },
  modalTitle: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 15,
  },
  modalOptionsList: {
    gap: Spacing.two,
  },
  optionRow: {
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderColor: 'rgba(151,151,151,0.15)',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
  },
  optionRowSelected: {
    backgroundColor: 'rgba(17,46,88,0.05)',
    borderColor: BrandColors.navy,
  },
  optionLeft: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.two,
  },
  optionIconBox: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.sm,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  optionIconBoxSelected: {
    backgroundColor: 'rgba(17,46,88,0.1)',
  },
  optionLabel: {
    color: BrandColors.grey,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13,
  },
  optionLabelSelected: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_700Bold',
  },
  optionBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(151,151,151,0.15)',
    borderRadius: BorderRadius.full,
    height: 20,
    justifyContent: 'center',
    minWidth: 20,
    paddingHorizontal: 6,
  },
  optionBadgeSelected: {
    backgroundColor: BrandColors.navy,
  },
  optionBadgeText: {
    color: BrandColors.grey,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 11,
  },
  optionBadgeTextSelected: {
    color: '#FFFFFF',
  },
  optionDateGroup: {
    flex: 1,
    gap: 2,
  },
  optionDescription: {
    color: BrandColors.grey,
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 11,
  },
});

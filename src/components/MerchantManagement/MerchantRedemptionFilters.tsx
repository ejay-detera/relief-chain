import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import type { RedemptionDateFilter } from '@/types/merchant-management';
import {
  type DropdownOption,
  FilterDropdownModal,
} from './FilterDropdownModal';

type ProgramOption = {
  id: string;
  name: string;
};

type Props = {
  searchQuery: string;
  onSearchChange: (text: string) => void;
  selectedDateFilter: RedemptionDateFilter;
  onSelectDateFilter: (filter: RedemptionDateFilter) => void;
  programs: ProgramOption[];
  selectedProgramId: string | null;
  onSelectProgramId: (programId: string | null) => void;
};

const DATE_OPTIONS: DropdownOption<RedemptionDateFilter>[] = [
  { label: 'All Time', value: 'all' },
  { label: 'Today', value: 'today' },
  { label: 'Last 7 Days', value: '7days' },
  { label: 'Last 30 Days', value: '30days' },
];

export const MerchantRedemptionFilters = ({
  searchQuery,
  onSearchChange,
  selectedDateFilter,
  onSelectDateFilter,
  programs,
  selectedProgramId,
  onSelectProgramId,
}: Props) => {
  const [programModalVisible, setProgramModalVisible] = useState(false);
  const [dateModalVisible, setDateModalVisible] = useState(false);

  // Map programs to dropdown options
  const programOptions: DropdownOption<string | null>[] = useMemo(() => {
    return [
      { label: 'All Programs', value: null, subtitle: 'Show all created aid programs' },
      ...programs.map((p) => ({
        label: p.name,
        value: p.id,
      })),
    ];
  }, [programs]);

  // Selected program label
  const selectedProgramLabel = useMemo(() => {
    if (!selectedProgramId) return 'All Programs';
    const found = programs.find((p) => p.id === selectedProgramId);
    return found ? found.name : 'All Programs';
  }, [selectedProgramId, programs]);

  // Selected date label
  const selectedDateLabel = useMemo(() => {
    const found = DATE_OPTIONS.find((d) => d.value === selectedDateFilter);
    return found ? found.label : 'All Time';
  }, [selectedDateFilter]);

  return (
    <View style={styles.container}>
      {/* Search Input */}
      <View style={styles.searchRow}>
        <FontAwesome name="search" size={13} color={BrandColors.grey} />
        <TextInput
          value={searchQuery}
          onChangeText={onSearchChange}
          placeholder="Search by beneficiary or hash..."
          placeholderTextColor={BrandColors.grey}
          style={styles.searchInput}
          autoCapitalize="none"
        />
        {searchQuery.length > 0 && (
          <Pressable onPress={() => onSearchChange('')} hitSlop={8}>
            <FontAwesome name="times-circle" size={14} color={BrandColors.grey} />
          </Pressable>
        )}
      </View>

      {/* Dropdown Filters Row */}
      <View style={styles.dropdownRow}>
        {/* Program Dropdown Button */}
        <Pressable
          onPress={() => setProgramModalVisible(true)}
          style={[
            styles.dropdownBtn,
            selectedProgramId !== null && styles.dropdownBtnActive,
          ]}
        >
          <View style={styles.dropdownLabelContainer}>
            <ThemedText style={styles.dropdownFieldLabel}>Program</ThemedText>
            <ThemedText
              style={[
                styles.dropdownValueText,
                selectedProgramId !== null && styles.dropdownValueTextActive,
              ]}
              numberOfLines={1}
            >
              {selectedProgramLabel}
            </ThemedText>
          </View>
          <FontAwesome
            name="chevron-down"
            size={11}
            color={selectedProgramId !== null ? BrandColors.navy : BrandColors.grey}
          />
        </Pressable>

        {/* Date Range Dropdown Button */}
        <Pressable
          onPress={() => setDateModalVisible(true)}
          style={[
            styles.dropdownBtn,
            selectedDateFilter !== 'all' && styles.dropdownBtnActive,
          ]}
        >
          <View style={styles.dropdownLabelContainer}>
            <ThemedText style={styles.dropdownFieldLabel}>Date Range</ThemedText>
            <ThemedText
              style={[
                styles.dropdownValueText,
                selectedDateFilter !== 'all' && styles.dropdownValueTextActive,
              ]}
              numberOfLines={1}
            >
              {selectedDateLabel}
            </ThemedText>
          </View>
          <FontAwesome
            name="chevron-down"
            size={11}
            color={selectedDateFilter !== 'all' ? BrandColors.navy : BrandColors.grey}
          />
        </Pressable>
      </View>

      {/* Program Dropdown Modal */}
      <FilterDropdownModal<string | null>
        visible={programModalVisible}
        title="Filter by Program"
        options={programOptions}
        selectedValue={selectedProgramId}
        onSelect={onSelectProgramId}
        onClose={() => setProgramModalVisible(false)}
      />

      {/* Date Dropdown Modal */}
      <FilterDropdownModal<RedemptionDateFilter>
        visible={dateModalVisible}
        title="Filter by Date Range"
        options={DATE_OPTIONS}
        selectedValue={selectedDateFilter}
        onSelect={onSelectDateFilter}
        onClose={() => setDateModalVisible(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.three,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F6F8',
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.two,
    paddingVertical: 7,
    marginBottom: Spacing.two,
    borderWidth: 1,
    borderColor: '#E8EAED',
  },
  searchInput: {
    flex: 1,
    marginLeft: Spacing.two,
    fontSize: 13,
    color: BrandColors.navy,
    paddingVertical: 2,
  },
  dropdownRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  dropdownBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'white',
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.two,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#E2E5EA',
  },
  dropdownBtnActive: {
    borderColor: BrandColors.navy,
    backgroundColor: '#F7F9FC',
  },
  dropdownLabelContainer: {
    flex: 1,
    marginRight: 6,
  },
  dropdownFieldLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: BrandColors.grey,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  dropdownValueText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333333',
    marginTop: 1,
  },
  dropdownValueTextActive: {
    color: BrandColors.navy,
    fontWeight: '700',
  },
});

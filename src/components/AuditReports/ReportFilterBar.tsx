import { FontAwesome } from '@expo/vector-icons';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import type { ProgramOption } from '@/services/reportService';
import type { DateRangePreset } from '@/types/reports';
import { formatDateToIsoDate } from '@/utils/report-utils';

const DATE_PRESETS: { preset: DateRangePreset; label: string }[] = [
  { preset: 'all', label: 'All Time' },
  { preset: 'last_7_days', label: 'Last 7 Days' },
  { preset: 'last_30_days', label: 'Last 30 Days' },
  { preset: 'this_month', label: 'This Month' },
  { preset: 'last_90_days', label: 'Last 90 Days' },
];

interface Props {
  programs: ProgramOption[];
  selectedProgramId: string;
  selectedDatePreset: DateRangePreset;
  selectedStartDate?: string | null;
  selectedEndDate?: string | null;
  selectedSpecificDate?: string | null;
  onSelectProgram: (id: string) => void;
  onSelectDateFilter: (
    preset: DateRangePreset,
    startDate?: string | null,
    endDate?: string | null,
    specificDate?: string | null,
  ) => void;
}

type DateModalTab = 'presets' | 'range';
type ActivePickerTarget = 'range_start' | 'range_end' | null;

export const ReportFilterBar = ({
  programs,
  selectedProgramId,
  selectedDatePreset,
  selectedStartDate,
  selectedEndDate,
  onSelectProgram,
  onSelectDateFilter,
}: Props) => {
  const [isProgramModalVisible, setIsProgramModalVisible] = useState(false);
  const [isDateModalVisible, setIsDateModalVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<DateModalTab>(
    selectedDatePreset === 'custom_range' ? 'range' : 'presets',
  );

  // Internal Date State for Custom Range
  const [tempRangeStart, setTempRangeStart] = useState<Date>(() => {
    if (selectedStartDate) return new Date(`${selectedStartDate}T12:00:00`);
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d;
  });
  const [tempRangeEnd, setTempRangeEnd] = useState<Date>(() => {
    if (selectedEndDate) return new Date(`${selectedEndDate}T12:00:00`);
    return new Date();
  });

  // Native Picker Modal State
  const [activePickerTarget, setActivePickerTarget] = useState<ActivePickerTarget>(null);

  const currentProgramLabel =
    selectedProgramId === 'all'
      ? 'All Programs'
      : programs.find((p) => p.id === selectedProgramId)?.name || 'Selected Program';

  // Compute display label for date button
  const getDateDisplayLabel = () => {
    if (selectedDatePreset === 'custom_range' && (selectedStartDate || selectedEndDate)) {
      const s = selectedStartDate
        ? new Date(`${selectedStartDate}T12:00:00`).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })
        : 'Start';
      const e = selectedEndDate
        ? new Date(`${selectedEndDate}T12:00:00`).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })
        : 'End';
      return `${s} - ${e}`;
    }
    return DATE_PRESETS.find((d) => d.preset === selectedDatePreset)?.label || 'All Time';
  };

  // Native DateTimePicker Change Handler
  const handlePickerChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setActivePickerTarget(null);
    }
    if (event.type === 'set' && selectedDate) {
      if (activePickerTarget === 'range_start') {
        setTempRangeStart(selectedDate);
      } else if (activePickerTarget === 'range_end') {
        setTempRangeEnd(selectedDate);
      }
    }
  };

  const applyRangeFilter = () => {
    const startIso = formatDateToIsoDate(tempRangeStart);
    const endIso = formatDateToIsoDate(tempRangeEnd);
    onSelectDateFilter('custom_range', startIso, endIso, null);
    setIsDateModalVisible(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.filterRow}>
        {/* Program Filter Button */}
        <Pressable
          accessibilityLabel="Filter by Program"
          accessibilityRole="button"
          onPress={() => setIsProgramModalVisible(true)}
          style={styles.filterButton}
        >
          <FontAwesome color={BrandColors.navy} name="filter" size={12} />
          <ThemedText numberOfLines={1} style={styles.filterLabel}>
            {currentProgramLabel}
          </ThemedText>
          <FontAwesome color={BrandColors.grey} name="chevron-down" size={10} />
        </Pressable>

        {/* Date Filter Button */}
        <Pressable
          accessibilityLabel="Filter by Date"
          accessibilityRole="button"
          onPress={() => setIsDateModalVisible(true)}
          style={styles.filterButton}
        >
          <FontAwesome color={BrandColors.navy} name="calendar" size={12} />
          <ThemedText numberOfLines={1} style={styles.filterLabel}>
            {getDateDisplayLabel()}
          </ThemedText>
          <FontAwesome color={BrandColors.grey} name="chevron-down" size={10} />
        </Pressable>
      </View>

      {/* Program Selection Modal */}
      <Modal
        animationType="fade"
        onRequestClose={() => setIsProgramModalVisible(false)}
        transparent
        visible={isProgramModalVisible}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setIsProgramModalVisible(false)}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>Select Scope / Program</ThemedText>
              <TouchableOpacity onPress={() => setIsProgramModalVisible(false)}>
                <FontAwesome color={BrandColors.grey} name="close" size={16} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalList}>
              <TouchableOpacity
                onPress={() => {
                  onSelectProgram('all');
                  setIsProgramModalVisible(false);
                }}
                style={[styles.modalItem, selectedProgramId === 'all' && styles.modalItemActive]}
              >
                <ThemedText style={[styles.modalItemText, selectedProgramId === 'all' && styles.modalItemTextActive]}>
                  All Programs (Consolidated)
                </ThemedText>
                {selectedProgramId === 'all' && (
                  <FontAwesome color={BrandColors.navy} name="check" size={14} />
                )}
              </TouchableOpacity>

              {programs.map((prog) => (
                <TouchableOpacity
                  key={prog.id}
                  onPress={() => {
                    onSelectProgram(prog.id);
                    setIsProgramModalVisible(false);
                  }}
                  style={[styles.modalItem, selectedProgramId === prog.id && styles.modalItemActive]}
                >
                  <ThemedText style={[styles.modalItemText, selectedProgramId === prog.id && styles.modalItemTextActive]}>
                    {prog.name}
                  </ThemedText>
                  {selectedProgramId === prog.id && (
                    <FontAwesome color={BrandColors.navy} name="check" size={14} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Date Filter Modal (Presets & Custom Range) */}
      <Modal
        animationType="fade"
        onRequestClose={() => setIsDateModalVisible(false)}
        transparent
        visible={isDateModalVisible}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setIsDateModalVisible(false)}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalContent, styles.dateModalContent]}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>Filter by Date</ThemedText>
              <TouchableOpacity onPress={() => setIsDateModalVisible(false)}>
                <FontAwesome color={BrandColors.grey} name="close" size={16} />
              </TouchableOpacity>
            </View>

            {/* Mode Switcher Tabs (Presets & Custom Range) */}
            <View style={styles.tabContainer}>
              <TouchableOpacity
                onPress={() => setActiveTab('presets')}
                style={[styles.tabButton, activeTab === 'presets' && styles.tabButtonActive]}
              >
                <ThemedText style={[styles.tabButtonText, activeTab === 'presets' && styles.tabButtonTextActive]}>
                  Quick Presets
                </ThemedText>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setActiveTab('range')}
                style={[styles.tabButton, activeTab === 'range' && styles.tabButtonActive]}
              >
                <ThemedText style={[styles.tabButtonText, activeTab === 'range' && styles.tabButtonTextActive]}>
                  Custom Range
                </ThemedText>
              </TouchableOpacity>
            </View>

            {/* TAB 1: QUICK PRESETS */}
            {activeTab === 'presets' && (
              <ScrollView style={styles.modalList}>
                {DATE_PRESETS.map((preset) => (
                  <TouchableOpacity
                    key={preset.preset}
                    onPress={() => {
                      onSelectDateFilter(preset.preset);
                      setIsDateModalVisible(false);
                    }}
                    style={[styles.modalItem, selectedDatePreset === preset.preset && styles.modalItemActive]}
                  >
                    <ThemedText style={[styles.modalItemText, selectedDatePreset === preset.preset && styles.modalItemTextActive]}>
                      {preset.label}
                    </ThemedText>
                    {selectedDatePreset === preset.preset && (
                      <FontAwesome color={BrandColors.navy} name="check" size={14} />
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {/* TAB 2: CUSTOM RANGE (CALENDAR DATE PICKERS ONLY) */}
            {activeTab === 'range' && (
              <ScrollView showsVerticalScrollIndicator={false} style={styles.customDateContainer}>
                {/* Start Date Field */}
                <ThemedText style={styles.rangeSectionTitle}>From Date (Start):</ThemedText>
                <TouchableOpacity
                  accessibilityLabel="Choose start date with calendar"
                  accessibilityRole="button"
                  onPress={() => setActivePickerTarget('range_start')}
                  style={styles.datePickerInput}
                >
                  <View style={styles.datePickerInputLeft}>
                    <FontAwesome color={BrandColors.navy} name="calendar" size={14} />
                    <ThemedText style={styles.datePickerInputText}>
                      {tempRangeStart.toLocaleDateString(undefined, {
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </ThemedText>
                  </View>
                  <FontAwesome color={BrandColors.grey} name="chevron-down" size={11} />
                </TouchableOpacity>

                {/* End Date Field */}
                <ThemedText style={[styles.rangeSectionTitle, { marginTop: 14 }]}>To Date (End):</ThemedText>
                <TouchableOpacity
                  accessibilityLabel="Choose end date with calendar"
                  accessibilityRole="button"
                  onPress={() => setActivePickerTarget('range_end')}
                  style={styles.datePickerInput}
                >
                  <View style={styles.datePickerInputLeft}>
                    <FontAwesome color={BrandColors.navy} name="calendar" size={14} />
                    <ThemedText style={styles.datePickerInputText}>
                      {tempRangeEnd.toLocaleDateString(undefined, {
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </ThemedText>
                  </View>
                  <FontAwesome color={BrandColors.grey} name="chevron-down" size={11} />
                </TouchableOpacity>

                {/* Apply Range Button */}
                <TouchableOpacity onPress={applyRangeFilter} style={styles.applyBtn}>
                  <ThemedText style={styles.applyBtnText}>Apply Date Range</ThemedText>
                </TouchableOpacity>
              </ScrollView>
            )}

            {/* Calendar DateTimePicker */}
            {activePickerTarget && (
              <DateTimePicker
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                mode="date"
                onChange={handlePickerChange}
                value={activePickerTarget === 'range_start' ? tempRangeStart : tempRangeEnd}
              />
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.four,
    marginBottom: Spacing.two,
  },
  filterRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  filterButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: 10,
    gap: 8,
  },
  filterLabel: {
    flex: 1,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
    color: BrandColors.navy,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.four,
  },
  modalContent: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '75%',
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.lg,
    padding: Spacing.four,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 5,
  },
  dateModalContent: {
    maxHeight: 460,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.two,
    paddingBottom: Spacing.two,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 16,
    color: BrandColors.navy,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: BorderRadius.md,
    padding: 3,
    marginBottom: Spacing.three,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: BorderRadius.sm,
  },
  tabButtonActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 3,
    elevation: 2,
  },
  tabButtonText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13,
    color: '#64748B',
  },
  tabButtonTextActive: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_700Bold',
  },
  modalList: {
    maxHeight: 280,
  },
  modalItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: BorderRadius.sm,
  },
  modalItemActive: {
    backgroundColor: '#F8FAFC',
  },
  modalItemText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 14,
    color: '#334155',
  },
  modalItemTextActive: {
    fontFamily: 'PlusJakartaSans_700Bold',
    color: BrandColors.navy,
  },
  customDateContainer: {
    paddingVertical: 4,
  },
  rangeSectionTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 12,
    color: BrandColors.navy,
    marginBottom: 6,
  },
  datePickerInput: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: BorderRadius.md,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  datePickerInputLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  datePickerInputText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13,
    color: BrandColors.navy,
  },
  applyBtn: {
    backgroundColor: BrandColors.navy,
    paddingVertical: 12,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    marginBottom: 8,
  },
  applyBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
    color: '#FFFFFF',
  },
});

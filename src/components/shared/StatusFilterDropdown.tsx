import React, { useState } from 'react';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle, View } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import {
  type DropdownOption,
  FilterDropdownModal,
} from '@/components/MerchantManagement/FilterDropdownModal';

export type StatusDropdownOption<T = string> = DropdownOption<T>;

type Props<T extends string> = {
  label?: string;
  selected: T;
  onSelect: (status: T) => void;
  options: DropdownOption<T>[];
  title?: string;
  containerStyle?: StyleProp<ViewStyle>;
};

export function StatusFilterDropdown<T extends string>({
  label = 'Status',
  selected,
  onSelect,
  options,
  title = 'Filter by Status',
  containerStyle,
}: Props<T>) {
  const [modalVisible, setModalVisible] = useState(false);

  const selectedOption = options.find((opt) => opt.value === selected);
  const displayLabel = selectedOption?.label || selected;
  const isFiltered = selected !== 'All';

  return (
    <View style={[styles.container, containerStyle]}>
      <Pressable
        accessibilityHint={`Opens status filter menu. Currently selected: ${displayLabel}`}
        accessibilityLabel={`Filter by ${label}`}
        accessibilityRole="button"
        onPress={() => setModalVisible(true)}
        style={[styles.dropdownBtn, isFiltered && styles.dropdownBtnActive]}
      >
        <View style={styles.dropdownLeft}>
          <FontAwesome
            name="filter"
            size={12}
            color={isFiltered ? BrandColors.navy : BrandColors.grey}
          />
          <ThemedText style={styles.dropdownFieldLabel}>{label}:</ThemedText>
          <ThemedText
            numberOfLines={1}
            style={[styles.dropdownValueText, isFiltered && styles.dropdownValueTextActive]}
          >
            {displayLabel}
          </ThemedText>
        </View>

        <View style={styles.dropdownRight}>
          {isFiltered && (
            <Pressable
              accessibilityHint="Resets filter to All"
              accessibilityLabel="Reset status filter to All"
              accessibilityRole="button"
              hitSlop={8}
              onPress={(e) => {
                e.stopPropagation();
                onSelect('All' as T);
              }}
              style={styles.clearBtn}
            >
              <FontAwesome name="times-circle" size={13} color={BrandColors.grey} />
            </Pressable>
          )}
          <FontAwesome
            name="chevron-down"
            size={11}
            color={isFiltered ? BrandColors.navy : BrandColors.grey}
          />
        </View>
      </Pressable>

      <FilterDropdownModal<T>
        visible={modalVisible}
        title={title}
        options={options}
        selectedValue={selected}
        onSelect={onSelect}
        onClose={() => setModalVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    backgroundColor: 'white',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BrandColors.lightGray,
  },
  dropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F3F4F6',
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  dropdownBtnActive: {
    backgroundColor: 'rgba(17, 46, 88, 0.06)',
    borderColor: BrandColors.navy,
  },
  dropdownLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flex: 1,
    marginRight: Spacing.two,
  },
  dropdownFieldLabel: {
    fontSize: 12,
    color: BrandColors.grey,
    fontFamily: 'PlusJakartaSans_600SemiBold',
  },
  dropdownValueText: {
    fontSize: 12,
    color: '#333333',
    fontFamily: 'PlusJakartaSans_600SemiBold',
    flexShrink: 1,
  },
  dropdownValueTextActive: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_700Bold',
  },
  dropdownRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  clearBtn: {
    padding: 2,
  },
});

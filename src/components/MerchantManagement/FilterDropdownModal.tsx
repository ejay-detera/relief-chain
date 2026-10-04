import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';

export interface DropdownOption<T = string> {
  label: string;
  value: T;
  subtitle?: string;
}

type Props<T> = {
  visible: boolean;
  title: string;
  options: DropdownOption<T>[];
  selectedValue: T;
  onSelect: (value: T) => void;
  onClose: () => void;
};

export function FilterDropdownModal<T extends string | null>({
  visible,
  title,
  options,
  selectedValue,
  onSelect,
  onClose,
}: Props<T>) {
  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          {/* Header */}
          <View style={styles.header}>
            <ThemedText style={styles.title}>{title}</ThemedText>
            <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={10}>
              <FontAwesome name="times" size={16} color={BrandColors.grey} />
            </Pressable>
          </View>

          {/* Options List */}
          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          >
            {options.map((item, idx) => {
              const isSelected = item.value === selectedValue;
              return (
                <Pressable
                  key={`${String(item.value)}-${idx}`}
                  onPress={() => {
                    onSelect(item.value);
                    onClose();
                  }}
                  style={[styles.optionRow, isSelected && styles.optionRowSelected]}
                >
                  <View style={styles.optionTextContainer}>
                    <ThemedText
                      style={[
                        styles.optionLabel,
                        isSelected && styles.optionLabelSelected,
                      ]}
                      numberOfLines={1}
                    >
                      {item.label}
                    </ThemedText>
                    {item.subtitle && (
                      <ThemedText style={styles.optionSubtitle} numberOfLines={1}>
                        {item.subtitle}
                      </ThemedText>
                    )}
                  </View>

                  {isSelected && (
                    <FontAwesome
                      name="check"
                      size={14}
                      color={BrandColors.navy}
                    />
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
  },
  sheet: {
    backgroundColor: 'white',
    borderRadius: BorderRadius.xl,
    maxHeight: '60%',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: BrandColors.navy,
  },
  closeBtn: {
    padding: 4,
  },
  list: {
    maxHeight: 350,
  },
  listContent: {
    paddingVertical: Spacing.one,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F7F8FA',
  },
  optionRowSelected: {
    backgroundColor: '#F3F6FB',
  },
  optionTextContainer: {
    flex: 1,
    marginRight: Spacing.two,
  },
  optionLabel: {
    fontSize: 14,
    color: '#333333',
    fontWeight: '500',
  },
  optionLabelSelected: {
    color: BrandColors.navy,
    fontWeight: '700',
  },
  optionSubtitle: {
    fontSize: 11,
    color: BrandColors.grey,
    marginTop: 2,
  },
});

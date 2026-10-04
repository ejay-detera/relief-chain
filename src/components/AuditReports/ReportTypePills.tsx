import { FontAwesome } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import type { ReportType } from '@/types/reports';

interface ReportTypeOption {
  type: ReportType;
  label: string;
  icon: 'handshake-o' | 'send' | 'users' | 'shopping-cart' | 'bank' | 'exchange' | 'shield';
}

const REPORT_TYPE_OPTIONS: ReportTypeOption[] = [
  { type: 'financial', label: 'Financial Report', icon: 'bank' },
  { type: 'audit', label: 'Audit Trail', icon: 'shield' },
  { type: 'program', label: 'Program Report', icon: 'handshake-o' },
  { type: 'distribution', label: 'Distribution Report', icon: 'send' },
  { type: 'beneficiary', label: 'Beneficiary Report', icon: 'users' },
  { type: 'merchant', label: 'Merchant Report', icon: 'shopping-cart' },
  { type: 'transaction', label: 'Transactions', icon: 'exchange' },
];

interface Props {
  selectedType: ReportType;
  onSelectType: (type: ReportType) => void;
}

export const ReportTypePills = ({ selectedType, onSelectType }: Props) => {
  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        {REPORT_TYPE_OPTIONS.map((opt) => {
          const isSelected = selectedType === opt.type;
          return (
            <Pressable
              accessibilityLabel={`Select ${opt.label}`}
              accessibilityRole="button"
              key={opt.type}
              onPress={() => onSelectType(opt.type)}
              style={[styles.pill, isSelected && styles.pillActive]}
            >
              <FontAwesome
                color={isSelected ? '#FFFFFF' : BrandColors.navy}
                name={opt.icon}
                size={13}
              />
              <ThemedText style={[styles.pillText, isSelected && styles.pillTextActive]}>
                {opt.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: Spacing.two,
  },
  scrollContent: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  pillActive: {
    backgroundColor: BrandColors.navy,
    borderColor: BrandColors.navy,
  },
  pillText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
    color: BrandColors.navy,
  },
  pillTextActive: {
    color: '#FFFFFF',
  },
});

import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';
import { BrandColors, Spacing, BorderRadius } from '@/constants/theme';
import type { DatabaseProgram } from './Step1ProgramSelect';

type Props = {
  program: DatabaseProgram;
  onNext: () => void;
  onBack: () => void;
};

export const Step2ProgramSummary = ({ program, onNext, onBack }: Props) => {
  const amountVal = Number(program.amount_per_beneficiary);
  const budgetVal = Number(program.total_budget);
  const maxRecipients = amountVal > 0 ? Math.floor(budgetVal / amountVal) : 0;

  const hasRegistration = Boolean(program.registration_open && program.registration_close);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.headerCard}>
          <FontAwesome name="file-text-o" size={40} color={BrandColors.navy} style={styles.cardIcon} />
          <ThemedText style={styles.programName}>{program.name}</ThemedText>
          <View style={styles.statusBadge}>
            <ThemedText style={styles.statusText}>{program.status.toUpperCase()}</ThemedText>
          </View>
        </View>

        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Overview Details</ThemedText>
          <View style={styles.infoCard}>
            <SummaryRow label="Purpose" value={program.purpose || 'Disaster relief assistance'} />
            <SummaryRow label="Disaster Event" value={program.disaster_event || 'General Calamity'} />
            <SummaryRow label="Expires on" value={program.expires_at || '—'} />
          </View>
        </View>

        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Financial Config</ThemedText>
          <View style={styles.infoCard}>
            <SummaryRow label="Total Program Budget" value={`₱${budgetVal.toLocaleString(undefined, { minimumFractionDigits: 2 })}`} isBold />
            <SummaryRow label="Amount Per Household" value={`₱${amountVal.toLocaleString(undefined, { minimumFractionDigits: 2 })}`} />
            <SummaryRow label="Target Capacity" value={`${maxRecipients.toLocaleString()} Beneficiaries`} />
          </View>
        </View>

        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Registration Model</ThemedText>
          <View style={styles.infoCard}>
            <SummaryRow label="Requires Registration" value={hasRegistration ? 'YES' : 'NO (Direct Distribution)'} />
            {hasRegistration && (
              <>
                <SummaryRow label="Registration Open" value={program.registration_open || '—'} />
                <SummaryRow label="Registration Close" value={program.registration_close || '—'} />
              </>
            )}
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.btnRow}>
          <Pressable onPress={onBack} style={[styles.btn, styles.btnBack]}>
            <ThemedText style={styles.btnTextBack}>Change Program</ThemedText>
          </Pressable>
          <Pressable onPress={onNext} style={[styles.btn, styles.btnNext]}>
            <ThemedText style={styles.btnTextNext}>Load Beneficiaries</ThemedText>
          </Pressable>
        </View>
      </View>
    </View>
  );
};

const SummaryRow = ({ label, value, isBold = false }: { label: string; value: string; isBold?: boolean }) => (
  <View style={styles.row}>
    <ThemedText style={styles.rowLabel}>{label}</ThemedText>
    <ThemedText style={[styles.rowValue, isBold && styles.rowValueBold]}>{value}</ThemedText>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFC',
  },
  scroll: {
    padding: Spacing.four,
    gap: Spacing.four,
  },
  headerCard: {
    backgroundColor: 'white',
    borderRadius: BorderRadius.lg,
    padding: Spacing.five,
    alignItems: 'center',
    boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
  },
  cardIcon: {
    marginBottom: Spacing.two,
  },
  programName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: BrandColors.navy,
    textAlign: 'center',
    marginBottom: Spacing.two,
  },
  statusBadge: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: BrandColors.green,
  },
  section: {
    gap: Spacing.two,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: BrandColors.navy,
    paddingLeft: 4,
  },
  infoCard: {
    backgroundColor: 'white',
    borderRadius: BorderRadius.lg,
    padding: Spacing.four,
    boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F3F4F6',
  },
  rowLabel: {
    fontSize: 13,
    color: BrandColors.grey,
    flex: 0.4,
  },
  rowValue: {
    fontSize: 13,
    color: BrandColors.navy,
    fontWeight: '500',
    flex: 0.6,
    textAlign: 'right',
  },
  rowValueBold: {
    fontWeight: 'bold',
    color: BrandColors.green,
  },
  footer: {
    padding: Spacing.four,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderColor: '#E5E7EB',
  },
  btnRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  btn: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnBack: {
    borderWidth: 1,
    borderColor: BrandColors.navy,
    backgroundColor: 'white',
  },
  btnNext: {
    backgroundColor: BrandColors.navy,
  },
  btnTextBack: {
    color: BrandColors.navy,
    fontSize: 14,
    fontWeight: 'bold',
  },
  btnTextNext: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
});

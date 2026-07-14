import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';
import { BrandColors, Spacing, BorderRadius } from '@/constants/theme';
import type { UserProfile } from '@/types/auth';
import type { DatabaseProgram } from './Step1ProgramSelect';

type Props = {
  program: DatabaseProgram;
  selectedBeneficiaries: UserProfile[];
  onNext: () => void;
  onBack: () => void;
};

export const Step5DistributionReview = ({ program, selectedBeneficiaries, onNext, onBack }: Props) => {
  const amountVal = Number(program.amount_per_beneficiary);
  const totalPayout = selectedBeneficiaries.length * amountVal;
  const budgetTotal = Number(program.total_budget);
  const remainingBudget = budgetTotal - totalPayout;

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <FontAwesome name="check-square-o" size={44} color={BrandColors.green} />
          <ThemedText style={styles.title}>Review Aid Distribution</ThemedText>
          <ThemedText style={styles.subtitle}>
            Please review the summary below before signing the ledger distribution transaction.
          </ThemedText>
        </View>

        <View style={styles.summaryCard}>
          <ThemedText style={styles.programTitle}>{program.name}</ThemedText>
          <ThemedText style={styles.eventText}>Disaster: {program.disaster_event || 'General Assistance'}</ThemedText>

          <View style={styles.divider} />

          <View style={styles.row}>
            <ThemedText style={styles.label}>Recipients Selected</ThemedText>
            <ThemedText style={styles.value}>{selectedBeneficiaries.length} Households</ThemedText>
          </View>
          <View style={styles.row}>
            <ThemedText style={styles.label}>Aid Per Household</ThemedText>
            <ThemedText style={styles.value}>₱{amountVal.toLocaleString()}</ThemedText>
          </View>
          <View style={styles.row}>
            <ThemedText style={styles.label}>Total Payout Amount</ThemedText>
            <ThemedText style={[styles.value, styles.valuePayout]}>
              ₱{totalPayout.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </ThemedText>
          </View>

          <View style={styles.divider} />

          <View style={styles.row}>
            <ThemedText style={styles.label}>Remaining Program Budget</ThemedText>
            <ThemedText style={styles.value}>
              ₱{remainingBudget.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </ThemedText>
          </View>
        </View>

        <View style={styles.warningBox}>
          <FontAwesome name="info-circle" size={20} color="#3182CE" style={styles.warningIcon} />
          <View style={styles.warningContent}>
            <ThemedText style={styles.warningTitle}>Permanent Transaction</ThemedText>
            <ThemedText style={styles.warningText}>
              Signing this transaction will disburse vouchers and submit anchors directly on the Stellar testnet ledger. This action cannot be reversed.
            </ThemedText>
          </View>
        </View>
      </View>

      <View style={styles.footer}>
        <View style={styles.btnRow}>
          <Pressable onPress={onBack} style={[styles.btn, styles.btnBack]}>
            <ThemedText style={styles.btnTextBack}>Back</ThemedText>
          </Pressable>
          <Pressable onPress={onNext} style={[styles.btn, styles.btnNext]}>
            <ThemedText style={styles.btnTextNext}>Sign & Distribute</ThemedText>
          </Pressable>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFC',
  },
  content: {
    flex: 1,
    padding: Spacing.four,
  },
  header: {
    alignItems: 'center',
    marginBottom: Spacing.six,
    gap: Spacing.two,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: BrandColors.navy,
  },
  subtitle: {
    fontSize: 12,
    color: BrandColors.grey,
    textAlign: 'center',
    paddingHorizontal: Spacing.four,
  },
  summaryCard: {
    backgroundColor: 'white',
    borderRadius: BorderRadius.lg,
    padding: Spacing.five,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
    marginBottom: Spacing.five,
  },
  programTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: BrandColors.navy,
    marginBottom: 4,
  },
  eventText: {
    fontSize: 12,
    color: BrandColors.grey,
    marginBottom: Spacing.four,
  },
  divider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: Spacing.three,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  label: {
    fontSize: 13,
    color: BrandColors.grey,
  },
  value: {
    fontSize: 13,
    fontWeight: '600',
    color: BrandColors.navy,
  },
  valuePayout: {
    color: BrandColors.green,
    fontWeight: 'bold',
    fontSize: 15,
  },
  warningBox: {
    flexDirection: 'row',
    backgroundColor: '#EBF8FF',
    borderColor: '#BEE3F8',
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  warningIcon: {
    marginTop: 2,
  },
  warningContent: {
    flex: 1,
  },
  warningTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#2B6CB0',
    marginBottom: 2,
  },
  warningText: {
    fontSize: 12,
    color: '#2B6CB0',
    lineHeight: 18,
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

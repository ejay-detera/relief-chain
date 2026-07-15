import React from 'react';
import { View, StyleSheet, ScrollView, Text, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { useCreateProgram } from './_layout';
import { StepIndicator } from '@/components/CreateProgram/StepIndicator';
import { WizardNavigation } from '@/components/CreateProgram/WizardNavigation';
import { BrandColors, BorderRadius, Spacing } from '@/constants/theme';

export default function BudgetScreen() {
  const router = useRouter();
  const { draft, updateDraft } = useCreateProgram();

  const handleNext = () => {
    router.push('/(lgu)/create-program/schedule' as any);
  };

  const handleBack = () => {
    router.back();
  };

  const isNextDisabled = draft.totalBudget <= 0 || draft.aidPerHousehold <= 0;

  // Format currency helpers
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 0 }).format(val);
  };

  const formatNumberInput = (val: number) => {
    return val === 0 ? '' : val.toString();
  };

  return (
    <View style={styles.container}>
      <StepIndicator currentStep={2} title="Budget Allocation" />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Total Budget */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>Total Budget (₱) <Text style={styles.required}>*</Text></Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 5000000"
            placeholderTextColor={BrandColors.grey}
            keyboardType="numeric"
            value={formatNumberInput(draft.totalBudget)}
            onChangeText={(text) => {
              const numVal = parseFloat(text.replace(/[^0-9.]/g, '')) || 0;
              updateDraft({ totalBudget: numVal });
            }}
          />
        </View>

        {/* Aid Amount per Household */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>Aid Amount per Household (₱) <Text style={styles.required}>*</Text></Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 5000"
            placeholderTextColor={BrandColors.grey}
            keyboardType="numeric"
            value={formatNumberInput(draft.aidPerHousehold)}
            onChangeText={(text) => {
              const numVal = parseFloat(text.replace(/[^0-9.]/g, '')) || 0;
              updateDraft({ aidPerHousehold: numVal });
            }}
          />
        </View>

        {/* Calculator Display Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Real-time Beneficiary Calculation</Text>
          
          <View style={styles.calcRow}>
            <Text style={styles.calcLabel}>Total Budget:</Text>
            <Text style={styles.calcValue}>{formatCurrency(draft.totalBudget)}</Text>
          </View>

          <View style={styles.calcRowDivider} />

          <View style={styles.calcRow}>
            <Text style={styles.calcLabel}>Aid per Household:</Text>
            <Text style={styles.calcValue}>{formatCurrency(draft.aidPerHousehold)}</Text>
          </View>

          <View style={styles.calcResultBox}>
            <Text style={styles.calcResultLabel}>Estimated Beneficiaries:</Text>
            <Text style={styles.calcResultValue}>
              {draft.maxBeneficiaries.toLocaleString()} households
            </Text>
          </View>

          <Text style={styles.formulaText}>
            Formula: Estimated Beneficiaries = Total Budget / Aid Amount
          </Text>
        </View>
      </ScrollView>

      <WizardNavigation onBack={handleBack} onNext={handleNext} disableNext={isNextDisabled} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF9F6',
  },
  scrollContent: {
    padding: Spacing.three,
    paddingBottom: Spacing.six,
  },
  formGroup: {
    marginBottom: Spacing.three,
  },
  label: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: BrandColors.navy,
    marginBottom: Spacing.one,
  },
  required: {
    color: 'red',
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: BrandColors.lightGray,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.three,
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_400Regular',
    backgroundColor: '#FFFFFF',
    color: BrandColors.navy,
  },
  card: {
    marginTop: Spacing.four,
    padding: Spacing.three,
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: BrandColors.lightGray,
    elevation: 2,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  cardTitle: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: BrandColors.navy,
    marginBottom: Spacing.three,
  },
  calcRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.one,
  },
  calcLabel: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: BrandColors.grey,
  },
  calcValue: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: BrandColors.navy,
  },
  calcRowDivider: {
    height: 1,
    backgroundColor: BrandColors.lightGray,
    marginVertical: Spacing.two,
  },
  calcResultBox: {
    marginTop: Spacing.three,
    padding: Spacing.three,
    borderRadius: BorderRadius.md,
    backgroundColor: '#F1FAF1',
    alignItems: 'center',
  },
  calcResultLabel: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: BrandColors.green,
    textTransform: 'uppercase',
    marginBottom: Spacing.one,
  },
  calcResultValue: {
    fontSize: 20,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: BrandColors.navy,
  },
  formulaText: {
    marginTop: Spacing.three,
    fontSize: 11,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: BrandColors.grey,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});

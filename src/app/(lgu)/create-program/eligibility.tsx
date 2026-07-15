import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Text, TextInput, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useCreateProgram } from './_layout';
import { StepIndicator } from '@/components/CreateProgram/StepIndicator';
import { WizardNavigation } from '@/components/CreateProgram/WizardNavigation';
import { BrandColors, BorderRadius, Spacing } from '@/constants/theme';

export default function EligibilityScreen() {
  const router = useRouter();
  const { draft, updateDraft } = useCreateProgram();
  const [customCriteria, setCustomCriteria] = useState('');

  const handleNext = () => {
    router.push('/(lgu)/create-program/voucher' as any);
  };

  const handleBack = () => {
    router.back();
  };

  const toggleCriteria = (item: string) => {
    const updated = draft.eligibilityCriteria.includes(item)
      ? draft.eligibilityCriteria.filter((c) => c !== item)
      : [...draft.eligibilityCriteria, item];
    updateDraft({ eligibilityCriteria: updated });
  };

  const addCustomCriteria = () => {
    if (customCriteria.trim() && !draft.eligibilityCriteria.includes(customCriteria.trim())) {
      updateDraft({
        eligibilityCriteria: [...draft.eligibilityCriteria, customCriteria.trim()],
      });
      setCustomCriteria('');
    }
  };

  // We always show these standard ones even if deselected (so they can be re-selected)
  const standardOptions = [
    'Resident of selected municipality',
    'Government-issued ID required',
    'Household affected by disaster',
    'Not already receiving aid from this program',
  ];

  // Merge standard options and any custom ones added to the draft
  const allOptions = Array.from(new Set([...standardOptions, ...draft.eligibilityCriteria]));

  return (
    <View style={styles.container}>
      <StepIndicator currentStep={4} title="Eligibility Criteria" />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.sectionDescription}>
          Select the criteria beneficiaries must meet to be eligible for this aid program. You can check/uncheck these or add custom rules.
        </Text>

        {/* Checkbox List */}
        <View style={styles.listContainer}>
          {allOptions.map((item) => {
            const isChecked = draft.eligibilityCriteria.includes(item);
            return (
              <TouchableOpacity
                key={item}
                style={[styles.checkboxRow, isChecked && styles.checkedRow]}
                onPress={() => toggleCriteria(item)}>
                <View style={[styles.checkbox, isChecked && styles.checkboxActive]}>
                  {isChecked ? <Text style={styles.checkmark}>✓</Text> : null}
                </View>
                <Text style={[styles.checkboxText, isChecked && styles.checkedText]}>{item}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Add Custom Criteria */}
        <View style={styles.addCustomGroup}>
          <Text style={styles.customLabel}>Add Custom Eligibility Rule</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.customInput}
              placeholder="e.g. Has at least 2 dependents"
              placeholderTextColor={BrandColors.grey}
              value={customCriteria}
              onChangeText={setCustomCriteria}
            />
            <TouchableOpacity style={styles.addButton} onPress={addCustomCriteria}>
              <Text style={styles.addButtonText}>Add</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      <WizardNavigation onBack={handleBack} onNext={handleNext} disableNext={draft.eligibilityCriteria.length === 0} />
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
  sectionDescription: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: BrandColors.grey,
    lineHeight: 20,
    marginBottom: Spacing.four,
  },
  listContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: BrandColors.lightGray,
    padding: Spacing.three,
    marginBottom: Spacing.four,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  checkedRow: {
    backgroundColor: '#F9FCF9',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 2,
    borderColor: BrandColors.grey,
    borderRadius: BorderRadius.sm,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.three,
  },
  checkboxActive: {
    borderColor: BrandColors.green,
    backgroundColor: BrandColors.green,
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  checkboxText: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: BrandColors.navy,
    flex: 1,
  },
  checkedText: {
    fontFamily: 'PlusJakartaSans_700Bold',
  },
  addCustomGroup: {
    marginTop: Spacing.two,
  },
  customLabel: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: BrandColors.navy,
    marginBottom: Spacing.one,
  },
  inputRow: {
    flexDirection: 'row',
  },
  customInput: {
    flex: 1,
    height: 48,
    borderWidth: 1,
    borderColor: BrandColors.lightGray,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.three,
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_400Regular',
    backgroundColor: '#FFFFFF',
    color: BrandColors.navy,
    marginRight: Spacing.two,
  },
  addButton: {
    width: 72,
    height: 48,
    backgroundColor: BrandColors.navy,
    borderRadius: BorderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButtonText: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#FFFFFF',
  },
});

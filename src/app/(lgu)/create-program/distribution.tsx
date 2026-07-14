import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Text, TouchableOpacity, Modal, FlatList, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { useCreateProgram } from './_layout';
import { StepIndicator } from '@/components/CreateProgram/StepIndicator';
import { WizardNavigation } from '@/components/CreateProgram/WizardNavigation';
import { BrandColors, BorderRadius, Spacing } from '@/constants/theme';

const METHODS = ['Automatic Distribution', 'Manual Distribution', 'Batch Distribution'];

export default function DistributionScreen() {
  const router = useRouter();
  const { draft, updateDraft } = useCreateProgram();
  const [methodModalVisible, setMethodModalVisible] = useState(false);

  const handleNext = () => {
    router.push('/(lgu)/create-program/documents' as any);
  };

  const handleBack = () => {
    router.back();
  };

  const getMethodLabel = (val: string) => {
    if (val === 'automatic') return 'Automatic Distribution';
    if (val === 'manual') return 'Manual Distribution';
    if (val === 'batch') return 'Batch Distribution';
    return val;
  };

  return (
    <View style={styles.container}>
      <StepIndicator currentStep={6} title="Distribution Method" />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Distribution Method */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>Distribution Method <Text style={styles.required}>*</Text></Text>
          <TouchableOpacity
            style={styles.dropdownTrigger}
            onPress={() => setMethodModalVisible(true)}>
            <Text style={styles.dropdownValue}>
              {getMethodLabel(draft.distributionMethod)}
            </Text>
            <Text style={styles.dropdownChevron}>▼</Text>
          </TouchableOpacity>
          <Text style={styles.helpText}>
            {draft.distributionMethod === 'automatic' && 'Vouchers are auto-assigned as soon as beneficiaries are approved.'}
            {draft.distributionMethod === 'manual' && 'LGU admins will manually assign vouchers to approved beneficiaries.'}
            {draft.distributionMethod === 'batch' && 'Vouchers are distributed in schedule-based batches.'}
          </Text>
        </View>

        {/* Wallet Type Toggle */}
        <View style={styles.toggleRow}>
          <View style={styles.toggleInfo}>
            <Text style={styles.toggleTitle}>Wallet Type</Text>
            <Text style={styles.toggleDescription}>
              {draft.walletTypeToggle
                ? 'Organization Wallet — Multi-sig wallet owned by the city office.'
                : 'Individual Wallet — Standard Stellar user wallets.'}
            </Text>
          </View>
          <Switch
            trackColor={{ false: BrandColors.lightGray, true: '#D0ECD0' }}
            thumbColor={draft.walletTypeToggle ? BrandColors.green : '#F4F3F4'}
            onValueChange={(val) => updateDraft({ walletTypeToggle: val })}
            value={draft.walletTypeToggle}
          />
        </View>

        <View style={styles.divider} />

        {/* Auto Distribute Toggle */}
        <View style={styles.toggleRow}>
          <View style={styles.toggleInfo}>
            <Text style={styles.toggleTitle}>Auto-Distribute After Verification</Text>
            <Text style={styles.toggleDescription}>
              Automatically trigger Stellar transaction transfer when beneficiary eligibility is verified.
            </Text>
          </View>
          <Switch
            trackColor={{ false: BrandColors.lightGray, true: '#D0ECD0' }}
            thumbColor={draft.autoDistributeToggle ? BrandColors.green : '#F4F3F4'}
            onValueChange={(val) => updateDraft({ autoDistributeToggle: val })}
            value={draft.autoDistributeToggle}
          />
        </View>
      </ScrollView>

      <WizardNavigation onBack={handleBack} onNext={handleNext} />

      {/* DISTRIBUTION METHOD MODAL */}
      <Modal visible={methodModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Distribution Method</Text>
              <TouchableOpacity onPress={() => setMethodModalVisible(false)}>
                <Text style={styles.closeButton}>Cancel</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={METHODS}
              keyExtractor={(item) => item}
              renderItem={({ item }) => {
                const val = item.split(' ')[0].toLowerCase();
                const isSelected = draft.distributionMethod === val;
                return (
                  <TouchableOpacity
                    style={[styles.modalItem, isSelected && styles.selectedItem]}
                    onPress={() => {
                      updateDraft({ distributionMethod: val as any });
                      setMethodModalVisible(false);
                    }}>
                    <Text style={[styles.modalItemText, isSelected && styles.selectedItemText]}>
                      {item}
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>
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
    marginBottom: Spacing.four,
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
  dropdownTrigger: {
    height: 48,
    borderWidth: 1,
    borderColor: BrandColors.lightGray,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.three,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  dropdownValue: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: BrandColors.navy,
  },
  dropdownChevron: {
    fontSize: 12,
    color: BrandColors.grey,
  },
  helpText: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: BrandColors.grey,
    marginTop: Spacing.one,
    lineHeight: 16,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.three,
  },
  toggleInfo: {
    flex: 1,
    marginRight: Spacing.three,
  },
  toggleTitle: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: BrandColors.navy,
    marginBottom: 4,
  },
  toggleDescription: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: BrandColors.grey,
    lineHeight: 16,
  },
  divider: {
    height: 1,
    backgroundColor: BrandColors.lightGray,
    marginVertical: Spacing.two,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    maxHeight: '40%',
    paddingBottom: Spacing.five,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.three,
    borderBottomWidth: 1,
    borderBottomColor: BrandColors.lightGray,
  },
  modalTitle: {
    fontSize: 16,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: BrandColors.navy,
  },
  closeButton: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: BrandColors.green,
  },
  modalItem: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  selectedItem: {
    backgroundColor: '#F1FAF1',
  },
  modalItemText: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: BrandColors.navy,
  },
  selectedItemText: {
    color: BrandColors.green,
    fontFamily: 'PlusJakartaSans_700Bold',
  },
});

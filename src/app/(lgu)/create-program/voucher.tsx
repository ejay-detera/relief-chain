import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useCreateProgram } from './_layout';
import { StepIndicator } from '@/components/CreateProgram/StepIndicator';
import { WizardNavigation } from '@/components/CreateProgram/WizardNavigation';
import { BrandColors, BorderRadius, Spacing } from '@/constants/theme';
import { fetchRegisteredMerchants } from '@/services/programService';

const DEFAULT_MERCHANTS = [
  'SM Supermarket',
  'Puregold',
  '7-Eleven',
  'Mercury Drug',
  'Robinsons Supermarket',
  'Metro Gaisano',
];

const VOUCHER_TYPES = [
  { value: 'food', label: 'Food Assistance' },
  { value: 'medicine', label: 'Medicine Assistance' },
  { value: 'supplies', label: 'Supplies Assistance' },
];

export default function VoucherScreen() {
  const router = useRouter();
  const { draft, updateDraft } = useCreateProgram();

  const [dateError, setDateError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Dropdown/Modal visibility states
  const [voucherTypeModalVisible, setVoucherTypeModalVisible] = useState(false);
  const [merchantModalVisible, setMerchantModalVisible] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Dynamic merchants state
  const [dbMerchants, setDbMerchants] = useState<string[]>([]);
  const [isLoadingMerchants, setIsLoadingMerchants] = useState(true);

  useEffect(() => {
    let active = true;
    const fetchMerchants = async () => {
      try {
        const names = await fetchRegisteredMerchants();
        if (active) {
          const merged = Array.from(new Set([...names, ...DEFAULT_MERCHANTS]));
          setDbMerchants(merged);
        }
      } catch (err) {
        console.error('Error fetching database merchants:', err);
        if (active) {
          setDbMerchants(DEFAULT_MERCHANTS);
        }
      } finally {
        if (active) {
          setIsLoadingMerchants(false);
        }
      }
    };
    fetchMerchants();
    return () => {
      active = false;
    };
  }, []);

  const getExpirationDateObject = () => {
    if (draft.voucherExpiration) {
      const parsed = Date.parse(draft.voucherExpiration);
      if (!isNaN(parsed)) return new Date(parsed);
    }
    return new Date();
  };

  const onExpirationChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (selectedDate) {
      const formatted = selectedDate.toISOString().split('T')[0];
      updateDraft({ voucherExpiration: formatted });
      setDateError('');
    }
  };

  // Computations & validations
  const hasVouchersSelected = draft.voucherTypes.length > 0;
  const totalAidValuePerBeneficiary = hasVouchersSelected
    ? draft.voucherValue * draft.voucherQuantity
    : 0;
  const remainingCash = draft.aidPerHousehold - totalAidValuePerBeneficiary;
  const isBudgetExceeded = totalAidValuePerBeneficiary > draft.aidPerHousehold;
  const maxVouchersToGenerate = draft.maxBeneficiaries * (hasVouchersSelected ? draft.voucherQuantity : 0);

  const handleNext = () => {
    if (hasVouchersSelected && !draft.voucherExpiration) {
      setDateError('Expiration date is required.');
      return;
    }
    if (isBudgetExceeded) {
      return; // Block progression
    }
    setDateError('');
    router.push('/(lgu)/create-program/documents' as any);
  };

  const handleBack = () => {
    router.back();
  };

  const toggleVoucherType = (type: string) => {
    const isSelected = draft.voucherTypes.includes(type);
    const updated = isSelected
      ? draft.voucherTypes.filter((t) => t !== type)
      : [...draft.voucherTypes, type];
    
    const updates: Partial<typeof draft> = { voucherTypes: updated };
    if (updated.length === 0) {
      updates.voucherValue = 0;
      updates.voucherQuantity = 1;
      updates.voucherExpiration = '';
      updates.selectedMerchants = [];
    }
    updateDraft(updates);
  };

  const toggleMerchant = (merchant: string) => {
    const updated = draft.selectedMerchants.includes(merchant)
      ? draft.selectedMerchants.filter((m) => m !== merchant)
      : [...draft.selectedMerchants, merchant];
    updateDraft({ selectedMerchants: updated });
  };

  const setPresetDate = (daysFromNow: number) => {
    const d = new Date();
    d.setDate(d.getDate() + daysFromNow);
    const formatted = d.toISOString().split('T')[0];
    updateDraft({ voucherExpiration: formatted });
    setDateError('');
  };

  const filteredMerchants = dbMerchants.filter((m) =>
    m.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getVoucherTypeLabels = () => {
    if (draft.voucherTypes.length === 0) return 'Select Voucher Types';
    return draft.voucherTypes
      .map((val) => {
        const found = VOUCHER_TYPES.find((t) => t.value === val);
        return found ? found.label : val;
      })
      .join(', ');
  };

  const isNextDisabled =
    (hasVouchersSelected && (
      draft.voucherValue <= 0 ||
      draft.voucherQuantity <= 0 ||
      !draft.voucherExpiration ||
      isBudgetExceeded ||
      (draft.redemptionType === 'merchant' && draft.selectedMerchants.length === 0)
    ));

  return (
    <View style={styles.container}>
      <StepIndicator currentStep={5} title="Voucher Configuration" />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* BUDGET ALLOCATION INFO CARD */}
        <View style={styles.budgetCard}>
          <Text style={styles.budgetCardTitle}>Step 2 Budget Reference</Text>
          <View style={styles.budgetRow}>
            <View style={styles.budgetCol}>
              <Text style={styles.budgetLabel}>Total Budget</Text>
              <Text style={styles.budgetValue}>₱{draft.totalBudget.toLocaleString()}</Text>
            </View>
            <View style={styles.budgetCol}>
              <Text style={styles.budgetLabel}>Aid / Household</Text>
              <Text style={styles.budgetValue}>₱{draft.aidPerHousehold.toLocaleString()}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.budgetRow}>
            <View style={styles.budgetCol}>
              <Text style={styles.budgetLabel}>Total Voucher Value</Text>
              <Text style={[styles.budgetValue, isBudgetExceeded && styles.errorValue]}>
                ₱{totalAidValuePerBeneficiary.toLocaleString()}
              </Text>
            </View>
            <View style={styles.budgetCol}>
              <Text style={styles.budgetLabel}>Remaining Cash Assistance</Text>
              <Text style={[styles.budgetValue, styles.cashValue]}>
                ₱{remainingCash.toLocaleString()}
              </Text>
            </View>
          </View>

          {hasVouchersSelected && (
            <>
              <View style={styles.divider} />
              <View style={styles.budgetRow}>
                <View style={styles.budgetCol}>
                  <Text style={styles.budgetLabel}>Max Vouchers Generated</Text>
                  <Text style={styles.budgetValue}>{maxVouchersToGenerate.toLocaleString()} units</Text>
                </View>
                <View style={styles.budgetCol} />
              </View>
            </>
          )}

          {isBudgetExceeded ? (
            <View style={styles.warningContainer}>
              <Text style={styles.warningText}>
                ⚠️ Total configured value (₱{totalAidValuePerBeneficiary.toLocaleString()}) exceeds the allocated aid limit of ₱{draft.aidPerHousehold.toLocaleString()} per household.
              </Text>
            </View>
          ) : (
            <View style={[styles.infoContainer, remainingCash === 0 && styles.allVouchersContainer]}>
              <Text style={[styles.infoText, remainingCash === 0 && styles.allVouchersText]}>
                {remainingCash > 0
                  ? `💡 Note: The remaining ₱${remainingCash.toLocaleString()} per household will be distributed automatically as Cash Assistance.`
                  : `🎉 All allocated aid (₱${draft.aidPerHousehold.toLocaleString()}) will be distributed via vouchers.`}
              </Text>
            </View>
          )}
        </View>

        {/* Voucher Type (Dropdown with Multi-Select) */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>Voucher Types</Text>
          <TouchableOpacity
            style={styles.dropdownTrigger}
            onPress={() => setVoucherTypeModalVisible(true)}>
            <Text style={[styles.dropdownValue, draft.voucherTypes.length === 0 && styles.placeholderText]}>
              {getVoucherTypeLabels()}
            </Text>
            <Text style={styles.dropdownChevron}>▼</Text>
          </TouchableOpacity>
        </View>

        {hasVouchersSelected ? (
          <>
            {/* Voucher Value */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Voucher Value per Unit (₱) <Text style={styles.required}>*</Text></Text>
              <TextInput
                style={[styles.input, isBudgetExceeded && styles.inputError]}
                placeholder="e.g. 500"
                placeholderTextColor={BrandColors.grey}
                keyboardType="numeric"
                value={draft.voucherValue === 0 ? '' : draft.voucherValue.toString()}
                onChangeText={(text) => {
                  const numVal = parseFloat(text.replace(/[^0-9.]/g, '')) || 0;
                  updateDraft({ voucherValue: numVal });
                }}
              />
            </View>

            {/* Quantity per Beneficiary */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Quantity per Beneficiary <Text style={styles.required}>*</Text></Text>
              <TextInput
                style={[styles.input, isBudgetExceeded && styles.inputError]}
                placeholder="e.g. 1"
                placeholderTextColor={BrandColors.grey}
                keyboardType="numeric"
                value={draft.voucherQuantity.toString()}
                onChangeText={(text) => {
                  const numVal = parseInt(text.replace(/[^0-9]/g, ''), 10) || 1;
                  updateDraft({ voucherQuantity: numVal });
                }}
              />
            </View>

            {/* Expiration Date (Native picker trigger) */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Expiration Date <Text style={styles.required}>*</Text></Text>
              <TouchableOpacity
                style={[styles.dropdownTrigger, dateError ? styles.inputError : null]}
                onPress={() => setShowDatePicker(true)}>
                <Text style={[styles.dropdownValue, !draft.voucherExpiration && styles.placeholderText]}>
                  {draft.voucherExpiration || 'Select Expiration Date (YYYY-MM-DD)'}
                </Text>
                <Text style={styles.calendarIcon}>📅</Text>
              </TouchableOpacity>
              {dateError ? <Text style={styles.errorText}>{dateError}</Text> : null}

              {showDatePicker && (
                <DateTimePicker
                  value={getExpirationDateObject()}
                  mode="date"
                  display="default"
                  onChange={onExpirationChange}
                />
              )}

              {/* Presets */}
              <View style={styles.presetContainer}>
                <TouchableOpacity style={styles.presetBtn} onPress={() => setPresetDate(30)}>
                  <Text style={styles.presetBtnText}>1 Month</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.presetBtn} onPress={() => setPresetDate(90)}>
                  <Text style={styles.presetBtnText}>3 Months</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.presetBtn} onPress={() => setPresetDate(180)}>
                  <Text style={styles.presetBtnText}>6 Months</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Redemption Type */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Redemption Type <Text style={styles.required}>*</Text></Text>
              <View style={styles.segmentedContainer}>
                <TouchableOpacity
                  style={[styles.segmentBtn, draft.redemptionType === 'cash' && styles.segmentBtnActive]}
                  onPress={() => updateDraft({ redemptionType: 'cash' })}>
                  <Text style={[styles.segmentBtnText, draft.redemptionType === 'cash' && styles.segmentBtnTextActive]}>
                    Cash Redemption
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.segmentBtn, draft.redemptionType === 'merchant' && styles.segmentBtnActive]}
                  onPress={() => updateDraft({ redemptionType: 'merchant' })}>
                  <Text style={[styles.segmentBtnText, draft.redemptionType === 'merchant' && styles.segmentBtnTextActive]}>
                    Merchant Voucher
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Select Merchants section if redemption type is Merchant Voucher */}
            {draft.redemptionType === 'merchant' && (
              <View style={styles.formGroup}>
                <Text style={styles.label}>Allowed Merchants <Text style={styles.required}>*</Text></Text>
                <TouchableOpacity
                  style={styles.dropdownTrigger}
                  onPress={() => setMerchantModalVisible(true)}>
                  <Text style={[styles.dropdownValue, draft.selectedMerchants.length === 0 && styles.placeholderText]}>
                    {draft.selectedMerchants.length > 0
                      ? `${draft.selectedMerchants.length} merchant(s) selected`
                      : 'Select Allowed Merchants'}
                  </Text>
                  <Text style={styles.dropdownChevron}>▼</Text>
                </TouchableOpacity>
                {draft.selectedMerchants.length > 0 && (
                  <Text style={styles.selectedListText}>
                    Selected: {draft.selectedMerchants.join(', ')}
                  </Text>
                )}
              </View>
            )}
          </>
        ) : (
          <View style={styles.pureCashBanner}>
            <Text style={styles.pureCashBannerText}>
              💸 No specific voucher categories selected. The full amount of ₱{draft.aidPerHousehold.toLocaleString()} per household will be distributed as Cash Assistance directly.
            </Text>
          </View>
        )}
      </ScrollView>

      <WizardNavigation onBack={handleBack} onNext={handleNext} disableNext={isNextDisabled} />

      {/* VOUCHER TYPES MULTI SELECT MODAL */}
      <Modal visible={voucherTypeModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Voucher Types</Text>
              <TouchableOpacity onPress={() => setVoucherTypeModalVisible(false)}>
                <Text style={styles.closeButton}>Done</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={VOUCHER_TYPES}
              keyExtractor={(item) => item.value}
              renderItem={({ item }) => {
                const isSelected = draft.voucherTypes.includes(item.value);
                return (
                  <TouchableOpacity
                    style={[styles.modalItem, isSelected && styles.selectedItem]}
                    onPress={() => toggleVoucherType(item.value)}>
                    <Text style={[styles.modalItemText, isSelected && styles.selectedItemText]}>
                      {item.label} {isSelected ? '✓' : ''}
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>

      {/* MERCHANT SEARCH MODAL */}
      <Modal visible={merchantModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Allowed Merchants</Text>
              <TouchableOpacity onPress={() => setMerchantModalVisible(false)}>
                <Text style={styles.closeButton}>Done</Text>
              </TouchableOpacity>
            </View>

            {/* Search input */}
            <View style={styles.searchContainer}>
              <TextInput
                style={styles.searchInput}
                placeholder="Search Merchant..."
                placeholderTextColor={BrandColors.grey}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>

            {/* Merchants List */}
            {isLoadingMerchants ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color={BrandColors.green} />
              </View>
            ) : (
              <FlatList
                data={filteredMerchants}
                keyExtractor={(item) => item}
                contentContainerStyle={styles.listContent}
                renderItem={({ item }) => {
                  const isSelected = draft.selectedMerchants.includes(item);
                  return (
                    <TouchableOpacity
                      style={[styles.modalItem, isSelected && styles.selectedItem]}
                      onPress={() => toggleMerchant(item)}>
                      <Text style={[styles.modalItemText, isSelected && styles.selectedItemText]}>
                        {item} {isSelected ? '✓' : ''}
                      </Text>
                    </TouchableOpacity>
                  );
                }}
                ListEmptyComponent={
                  <Text style={styles.emptyText}>{`No merchants found matching "${searchQuery}"`}</Text>
                }
              />
            )}
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
  budgetCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.md,
    padding: Spacing.three,
    marginBottom: Spacing.three,
    borderWidth: 1,
    borderColor: BrandColors.lightGray,
    elevation: 1,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  budgetCardTitle: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: BrandColors.grey,
    textTransform: 'uppercase',
    marginBottom: Spacing.two,
  },
  budgetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: Spacing.one,
  },
  budgetCol: {
    flex: 1,
  },
  budgetLabel: {
    fontSize: 10,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: BrandColors.grey,
  },
  budgetValue: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: BrandColors.navy,
  },
  cashValue: {
    color: BrandColors.green,
  },
  errorValue: {
    color: 'red',
  },
  divider: {
    height: 1,
    backgroundColor: BrandColors.lightGray,
    marginVertical: Spacing.two,
  },
  warningContainer: {
    backgroundColor: '#FFF2F2',
    padding: Spacing.two,
    borderRadius: BorderRadius.sm,
    marginTop: Spacing.two,
    borderWidth: 1,
    borderColor: '#FFD1D1',
  },
  warningText: {
    color: 'red',
    fontSize: 11,
    fontFamily: 'PlusJakartaSans_500Medium',
    lineHeight: 15,
  },
  infoContainer: {
    backgroundColor: '#F4F9F2',
    padding: Spacing.two,
    borderRadius: BorderRadius.sm,
    marginTop: Spacing.two,
    borderWidth: 1,
    borderColor: '#D4EBD1',
  },
  allVouchersContainer: {
    backgroundColor: '#F0F9FF',
    borderColor: '#CBE5FF',
  },
  infoText: {
    color: BrandColors.green,
    fontSize: 11,
    fontFamily: 'PlusJakartaSans_500Medium',
    lineHeight: 15,
  },
  allVouchersText: {
    color: BrandColors.navy,
  },
  pureCashBanner: {
    backgroundColor: '#FFFBE6',
    borderWidth: 1,
    borderColor: '#FFE58F',
    borderRadius: BorderRadius.md,
    padding: Spacing.three,
    marginTop: Spacing.one,
  },
  pureCashBannerText: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: '#D46B08',
    lineHeight: 18,
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
  segmentedContainer: {
    flexDirection: 'row',
    backgroundColor: BrandColors.lightGray,
    borderRadius: BorderRadius.md,
    padding: 2,
    height: 44,
  },
  segmentBtn: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: BorderRadius.md - 2,
  },
  segmentBtnActive: {
    backgroundColor: '#FFFFFF',
    elevation: 2,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  segmentBtnText: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: BrandColors.grey,
  },
  segmentBtnTextActive: {
    fontFamily: 'PlusJakartaSans_700Bold',
    color: BrandColors.navy,
  },
  presetContainer: {
    flexDirection: 'row',
    marginTop: Spacing.two,
  },
  presetBtn: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: BrandColors.green,
    marginRight: Spacing.two,
    backgroundColor: '#FFFFFF',
  },
  presetBtnText: {
    fontSize: 11,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: BrandColors.green,
  },
  inputError: {
    borderColor: 'red',
  },
  errorText: {
    color: 'red',
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_400Regular',
    marginTop: Spacing.one,
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
  placeholderText: {
    color: BrandColors.grey,
  },
  dropdownChevron: {
    fontSize: 12,
    color: BrandColors.grey,
  },
  calendarIcon: {
    fontSize: 16,
    color: BrandColors.grey,
  },
  selectedListText: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: BrandColors.green,
    marginTop: Spacing.one,
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
    height: '60%',
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
  searchContainer: {
    padding: Spacing.three,
    borderBottomWidth: 1,
    borderBottomColor: BrandColors.lightGray,
  },
  searchInput: {
    height: 40,
    borderWidth: 1,
    borderColor: BrandColors.lightGray,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.three,
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 13,
    backgroundColor: '#FAF9F6',
    color: BrandColors.navy,
  },
  loadingContainer: {
    padding: Spacing.five,
    alignItems: 'center',
  },
  listContent: {
    paddingBottom: Spacing.five,
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
  emptyText: {
    padding: Spacing.four,
    textAlign: 'center',
    color: BrandColors.grey,
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 13,
  },
});

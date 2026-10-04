import { StepIndicator } from '@/components/CreateProgram/StepIndicator';
import { WizardNavigation } from '@/components/CreateProgram/WizardNavigation';
import { FadeInView } from '@/components/shared/FadeInView';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { fetchRegisteredMerchants } from '@/services/programService';
import { FontAwesome } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { useCreateProgram } from './_layout';

const VOUCHER_TYPES = [
  { value: 'food', label: 'Food Assistance' },
  { value: 'medicine', label: 'Medicine Assistance' },
  { value: 'supplies', label: 'Supplies Assistance' },
];

export default function VoucherScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const { draft, updateDraft, editingProgramId } = useCreateProgram();

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
        let orgId: string | undefined;
        if (profile?.id) {
          const { data: mem } = await supabase
            .from('organization_memberships')
            .select('organization_id')
            .eq('user_id', profile.id)
            .eq('is_active', true)
            .limit(1)
            .maybeSingle();
          orgId = mem?.organization_id;
        }

        const names = await fetchRegisteredMerchants(orgId, editingProgramId || undefined);
        if (active) {
          setDbMerchants(names);
          // Only keep merchants in draft who are actually in the accepted pool
          if (draft.selectedMerchants.length > 0 && names.length > 0) {
            const valid = draft.selectedMerchants.filter((m) => names.includes(m));
            if (valid.length !== draft.selectedMerchants.length) {
              updateDraft({ selectedMerchants: valid });
            }
          }
        }
      } catch (err) {
        console.error('Error fetching database merchants:', err);
        if (active) {
          setDbMerchants([]);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, editingProgramId]);

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

  const getAssistanceMode = (): 'cash' | 'food' | 'medicine' | 'custom' => {
    if (draft.voucherTypes.length === 0) return 'cash';
    if (draft.voucherTypes.length === 1 && draft.voucherTypes[0] === 'food') return 'food';
    if (draft.voucherTypes.length === 1 && draft.voucherTypes[0] === 'medicine') return 'medicine';
    return 'custom';
  };
  const activeMode = getAssistanceMode();

  const selectAssistanceMode = (mode: 'cash' | 'food' | 'medicine' | 'custom') => {
    if (mode === 'cash') {
      updateDraft({
        voucherTypes: [],
        redemptionType: 'cash',
        voucherValue: 0,
        voucherQuantity: 1,
        selectedMerchants: [],
        voucherExpiration: '',
      });
      setDateError('');
    } else if (mode === 'food') {
      updateDraft({
        voucherTypes: ['food'],
        redemptionType: 'merchant',
        voucherValue: draft.aidPerHousehold,
        voucherQuantity: 1,
      });
      if (!draft.voucherExpiration) {
        setPresetDate(60);
      }
    } else if (mode === 'medicine') {
      updateDraft({
        voucherTypes: ['medicine'],
        redemptionType: 'merchant',
        voucherValue: draft.aidPerHousehold,
        voucherQuantity: 1,
      });
      if (!draft.voucherExpiration) {
        setPresetDate(60);
      }
    } else {
      updateDraft({
        voucherTypes: draft.voucherTypes.length > 0 ? draft.voucherTypes : ['food'],
        redemptionType: 'merchant',
        voucherValue: draft.voucherValue > 0 ? draft.voucherValue : Math.floor(draft.aidPerHousehold / 2),
        voucherQuantity: 1,
      });
      if (!draft.voucherExpiration) {
        setPresetDate(60);
      }
    }
  };

  const isNextDisabled =
    (hasVouchersSelected && (
      draft.voucherValue <= 0 ||
      draft.voucherQuantity <= 0 ||
      !draft.voucherExpiration ||
      isBudgetExceeded
    ));

  return (
    <View style={styles.container}>
      <StepIndicator currentStep={5} title="Aid Type & Vouchers" />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <FadeInView delay={0}>
        {/* ASSISTANCE TYPE SELECTION */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionHeaderTitle}>
            Assistance Type <Text style={styles.required}>*</Text>
          </Text>
          <Text style={styles.sectionSubtitle}>
            Choose how assistance will be distributed to eligible households.
          </Text>

          <View style={styles.assistanceCardsContainer}>
            {/* Cash Assistance Option */}
            <TouchableOpacity
              style={[styles.assistanceCard, activeMode === 'cash' && styles.assistanceCardActive]}
              onPress={() => selectAssistanceMode('cash')}
              activeOpacity={0.8}
            >
              <View style={[styles.assistanceIconBg, activeMode === 'cash' && styles.assistanceIconBgActive]}>
                <FontAwesome name="money" size={18} color={activeMode === 'cash' ? '#FFFFFF' : BrandColors.navy} />
              </View>
              <View style={styles.assistanceTextWrap}>
                <Text style={[styles.assistanceTitle, activeMode === 'cash' && styles.assistanceTitleActive]}>
                  Cash Assistance (Pure Cash)
                </Text>
                <Text style={styles.assistanceDesc}>
                  Disbursed directly into beneficiary&apos;s wallet in RCPHP. Freedom to withdraw or spend anywhere.
                </Text>
              </View>
              <View style={[styles.radioCircle, activeMode === 'cash' && styles.radioCircleActive]}>
                {activeMode === 'cash' && <View style={styles.radioDot} />}
              </View>
            </TouchableOpacity>

            {/* Food Voucher Option */}
            <TouchableOpacity
              style={[styles.assistanceCard, activeMode === 'food' && styles.assistanceCardActive]}
              onPress={() => selectAssistanceMode('food')}
              activeOpacity={0.8}
            >
              <View style={[styles.assistanceIconBg, activeMode === 'food' && styles.assistanceIconBgActive]}>
                <FontAwesome name="cutlery" size={17} color={activeMode === 'food' ? '#FFFFFF' : BrandColors.navy} />
              </View>
              <View style={styles.assistanceTextWrap}>
                <Text style={[styles.assistanceTitle, activeMode === 'food' && styles.assistanceTitleActive]}>
                  Food Voucher (Merchants Only)
                </Text>
                <Text style={styles.assistanceDesc}>
                  Aid is issued as Food Vouchers redeemable exclusively at accredited supermarkets and grocery stores.
                </Text>
              </View>
              <View style={[styles.radioCircle, activeMode === 'food' && styles.radioCircleActive]}>
                {activeMode === 'food' && <View style={styles.radioDot} />}
              </View>
            </TouchableOpacity>

            {/* Medicine Voucher Option */}
            <TouchableOpacity
              style={[styles.assistanceCard, activeMode === 'medicine' && styles.assistanceCardActive]}
              onPress={() => selectAssistanceMode('medicine')}
              activeOpacity={0.8}
            >
              <View style={[styles.assistanceIconBg, activeMode === 'medicine' && styles.assistanceIconBgActive]}>
                <FontAwesome name="medkit" size={17} color={activeMode === 'medicine' ? '#FFFFFF' : BrandColors.navy} />
              </View>
              <View style={styles.assistanceTextWrap}>
                <Text style={[styles.assistanceTitle, activeMode === 'medicine' && styles.assistanceTitleActive]}>
                  Medicine Voucher (Pharmacies)
                </Text>
                <Text style={styles.assistanceDesc}>
                  Aid is issued as Medicine Vouchers redeemable exclusively at accredited pharmacies & drugstores.
                </Text>
              </View>
              <View style={[styles.radioCircle, activeMode === 'medicine' && styles.radioCircleActive]}>
                {activeMode === 'medicine' && <View style={styles.radioDot} />}
              </View>
            </TouchableOpacity>

            {/* Custom / Mixed Option */}
            <TouchableOpacity
              style={[styles.assistanceCard, activeMode === 'custom' && styles.assistanceCardActive]}
              onPress={() => selectAssistanceMode('custom')}
              activeOpacity={0.8}
            >
              <View style={[styles.assistanceIconBg, activeMode === 'custom' && styles.assistanceIconBgActive]}>
                <FontAwesome name="sliders" size={17} color={activeMode === 'custom' ? '#FFFFFF' : BrandColors.navy} />
              </View>
              <View style={styles.assistanceTextWrap}>
                <Text style={[styles.assistanceTitle, activeMode === 'custom' && styles.assistanceTitleActive]}>
                  Custom / Mixed (Vouchers + Cash)
                </Text>
                <Text style={styles.assistanceDesc}>
                  Select multiple voucher categories and disburse remaining aid balance automatically as cash.
                </Text>
              </View>
              <View style={[styles.radioCircle, activeMode === 'custom' && styles.radioCircleActive]}>
                {activeMode === 'custom' && <View style={styles.radioDot} />}
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* CASH CONFIRMATION BANNER */}
        {activeMode === 'cash' && (
          <View style={styles.cashActiveCard}>
            <View style={styles.cashActiveHeader}>
              <FontAwesome name="check-circle" size={18} color={BrandColors.green} />
              <Text style={styles.cashActiveTitle}>100% Cash Assistance Configured</Text>
            </View>
            <Text style={styles.cashActiveText}>
              All ₱{draft.aidPerHousehold.toLocaleString()} per household will be disbursed directly as Cash in RCPHP. No merchant accreditation or voucher expiration dates required.
            </Text>
          </View>
        )}

        {/* BUDGET ALLOCATION INFO CARD */}
        <View style={styles.budgetCard}>
          <Text style={styles.budgetCardTitle}>Aid Allocation Breakdown</Text>
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
              <Text style={styles.budgetLabel}>Cash Assistance</Text>
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

          {isBudgetExceeded && (
            <View style={styles.warningContainer}>
              <Text style={styles.warningText}>
                ⚠️ Total configured value (₱{totalAidValuePerBeneficiary.toLocaleString()}) exceeds the allocated aid limit of ₱{draft.aidPerHousehold.toLocaleString()} per household.
              </Text>
            </View>
          )}
        </View>

        {/* CUSTOM VOUCHER TYPES DROPDOWN (ONLY SHOWN IN CUSTOM MODE) */}
        {activeMode === 'custom' && (
          <View style={styles.formGroup}>
            <Text style={styles.label}>Select Voucher Categories</Text>
            <TouchableOpacity
              style={styles.dropdownTrigger}
              onPress={() => setVoucherTypeModalVisible(true)}>
              <Text style={[styles.dropdownValue, draft.voucherTypes.length === 0 && styles.placeholderText]}>
                {getVoucherTypeLabels()}
              </Text>
              <Text style={styles.dropdownChevron}>▼</Text>
            </TouchableOpacity>
          </View>
        )}

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
                  onValueChange={(event, date) => onExpirationChange(event, date)}
                  onDismiss={() => setShowDatePicker(false)}
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
                <Text style={styles.label}>Allowed Merchants (Accepted Only)</Text>
                <TouchableOpacity
                  style={styles.dropdownTrigger}
                  onPress={() => setMerchantModalVisible(true)}>
                  <Text style={[styles.dropdownValue, draft.selectedMerchants.length === 0 && styles.placeholderText]}>
                    {draft.selectedMerchants.length > 0
                      ? `${draft.selectedMerchants.length} accepted merchant(s) selected`
                      : dbMerchants.length > 0
                      ? 'Select Accepted Merchants'
                      : '0 merchants selected (merchants apply voluntarily)'}
                  </Text>
                  <Text style={styles.dropdownChevron}>▼</Text>
                </TouchableOpacity>

                <View style={styles.merchantGuidanceBox}>
                  <FontAwesome name="info-circle" size={13} color={BrandColors.navy} />
                  <Text style={styles.merchantGuidanceText}>
                    {dbMerchants.length > 0
                      ? 'Only merchants whose applications have been accepted are listed.'
                      : 'No accepted merchants yet. Once this program is saved (as Draft or Published), registered merchants can discover and apply for it in their Programs tab. You can review and accept their applications anytime.'}
                  </Text>
                </View>

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
        </FadeInView>
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
              <Text style={styles.modalTitle}>Accepted Merchants</Text>
              <TouchableOpacity onPress={() => setMerchantModalVisible(false)}>
                <Text style={styles.closeButton}>Done</Text>
              </TouchableOpacity>
            </View>

            {/* Search input */}
            <View style={styles.searchContainer}>
              <TextInput
                style={styles.searchInput}
                placeholder="Search accepted merchants..."
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
                  <View style={styles.emptyMerchantModalBox}>
                    <Text style={styles.emptyText}>
                      {dbMerchants.length === 0
                        ? 'No accepted merchants for this program yet.\n\nRegistered merchants can discover this program once saved and voluntarily apply to accept vouchers.'
                        : `No accepted merchants found matching "${searchQuery}"`}
                    </Text>
                  </View>
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
  sectionContainer: {
    marginBottom: Spacing.four,
  },
  sectionHeaderTitle: {
    fontSize: 15,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: BrandColors.navy,
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: BrandColors.grey,
    marginBottom: Spacing.three,
    lineHeight: 16,
  },
  assistanceCardsContainer: {
    gap: Spacing.two,
  },
  assistanceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.three,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: BrandColors.lightGray,
    borderRadius: BorderRadius.lg,
    columnGap: Spacing.three,
  },
  assistanceCardActive: {
    borderColor: BrandColors.green,
    backgroundColor: '#F7FCF6',
  },
  assistanceIconBg: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#EEEDED',
    justifyContent: 'center',
    alignItems: 'center',
  },
  assistanceIconBgActive: {
    backgroundColor: BrandColors.navy,
  },
  assistanceTextWrap: {
    flex: 1,
  },
  assistanceTitle: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: BrandColors.navy,
    marginBottom: 2,
  },
  assistanceTitleActive: {
    color: BrandColors.navy,
  },
  assistanceDesc: {
    fontSize: 11,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: BrandColors.grey,
    lineHeight: 15,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: BrandColors.grey,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioCircleActive: {
    borderColor: BrandColors.green,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: BrandColors.green,
  },
  cashActiveCard: {
    backgroundColor: '#EDF7ED',
    borderWidth: 1,
    borderColor: BrandColors.green,
    borderRadius: BorderRadius.lg,
    padding: Spacing.three,
    marginBottom: Spacing.three,
  },
  cashActiveHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: Spacing.two,
    marginBottom: 4,
  },
  cashActiveTitle: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: BrandColors.navy,
  },
  cashActiveText: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: '#2E5A27',
    lineHeight: 16,
  },
  merchantGuidanceBox: {
    backgroundColor: '#F3F4F6',
    borderRadius: BorderRadius.md,
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.two,
    padding: Spacing.two,
  },
  merchantGuidanceText: {
    color: BrandColors.navy,
    flex: 1,
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 11,
    lineHeight: 15,
  },
  emptyMerchantModalBox: {
    padding: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
  },
});


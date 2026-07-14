import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useCreateProgram } from './_layout';
import { StepIndicator } from '@/components/CreateProgram/StepIndicator';
import { WizardNavigation } from '@/components/CreateProgram/WizardNavigation';
import { BrandColors, BorderRadius, Spacing } from '@/constants/theme';

type PickerType = 'programStart' | 'programEnd' | 'regOpen' | 'regClose' | 'distStart' | 'distEnd';

export default function ScheduleScreen() {
  const router = useRouter();
  const { draft, updateDraft } = useCreateProgram();
  
  const [currentPicker, setCurrentPicker] = useState<PickerType | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const getDateObject = (dateStr: string) => {
    if (dateStr) {
      const parsed = Date.parse(dateStr);
      if (!isNaN(parsed)) return new Date(parsed);
    }
    return new Date();
  };

  const getMinDateForPicker = (type: PickerType): Date | undefined => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    switch (type) {
      case 'programStart':
        return today; // Start date cannot be in the past
      case 'programEnd':
        return draft.startDate ? new Date(draft.startDate) : today;
      case 'regOpen':
        return draft.startDate ? new Date(draft.startDate) : today;
      case 'regClose':
        return draft.registrationOpen ? new Date(draft.registrationOpen) : (draft.startDate ? new Date(draft.startDate) : today);
      case 'distStart':
        return draft.startDate ? new Date(draft.startDate) : today;
      case 'distEnd':
        return draft.distributionStart ? new Date(draft.distributionStart) : today;
      default:
        return undefined;
    }
  };

  const getMaxDateForPicker = (type: PickerType): Date | undefined => {
    if (draft.endDate) {
      const maxDate = new Date(draft.endDate);
      if (type === 'regOpen' || type === 'regClose' || type === 'distStart' || type === 'distEnd') {
        return maxDate; // Cannot exceed program end date
      }
    }
    return undefined;
  };

  const onPickerChange = (event: any, selectedDate?: Date) => {
    const picker = currentPicker;
    setCurrentPicker(null);

    if (selectedDate && picker) {
      const formatted = selectedDate.toISOString().split('T')[0];
      
      switch (picker) {
        case 'programStart':
          updateDraft({ startDate: formatted });
          break;
        case 'programEnd':
          updateDraft({ endDate: formatted });
          break;
        case 'regOpen':
          updateDraft({ registrationOpen: formatted });
          break;
        case 'regClose':
          updateDraft({ registrationClose: formatted });
          break;
        case 'distStart':
          updateDraft({ distributionStart: formatted });
          break;
        case 'distEnd':
          updateDraft({ distributionEnd: formatted });
          break;
      }
      
      // Clear error for this picker field
      setValidationErrors(prev => {
        const next = { ...prev };
        delete next[picker];
        return next;
      });
    }
  };

  const clearField = (field: 'registrationOpen' | 'registrationClose') => {
    updateDraft({ [field]: '' });
    setValidationErrors(prev => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const handleNext = () => {
    let valid = true;
    const errors: Record<string, string> = {};
    const todayStr = new Date().toISOString().split('T')[0];

    // Required fields check
    if (!draft.startDate) {
      errors.programStart = 'Program start date is required.';
      valid = false;
    } else if (draft.startDate < todayStr) {
      errors.programStart = 'Program start date cannot be in the past.';
      valid = false;
    }

    if (!draft.endDate) {
      errors.programEnd = 'Program end date is required.';
      valid = false;
    } else if (draft.startDate && draft.endDate && draft.startDate > draft.endDate) {
      errors.programEnd = 'Program end date must be on or after the start date.';
      valid = false;
    }

    // Optional registration dates check
    if (draft.registrationOpen && draft.startDate && draft.registrationOpen < draft.startDate) {
      errors.regOpen = 'Registration start cannot be before program start.';
      valid = false;
    }

    if (draft.registrationOpen && draft.registrationClose && draft.registrationOpen > draft.registrationClose) {
      errors.regClose = 'Registration close must be on or after registration open.';
      valid = false;
    }

    if (draft.registrationClose && draft.endDate && draft.registrationClose > draft.endDate) {
      errors.regClose = 'Registration close cannot exceed program end date.';
      valid = false;
    }

    // Required distribution dates check
    if (!draft.distributionStart) {
      errors.distStart = 'Distribution start date is required.';
      valid = false;
    } else if (draft.startDate && draft.distributionStart < draft.startDate) {
      errors.distStart = 'Distribution start cannot be before program start.';
      valid = false;
    }

    if (!draft.distributionEnd) {
      errors.distEnd = 'Distribution deadline is required.';
      valid = false;
    } else if (draft.distributionStart && draft.distributionEnd && draft.distributionStart > draft.distributionEnd) {
      errors.distEnd = 'Distribution deadline must be on or after distribution start.';
      valid = false;
    }

    if (draft.distributionEnd && draft.endDate && draft.distributionEnd > draft.endDate) {
      errors.distEnd = 'Distribution deadline cannot exceed program end date.';
      valid = false;
    }

    setValidationErrors(errors);

    if (valid) {
      router.push('/(lgu)/create-program/eligibility' as any);
    }
  };

  const handleBack = () => {
    router.back();
  };

  const setPresetDate = (type: 'startDate' | 'endDate' | 'distributionStart' | 'distributionEnd', daysFromNow: number) => {
    const d = new Date();
    d.setDate(d.getDate() + daysFromNow);
    const formatted = d.toISOString().split('T')[0];
    updateDraft({ [type]: formatted });
    
    // Clear validation error for that field
    setValidationErrors(prev => {
      const next = { ...prev };
      const pickerName = type === 'startDate' ? 'programStart' : type === 'endDate' ? 'programEnd' : type === 'distributionStart' ? 'distStart' : 'distEnd';
      delete next[pickerName];
      return next;
    });
  };

  const isNextDisabled = !draft.startDate || !draft.endDate || !draft.distributionStart || !draft.distributionEnd;

  return (
    <View style={styles.container}>
      <StepIndicator currentStep={3} title="Program Schedule" />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        {/* SECTION 1: PROGRAM TIMELINE */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionHeader}>1. Program Period (Required)</Text>
          
          {/* Program Start */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Program Start Date <Text style={styles.required}>*</Text></Text>
            <TouchableOpacity
              style={[styles.dropdownTrigger, validationErrors.programStart ? styles.inputError : null]}
              onPress={() => setCurrentPicker('programStart')}>
              <Text style={[styles.dropdownValue, !draft.startDate && styles.placeholderText]}>
                {draft.startDate || 'Select Start Date (YYYY-MM-DD)'}
              </Text>
              <Text style={styles.calendarIcon}>📅</Text>
            </TouchableOpacity>
            {validationErrors.programStart ? <Text style={styles.errorText}>{validationErrors.programStart}</Text> : null}

            {/* Presets */}
            <View style={styles.presetContainer}>
              <TouchableOpacity style={styles.presetBtn} onPress={() => setPresetDate('startDate', 0)}>
                <Text style={styles.presetBtnText}>Today</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.presetBtn} onPress={() => setPresetDate('startDate', 1)}>
                <Text style={styles.presetBtnText}>Tomorrow</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.presetBtn} onPress={() => setPresetDate('startDate', 7)}>
                <Text style={styles.presetBtnText}>In 1 Week</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Program End */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Program End Date <Text style={styles.required}>*</Text></Text>
            <TouchableOpacity
              style={[styles.dropdownTrigger, validationErrors.programEnd ? styles.inputError : null]}
              onPress={() => setCurrentPicker('programEnd')}>
              <Text style={[styles.dropdownValue, !draft.endDate && styles.placeholderText]}>
                {draft.endDate || 'Select End Date (YYYY-MM-DD)'}
              </Text>
              <Text style={styles.calendarIcon}>📅</Text>
            </TouchableOpacity>
            {validationErrors.programEnd ? <Text style={styles.errorText}>{validationErrors.programEnd}</Text> : null}
            
            {/* Presets */}
            <View style={styles.presetContainer}>
              <TouchableOpacity style={styles.presetBtn} onPress={() => setPresetDate('endDate', 30)}>
                <Text style={styles.presetBtnText}>In 1 Month</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.presetBtn} onPress={() => setPresetDate('endDate', 90)}>
                <Text style={styles.presetBtnText}>In 3 Months</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* SECTION 2: REGISTRATION TIMELINE */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionHeader}>2. Registration Period (Optional)</Text>
            <Text style={styles.optionalBadge}>Optional</Text>
          </View>
          <Text style={styles.sectionHelpText}>
            Leave empty if registration is open indefinitely. Eligibility will be checked automatically.
          </Text>

          {/* Registration Open */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Registration Open Date</Text>
            <View style={styles.pickerWrapper}>
              <TouchableOpacity
                style={[styles.dropdownTrigger, styles.flexPicker, validationErrors.regOpen ? styles.inputError : null]}
                onPress={() => setCurrentPicker('regOpen')}>
                <Text style={[styles.dropdownValue, !draft.registrationOpen && styles.placeholderText]}>
                  {draft.registrationOpen || 'Select Date'}
                </Text>
                <Text style={styles.calendarIcon}>📅</Text>
              </TouchableOpacity>
              {draft.registrationOpen ? (
                <TouchableOpacity style={styles.clearBtn} onPress={() => clearField('registrationOpen')}>
                  <Text style={styles.clearBtnText}>Clear</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            {validationErrors.regOpen ? <Text style={styles.errorText}>{validationErrors.regOpen}</Text> : null}
          </View>

          {/* Registration Close */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Registration Close Date</Text>
            <View style={styles.pickerWrapper}>
              <TouchableOpacity
                style={[styles.dropdownTrigger, styles.flexPicker, validationErrors.regClose ? styles.inputError : null]}
                onPress={() => setCurrentPicker('regClose')}>
                <Text style={[styles.dropdownValue, !draft.registrationClose && styles.placeholderText]}>
                  {draft.registrationClose || 'Select Date'}
                </Text>
                <Text style={styles.calendarIcon}>📅</Text>
              </TouchableOpacity>
              {draft.registrationClose ? (
                <TouchableOpacity style={styles.clearBtn} onPress={() => clearField('registrationClose')}>
                  <Text style={styles.clearBtnText}>Clear</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            {validationErrors.regClose ? <Text style={styles.errorText}>{validationErrors.regClose}</Text> : null}
          </View>
        </View>

        {/* SECTION 3: DISTRIBUTION TIMELINE */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionHeader}>3. Distribution Period (Required)</Text>

          {/* Distribution Start */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Distribution Start Date <Text style={styles.required}>*</Text></Text>
            <TouchableOpacity
              style={[styles.dropdownTrigger, validationErrors.distStart ? styles.inputError : null]}
              onPress={() => setCurrentPicker('distStart')}>
              <Text style={[styles.dropdownValue, !draft.distributionStart && styles.placeholderText]}>
                {draft.distributionStart || 'Select Start Date (YYYY-MM-DD)'}
              </Text>
              <Text style={styles.calendarIcon}>📅</Text>
            </TouchableOpacity>
            {validationErrors.distStart ? <Text style={styles.errorText}>{validationErrors.distStart}</Text> : null}
            
            {/* Presets */}
            <View style={styles.presetContainer}>
              <TouchableOpacity style={styles.presetBtn} onPress={() => setPresetDate('distributionStart', 0)}>
                <Text style={styles.presetBtnText}>Today</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.presetBtn} onPress={() => setPresetDate('distributionStart', 1)}>
                <Text style={styles.presetBtnText}>Tomorrow</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Distribution End */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Distribution Deadline <Text style={styles.required}>*</Text></Text>
            <TouchableOpacity
              style={[styles.dropdownTrigger, validationErrors.distEnd ? styles.inputError : null]}
              onPress={() => setCurrentPicker('distEnd')}>
              <Text style={[styles.dropdownValue, !draft.distributionEnd && styles.placeholderText]}>
                {draft.distributionEnd || 'Select Deadline (YYYY-MM-DD)'}
              </Text>
              <Text style={styles.calendarIcon}>📅</Text>
            </TouchableOpacity>
            {validationErrors.distEnd ? <Text style={styles.errorText}>{validationErrors.distEnd}</Text> : null}
            
            {/* Presets */}
            <View style={styles.presetContainer}>
              <TouchableOpacity style={styles.presetBtn} onPress={() => setPresetDate('distributionEnd', 14)}>
                <Text style={styles.presetBtnText}>In 2 Weeks</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.presetBtn} onPress={() => setPresetDate('distributionEnd', 30)}>
                <Text style={styles.presetBtnText}>In 1 Month</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Date picker modal overlay */}
        {currentPicker && (
          <DateTimePicker
            value={getDateObject(
              currentPicker === 'programStart' ? draft.startDate :
              currentPicker === 'programEnd' ? draft.endDate :
              currentPicker === 'regOpen' ? draft.registrationOpen :
              currentPicker === 'regClose' ? draft.registrationClose :
              currentPicker === 'distStart' ? draft.distributionStart :
              draft.distributionEnd
            )}
            mode="date"
            display="default"
            minimumDate={getMinDateForPicker(currentPicker)}
            maximumDate={getMaxDateForPicker(currentPicker)}
            onChange={onPickerChange}
          />
        )}
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
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.lg,
    padding: Spacing.four,
    marginBottom: Spacing.four,
    borderWidth: 1,
    borderColor: BrandColors.lightGray,
  },
  sectionHeader: {
    fontSize: 15,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: BrandColors.navy,
    marginBottom: Spacing.three,
    borderBottomWidth: 1,
    borderBottomColor: BrandColors.lightGray,
    paddingBottom: 6,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.one,
  },
  optionalBadge: {
    fontSize: 10,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: BrandColors.grey,
    backgroundColor: BrandColors.lightGray,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  sectionHelpText: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: BrandColors.grey,
    marginBottom: Spacing.three,
    lineHeight: 16,
  },
  formGroup: {
    marginBottom: Spacing.four,
  },
  label: {
    fontSize: 13,
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
  pickerWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  flexPicker: {
    flex: 1,
  },
  clearBtn: {
    marginLeft: Spacing.three,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: '#D0D5DD',
    backgroundColor: '#FFFFFF',
  },
  clearBtnText: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: BrandColors.grey,
  },
  dropdownValue: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: BrandColors.navy,
  },
  placeholderText: {
    color: BrandColors.grey,
  },
  calendarIcon: {
    fontSize: 16,
    color: BrandColors.grey,
  },
  inputError: {
    borderColor: 'red',
  },
  errorText: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: 'red',
    marginTop: Spacing.one,
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
});

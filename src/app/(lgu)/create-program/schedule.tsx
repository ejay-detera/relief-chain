import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useCreateProgram } from './_layout';
import { StepIndicator } from '@/components/CreateProgram/StepIndicator';
import { WizardNavigation } from '@/components/CreateProgram/WizardNavigation';
import { BrandColors, BorderRadius, Spacing } from '@/constants/theme';

export default function ScheduleScreen() {
  const router = useRouter();
  const { draft, updateDraft } = useCreateProgram();
  
  const [startError, setStartError] = useState('');
  const [endError, setEndError] = useState('');
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  const getStartDateObject = () => {
    if (draft.startDate) {
      const parsed = Date.parse(draft.startDate);
      if (!isNaN(parsed)) return new Date(parsed);
    }
    return new Date();
  };

  const getEndDateObject = () => {
    if (draft.endDate) {
      const parsed = Date.parse(draft.endDate);
      if (!isNaN(parsed)) return new Date(parsed);
    }
    return new Date();
  };

  const onStartChange = (event: any, selectedDate?: Date) => {
    setShowStartPicker(false);
    if (selectedDate) {
      const formatted = selectedDate.toISOString().split('T')[0];
      updateDraft({ startDate: formatted });
      setStartError('');
    }
  };

  const onEndChange = (event: any, selectedDate?: Date) => {
    setShowEndPicker(false);
    if (selectedDate) {
      const formatted = selectedDate.toISOString().split('T')[0];
      updateDraft({ endDate: formatted });
      setEndError('');
    }
  };

  const handleNext = () => {
    let valid = true;

    if (!draft.startDate) {
      setStartError('Start date is required.');
      valid = false;
    } else {
      setStartError('');
    }

    if (!draft.endDate) {
      setEndError('Deadline is required.');
      valid = false;
    } else {
      setEndError('');
    }

    if (valid && draft.startDate && draft.endDate) {
      const start = new Date(draft.startDate);
      const end = new Date(draft.endDate);
      if (start > end) {
        setEndError('Deadline must be on or after the start date.');
        valid = false;
      }
    }

    if (valid) {
      router.push('/(lgu)/create-program/eligibility' as any);
    }
  };

  const handleBack = () => {
    router.back();
  };

  const setPresetDate = (type: 'start' | 'end', daysFromNow: number) => {
    const d = new Date();
    d.setDate(d.getDate() + daysFromNow);
    const formatted = d.toISOString().split('T')[0];
    if (type === 'start') {
      updateDraft({ startDate: formatted });
      setStartError('');
    } else {
      updateDraft({ endDate: formatted });
      setEndError('');
    }
  };

  const isNextDisabled = !draft.startDate || !draft.endDate;

  return (
    <View style={styles.container}>
      <StepIndicator currentStep={3} title="Program Schedule" />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Distribution Start */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>Distribution Start Date <Text style={styles.required}>*</Text></Text>
          <TouchableOpacity
            style={[styles.dropdownTrigger, startError ? styles.inputError : null]}
            onPress={() => setShowStartPicker(true)}>
            <Text style={[styles.dropdownValue, !draft.startDate && styles.placeholderText]}>
              {draft.startDate || 'Select Start Date (YYYY-MM-DD)'}
            </Text>
            <Text style={styles.calendarIcon}>📅</Text>
          </TouchableOpacity>
          {startError ? <Text style={styles.errorText}>{startError}</Text> : null}

          {showStartPicker && (
            <DateTimePicker
              value={getStartDateObject()}
              mode="date"
              display="default"
              onChange={onStartChange}
            />
          )}

          {/* Quick presets for start date */}
          <View style={styles.presetContainer}>
            <TouchableOpacity style={styles.presetBtn} onPress={() => setPresetDate('start', 0)}>
              <Text style={styles.presetBtnText}>Today</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.presetBtn} onPress={() => setPresetDate('start', 1)}>
              <Text style={styles.presetBtnText}>Tomorrow</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.presetBtn} onPress={() => setPresetDate('start', 7)}>
              <Text style={styles.presetBtnText}>In 1 Week</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Distribution Deadline */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>Distribution Deadline <Text style={styles.required}>*</Text></Text>
          <TouchableOpacity
            style={[styles.dropdownTrigger, endError ? styles.inputError : null]}
            onPress={() => setShowEndPicker(true)}>
            <Text style={[styles.dropdownValue, !draft.endDate && styles.placeholderText]}>
              {draft.endDate || 'Select Deadline (YYYY-MM-DD)'}
            </Text>
            <Text style={styles.calendarIcon}>📅</Text>
          </TouchableOpacity>
          {endError ? <Text style={styles.errorText}>{endError}</Text> : null}

          {showEndPicker && (
            <DateTimePicker
              value={getEndDateObject()}
              mode="date"
              display="default"
              onChange={onEndChange}
            />
          )}

          {/* Quick presets for deadline */}
          <View style={styles.presetContainer}>
            <TouchableOpacity style={styles.presetBtn} onPress={() => setPresetDate('end', 14)}>
              <Text style={styles.presetBtnText}>In 2 Weeks</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.presetBtn} onPress={() => setPresetDate('end', 30)}>
              <Text style={styles.presetBtnText}>In 1 Month</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.presetBtn} onPress={() => setPresetDate('end', 60)}>
              <Text style={styles.presetBtnText}>In 2 Months</Text>
            </TouchableOpacity>
          </View>
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
    color: 'red',
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_400Regular',
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

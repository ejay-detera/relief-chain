import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useMemo, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';

import { registrationStyles as styles } from './styles';

type Props = { label: string; onChange: (value: string) => void; value: string };

const formatDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const RegistrationDateField = ({ label, onChange, value }: Props) => {
  const [isOpen, setIsOpen] = useState(false);
  const selectedDate = useMemo(() => {
    const parsed = value ? new Date(`${value}T12:00:00`) : new Date();
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }, [value]);
  const latestBirthdate = useMemo(() => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday;
  }, []);

  const handleChange = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') setIsOpen(false);
    if (event.type === 'set' && date) onChange(formatDate(date));
  };

  return (
    <View>
      <View style={styles.fieldLabelRow}><ThemedText style={styles.fieldLabel}>{label}</ThemedText><ThemedText style={styles.required}>*</ThemedText></View>
      <Pressable accessibilityLabel={`Select ${label}`} accessibilityRole="button" onPress={() => setIsOpen(true)} style={styles.dateInput}>
        <ThemedText style={value ? styles.dateText : styles.datePlaceholder}>{value || 'Select birthdate'}</ThemedText>
      </Pressable>
      {isOpen && <View style={styles.datePickerWrap}>
        <DateTimePicker display={Platform.OS === 'ios' ? 'spinner' : 'default'} maximumDate={latestBirthdate} mode="date" onChange={handleChange} value={selectedDate} />
        {Platform.OS === 'ios' && <Pressable onPress={() => setIsOpen(false)} style={styles.dateDone}><ThemedText style={styles.dateDoneText}>Done</ThemedText></Pressable>}
      </View>}
    </View>
  );
};

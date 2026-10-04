import { StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';

interface TransferMemoInputProps {
  memo: string;
  onChangeMemo: (text: string) => void;
}

export function TransferMemoInput({ memo, onChangeMemo }: TransferMemoInputProps) {
  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <ThemedText style={styles.label}>Transfer Memo / Reference (Optional)</ThemedText>
        <ThemedText style={styles.counter}>{memo.length}/28</ThemedText>
      </View>

      <View style={styles.inputWrapper}>
        <TextInput
          maxLength={28}
          onChangeText={onChangeMemo}
          placeholder="e.g. Relief aid reallocation"
          placeholderTextColor={BrandColors.grey}
          style={styles.input}
          value={memo}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.four,
    marginBottom: Spacing.four,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.one,
  },
  label: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 14,
    color: BrandColors.navy,
  },
  counter: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 11,
    color: BrandColors.grey,
  },
  inputWrapper: {
    backgroundColor: BrandColors.lightGray,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    paddingHorizontal: Spacing.three,
    minHeight: 46,
    justifyContent: 'center',
  },
  input: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 13,
    color: BrandColors.navy,
    paddingVertical: Spacing.two,
  },
});

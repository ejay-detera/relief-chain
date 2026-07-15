import React from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';

import { BrandColors, Spacing } from '@/constants/theme';

type Props = {
  value: string;
  onChangeText: (text: string) => void;
};

export const VerificationSearch = ({ value, onChangeText }: Props) => {
  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <FontAwesome name="search" size={16} color={BrandColors.grey} style={styles.icon} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder="Search by name, ID number, or phone..."
          placeholderTextColor={BrandColors.grey}
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {value.length > 0 && (
          <FontAwesome
            name="times-circle"
            size={16}
            color={BrandColors.grey}
            onPress={() => onChangeText('')}
            style={styles.clearIcon}
          />
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    backgroundColor: 'white',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    height: 44,
  },
  icon: {
    marginRight: Spacing.two,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_400Regular',
    paddingVertical: 0,
  },
  clearIcon: {
    padding: 4,
  },
});

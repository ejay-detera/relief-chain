import React from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';

import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
};

export const MerchantSearchBar = ({
  value,
  onChangeText,
  placeholder = 'Search merchant, category, owner...',
}: Props) => {
  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <View style={styles.searchBar}>
          <FontAwesome
            name="search"
            size={15}
            color={BrandColors.grey}
            style={styles.icon}
          />
          <TextInput
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor={BrandColors.grey}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {value.length > 0 && (
            <FontAwesome
              name="times-circle"
              size={15}
              color={BrandColors.grey}
              onPress={() => onChangeText('')}
              style={styles.clearIcon}
            />
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    backgroundColor: 'white',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.three,
    height: 42,
  },
  icon: {
    marginRight: Spacing.two,
  },
  input: {
    flex: 1,
    fontSize: 13,
    color: BrandColors.navy,
    paddingVertical: 0,
  },
  clearIcon: {
    padding: 4,
  },
});


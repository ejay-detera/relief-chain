import React from 'react';
import { View, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BrandColors } from '@/constants/theme';

export default function ProfileScreen() {
  return (
    <View style={styles.container}>
      <ThemedText style={styles.text}>Profile</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  text: {
    color: BrandColors.navy,
    fontSize: 24,
    fontWeight: 'bold',
  },
});

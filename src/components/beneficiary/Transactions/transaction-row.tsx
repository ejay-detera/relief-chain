import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { BrandColors, Spacing } from '@/constants/theme';
import { RedemptionRecord } from '@/types/wallet';

type Props = {
  record: RedemptionRecord;
};

export function TransactionRow({ record }: Props) {
  return (
    <View style={styles.row}>
      <View style={styles.leftCol}>
        <ThemedText style={styles.merchant} numberOfLines={1}>{record.merchant}</ThemedText>
        <ThemedText style={styles.date}>{record.date}</ThemedText>
        <ThemedText style={styles.hash} selectable numberOfLines={1}>{record.txHash}</ThemedText>
      </View>
      <View style={styles.rightCol}>
        <ThemedText style={styles.amount}>-{record.amount}</ThemedText>
        <ThemedText style={styles.balanceLabel}>Balance: {record.remainingBalance}</ThemedText>
        <View style={[styles.statusDot, record.status === 'Completed' ? styles.statusSuccess : styles.statusFailed]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    backgroundColor: 'white',
  },
  leftCol: {
    flex: 1,
    marginRight: Spacing.three,
  },
  merchant: {
    fontSize: 15,
    fontWeight: '600',
    color: BrandColors.navy,
    marginBottom: 4,
  },
  date: {
    fontSize: 12,
    color: BrandColors.grey,
    marginBottom: 4,
  },
  hash: {
    fontSize: 10,
    color: '#999',
  },
  rightCol: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  amount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#E74C3C',
    marginBottom: 4,
  },
  balanceLabel: {
    fontSize: 11,
    color: BrandColors.grey,
    marginBottom: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusSuccess: {
    backgroundColor: BrandColors.green,
  },
  statusFailed: {
    backgroundColor: '#E74C3C',
  },
});

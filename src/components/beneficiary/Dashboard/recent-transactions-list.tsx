import React from 'react';
import { StyleSheet, View, Pressable } from 'react-native';
import { Link } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { BrandColors, Spacing, BorderRadius } from '@/constants/theme';
import { RedemptionRecord } from '@/types/wallet';

type Props = {
  redemptions: RedemptionRecord[];
};

export function RecentTransactionsList({ redemptions }: Props) {
  if (redemptions.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <ThemedText style={styles.sectionTitle}>Recent Transactions</ThemedText>
        <Link href={"/(beneficiary)/transactions" as any} asChild>
          <Pressable>
            <ThemedText style={styles.viewAll}>View All</ThemedText>
          </Pressable>
        </Link>
      </View>
      
      <View style={styles.list}>
        {redemptions.slice(0, 3).map((item) => (
          <View key={item.id} style={styles.row}>
            <View style={styles.info}>
              <ThemedText style={styles.merchant}>{item.merchant}</ThemedText>
              <ThemedText style={styles.date}>{item.date}</ThemedText>
            </View>
            <ThemedText style={styles.amount}>-{item.amount}</ThemedText>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.four,
    marginHorizontal: Spacing.four,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.three,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: BrandColors.navy,
  },
  viewAll: {
    fontSize: 13,
    color: BrandColors.navy,
    fontWeight: '600',
  },
  list: {
    backgroundColor: 'white',
    borderRadius: BorderRadius.lg,
    padding: Spacing.three,
    boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  info: {
    flex: 1,
  },
  merchant: {
    fontSize: 14,
    fontWeight: '600',
    color: BrandColors.navy,
    marginBottom: 2,
  },
  date: {
    fontSize: 12,
    color: BrandColors.grey,
  },
  amount: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#E74C3C',
  },
});

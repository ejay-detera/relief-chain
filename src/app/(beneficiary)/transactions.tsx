import React, { useState } from 'react';
import { StyleSheet, View, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { BrandColors, Spacing, BottomTabInset } from '@/constants/theme';
import { TransactionRow } from '@/components/beneficiary/Transactions/transaction-row';
import { useStellarWallet } from '@/hooks/use-stellar-wallet';
import { useBeneficiaryRedemptions } from '@/hooks/use-beneficiary-redemptions';

export default function TransactionsScreen() {
  const { payments } = useStellarWallet();
  const { redemptions } = useBeneficiaryRedemptions();
  
  // Combine Stellar payments (XLM transfers) with Supabase redemptions (Voucher uses)
  // For now, we'll just show redemptions if they exist, otherwise fallback to Stellar payments.
  const dataToShow = redemptions.length > 0 ? redemptions : payments;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <ThemedText style={styles.title}>Transaction History</ThemedText>
        </View>
        
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {dataToShow.map(record => (
            <TransactionRow key={record.id} record={record} />
          ))}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFC',
  },
  safeArea: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.six,
    paddingBottom: Spacing.four,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: BrandColors.navy,
  },
  scrollContent: {
    paddingBottom: BottomTabInset + Spacing.six,
  },
});

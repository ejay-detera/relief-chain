import React, { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedView } from '@/components/themed-view';
import { Spacing, BottomTabInset, MaxContentWidth } from '@/constants/theme';
import { LogoHeader } from '@/components/LogoHeader/LogoHeader';

import { WalletBalanceCard } from '@/components/beneficiary/Dashboard/wallet-balance-card';
import { BeneficiaryQRCard } from '@/components/beneficiary/Dashboard/beneficiary-qr-card';
import { AvailableAssistanceBanner } from '@/components/beneficiary/Dashboard/available-assistance-banner';
import { EnrolledProgramCard } from '@/components/beneficiary/Dashboard/enrolled-program-card';
import { RecentTransactionsList } from '@/components/beneficiary/Dashboard/recent-transactions-list';

import { useStellarWallet } from '@/hooks/use-stellar-wallet';
import { useBeneficiaryPrograms } from '@/hooks/use-beneficiary-programs';

export default function BeneficiaryDashboard() {
  const { wallet, payments, isLoading } = useStellarWallet();
  const { programs, isLoading: programsLoading } = useBeneficiaryPrograms();

  const totalVoucherBalance = programs.reduce((acc, curr) => {
    // Basic calculation for the banner
    const num = parseFloat(curr.voucherBalance.replace(/[^0-9.]/g, ''));
    return acc + (isNaN(num) ? 0 : num);
  }, 0);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <LogoHeader />
          
          <WalletBalanceCard wallet={wallet} isLoading={isLoading} />
          
          <AvailableAssistanceBanner totalAmount={`₱${totalVoucherBalance.toLocaleString()}`} />
          
          <BeneficiaryQRCard publicKey={wallet?.publicKey} />
          
          <EnrolledProgramCard programs={programs} />
          
          <RecentTransactionsList redemptions={payments} />
          
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
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    width: '100%',
  },
  scrollContent: {
    paddingBottom: BottomTabInset + Spacing.six,
  },
});

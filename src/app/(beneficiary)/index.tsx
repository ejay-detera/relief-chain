import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LogoHeader } from '@/components/LogoHeader/LogoHeader';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, BrandColors, MaxContentWidth, Spacing } from '@/constants/theme';

import { ActiveProgramCard } from '@/components/beneficiary/Dashboard/active-program-card';
import { DashboardGreeting } from '@/components/beneficiary/Dashboard/dashboard-greeting';
import { QuickActionGrid } from '@/components/beneficiary/Dashboard/quick-action-grid';
import { RecentTransactionsList } from '@/components/beneficiary/Dashboard/recent-transactions-list';
import { WalletBalanceCard } from '@/components/beneficiary/Dashboard/wallet-balance-card';
import { QrModal } from '@/components/beneficiary/shared/qr-modal';

import { useAuth } from '@/context/AuthContext';
import { useBeneficiaryPrograms } from '@/hooks/use-beneficiary-programs';
import { useStellarWallet } from '@/hooks/use-stellar-wallet';
import { selectActiveProgram } from '@/utils/active-program';

export default function BeneficiaryDashboard() {
  const router = useRouter();
  const { profile } = useAuth();
  const { wallet, payments } = useStellarWallet();
  const { programs, isLoading, error, refetch } = useBeneficiaryPrograms();
  const [isQrVisible, setIsQrVisible] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch])
  );

  const approvedPrograms = programs.filter((program) => program.approvalStatus === 'Approved');
  const totalVoucherBalance = approvedPrograms.reduce((acc, curr) => {
    const num = parseFloat(curr.voucherBalance.replace(/[^0-9.]/g, ''));
    return acc + (isNaN(num) ? 0 : num);
  }, 0);
  const voucherBalanceLabel = `₱${totalVoucherBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const activeProgram = selectActiveProgram(programs);
  const hasNoAssistance = !isLoading && !error && activeProgram === null;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <LogoHeader />

          <DashboardGreeting name={profile?.full_name ?? null} />

          <WalletBalanceCard
            voucherBalance={voucherBalanceLabel}
            onWithdraw={() => Alert.alert('Coming soon', 'Withdrawing funds will be available in a future update.')}
            onSend={() => Alert.alert('Coming soon', 'Sending funds will be available in a future update.')}
          />

          <QuickActionGrid
            onShowQr={() => setIsQrVisible(true)}
            onFindMerchant={() => router.push('/(beneficiary)/find-organization')}
            onMyAssistance={() => router.push('/(beneficiary)/my-assistance')}
            onProfile={() => router.push('/(beneficiary)/profile')}
          />

          {isLoading && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator color={BrandColors.navy} size="large" />
            </View>
          )}

          {!isLoading && error && (
            <ErrorState message="We couldn't load your assistance data." onRetry={refetch} />
          )}

          {hasNoAssistance && (
            <EmptyState
              actionLabel="Find Organizations"
              description="You don't have any assistance yet. Apply to a program to get started."
              onAction={() => router.push('/(beneficiary)/find-organization')}
              title="No Assistance Yet"
            />
          )}

          {!isLoading && !error && activeProgram && <ActiveProgramCard program={activeProgram} />}

          <RecentTransactionsList redemptions={payments} />
        </ScrollView>
      </SafeAreaView>

      <QrModal onClose={() => setIsQrVisible(false)} publicKey={wallet?.publicKey} visible={isQrVisible} />
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
  loadingContainer: {
    paddingVertical: Spacing.six,
    alignItems: 'center',
  },
});

import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RequestCashOutModal, type CashOutSubmitOutcome } from '@/components/CashOut/RequestCashOutModal';
import { LogoHeader } from '@/components/LogoHeader/LogoHeader';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, BrandColors, MaxContentWidth, Spacing } from '@/constants/theme';

import { ActivateWalletCard } from '@/components/WalletProvision/ActivateWalletCard';
import { ActiveProgramCard } from '@/components/beneficiary/Dashboard/active-program-card';
import { DashboardGreeting } from '@/components/beneficiary/Dashboard/dashboard-greeting';
import { QuickActionGrid } from '@/components/beneficiary/Dashboard/quick-action-grid';
import { RecentTransactionsList } from '@/components/beneficiary/Dashboard/recent-transactions-list';
import { WalletBalanceCard } from '@/components/beneficiary/Dashboard/wallet-balance-card';
import { QrModal } from '@/components/shared/qr-modal';

import { useAuth } from '@/context/AuthContext';
import { useBeneficiaryBalances } from '@/hooks/use-beneficiary-balances';
import { entitlementForProgram, useBeneficiaryEntitlements } from '@/hooks/use-beneficiary-entitlements';
import { useBeneficiaryPrograms } from '@/hooks/use-beneficiary-programs';
import { useBeneficiaryRedemptions } from '@/hooks/use-beneficiary-redemptions';
import { pilotWalletPublicKey, usePilotWallet } from '@/hooks/use-pilot-wallet';
import { requestCashOut } from '@/services/cashout-service';
import type { StroopAmount } from '@/types/blockchain';
import { selectActiveProgram } from '@/utils/active-program';
import { ZERO_STROOPS } from '@/utils/format-stroops';

export default function BeneficiaryDashboard() {
  const router = useRouter();
  const { profile, session } = useAuth();
  const { state: walletState } = usePilotWallet();
  const userId = session?.user.id ?? null;
  const { balance, refresh: refreshBalance } = useBeneficiaryBalances();
  const { entitlements, refresh: refreshEntitlements } = useBeneficiaryEntitlements();
  const { redemptions } = useBeneficiaryRedemptions();
  const { programs, isLoading, error, refetch } = useBeneficiaryPrograms();
  const [isQrVisible, setIsQrVisible] = useState(false);
  const [isCashOutVisible, setIsCashOutVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const availableCash: StroopAmount =
    balance.status === 'current' || balance.status === 'stale'
      ? balance.data.cashAvailableStroops
      : ZERO_STROOPS;

  const submitCashOut = async (amountStroops: StroopAmount): Promise<CashOutSubmitOutcome> => {
    const result = await requestCashOut({ actor: 'beneficiary', amountStroops });
    if (!result.ok) return { ok: false, message: result.error.message };
    await refreshBalance();
    return { ok: true };
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetch(), refreshBalance(), refreshEntitlements()]);
    setRefreshing(false);
  }, [refetch, refreshBalance, refreshEntitlements]);

  useFocusEffect(
    useCallback(() => {
      void refetch();
      void refreshBalance();
      void refreshEntitlements();
    }, [refetch, refreshBalance, refreshEntitlements])
  );

  const publicKey = pilotWalletPublicKey(walletState);
  const activeProgram = selectActiveProgram(programs);
  const hasNoAssistance = !isLoading && !error && activeProgram === null;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[BrandColors.navy]} tintColor={BrandColors.navy} />}
        >
          <LogoHeader />

          <DashboardGreeting name={profile?.full_name ?? null} />

          <WalletBalanceCard
            balance={balance}
            onWithdraw={() => setIsCashOutVisible(true)}
            onSend={() => Alert.alert('Coming soon', 'Sending funds will be available in a future update.')}
          />

          {userId && publicKey && walletState?.status === 'binding_required' && (
            <ActivateWalletCard
              userId={userId}
              walletAddress={publicKey}
              onProvisioned={() => {
                void refreshBalance();
                void refreshEntitlements();
              }}
            />
          )}

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

          {!isLoading && !error && activeProgram && (
            <ActiveProgramCard
              program={activeProgram}
              entitlement={entitlementForProgram(entitlements, activeProgram.id)}
              balanceState={entitlements}
            />
          )}

          <RecentTransactionsList redemptions={redemptions} />
        </ScrollView>
      </SafeAreaView>

      <QrModal onClose={() => setIsQrVisible(false)} publicKey={publicKey ?? undefined} visible={isQrVisible} />

      <RequestCashOutModal
        availableStroops={availableCash}
        onClose={() => setIsCashOutVisible(false)}
        onSubmit={submitCashOut}
        visible={isCashOutVisible}
      />
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

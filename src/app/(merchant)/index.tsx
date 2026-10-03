import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { RequestCashOutModal, type CashOutSubmitOutcome } from '@/components/CashOut/RequestCashOutModal';
import { CashOutAndRefunds } from '@/components/MerchantDashboard/CashOutAndRefunds';
import { MerchantBottomNavigation } from '@/components/MerchantDashboard/MerchantBottomNavigation';
import { MerchantDashboardHeader } from '@/components/MerchantDashboard/MerchantDashboardHeader';
import { RecentPayments } from '@/components/MerchantDashboard/RecentPayments';
import { SalesSummaryCard } from '@/components/MerchantDashboard/SalesSummaryCard';
import { WalletBalanceCard } from '@/components/MerchantDashboard/WalletBalanceCard';
import { RequestRefundModal, type RefundSubmitOutcome } from '@/components/Refund/RequestRefundModal';
import { FadeInView } from '@/components/shared/FadeInView';
import { QrModal } from '@/components/shared/qr-modal';
import { ThemedText } from '@/components/themed-text';
import { BrandColors, FloatingTabBarGap, FloatingTabBarHeight, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useMerchantBalances } from '@/hooks/use-merchant-balances';
import { useMerchantInvoiceHistory } from '@/hooks/use-merchant-invoice-history';
import { useMerchantMetrics } from '@/hooks/use-merchant-metrics';
import { useMerchantRefunds } from '@/hooks/use-merchant-refunds';
import { useMerchantSettlementCheck } from '@/hooks/use-merchant-settlement-check';
import { useMerchantSettlements } from '@/hooks/use-merchant-settlements';
import { useMerchantTransactions } from '@/hooks/use-merchant-transactions';
import { merchantWalletPublicKey, useMerchantWallet } from '@/hooks/use-merchant-wallet';
import { requestCashOut } from '@/services/cashout-service';
import { authorizeRefund, prepareRefund } from '@/services/refund-service';
import type { StroopAmount } from '@/types/blockchain';
import type { MerchantPayment } from '@/types/merchant-dashboard';
import type { MerchantMetrics } from '@/types/merchant-metrics';
import type { RefundableSettlement } from '@/types/refund';
import { ZERO_STROOPS } from '@/utils/format-stroops';

const MerchantDashboardScreen = () => {
  const { profile, session } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { state: walletState, merchantEntityId } = useMerchantWallet();

  const emailPrefix = session?.user?.email?.split('@')[0]?.trim();
  const displayName = profile?.full_name?.trim() || profile?.first_name?.trim() || emailPrefix || 'Merchant';
  const { isLoading: isMetricsLoading, metrics, reload: refreshMetrics } = useMerchantMetrics(merchantEntityId);
  const { balance, refresh: refreshBalance } = useMerchantBalances();
  const { state: refundsState, refresh: refreshRefunds } = useMerchantRefunds(merchantEntityId);
  const { state: settlementsState, refresh: refreshSettlements } = useMerchantSettlements(merchantEntityId);
  const { refresh: refreshInvoices } = useMerchantInvoiceHistory(merchantEntityId);
  const {
    transactions: recentTransactions,
    summary: transactionSummary,
    isLoading: isTransactionsLoading,
    refresh: refreshTransactions,
  } = useMerchantTransactions(merchantEntityId);
  const { checkSettlement } = useMerchantSettlementCheck(merchantEntityId);
  const [cashOutVisible, setCashOutVisible] = useState(false);
  const [refundSettlement, setRefundSettlement] = useState<RefundableSettlement | null>(null);
  const [isQrVisible, setIsQrVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const publicKey = merchantWalletPublicKey(walletState);

  const effectiveMetrics = useMemo<MerchantMetrics | null>(() => {
    if (metrics) return metrics;
    if (merchantEntityId && !isTransactionsLoading) {
      return {
        merchantId: merchantEntityId,
        vouchersProcessed: transactionSummary.voucherCount,
        totalSales: transactionSummary.totalSettledPhp,
        updatedAt: new Date().toISOString(),
      };
    }
    return null;
  }, [metrics, merchantEntityId, isTransactionsLoading, transactionSummary]);

  const displayedPayments = useMemo<MerchantPayment[]>(() => {
    return recentTransactions.slice(0, 5).map((tx) => ({
      id: tx.id,
      payerName: tx.payerName,
      occurredAt: tx.occurredAt,
      amount: tx.amount,
    }));
  }, [recentTransactions]);

  const showComingSoon = (feature: string) => Alert.alert(feature, 'This feature will be available soon.');

  // Fast database-only refresh for pull-to-refresh
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      refreshMetrics(),
      refreshBalance(),
      refreshRefunds(),
      refreshSettlements(),
      refreshInvoices(),
      refreshTransactions(),
    ]);
    setRefreshing(false);
  }, [refreshMetrics, refreshBalance, refreshRefunds, refreshSettlements, refreshInvoices, refreshTransactions]);

  // Dedicated on-demand blockchain ledger sync from the wallet balance card
  const handleSync = useCallback(async () => {
    setIsSyncing(true);
    try {
      await checkSettlement();
    } catch {
      // Degrades gracefully when offline
    }
    await Promise.all([
      refreshBalance(),
      refreshMetrics(),
      refreshTransactions(),
      refreshSettlements(),
      refreshInvoices(),
    ]);
    setIsSyncing(false);
  }, [checkSettlement, refreshBalance, refreshMetrics, refreshTransactions, refreshSettlements, refreshInvoices]);

  const settledBalance: StroopAmount =
    balance.status === 'current' || balance.status === 'stale'
      ? balance.data.settledBalanceStroops
      : ZERO_STROOPS;

  const submitCashOut = async (amountStroops: StroopAmount): Promise<CashOutSubmitOutcome> => {
    const result = await requestCashOut({ actor: 'merchant', amountStroops });
    if (!result.ok) return { ok: false, message: result.error.message };
    await Promise.all([refreshBalance()]);
    return { ok: true };
  };

  const submitRefund = async (
    settlementId: string,
    amountStroops: StroopAmount,
  ): Promise<RefundSubmitOutcome> => {
    const prepared = await prepareRefund({ originalSettlementId: settlementId, amountStroops });
    if (!prepared.ok) return { ok: false, message: prepared.error.message };
    // An expiry-triggered exception route is accepted for review; it is not signed here (Req 15.5).
    if (!prepared.data.requiresException) {
      const submitted = await authorizeRefund({ refundId: prepared.data.refundId });
      if (!submitted.ok) return { ok: false, message: submitted.error.message };
    }
    await Promise.all([refreshRefunds(), refreshSettlements()]);
    return { ok: true };
  };

  return <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}><View style={styles.screen}>
    <MerchantDashboardHeader onShowQr={() => setIsQrVisible(true)} />
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + FloatingTabBarGap + FloatingTabBarHeight + Spacing.four }]} refreshControl={<RefreshControl onRefresh={handleRefresh} refreshing={refreshing} />} showsVerticalScrollIndicator={false}>
      <FadeInView delay={0}>
        <ThemedText style={styles.greetingText}>
          Welcome back, <ThemedText style={styles.storeName}>{displayName}</ThemedText>
        </ThemedText>
      </FadeInView>
      <FadeInView delay={40}>
        <WalletBalanceCard
          balance={settledBalance}
          isSyncing={isSyncing}
          onSettlementsPress={() => showComingSoon('Settlements')}
          onSyncPress={handleSync}
          onWithdrawPress={() => setCashOutVisible(true)}
        />
      </FadeInView>
      <FadeInView delay={80}>
        <SalesSummaryCard isLoading={isMetricsLoading && !effectiveMetrics} metrics={effectiveMetrics} />
      </FadeInView>
      <FadeInView delay={120}>
        <CashOutAndRefunds
          onRequestRefund={setRefundSettlement}
          onRetryRefunds={() => void refreshRefunds()}
          onRetrySettlements={() => void refreshSettlements()}
          onViewAllRefunds={() => router.push({ pathname: '/(merchant)/history', params: { tab: 'refunds' } })}
          onViewAllSettlements={() => router.push({ pathname: '/(merchant)/history', params: { tab: 'settlements' } })}
          refunds={refundsState}
          settlements={settlementsState}
        />
      </FadeInView>
      <FadeInView delay={160}>
        <RecentPayments onViewAll={() => router.push({ pathname: '/(merchant)/history', params: { tab: 'payments' } })} payments={displayedPayments} />
      </FadeInView>
    </ScrollView>
    <MerchantBottomNavigation active="dashboard" />
    <RequestCashOutModal availableStroops={settledBalance} onClose={() => setCashOutVisible(false)} onSubmit={submitCashOut} visible={cashOutVisible} />
    <RequestRefundModal onClose={() => setRefundSettlement(null)} onSubmit={submitRefund} settlement={refundSettlement} visible={refundSettlement !== null} />
    <QrModal onClose={() => setIsQrVisible(false)} publicKey={publicKey ?? undefined} visible={isQrVisible} />
  </View></SafeAreaView>;
};
export default MerchantDashboardScreen;
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FFFFFF' },
  screen: { flex: 1 },
  content: { gap: Spacing.three, padding: Spacing.three },
  greetingText: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 18,
    lineHeight: 24,
  },
  storeName: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 18,
    lineHeight: 24,
  },
});

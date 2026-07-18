import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { RequestCashOutModal, type CashOutSubmitOutcome } from '@/components/CashOut/RequestCashOutModal';
import { ActiveProgramsCard } from '@/components/MerchantDashboard/ActiveProgramsCard';
import { CashOutAndRefunds } from '@/components/MerchantDashboard/CashOutAndRefunds';
import { MerchantBottomNavigation } from '@/components/MerchantDashboard/MerchantBottomNavigation';
import { MerchantDashboardHeader } from '@/components/MerchantDashboard/MerchantDashboardHeader';
import { ReceivePaymentCard } from '@/components/MerchantDashboard/ReceivePaymentCard';
import { RecentPayments } from '@/components/MerchantDashboard/RecentPayments';
import { SalesSummaryCard } from '@/components/MerchantDashboard/SalesSummaryCard';
import { WalletBalanceCard } from '@/components/MerchantDashboard/WalletBalanceCard';
import { AccreditationStatusBanner } from '@/components/MerchantDashboard/AccreditationStatusBanner';
import { LguSelectionView } from '@/components/MerchantDashboard/LguSelectionView';
import { RequestRefundModal, type RefundSubmitOutcome } from '@/components/Refund/RequestRefundModal';
import { QrModal } from '@/components/shared/qr-modal';
import { ThemedText } from '@/components/themed-text';
import { BrandColors, FloatingTabBarGap, FloatingTabBarHeight, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useCashOutRequests } from '@/hooks/use-cashout-requests';
import { useMerchantBalances } from '@/hooks/use-merchant-balances';
import { useMerchantMetrics } from '@/hooks/use-merchant-metrics';
import { useMerchantPrograms } from '@/hooks/use-merchant-programs';
import { useMerchantRefunds } from '@/hooks/use-merchant-refunds';
import { useMerchantSettlements } from '@/hooks/use-merchant-settlements';
import { merchantWalletPublicKey, useMerchantWallet } from '@/hooks/use-merchant-wallet';
import { requestCashOut } from '@/services/cashout-service';
import { authorizeRefund, prepareRefund } from '@/services/refund-service';
import { fetchMyAccreditation, type AccreditationSummary } from '@/services/merchantAccreditationService';
import { fetchMerchantPaymentHistory, type MerchantPaymentRecord } from '@/services/merchantPaymentHistoryService';
import type { StroopAmount } from '@/types/blockchain';
import type { RefundableSettlement } from '@/types/refund';
import { ZERO_STROOPS } from '@/utils/format-stroops';

const MerchantDashboardScreen = () => {
  const { profile } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isLoading: isMetricsLoading, metrics, reload: refreshMetrics } = useMerchantMetrics();
  const { error: programsError, isLoading: areProgramsLoading, programs, refresh } = useMerchantPrograms();
  const { balance, refresh: refreshBalance } = useMerchantBalances();
  const { state: cashOutState, refresh: refreshCashOut } = useCashOutRequests();
  const { state: refundsState, refresh: refreshRefunds } = useMerchantRefunds();
  const { state: settlementsState, refresh: refreshSettlements } = useMerchantSettlements();
  const [payments, setPayments] = useState<MerchantPaymentRecord[]>([]);
  const [cashOutVisible, setCashOutVisible] = useState(false);
  const [refundSettlement, setRefundSettlement] = useState<RefundableSettlement | null>(null);
  const [isQrVisible, setIsQrVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { state: walletState, merchantEntityId } = useMerchantWallet();
  const publicKey = merchantWalletPublicKey(walletState);

  const [accreditation, setAccreditation] = useState<AccreditationSummary | null>(null);
  const [accreditationLoaded, setAccreditationLoaded] = useState(false);
  useEffect(() => {
    fetchMyAccreditation()
      .then(setAccreditation)
      .catch(console.error)
      .finally(() => setAccreditationLoaded(true));
    if (merchantEntityId) {
      fetchMerchantPaymentHistory(merchantEntityId).then(p => setPayments(p.slice(0, 3))).catch(console.error);
    }
  }, [merchantEntityId]);

  const activePrograms = programs.filter((program) => program.status === 'active');
  const showComingSoon = (feature: string) => Alert.alert(feature, 'This feature will be available soon.');

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      refreshMetrics(),
      refresh(),
      refreshBalance(),
      refreshCashOut(),
      refreshRefunds(),
      refreshSettlements(),
    ]);
    if (merchantEntityId) {
      fetchMerchantPaymentHistory(merchantEntityId).then(p => setPayments(p.slice(0, 3))).catch(console.error);
    }
    setRefreshing(false);
  }, [refreshMetrics, refresh, refreshBalance, refreshCashOut, refreshRefunds, refreshSettlements, merchantEntityId]);

  const settledBalance: StroopAmount =
    balance.status === 'current' || balance.status === 'stale'
      ? balance.data.settledBalanceStroops
      : ZERO_STROOPS;

  const submitCashOut = async (amountStroops: StroopAmount): Promise<CashOutSubmitOutcome> => {
    const result = await requestCashOut({ actor: 'merchant', amountStroops });
    if (!result.ok) return { ok: false, message: result.error.message };
    await Promise.all([refreshCashOut(), refreshBalance()]);
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
    <MerchantDashboardHeader onNotificationsPress={() => showComingSoon('Notifications')} onShowQr={() => setIsQrVisible(true)} />
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + FloatingTabBarGap + FloatingTabBarHeight + Spacing.four }]} refreshControl={<RefreshControl onRefresh={handleRefresh} refreshing={refreshing} />} showsVerticalScrollIndicator={false}>
      {accreditationLoaded && accreditation === null ? (
        <LguSelectionView onApplied={() => { setAccreditationLoaded(false); fetchMyAccreditation().then(setAccreditation).catch(console.error).finally(() => setAccreditationLoaded(true)); }} />
      ) : (
        <>
          {(accreditation === null || accreditation.status !== 'active') && (
            <AccreditationStatusBanner status={accreditation?.status ?? 'pending'} />
          )}
          <ThemedText style={styles.storeName}>{profile?.full_name ?? 'Merchant Account'}</ThemedText>
          <WalletBalanceCard balance={settledBalance} onSettlementsPress={() => showComingSoon('Settlements')} onWithdrawPress={() => setCashOutVisible(true)} />
          <ReceivePaymentCard onPress={() => router.push('/(merchant)/receive')} />
          <SalesSummaryCard isLoading={isMetricsLoading} metrics={metrics} />
          <CashOutAndRefunds
            cashOut={cashOutState}
            onRequestCashOut={() => setCashOutVisible(true)}
            onRequestRefund={setRefundSettlement}
            onRetryCashOut={() => void refreshCashOut()}
            onRetryRefunds={() => void refreshRefunds()}
            onRetrySettlements={() => void refreshSettlements()}
            refunds={refundsState}
            settlements={settlementsState}
          />
          <RecentPayments onViewAll={() => router.push('/(merchant)/redemptions' as any)} payments={payments} />
          <ActiveProgramsCard error={programsError} isLoading={areProgramsLoading} onBrowsePress={() => router.push('/(merchant)/programs')} onRetry={() => void refresh()} programs={activePrograms} />
        </>
      )}
    </ScrollView>
    <MerchantBottomNavigation active="dashboard" />
    <RequestCashOutModal availableStroops={settledBalance} onClose={() => setCashOutVisible(false)} onSubmit={submitCashOut} visible={cashOutVisible} />
    <RequestRefundModal onClose={() => setRefundSettlement(null)} onSubmit={submitRefund} settlement={refundSettlement} visible={refundSettlement !== null} />
    <QrModal onClose={() => setIsQrVisible(false)} publicKey={publicKey ?? undefined} visible={isQrVisible} />
  </View></SafeAreaView>;
};
export default MerchantDashboardScreen;
const styles = StyleSheet.create({ safeArea: { flex: 1, backgroundColor: '#FFFFFF' }, screen: { flex: 1 }, content: { gap: Spacing.three, padding: Spacing.three }, storeName: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 18 } });

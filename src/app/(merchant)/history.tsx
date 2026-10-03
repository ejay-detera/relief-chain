import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { MerchantBottomNavigation } from '@/components/MerchantDashboard/MerchantBottomNavigation';
import { HistoryPaymentsTab } from '@/components/MerchantHistory/HistoryPaymentsTab';
import { HistoryRefundsTab } from '@/components/MerchantHistory/HistoryRefundsTab';
import { HistorySettlementsTab } from '@/components/MerchantHistory/HistorySettlementsTab';
import { HistoryTabBar, type HistoryTabKey } from '@/components/MerchantHistory/HistoryTabBar';
import { TransactionDetailModal } from '@/components/MerchantTransactions/TransactionDetailModal';
import { RequestRefundModal, type RefundSubmitOutcome } from '@/components/Refund/RequestRefundModal';
import { ThemedText } from '@/components/themed-text';
import { BrandColors, FloatingTabBarGap, FloatingTabBarHeight, Spacing } from '@/constants/theme';
import { useMerchantRefunds } from '@/hooks/use-merchant-refunds';
import { useMerchantSettlements } from '@/hooks/use-merchant-settlements';
import { useMerchantTransactions } from '@/hooks/use-merchant-transactions';
import { useMerchantWallet } from '@/hooks/use-merchant-wallet';
import { authorizeRefund, prepareRefund } from '@/services/refund-service';
import type { StroopAmount } from '@/types/blockchain';
import type { MerchantTransaction } from '@/types/merchant-transaction';
import type { RefundableSettlement } from '@/types/refund';

const parseTab = (val: string | undefined): HistoryTabKey => {
  if (val === 'refunds' || val === 'payments') return val;
  return 'settlements';
};

export default function MerchantHistoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [userSelectedTab, setUserSelectedTab] = useState<HistoryTabKey | null>(null);
  const activeTab: HistoryTabKey = userSelectedTab ?? parseTab(params.tab);

  const { merchantEntityId } = useMerchantWallet();
  const { state: settlementsState, refresh: refreshSettlements } = useMerchantSettlements(merchantEntityId);
  const { state: refundsState, refresh: refreshRefunds } = useMerchantRefunds(merchantEntityId);
  const {
    filteredTransactions,
    summary: transactionSummary,
    filter,
    setFilter,
    datePreset,
    setDatePreset,
    searchQuery,
    setSearchQuery,
    isLoading: isTxLoading,
    refresh: refreshTransactions,
  } = useMerchantTransactions(merchantEntityId);

  const [refundSettlement, setRefundSettlement] = useState<RefundableSettlement | null>(null);
  const [selectedTx, setSelectedTx] = useState<MerchantTransaction | null>(null);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(merchant)');
    }
  }, [router]);

  const submitRefund = async (
    settlementId: string,
    amountStroops: StroopAmount,
  ): Promise<RefundSubmitOutcome> => {
    const prepared = await prepareRefund({ originalSettlementId: settlementId, amountStroops });
    if (!prepared.ok) return { ok: false, message: prepared.error.message };
    if (!prepared.data.requiresException) {
      const submitted = await authorizeRefund({ refundId: prepared.data.refundId });
      if (!submitted.ok) return { ok: false, message: submitted.error.message };
    }
    await Promise.all([refreshRefunds(), refreshSettlements()]);
    return { ok: true };
  };

  const bottomInset = insets.bottom + FloatingTabBarGap + FloatingTabBarHeight + Spacing.four;
  const settlementsCount = settlementsState.status === 'ready' ? settlementsState.settlements.length : undefined;
  const refundsCount = refundsState.status === 'ready' ? refundsState.refunds.length : undefined;
  const paymentsCount = transactionSummary.totalCount;

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Go back" accessibilityRole="button" hitSlop={10} onPress={handleBack} style={styles.backButton}>
          <MaterialCommunityIcons color={BrandColors.navy} name="arrow-left" size={22} />
        </Pressable>
        <ThemedText style={styles.headerTitle}>History</ThemedText>
        <View style={styles.headerSpacer} />
      </View>

      <HistoryTabBar
        activeTab={activeTab}
        onSelectTab={setUserSelectedTab}
        paymentsCount={paymentsCount}
        refundsCount={refundsCount}
        settlementsCount={settlementsCount}
      />

      <View style={styles.tabContent}>
        {activeTab === 'settlements' && (
          <HistorySettlementsTab
            bottomInset={bottomInset}
            onRefresh={() => void refreshSettlements()}
            onRequestRefund={setRefundSettlement}
            onRetry={() => void refreshSettlements()}
            refreshing={settlementsState.status === 'loading'}
            state={settlementsState}
          />
        )}
        {activeTab === 'refunds' && (
          <HistoryRefundsTab
            bottomInset={bottomInset}
            onRefresh={() => void refreshRefunds()}
            onRetry={() => void refreshRefunds()}
            refreshing={refundsState.status === 'loading'}
            state={refundsState}
          />
        )}
        {activeTab === 'payments' && (
          <HistoryPaymentsTab
            bottomInset={bottomInset}
            datePreset={datePreset}
            filter={filter}
            filteredTransactions={filteredTransactions}
            isLoading={isTxLoading}
            onRefresh={() => void refreshTransactions()}
            onSelectTransaction={setSelectedTx}
            searchQuery={searchQuery}
            setDatePreset={setDatePreset}
            setFilter={setFilter}
            setSearchQuery={setSearchQuery}
            summary={transactionSummary}
          />
        )}
      </View>

      <MerchantBottomNavigation active="history" />

      <RequestRefundModal onClose={() => setRefundSettlement(null)} onSubmit={submitRefund} settlement={refundSettlement} visible={refundSettlement !== null} />
      <TransactionDetailModal onClose={() => setSelectedTx(null)} transaction={selectedTx} visible={selectedTx !== null} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: '#FFFFFF', flex: 1 },
  header: { alignItems: 'center', backgroundColor: '#FFFFFF', borderBottomColor: '#EEEDED', borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: Spacing.four, paddingVertical: Spacing.three },
  backButton: { alignItems: 'center', height: 36, justifyContent: 'center', width: 36 },
  headerTitle: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 17 },
  headerSpacer: { width: 36 },
  tabContent: { flex: 1 },
});

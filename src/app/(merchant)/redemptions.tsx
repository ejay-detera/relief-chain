import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { RedemptionHistoryList } from '@/components/shared/RedemptionHistoryList';
import { fetchMerchantPaymentHistory, type MerchantPaymentRecord } from '@/services/merchantPaymentHistoryService';
import { useMerchantWallet } from '@/hooks/use-merchant-wallet';
import { BrandColors, BottomTabInset, FloatingTabBarHeight, FloatingTabBarGap, Spacing } from '@/constants/theme';

export default function MerchantRedemptionsScreen() {
  const { merchantEntityId } = useMerchantWallet();
  const [payments, setPayments] = useState<MerchantPaymentRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPayments = useCallback(async () => {
    if (!merchantEntityId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchMerchantPaymentHistory(merchantEntityId);
      setPayments(data);
    } catch (e) {
      setError('Could not load payment history.');
    } finally {
      setIsLoading(false);
    }
  }, [merchantEntityId]);

  useEffect(() => { void loadPayments(); }, [loadPayments]);

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <View style={styles.header}>
        <ThemedText style={styles.pageTitle}>Transaction History</ThemedText>
      </View>
      <RedemptionHistoryList
        payments={payments}
        isLoading={isLoading}
        error={error}
        onRefresh={loadPayments}
        contentContainerStyle={{ paddingBottom: BottomTabInset + FloatingTabBarGap + FloatingTabBarHeight + Spacing.four }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FAFAFC' },
  header: { paddingHorizontal: Spacing.four, paddingTop: Spacing.three, paddingBottom: Spacing.two },
  pageTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 22, color: BrandColors.navy },
});

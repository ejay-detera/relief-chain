import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { RedemptionHistoryList } from '@/components/shared/RedemptionHistoryList';
import { fetchLguPaymentHistory, type MerchantPaymentRecord } from '@/services/merchantPaymentHistoryService';
import { useOrganizationId } from '@/hooks/use-organization-id';
import { BrandColors, BottomTabInset, FloatingTabBarHeight, FloatingTabBarGap, Spacing } from '@/constants/theme';

export default function LguRedemptionsScreen() {
  const organizationId = useOrganizationId();
  const [payments, setPayments] = useState<MerchantPaymentRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPayments = useCallback(async () => {
    if (!organizationId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchLguPaymentHistory(organizationId);
      setPayments(data);
    } catch (e) {
      setError('Could not load redemption history.');
    } finally {
      setIsLoading(false);
    }
  }, [organizationId]);

  useEffect(() => { void loadPayments(); }, [loadPayments]);

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <View style={styles.header}>
        <ThemedText style={styles.pageTitle}>Merchant Redemptions</ThemedText>
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

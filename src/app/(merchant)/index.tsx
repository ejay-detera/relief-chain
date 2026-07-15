import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActiveProgramsCard } from '@/components/MerchantDashboard/ActiveProgramsCard';
import { MerchantBottomNavigation } from '@/components/MerchantDashboard/MerchantBottomNavigation';
import { MerchantDashboardHeader } from '@/components/MerchantDashboard/MerchantDashboardHeader';
import { ReceivePaymentCard } from '@/components/MerchantDashboard/ReceivePaymentCard';
import { RecentPayments } from '@/components/MerchantDashboard/RecentPayments';
import { SalesSummaryCard } from '@/components/MerchantDashboard/SalesSummaryCard';
import { WalletBalanceCard } from '@/components/MerchantDashboard/WalletBalanceCard';
import { ThemedText } from '@/components/themed-text';
import { BrandColors, FloatingTabBarGap, FloatingTabBarHeight, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useMerchantMetrics } from '@/hooks/use-merchant-metrics';
import { useMerchantPrograms } from '@/hooks/use-merchant-programs';
import type { MerchantPayment } from '@/types/merchant-dashboard';

const MerchantDashboardScreen = () => {
  const { profile } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isLoading: isMetricsLoading, metrics } = useMerchantMetrics();
  const { error: programsError, isLoading: areProgramsLoading, programs, refresh } = useMerchantPrograms();
  const [payments] = useState<MerchantPayment[]>([{ id: 'payment-1', payerName: 'Puregold Supermarket', occurredAt: 'Today, 10:45 AM', amount: 1500 }, { id: 'payment-2', payerName: 'Elena Rodriguez', occurredAt: 'Oct 24, 09:12 AM', amount: 10000 }]);
  const activePrograms = programs.filter((program) => program.status === 'active');
  const showComingSoon = (feature: string) => Alert.alert(feature, 'This feature will be available soon.');

  return <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}><View style={styles.screen}>
    <MerchantDashboardHeader onNotificationsPress={() => showComingSoon('Notifications')} />
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + FloatingTabBarGap + FloatingTabBarHeight + Spacing.four }]} showsVerticalScrollIndicator={false}>
      <ThemedText style={styles.storeName}>{profile?.full_name ?? 'Merchant Account'}</ThemedText>
      <WalletBalanceCard onSettlementsPress={() => showComingSoon('Settlements')} onWithdrawPress={() => showComingSoon('Withdraw')} />
      <ReceivePaymentCard onPress={() => router.push('/(merchant)/receive')} />
      <SalesSummaryCard isLoading={isMetricsLoading} metrics={metrics} />
      <RecentPayments onViewAll={() => showComingSoon('Payment History')} payments={payments} />
      <ActiveProgramsCard error={programsError} isLoading={areProgramsLoading} onBrowsePress={() => router.push('/(merchant)/programs')} onRetry={() => void refresh()} programs={activePrograms} />
    </ScrollView>
    <MerchantBottomNavigation active="dashboard" />
  </View></SafeAreaView>;
};
export default MerchantDashboardScreen;
const styles = StyleSheet.create({ safeArea: { flex: 1, backgroundColor: '#FFFFFF' }, screen: { flex: 1 }, content: { gap: Spacing.three, padding: Spacing.three }, storeName: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 18 } });

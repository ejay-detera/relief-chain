import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActiveProgramsCard } from '@/components/MerchantDashboard/ActiveProgramsCard';
import { MerchantBottomNavigation } from '@/components/MerchantDashboard/MerchantBottomNavigation';
import { MerchantDashboardHeader } from '@/components/MerchantDashboard/MerchantDashboardHeader';
import { ReceivePaymentCard } from '@/components/MerchantDashboard/ReceivePaymentCard';
import { RecentPayments } from '@/components/MerchantDashboard/RecentPayments';
import { SalesSummaryCard } from '@/components/MerchantDashboard/SalesSummaryCard';
import { WalletBalanceCard } from '@/components/MerchantDashboard/WalletBalanceCard';
import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, BrandColors, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import type { MerchantPayment, MerchantProgram } from '@/types/merchant-dashboard';

const MerchantProfileScreen = () => {
  const { profile } = useAuth();
  const router = useRouter();
  const [payments] = useState<MerchantPayment[]>([{ id: 'payment-1', payerName: 'Puregold Supermarket', occurredAt: 'Today, 10:45 AM', amount: 1500 }, { id: 'payment-2', payerName: 'Elena Rodriguez', occurredAt: 'Oct 24, 09:12 AM', amount: 10000 }]);
  const [programs] = useState<MerchantProgram[]>([{ id: 'dswd-ayuda', name: 'DSWD Ayuda', completion: 65, description: 'Emergency cash assistance for eligible households.', merchantId: '123-009-3', status: 'Active' }, { id: 'lgu-relief', name: 'LGU Relief', completion: 65, description: 'Community relief vouchers from your local government.', merchantId: '123-009-3', status: 'Active' }]);
  const showComingSoon = (feature: string) => Alert.alert(feature, 'This feature will be available soon.');

  return <SafeAreaView edges={['top']} style={styles.safeArea}><View style={styles.screen}>
    <MerchantDashboardHeader onNotificationsPress={() => showComingSoon('Notifications')} />
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <ThemedText style={styles.storeName}>{profile?.full_name ?? 'Aling Nena’s Sari-Sari Store'}</ThemedText>
      <WalletBalanceCard onSettlementsPress={() => showComingSoon('Settlements')} onWithdrawPress={() => showComingSoon('Withdraw')} />
      <ReceivePaymentCard onPress={() => showComingSoon('Receive Payment')} />
      <SalesSummaryCard />
      <RecentPayments onViewAll={() => showComingSoon('Payment History')} payments={payments} />
      <ActiveProgramsCard onBrowsePress={() => router.push('/(merchant)/programs')} programs={programs} />
    </ScrollView>
    <MerchantBottomNavigation onProfilePress={() => showComingSoon('Merchant Profile')} onReceivePress={() => showComingSoon('Receive Payment')} />
  </View></SafeAreaView>;
};

export default MerchantProfileScreen;

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FFFFFF' },
  screen: { flex: 1 },
  content: { gap: Spacing.three, padding: Spacing.three, paddingBottom: BottomTabInset + Spacing.five },
  storeName: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 18 },
});

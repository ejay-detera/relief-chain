import { useState } from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MerchantBottomNavigation } from '@/components/MerchantDashboard/MerchantBottomNavigation';
import { MerchantDashboardHeader } from '@/components/MerchantDashboard/MerchantDashboardHeader';
import { MerchantProgramCard } from '@/components/MerchantPrograms/MerchantProgramCard';
import { ProgramsSummary } from '@/components/MerchantPrograms/ProgramsSummary';
import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, BrandColors, Spacing } from '@/constants/theme';
import type { MerchantProgram } from '@/types/merchant-dashboard';

const programsDescription = 'Enables the purchase of essential grocery items, grains, and perishables. Accredited for dry goods and fresh produce categories.';

const MerchantProgramsScreen = () => {
  const [programs] = useState<MerchantProgram[]>([{ id: 'food-relief-1', name: 'Food Relief', completion: 65, description: programsDescription, merchantId: '123-009-3', status: 'Active' }, { id: 'food-relief-2', name: 'Food Relief', completion: 65, description: programsDescription, merchantId: '123-009-3', status: 'Active' }, { id: 'food-relief-3', name: 'Food Relief', completion: 65, description: programsDescription, merchantId: '123-009-3', status: 'Active' }]);
  const showComingSoon = (feature: string) => Alert.alert(feature, 'This feature will be available soon.');

  return <SafeAreaView edges={['top']} style={styles.safeArea}><View style={styles.screen}>
    <MerchantDashboardHeader onNotificationsPress={() => showComingSoon('Notifications')} />
    <FlatList
      contentContainerStyle={styles.content}
      data={programs}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={<View style={styles.intro}><ThemedText style={styles.title}>Accepted Programs</ThemedText><ThemedText style={styles.subtitle}>Manage your active relief accreditations. These programs allow you to accept specific digital vouchers from beneficiaries in your community.</ThemedText><ProgramsSummary activePrograms={programs.length} vouchersProcessed={1248} /></View>}
      renderItem={({ item }) => <MerchantProgramCard onPress={() => showComingSoon(item.name)} program={item} />}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      showsVerticalScrollIndicator={false}
    />
    <MerchantBottomNavigation onProfilePress={() => showComingSoon('Merchant Profile')} onReceivePress={() => showComingSoon('Receive Payment')} />
  </View></SafeAreaView>;
};

export default MerchantProgramsScreen;

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FFFFFF' },
  screen: { flex: 1 },
  content: { padding: Spacing.three, paddingBottom: BottomTabInset + Spacing.five },
  intro: { gap: Spacing.three, marginBottom: Spacing.three },
  title: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 18 },
  subtitle: { color: BrandColors.grey, fontFamily: 'PlusJakartaSans_400Regular', fontSize: 11, lineHeight: 14 },
  separator: { height: Spacing.three },
});

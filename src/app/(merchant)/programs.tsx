import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MerchantProgramCard } from '@/components/MerchantPrograms/MerchantProgramCard';
import { MerchantProgramsHeader } from '@/components/MerchantPrograms/MerchantProgramsHeader';
import { ProgramsSummary } from '@/components/MerchantPrograms/ProgramsSummary';
import { ThemedText } from '@/components/themed-text';
import { BrandColors, Spacing } from '@/constants/theme';
import { useMerchantMetrics } from '@/hooks/use-merchant-metrics';
import type { MerchantProgram } from '@/types/merchant-dashboard';

const description = 'Enables the purchase of essential grocery items, grains, and perishables. Accredited for dry goods and fresh produce categories.';
const MerchantProgramsScreen = () => {
  const router = useRouter();
  const { metrics } = useMerchantMetrics();
  const [programs] = useState<MerchantProgram[]>([{ id: 'food-relief-1', name: 'Food Relief', completion: 65, description, merchantId: '123-009-3', status: 'Active' }, { id: 'food-relief-2', name: 'Food Relief', completion: 65, description, merchantId: '123-009-3', status: 'Active' }, { id: 'food-relief-3', name: 'Food Relief', completion: 65, description, merchantId: '123-009-3', status: 'Active' }]);
  return <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
    <MerchantProgramsHeader onBack={() => router.back()} />
    <FlatList contentContainerStyle={styles.content} data={programs} keyExtractor={(item) => item.id}
      ListHeaderComponent={<View style={styles.intro}><ThemedText style={styles.title}>Accepted Programs</ThemedText><ThemedText style={styles.subtitle}>Manage your active relief accreditations. These programs allow you to accept specific digital vouchers from beneficiaries in your community.</ThemedText><ProgramsSummary activePrograms={programs.length} vouchersProcessed={metrics?.vouchersProcessed ?? null} /></View>}
      renderItem={({ item }) => <MerchantProgramCard onPress={() => Alert.alert(item.name, 'Program details will be available soon.')} program={item} />} ItemSeparatorComponent={() => <View style={styles.separator} />} showsVerticalScrollIndicator={false} />
  </SafeAreaView>;
};
export default MerchantProgramsScreen;
const styles = StyleSheet.create({ safeArea: { backgroundColor: '#FFFFFF', flex: 1 }, content: { padding: Spacing.three, paddingBottom: Spacing.five }, intro: { gap: Spacing.three, marginBottom: Spacing.three }, title: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 18 }, subtitle: { color: BrandColors.grey, fontFamily: 'PlusJakartaSans_400Regular', fontSize: 11, lineHeight: 15 }, separator: { height: Spacing.three } });

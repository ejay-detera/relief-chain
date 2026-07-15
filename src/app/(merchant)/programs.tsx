import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { MerchantBottomNavigation } from '@/components/MerchantDashboard/MerchantBottomNavigation';
import { MerchantDashboardHeader } from '@/components/MerchantDashboard/MerchantDashboardHeader';
import { MerchantProgramCard } from '@/components/MerchantPrograms/MerchantProgramCard';
import { ProgramsSummary } from '@/components/MerchantPrograms/ProgramsSummary';
import { ThemedText } from '@/components/themed-text';
import { BrandColors, FloatingTabBarGap, FloatingTabBarHeight, Spacing } from '@/constants/theme';
import { useMerchantMetrics } from '@/hooks/use-merchant-metrics';
import { useMerchantPrograms } from '@/hooks/use-merchant-programs';

const MerchantProgramsScreen = () => {
  const insets = useSafeAreaInsets();
  const { metrics } = useMerchantMetrics();
  const { error, isLoading, programs, refresh } = useMerchantPrograms();
  const activePrograms = programs.filter((program) => program.status === 'active').length;
  const showNotifications = () => Alert.alert('Notifications', 'This feature will be available soon.');
  const emptyMessage = error ? 'Unable to load programs.' : 'No programs are available for this merchant.';

  return <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}><View style={styles.screen}>
    <MerchantDashboardHeader onNotificationsPress={showNotifications} />
    <FlatList contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + FloatingTabBarGap + FloatingTabBarHeight + Spacing.four }]} data={programs} keyExtractor={(item) => item.id}
      ListHeaderComponent={<View style={styles.intro}><ThemedText style={styles.title}>Accepted Programs</ThemedText><ThemedText style={styles.subtitle}>View the relief programs whose digital vouchers your business can accept.</ThemedText><ProgramsSummary activePrograms={activePrograms} vouchersProcessed={metrics?.vouchersProcessed ?? null} />{error && programs.length > 0 ? <ThemedText style={styles.error}>Programs could not be refreshed. Showing the latest available list.</ThemedText> : null}</View>}
      ListEmptyComponent={<View style={styles.empty}><ThemedText style={styles.emptyTitle}>{isLoading ? 'Loading programs…' : emptyMessage}</ThemedText>{error && !isLoading ? <Pressable accessibilityRole="button" onPress={() => void refresh()} style={styles.retry}><ThemedText style={styles.retryText}>Try Again</ThemedText></Pressable> : null}</View>}
      renderItem={({ item }) => <MerchantProgramCard program={item} />} ItemSeparatorComponent={() => <View style={styles.separator} />} refreshing={isLoading && programs.length > 0} onRefresh={() => void refresh()} showsVerticalScrollIndicator={false} />
    <MerchantBottomNavigation active="programs" />
  </View></SafeAreaView>;
};
export default MerchantProgramsScreen;
const styles = StyleSheet.create({ safeArea: { backgroundColor: '#FFFFFF', flex: 1 }, screen: { flex: 1 }, content: { flexGrow: 1, padding: Spacing.three }, intro: { gap: Spacing.three, marginBottom: Spacing.three }, title: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 18 }, subtitle: { color: BrandColors.grey, fontFamily: 'PlusJakartaSans_400Regular', fontSize: 11, lineHeight: 15 }, error: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_500Medium', fontSize: 10 }, empty: { alignItems: 'center', flex: 1, justifyContent: 'center', minHeight: 180 }, emptyTitle: { color: BrandColors.grey, fontFamily: 'PlusJakartaSans_500Medium', fontSize: 12, textAlign: 'center' }, retry: { backgroundColor: BrandColors.navy, borderRadius: 18, marginTop: Spacing.three, paddingHorizontal: Spacing.four, paddingVertical: Spacing.two }, retryText: { color: '#FFFFFF', fontFamily: 'PlusJakartaSans_700Bold', fontSize: 10 }, separator: { height: Spacing.three } });

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { InvoiceDetailModal } from '@/components/MerchantPaymentHistory/InvoiceDetailModal';
import { InvoiceHistoryCard } from '@/components/MerchantPaymentHistory/InvoiceHistoryCard';
import { InvoiceHistoryFilter } from '@/components/MerchantPaymentHistory/InvoiceHistoryFilter';
import { InvoiceHistorySummary } from '@/components/MerchantPaymentHistory/InvoiceHistorySummary';
import { FadeInView } from '@/components/shared/FadeInView';
import { ThemedText } from '@/components/themed-text';
import { BrandColors, Spacing } from '@/constants/theme';
import { useMerchantInvoiceHistory } from '@/hooks/use-merchant-invoice-history';
import { useMerchantWallet } from '@/hooks/use-merchant-wallet';
import type { MerchantInvoiceRecord } from '@/types/merchant-payment-history';

const MerchantPaymentHistoryScreen = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { merchantEntityId } = useMerchantWallet();
  const {
    invoices,
    filteredCount,
    hasMore,
    isLoading,
    filter,
    sortOrder,
    summary,
    setFilter,
    toggleSortOrder,
    loadMore,
    refresh,
    checkInvoiceSettlement,
  } = useMerchantInvoiceHistory(merchantEntityId);

  const [selectedRecord, setSelectedRecord] = useState<MerchantInvoiceRecord | null>(null);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(merchant)');
    }
  }, [router]);

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Go back" accessibilityRole="button" hitSlop={10} onPress={handleBack} style={styles.backButton}>
          <MaterialCommunityIcons color={BrandColors.navy} name="arrow-left" size={22} />
        </Pressable>
        <ThemedText style={styles.title}>Payment History</ThemedText>
      </View>

      <FlatList
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.four }]}
        data={invoices}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons color={BrandColors.grey} name="receipt-text-outline" size={48} />
            <ThemedText style={styles.emptyTitle}>
              {isLoading ? 'Loading payments…' : 'No payment requests found'}
            </ThemedText>
            <ThemedText style={styles.emptySubtitle}>
              {filter === 'all'
                ? 'Create a new invoice in the scanner to receive payments.'
                : `No ${filter} invoices found.`}
            </ThemedText>
            <Pressable accessibilityRole="button" onPress={() => router.push('/(merchant)/receive')} style={styles.emptyButton}>
              <ThemedText style={styles.emptyButtonText}>Receive Payment</ThemedText>
            </Pressable>
          </View>
        }
        ListFooterComponent={
          hasMore ? (
            <Pressable accessibilityRole="button" onPress={loadMore} style={styles.loadMoreButton}>
              <ThemedText style={styles.loadMoreText}>
                Load older invoices ({invoices.length} of {filteredCount})
              </ThemedText>
            </Pressable>
          ) : null
        }
        ListHeaderComponent={
          <FadeInView delay={0}>
            <View style={styles.headerBlock}>
              <InvoiceHistorySummary summary={summary} />
              <InvoiceHistoryFilter
                activeFilter={filter}
                onSelectFilter={setFilter}
                onToggleSort={toggleSortOrder}
                sortOrder={sortOrder}
                summary={summary}
              />
            </View>
          </FadeInView>
        }
        refreshControl={<RefreshControl onRefresh={() => void refresh()} refreshing={isLoading} />}
        renderItem={({ item, index }) => (
          <FadeInView delay={Math.min(index, 4) * 30}>
            <InvoiceHistoryCard onPress={setSelectedRecord} record={item} />
          </FadeInView>
        )}
        showsVerticalScrollIndicator={false}
      />

      <InvoiceDetailModal
        onCheckSettlement={checkInvoiceSettlement}
        onClose={() => setSelectedRecord(null)}
        record={selectedRecord}
        visible={selectedRecord !== null}
      />
    </SafeAreaView>
  );
};

export default MerchantPaymentHistoryScreen;

const styles = StyleSheet.create({
  safeArea: { backgroundColor: '#FFFFFF', flex: 1 },
  header: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  backButton: { padding: Spacing.one },
  title: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 18 },
  content: { gap: Spacing.two, padding: Spacing.three },
  headerBlock: { gap: Spacing.three, marginBottom: Spacing.two },
  separator: { height: Spacing.two },
  loadMoreButton: { alignItems: 'center', backgroundColor: '#F1F4F9', borderRadius: 20, marginTop: Spacing.two, paddingVertical: Spacing.two },
  loadMoreText: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 12 },
  emptyContainer: { alignItems: 'center', gap: Spacing.two, justifyContent: 'center', minHeight: 220, paddingVertical: Spacing.four },
  emptyTitle: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 16 },
  emptySubtitle: { color: BrandColors.grey, fontFamily: 'PlusJakartaSans_500Medium', fontSize: 13, textAlign: 'center' },
  emptyButton: { backgroundColor: BrandColors.navy, borderRadius: 24, marginTop: Spacing.two, paddingHorizontal: Spacing.four, paddingVertical: Spacing.two },
  emptyButtonText: { color: '#FFFFFF', fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13 },
});

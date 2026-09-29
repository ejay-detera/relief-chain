import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { TransactionDetailModal } from '@/components/MerchantTransactions/TransactionDetailModal';
import { FadeInView } from '@/components/shared/FadeInView';
import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import { shortReference, useMerchantTransactions } from '@/hooks/use-merchant-transactions';
import { useMerchantWallet } from '@/hooks/use-merchant-wallet';
import type { MerchantTransaction, MerchantTransactionFilter } from '@/types/merchant-transaction';

const formatPhp = (amount: number): string =>
  `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function MerchantTransactionsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { merchantEntityId } = useMerchantWallet();
  const {
    filteredTransactions,
    summary,
    filter,
    setFilter,
    searchQuery,
    setSearchQuery,
    isLoading,
    refresh,
  } = useMerchantTransactions(merchantEntityId);

  const [selectedTransaction, setSelectedTransaction] = useState<MerchantTransaction | null>(null);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(merchant)');
    }
  }, [router]);

  const filterTabs: { id: MerchantTransactionFilter; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: summary.totalCount },
    { id: 'voucher_redemption', label: 'Vouchers', count: summary.voucherCount },
    { id: 'cash_payment', label: 'Direct Cash', count: summary.cashCount },
  ];

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable accessibilityLabel="Go back" accessibilityRole="button" hitSlop={10} onPress={handleBack} style={styles.backButton}>
          <MaterialCommunityIcons color={BrandColors.navy} name="arrow-left" size={22} />
        </Pressable>
        <ThemedText style={styles.headerTitle}>Past Transactions</ThemedText>
        <View style={styles.headerSpacer} />
      </View>

      <FlatList
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.four }]}
        data={filteredTransactions}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons color={BrandColors.grey} name="receipt-text-outline" size={44} />
            <ThemedText style={styles.emptyTitle}>
              {isLoading ? 'Loading transactions…' : 'No past transactions found'}
            </ThemedText>
            <ThemedText style={styles.emptySubtitle}>
              {searchQuery.trim().length > 0
                ? 'No transactions matched your search criteria.'
                : filter !== 'all'
                ? `No ${filter === 'voucher_redemption' ? 'voucher redemptions' : 'direct payments'} recorded yet.`
                : 'Confirmed payments from beneficiaries will automatically appear here once received.'}
            </ThemedText>
            {!isLoading && searchQuery.trim().length === 0 && filter === 'all' && (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/(merchant)/receive')}
                style={styles.emptyButton}
              >
                <ThemedText style={styles.emptyButtonText}>Receive Payment</ThemedText>
              </Pressable>
            )}
          </View>
        }
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            {/* Summary card */}
            <View style={styles.summaryCard}>
              <View style={styles.summaryColumn}>
                <ThemedText style={styles.summaryLabel}>Total Settled Revenue</ThemedText>
                <ThemedText style={styles.summaryAmount}>{formatPhp(summary.totalSettledPhp)}</ThemedText>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryStat}>
                <ThemedText style={styles.summaryStatLabel}>Total Payments</ThemedText>
                <ThemedText style={styles.summaryStatValue}>{summary.totalCount}</ThemedText>
              </View>
            </View>

            {/* Search Input */}
            <View style={styles.searchBox}>
              <MaterialCommunityIcons color={BrandColors.grey} name="magnify" size={20} />
              <TextInput
                clearButtonMode="while-editing"
                onChangeText={setSearchQuery}
                placeholder="Search by program, reference, or hash..."
                placeholderTextColor={BrandColors.grey}
                style={styles.searchInput}
                value={searchQuery}
              />
              {searchQuery.length > 0 && (
                <Pressable onPress={() => setSearchQuery('')} style={styles.clearSearch}>
                  <MaterialCommunityIcons color={BrandColors.grey} name="close-circle" size={16} />
                </Pressable>
              )}
            </View>

            {/* Filter Tabs */}
            <View style={styles.filterRow}>
              {filterTabs.map((tab) => {
                const isActive = filter === tab.id;
                return (
                  <Pressable
                    accessibilityRole="button"
                    key={tab.id}
                    onPress={() => setFilter(tab.id)}
                    style={[styles.filterChip, isActive && styles.filterChipActive]}
                  >
                    <ThemedText style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                      {tab.label}
                    </ThemedText>
                    <View style={[styles.filterCountBadge, isActive && styles.filterCountBadgeActive]}>
                      <ThemedText style={[styles.filterCountText, isActive && styles.filterCountTextActive]}>
                        {tab.count}
                      </ThemedText>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        }
        refreshControl={<RefreshControl onRefresh={() => void refresh()} refreshing={isLoading} />}
        renderItem={({ item, index }) => {
          const reference = shortReference(item.correlationId, item.id);
          const formattedAmount = `+ ₱${item.amount.toLocaleString('en-PH', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`;

          return (
            <FadeInView delay={Math.min(index, 5) * 30}>
              <Pressable
                accessibilityLabel={`View transaction ${reference}`}
                accessibilityRole="button"
                onPress={() => setSelectedTransaction(item)}
                style={styles.card}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.cardTitleContainer}>
                    <ThemedText numberOfLines={1} style={styles.cardTitle}>
                      {item.payerName}
                    </ThemedText>
                    <ThemedText style={styles.cardReference}>{reference}</ThemedText>
                  </View>
                  <ThemedText style={styles.cardAmount}>{formattedAmount}</ThemedText>
                </View>

                <View style={styles.cardFooter}>
                  <View style={styles.cardKindBadge}>
                    <ThemedText style={styles.cardKindText}>
                      {item.kind === 'voucher_redemption' ? 'Voucher' : 'Cash'}
                    </ThemedText>
                  </View>
                  <ThemedText style={styles.cardDate}>{item.occurredAt}</ThemedText>
                </View>
              </Pressable>
            </FadeInView>
          );
        }}
        showsVerticalScrollIndicator={false}
      />

      {/* Transaction Detail Modal */}
      <TransactionDetailModal
        onClose={() => setSelectedTransaction(null)}
        transaction={selectedTransaction}
        visible={selectedTransaction !== null}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: '#FAFAFC',
    flex: 1,
  },
  header: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderBottomColor: '#EDF0F5',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  backButton: {
    alignItems: 'center',
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  headerTitle: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 17,
  },
  headerSpacer: {
    width: 36,
  },
  content: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
  },
  headerBlock: {
    gap: Spacing.three,
    marginBottom: Spacing.two,
  },
  summaryCard: {
    backgroundColor: BrandColors.navy,
    borderRadius: BorderRadius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.four,
    shadowColor: BrandColors.navy,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 4,
  },
  summaryColumn: {
    flex: 1,
  },
  summaryLabel: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 11,
  },
  summaryAmount: {
    color: '#FFFFFF',
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 22,
    marginTop: 4,
  },
  summaryDivider: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    height: 36,
    marginHorizontal: Spacing.three,
    width: 1,
  },
  summaryStat: {
    alignItems: 'flex-end',
  },
  summaryStatLabel: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 11,
  },
  summaryStatValue: {
    color: '#FFFFFF',
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 18,
    marginTop: 4,
  },
  searchBox: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    flexDirection: 'row',
    paddingHorizontal: Spacing.three,
    paddingVertical: PlatformSelect(8, 6),
    gap: Spacing.two,
  },
  searchInput: {
    color: BrandColors.navy,
    flex: 1,
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 13,
    padding: 0,
  },
  clearSearch: {
    padding: 2,
  },
  filterRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  filterChip: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: Spacing.three,
    paddingVertical: 6,
  },
  filterChipActive: {
    backgroundColor: BrandColors.navy,
    borderColor: BrandColors.navy,
  },
  filterChipText: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  filterCountBadge: {
    backgroundColor: '#F1F5F9',
    borderRadius: BorderRadius.full,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  filterCountBadgeActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  filterCountText: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 10,
  },
  filterCountTextActive: {
    color: '#FFFFFF',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(151,151,151,0.22)',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    gap: Spacing.two,
    padding: Spacing.three,
    shadowColor: '#112E58',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  cardHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cardTitleContainer: {
    flex: 1,
    marginRight: Spacing.two,
  },
  cardTitle: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
  },
  cardReference: {
    color: BrandColors.grey,
    fontFamily: 'monospace',
    fontSize: 10,
    marginTop: 2,
  },
  cardAmount: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
  },
  cardFooter: {
    alignItems: 'center',
    borderTopColor: '#F1F5F9',
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: Spacing.one,
  },
  cardKindBadge: {
    backgroundColor: '#E8F5E9',
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  cardKindText: {
    color: BrandColors.green,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 9,
    textTransform: 'uppercase',
  },
  cardDate: {
    color: BrandColors.grey,
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 10,
  },
  separator: {
    height: Spacing.two,
  },
  emptyContainer: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(151,151,151,0.2)',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    gap: Spacing.two,
    marginTop: Spacing.four,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.six,
  },
  emptyTitle: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 15,
  },
  emptySubtitle: {
    color: BrandColors.grey,
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  emptyButton: {
    backgroundColor: BrandColors.green,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
  emptyButtonText: {
    color: '#FFFFFF',
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
  },
});

function PlatformSelect<T>(ios: T, android: T): T {
  return ios;
}

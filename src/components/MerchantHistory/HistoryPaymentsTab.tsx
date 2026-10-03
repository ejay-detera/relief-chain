import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { HistoryFilterDropdowns } from '@/components/MerchantHistory/HistoryFilterDropdowns';
import { TransactionExportModal } from '@/components/MerchantHistory/TransactionExportModal';
import { FadeInView } from '@/components/shared/FadeInView';
import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import { type DateRangePreset, shortReference } from '@/hooks/use-merchant-transactions';
import type {
  MerchantTransaction,
  MerchantTransactionFilter,
  MerchantTransactionsSummary,
} from '@/types/merchant-transaction';

type Props = {
  bottomInset: number;
  datePreset: DateRangePreset;
  filter: MerchantTransactionFilter;
  filteredTransactions: readonly MerchantTransaction[];
  isLoading: boolean;
  onRefresh: () => void;
  onSelectTransaction: (transaction: MerchantTransaction) => void;
  searchQuery: string;
  setDatePreset: (preset: DateRangePreset) => void;
  setFilter: (filter: MerchantTransactionFilter) => void;
  setSearchQuery: (query: string) => void;
  summary: MerchantTransactionsSummary;
};

const formatPhp = (amount: number): string =>
  `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const HistoryPaymentsTab = ({
  bottomInset,
  datePreset,
  filter,
  filteredTransactions,
  isLoading,
  onRefresh,
  onSelectTransaction,
  searchQuery,
  setDatePreset,
  setFilter,
  setSearchQuery,
  summary,
}: Props) => {
  const router = useRouter();
  const [exportModalVisible, setExportModalVisible] = useState(false);



  return (
    <>
      <FlatList
        contentContainerStyle={[styles.content, { paddingBottom: bottomInset }]}
      data={filteredTransactions}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      keyExtractor={(item) => item.id}
      ListEmptyComponent={
        <View style={styles.emptyContainer}>
          <MaterialCommunityIcons color={BrandColors.grey} name="receipt-text-outline" size={44} />
          <ThemedText style={styles.emptyTitle}>
            {isLoading ? 'Loading payments…' : 'No past payments found'}
          </ThemedText>
          <ThemedText style={styles.emptySubtitle}>
            {searchQuery.trim().length > 0
              ? 'No payments matched your search criteria.'
              : filter !== 'all'
              ? `No ${filter === 'voucher_redemption' ? 'voucher redemptions' : 'direct payments'} recorded yet.`
              : 'Confirmed payments will automatically appear here once received.'}
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
              <ThemedText numberOfLines={1} style={styles.summaryAmount}>
                {formatPhp(summary.totalSettledPhp)}
              </ThemedText>
            </View>
            <Pressable
              accessibilityLabel="Export redemptions"
              accessibilityRole="button"
              hitSlop={6}
              onPress={() => setExportModalVisible(true)}
              style={styles.exportButton}
            >
              <MaterialCommunityIcons color="#FFFFFF" name="file-download-outline" size={17} />
              <ThemedText style={styles.exportButtonText}>Export</ThemedText>
            </Pressable>
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

          {/* Dropdown Filters Bar */}
          <HistoryFilterDropdowns
            datePreset={datePreset}
            filter={filter}
            onSelectDatePreset={setDatePreset}
            onSelectFilter={setFilter}
            typeCounts={{
              all: summary.totalCount,
              directCash: summary.cashCount,
              vouchers: summary.voucherCount,
            }}
          />
        </View>
      }
      refreshControl={<RefreshControl onRefresh={onRefresh} refreshing={isLoading} />}
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
              onPress={() => onSelectTransaction(item)}
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
      <TransactionExportModal
        onClose={() => setExportModalVisible(false)}
        transactions={filteredTransactions}
        visible={exportModalVisible}
      />
    </>
  );
};

const styles = StyleSheet.create({
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
    alignItems: 'center',
    backgroundColor: BrandColors.navy,
    borderRadius: BorderRadius.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: Spacing.four,
    shadowColor: BrandColors.navy,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  summaryColumn: {
    flex: 1,
  },
  summaryLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 11,
    marginBottom: 4,
  },
  summaryAmount: {
    color: '#FFFFFF',
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 20,
  },
  searchBox: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(151,151,151,0.25)',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
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

  card: {
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(151,151,151,0.2)',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    gap: Spacing.two,
    padding: Spacing.three,
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
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 14,
  },
  cardReference: {
    color: BrandColors.grey,
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 11,
    marginTop: 2,
  },
  cardAmount: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 15,
  },
  cardFooter: {
    alignItems: 'center',
    borderTopColor: '#F3F4F6',
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: Spacing.two,
  },
  cardKindBadge: {
    backgroundColor: 'rgba(111,202,75,0.12)',
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  cardKindText: {
    color: BrandColors.green,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 10,
  },
  cardDate: {
    color: BrandColors.grey,
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 11,
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
    justifyContent: 'center',
    marginTop: Spacing.two,
    padding: Spacing.four,
  },
  emptyTitle: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
    textAlign: 'center',
  },
  emptySubtitle: {
    color: BrandColors.grey,
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
  },
  emptyButton: {
    backgroundColor: BrandColors.navy,
    borderRadius: BorderRadius.full,
    marginTop: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
  emptyButtonText: {
    color: '#FFFFFF',
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 12,
  },
  exportButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: BorderRadius.md,
    flexDirection: 'row',
    gap: 6,
    marginLeft: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: 7,
  },
  exportButtonText: {
    color: '#FFFFFF',
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 12,
  },

});

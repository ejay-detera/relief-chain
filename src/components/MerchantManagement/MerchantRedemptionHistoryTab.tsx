import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import {
  fetchMerchantPrograms,
  fetchMerchantRedemptions,
} from '@/services/organizationMerchantService';
import type {
  MerchantRedemptionTransaction,
  RedemptionDateFilter,
} from '@/types/merchant-management';
import { MerchantRedemptionCard } from './MerchantRedemptionCard';
import { MerchantRedemptionFilters } from './MerchantRedemptionFilters';

type Props = {
  merchantId: string;
  orgId?: string;
  onTotalCountChange?: (count: number) => void;
};

export const MerchantRedemptionHistoryTab = ({
  merchantId,
  orgId,
  onTotalCountChange,
}: Props) => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [transactions, setTransactions] = useState<
    MerchantRedemptionTransaction[]
  >([]);
  const [programs, setPrograms] = useState<{ id: string; name: string }[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDateFilter, setSelectedDateFilter] =
    useState<RedemptionDateFilter>('all');
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(
    null,
  );

  const loadData = useCallback(async () => {
    try {
      const [txList, progList] = await Promise.all([
        fetchMerchantRedemptions({ merchantId, orgId }),
        fetchMerchantPrograms(merchantId, orgId),
      ]);
      setTransactions(txList);
      setPrograms(progList);
      if (onTotalCountChange) {
        onTotalCountChange(txList.length);
      }
    } catch (err) {
      console.error('Failed to load merchant redemption history:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [merchantId, orgId, onTotalCountChange]);

  useEffect(() => {
    let isMounted = true;
    Promise.resolve().then(() => {
      if (isMounted) {
        setLoading(true);
        void loadData();
      }
    });
    return () => {
      isMounted = false;
    };
  }, [loadData]);

  const handleRefresh = () => {
    setRefreshing(true);
    void loadData();
  };

  // Filter transactions
  const filteredTransactions = useMemo(() => {
    const now = new Date();
    const q = searchQuery.toLowerCase().trim();

    return transactions.filter((tx) => {
      // 1. Program filter
      if (selectedProgramId && tx.program_id !== selectedProgramId) {
        return false;
      }

      // 2. Date filter
      if (selectedDateFilter !== 'all') {
        const txDate = new Date(tx.redeemed_at);
        if (selectedDateFilter === 'today') {
          const isSameDay =
            txDate.getFullYear() === now.getFullYear() &&
            txDate.getMonth() === now.getMonth() &&
            txDate.getDate() === now.getDate();
          if (!isSameDay) return false;
        } else if (selectedDateFilter === '7days') {
          const diffDays =
            (now.getTime() - txDate.getTime()) / (1000 * 60 * 60 * 24);
          if (diffDays > 7) return false;
        } else if (selectedDateFilter === '30days') {
          const diffDays =
            (now.getTime() - txDate.getTime()) / (1000 * 60 * 60 * 24);
          if (diffDays > 30) return false;
        }
      }

      // 3. Search query filter
      if (q) {
        const matchesBen =
          tx.beneficiary_name.toLowerCase().includes(q) ||
          (tx.beneficiary_reference &&
            tx.beneficiary_reference.toLowerCase().includes(q));
        const matchesHash = tx.tx_hash && tx.tx_hash.toLowerCase().includes(q);
        const matchesProgram = tx.program_name.toLowerCase().includes(q);
        const matchesCategory = tx.category.toLowerCase().includes(q);
        if (!matchesBen && !matchesHash && !matchesProgram && !matchesCategory) {
          return false;
        }
      }

      return true;
    });
  }, [transactions, selectedProgramId, selectedDateFilter, searchQuery]);

  // Summary Metrics
  const summary = useMemo(() => {
    const totalAmount = filteredTransactions.reduce(
      (sum, tx) => sum + (Number(tx.amount) || 0),
      0,
    );
    return {
      count: filteredTransactions.length,
      amount: totalAmount,
    };
  }, [filteredTransactions]);

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={BrandColors.navy} />
        <ThemedText style={styles.loadingText}>
          Loading redemption transactions...
        </ThemedText>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      {/* KPI Summary Cards */}
      <View style={styles.kpiRow}>
        <View style={styles.kpiCard}>
          <ThemedText style={styles.kpiValue}>{summary.count}</ThemedText>
          <ThemedText style={styles.kpiLabel}>Total Redemptions</ThemedText>
        </View>

        <View style={styles.kpiCard}>
          <ThemedText style={styles.kpiValue}>
            ₱
            {summary.amount.toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </ThemedText>
          <ThemedText style={styles.kpiLabel}>Total Redeemed</ThemedText>
        </View>
      </View>

      {/* Filter Controls */}
      <MerchantRedemptionFilters
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedDateFilter={selectedDateFilter}
        onSelectDateFilter={setSelectedDateFilter}
        programs={programs}
        selectedProgramId={selectedProgramId}
        onSelectProgramId={setSelectedProgramId}
      />

      {/* Header with Refresh Button */}
      <View style={styles.listHeaderRow}>
        <ThemedText style={styles.listSectionTitle}>
          Transactions ({filteredTransactions.length})
        </ThemedText>
        <Pressable
          onPress={handleRefresh}
          disabled={refreshing}
          style={styles.refreshBtn}
        >
          <FontAwesome
            name="refresh"
            size={12}
            color={refreshing ? BrandColors.grey : BrandColors.navy}
          />
          <ThemedText style={styles.refreshBtnText}>
            {refreshing ? 'Updating...' : 'Refresh'}
          </ThemedText>
        </Pressable>
      </View>

      {/* Transactions List */}
      {filteredTransactions.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconCircle}>
            <FontAwesome name="file-text-o" size={26} color={BrandColors.grey} />
          </View>
          <ThemedText style={styles.emptyTitle}>
            No Redemptions Found
          </ThemedText>
          <ThemedText style={styles.emptySubtitle}>
            {transactions.length === 0
              ? 'This merchant has not processed any aid redemptions yet.'
              : 'No transactions match the selected date or program filter.'}
          </ThemedText>
        </View>
      ) : (
        filteredTransactions.map((tx) => (
          <MerchantRedemptionCard key={tx.id} transaction={tx} />
        ))
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingBottom: Spacing.four,
  },
  centerContainer: {
    paddingVertical: Spacing.four * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: Spacing.two,
    fontSize: 13,
    color: BrandColors.grey,
  },
  kpiRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginBottom: Spacing.three,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: '#F8F9FB',
    borderRadius: BorderRadius.lg,
    padding: Spacing.three,
    borderWidth: 1,
    borderColor: '#E8ECF2',
  },
  kpiValue: {
    fontSize: 16,
    fontWeight: '800',
    color: BrandColors.navy,
  },
  kpiLabel: {
    fontSize: 11,
    color: BrandColors.grey,
    marginTop: 2,
  },
  listHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.two,
  },
  listSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: BrandColors.navy,
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
    backgroundColor: '#F0F2F6',
  },
  refreshBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: BrandColors.navy,
  },
  emptyContainer: {
    paddingVertical: Spacing.four * 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'white',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  emptyIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#F7F8FA',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: BrandColors.navy,
  },
  emptySubtitle: {
    fontSize: 12,
    color: BrandColors.grey,
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: Spacing.four,
  },
});

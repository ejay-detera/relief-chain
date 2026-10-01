import React from 'react';
import { StyleSheet, View } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import { RedemptionRecord } from '@/types/wallet';

type Props = {
  record: RedemptionRecord;
};

export function TransactionRow({ record }: Props) {
  const isPending = record.status === 'Pending';
  const isCompleted = record.status === 'Completed';
  const isCredit = record.direction === 'credit';

  return (
    <View style={styles.row}>
      <View style={styles.leftCol}>
        <View style={styles.merchantRow}>
          <ThemedText style={styles.merchant} numberOfLines={1}>
            {record.merchant}
          </ThemedText>
          {record.category && (
            <View style={styles.categoryBadge}>
              <ThemedText style={styles.categoryBadgeText}>{record.category}</ThemedText>
            </View>
          )}
        </View>

        <View style={styles.metaRow}>
          <ThemedText style={styles.date}>{record.date}</ThemedText>
          {isPending && (
            <View style={styles.pendingSyncPill}>
              <FontAwesome name="refresh" size={9} color="#B45309" />
              <ThemedText style={styles.pendingSyncText}>Pending Sync</ThemedText>
            </View>
          )}
        </View>

        <ThemedText style={styles.hash} selectable numberOfLines={1}>
          {isPending ? 'Syncing to Stellar ledger…' : record.txHash}
        </ThemedText>
      </View>

      <View style={styles.rightCol}>
        <ThemedText
          style={[
            styles.amount,
            isCredit ? styles.amountCredit : styles.amountDebit,
          ]}
        >
          {isCredit ? `+${record.amount}` : `-${record.amount}`}
        </ThemedText>
        <ThemedText style={styles.balanceLabel}>Balance: {record.remainingBalance}</ThemedText>
        <View
          style={[
            styles.statusDot,
            isCompleted && styles.statusSuccess,
            isPending && styles.statusPending,
            !isCompleted && !isPending && styles.statusFailed,
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    backgroundColor: 'white',
  },
  leftCol: {
    flex: 1,
    marginRight: Spacing.three,
  },
  merchantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 6,
    marginBottom: 4,
  },
  merchant: {
    fontSize: 14,
    fontWeight: '600',
    color: BrandColors.navy,
    flexShrink: 1,
  },
  categoryBadge: {
    backgroundColor: '#F0F4F8',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  categoryBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: BrandColors.navy,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 6,
    marginBottom: 4,
  },
  date: {
    fontSize: 12,
    color: BrandColors.grey,
  },
  pendingSyncPill: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 4,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
  },
  pendingSyncText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#B45309',
  },
  hash: {
    fontSize: 10,
    color: '#999',
  },
  rightCol: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  amount: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  amountCredit: {
    color: BrandColors.green,
  },
  amountDebit: {
    color: BrandColors.navy,
  },
  balanceLabel: {
    fontSize: 11,
    color: BrandColors.grey,
    marginBottom: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusSuccess: {
    backgroundColor: BrandColors.green,
  },
  statusPending: {
    backgroundColor: '#F59E0B',
  },
  statusFailed: {
    backgroundColor: '#E53E3E',
  },
});

import { FontAwesome } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import type { Disbursement } from '@/services/disbursementService';

import { DisbursementStatusPill } from './DisbursementStatusPill';

type Props = {
  item: Disbursement;
  onCopyHash: (hash: string) => void;
  onOpen: (jobId: string) => void;
};

export const DisbursementHistoryCard = ({ item, onCopyHash, onOpen }: Props) => {
  const hasHash = item.txHash.length > 0;
  return (
    <Pressable
      accessibilityHint="Opens reconciled distribution status"
      accessibilityLabel={`${item.programName} distribution, ${item.status}`}
      accessibilityRole="button"
      onPress={() => onOpen(item.id)}
      style={styles.card}
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <FontAwesome name="check-circle" size={16} color={BrandColors.green} />
          <ThemedText style={styles.programName}>{item.programName}</ThemedText>
        </View>
        <DisbursementStatusPill status={item.status} />
      </View>

      <ThemedText style={styles.eventText}>Disaster: {item.disasterEvent}</ThemedText>
      <ThemedText style={styles.dateText}>{item.date}</ThemedText>

      <View style={styles.cardBody}>
        <View style={styles.stat}>
          <ThemedText style={styles.statLabel}>Total Payout</ThemedText>
          <ThemedText style={styles.statValuePayout}>₱{item.amount.toLocaleString()}</ThemedText>
        </View>
        <View style={styles.stat}>
          <ThemedText style={styles.statLabel}>Households Served</ThemedText>
          <ThemedText style={styles.statValue}>{item.recipientsCount} Families</ThemedText>
        </View>
      </View>

      {item.failedCount > 0 ? (
        <ThemedText style={styles.failedText}>
          {item.failedCount} transfer{item.failedCount === 1 ? '' : 's'} need review — open to reconcile or
          retry safely.
        </ThemedText>
      ) : null}

      <View style={styles.hashRow}>
        <ThemedText numberOfLines={1} style={styles.hashText}>
          {hasHash ? `Hash: ${item.txHash}` : 'Awaiting on-chain confirmation.'}
        </ThemedText>
        {hasHash ? (
          <Pressable
            accessibilityLabel="Copy transaction hash"
            accessibilityRole="button"
            onPress={() => onCopyHash(item.txHash)}
            style={styles.copyBtn}
          >
            <FontAwesome name="copy" size={12} color={BrandColors.navy} />
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'white',
    borderColor: '#E5E7EB',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
    padding: Spacing.four,
  },
  cardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  cardHeaderLeft: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: Spacing.two,
    marginRight: Spacing.two,
  },
  programName: {
    color: BrandColors.navy,
    flex: 1,
    fontSize: 15,
    fontWeight: 'bold',
  },
  eventText: {
    color: BrandColors.grey,
    fontSize: 12,
    marginBottom: 2,
    marginLeft: 22,
  },
  dateText: {
    color: BrandColors.grey,
    fontSize: 12,
    marginBottom: Spacing.three,
    marginLeft: 22,
  },
  cardBody: {
    backgroundColor: '#FAFAFC',
    borderRadius: BorderRadius.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.three,
    padding: Spacing.three,
  },
  stat: {
    flex: 1,
  },
  statLabel: {
    color: BrandColors.grey,
    fontSize: 11,
    marginBottom: 2,
  },
  statValue: {
    color: BrandColors.navy,
    fontSize: 13,
    fontWeight: 'bold',
  },
  statValuePayout: {
    color: BrandColors.green,
    fontSize: 14,
    fontWeight: 'bold',
  },
  failedText: {
    color: BrandColors.navy,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: Spacing.two,
  },
  hashRow: {
    alignItems: 'center',
    borderTopColor: '#E2E8F0',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: Spacing.two,
  },
  hashText: {
    color: BrandColors.grey,
    flex: 1,
    fontFamily: 'monospace',
    fontSize: 10,
    marginRight: Spacing.two,
  },
  copyBtn: {
    padding: 2,
  },
});

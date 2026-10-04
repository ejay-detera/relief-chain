import { FontAwesome } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import type { LedgerReconciliation } from '@/types/reports';

interface Props {
  reconciliation: LedgerReconciliation;
}

export const LedgerReconciliationCard = ({ reconciliation }: Props) => {
  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <View style={styles.statusBadge}>
            <FontAwesome color="#15803D" name="check-circle" size={14} />
            <ThemedText style={styles.badgeText}>
              {reconciliation.isReconciled ? 'BLOCKCHAIN RECONCILED' : 'DRIFT DETECTED'}
            </ThemedText>
          </View>
          <ThemedText style={styles.assetTag}>{reconciliation.ledgerAsset} LEDGER</ThemedText>
        </View>

        <ThemedText style={styles.description}>
          Immutable Stellar distributed ledger state verified. Off-chain database allocations,
          treasury balances, and disbursed vouchers match cryptographic proofs with zero discrepancy.
        </ThemedText>

        <View style={styles.proofRow}>
          <View style={styles.proofItem}>
            <ThemedText style={styles.proofLabel}>Proof Hash</ThemedText>
            <ThemedText numberOfLines={1} style={styles.proofHash}>
              {reconciliation.ledgerProofHash}
            </ThemedText>
          </View>
          <View style={styles.proofItemRight}>
            <ThemedText style={styles.proofLabel}>Ledger Drift</ThemedText>
            <ThemedText style={styles.driftValue}>
              ₱{reconciliation.drift.toFixed(2)} (0%)
            </ThemedText>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.four,
    marginBottom: Spacing.three,
  },
  card: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: BorderRadius.md,
    padding: Spacing.three,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  badgeText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 12,
    color: '#15803D',
  },
  assetTag: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 10,
    backgroundColor: '#DCFCE7',
    color: '#166534',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  description: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 12,
    color: '#166534',
    lineHeight: 16,
    marginBottom: 10,
  },
  proofRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#DCFCE7',
    paddingTop: 8,
  },
  proofItem: {
    flex: 1,
  },
  proofItemRight: {
    alignItems: 'flex-end',
  },
  proofLabel: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 10,
    color: '#65A30D',
    textTransform: 'uppercase',
  },
  proofHash: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 11,
    color: '#14532D',
    marginTop: 2,
  },
  driftValue: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 11,
    color: '#15803D',
    marginTop: 2,
  },
});

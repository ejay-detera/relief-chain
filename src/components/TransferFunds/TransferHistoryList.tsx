import { FontAwesome } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import type { OrganizationTransferRecord } from '@/types/organization-transfer';

interface TransferHistoryListProps {
  transfers: OrganizationTransferRecord[];
  currentOrgId: string | null;
  isLoading: boolean;
}

export function TransferHistoryList({
  transfers,
  currentOrgId,
  isLoading,
}: TransferHistoryListProps) {
  if (isLoading && transfers.length === 0) {
    return (
      <View style={styles.container}>
        <ThemedText style={styles.sectionTitle}>Recent Transfers</ThemedText>
        <ThemedText style={styles.emptyText}>Loading transfer history…</ThemedText>
      </View>
    );
  }

  if (transfers.length === 0) {
    return (
      <View style={styles.container}>
        <ThemedText style={styles.sectionTitle}>Recent Transfers</ThemedText>
        <View style={styles.emptyCard}>
          <FontAwesome color={BrandColors.grey} name="history" size={24} />
          <ThemedText style={styles.emptyText}>No transfers recorded yet.</ThemedText>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ThemedText style={styles.sectionTitle}>Recent Transfers</ThemedText>

      {transfers.map((item) => {
        const isSender = item.sender_organization_id === currentOrgId;
        const otherParty = isSender
          ? item.destination_organization_name || `${item.destination_wallet_address.slice(0, 6)}...`
          : 'Incoming Aid';

        return (
          <View key={item.id} style={styles.transferCard}>
            <View style={styles.cardHeader}>
              <View style={styles.directionRow}>
                <View style={[styles.iconCircle, isSender ? styles.sentCircle : styles.receivedCircle]}>
                  <FontAwesome
                    color={isSender ? '#D32F2F' : BrandColors.green}
                    name={isSender ? 'arrow-up' : 'arrow-down'}
                    size={12}
                  />
                </View>
                <View>
                  <ThemedText style={styles.partyText}>
                    {isSender ? `To: ${otherParty}` : `From: ${otherParty}`}
                  </ThemedText>
                  <ThemedText style={styles.dateText}>
                    {new Date(item.created_at).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </ThemedText>
                </View>
              </View>

              <View style={styles.amountBox}>
                <ThemedText style={[styles.amountText, isSender ? styles.amountSent : styles.amountReceived]}>
                  {isSender ? '-' : '+'}₱{item.amount_rcphp}
                </ThemedText>
                <View style={styles.statusBadge}>
                  <ThemedText style={styles.statusText}>{item.status}</ThemedText>
                </View>
              </View>
            </View>

            {item.memo ? (
              <ThemedText style={styles.memoText}>Memo: {item.memo}</ThemedText>
            ) : null}

            {item.transaction_hash ? (
              <ThemedText style={styles.hashText}>
                Tx: {item.transaction_hash.slice(0, 12)}...{item.transaction_hash.slice(-8)}
              </ThemedText>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.four,
    marginBottom: Spacing.six,
  },
  sectionTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 16,
    color: BrandColors.navy,
    marginBottom: Spacing.three,
  },
  emptyCard: {
    backgroundColor: BrandColors.lightGray,
    borderRadius: BorderRadius.lg,
    padding: Spacing.five,
    alignItems: 'center',
    gap: Spacing.two,
  },
  emptyText: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 13,
    color: BrandColors.grey,
  },
  transferCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.lg,
    padding: Spacing.three,
    marginBottom: Spacing.two,
    borderWidth: 1,
    borderColor: '#EFEFEF',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  directionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sentCircle: {
    backgroundColor: '#FFEBEE',
  },
  receivedCircle: {
    backgroundColor: '#E8F5E9',
  },
  partyText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13,
    color: BrandColors.navy,
  },
  dateText: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 11,
    color: BrandColors.grey,
  },
  amountBox: {
    alignItems: 'flex-end',
  },
  amountText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
  },
  amountSent: {
    color: '#D32F2F',
  },
  amountReceived: {
    color: '#2E7D32',
  },
  statusBadge: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
    marginTop: 2,
  },
  statusText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 10,
    color: '#0369A1',
    textTransform: 'uppercase',
  },
  memoText: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 11,
    color: BrandColors.grey,
    marginTop: Spacing.one,
  },
  hashText: {
    fontFamily: 'monospace',
    fontSize: 10,
    color: BrandColors.grey,
    marginTop: 2,
  },
});

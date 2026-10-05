import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import { useNetworkState } from '@/hooks/use-network-state';
import { type OfflineSyncQueueItem } from '@/types/offline-sync';

interface SyncStatusModalProps {
  visible: boolean;
  onClose: () => void;
  queue: OfflineSyncQueueItem[];
  pendingCount: number;
  settledCount: number;
  rejectedCount: number;
  isSyncing: boolean;
  onSyncNow: () => void;
  onClearSettled: () => void;
}

export function SyncStatusModal({
  visible,
  onClose,
  queue,
  pendingCount,
  settledCount,
  rejectedCount,
  isSyncing,
  onSyncNow,
  onClearSettled,
}: SyncStatusModalProps) {
  const { isOffline } = useNetworkState();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View>
              <ThemedText style={styles.title}>Offline Sync Queue</ThemedText>
              <ThemedText style={styles.subtitle}>
                {isOffline ? 'Offline — Syncs automatically when online' : 'Connected to ReliefChain Network'}
              </ThemedText>
            </View>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <MaterialCommunityIcons name="close" size={20} color={BrandColors.navy} />
            </Pressable>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <ThemedText style={styles.statNumber}>{pendingCount}</ThemedText>
              <ThemedText style={styles.statLabel}>Pending</ThemedText>
            </View>
            <View style={styles.statBox}>
              <ThemedText style={[styles.statNumber, styles.settledColor]}>{settledCount}</ThemedText>
              <ThemedText style={styles.statLabel}>Settled</ThemedText>
            </View>
            <View style={styles.statBox}>
              <ThemedText style={[styles.statNumber, styles.rejectedColor]}>{rejectedCount}</ThemedText>
              <ThemedText style={styles.statLabel}>Rejected</ThemedText>
            </View>
          </View>

          <ScrollView style={styles.listContainer}>
            {queue.length === 0 ? (
              <ThemedText style={styles.emptyText}>No offline transactions in queue.</ThemedText>
            ) : (
              queue.map((item) => (
                <View key={item.id} style={styles.queueItem}>
                  <View style={styles.itemMain}>
                    <ThemedText style={styles.itemTitle}>{item.envelope.beneficiaryName}</ThemedText>
                    <ThemedText style={styles.itemSub}>
                      ₱{item.envelope.amountPhp} • {item.envelope.programName || 'Relief Aid'}
                    </ThemedText>
                    {item.lastError && (
                      <ThemedText style={styles.itemError}>Notice: {item.lastError}</ThemedText>
                    )}
                  </View>
                  <View style={[styles.statusBadge, styles[`status_${item.status}`]]}>
                    <ThemedText style={styles.statusBadgeText}>
                      {item.status === 'pending_sync' ? 'Pending' : item.status === 'settled' ? 'Settled' : item.status === 'rejected' ? 'Overspent' : 'Syncing'}
                    </ThemedText>
                  </View>
                </View>
              ))
            )}
          </ScrollView>

          <View style={styles.actions}>
            <Pressable
              disabled={isOffline || isSyncing || pendingCount === 0}
              onPress={onSyncNow}
              style={[styles.syncButton, (isOffline || isSyncing || pendingCount === 0) && styles.disabledButton]}
            >
              {isSyncing ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <ThemedText style={styles.syncButtonText}>
                  {isOffline ? 'Offline (Cannot Sync)' : 'Sync Now'}
                </ThemedText>
              )}
            </Pressable>
            {settledCount > 0 && (
              <Pressable onPress={onClearSettled} style={styles.clearButton}>
                <ThemedText style={styles.clearButtonText}>Clear Settled</ThemedText>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl, padding: Spacing.four, maxHeight: '80%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.three },
  title: { fontSize: 18, fontWeight: '700', color: BrandColors.navy },
  subtitle: { fontSize: 12, color: BrandColors.grey, marginTop: 2 },
  closeBtn: { padding: 4 },
  statsRow: { flexDirection: 'row', columnGap: Spacing.three, marginBottom: Spacing.three },
  statBox: { flex: 1, backgroundColor: '#F8FAFC', borderRadius: BorderRadius.md, padding: Spacing.two, alignItems: 'center' },
  statNumber: { fontSize: 18, fontWeight: '700', color: '#D97706' },
  settledColor: { color: BrandColors.green },
  rejectedColor: { color: '#EF4444' },
  statLabel: { fontSize: 11, color: BrandColors.grey },
  listContainer: { maxHeight: 220, marginBottom: Spacing.three },
  emptyText: { textAlign: 'center', color: BrandColors.grey, marginVertical: Spacing.four, fontSize: 13 },
  queueItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: Spacing.two, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  itemMain: { flex: 1, marginRight: Spacing.two },
  itemTitle: { fontSize: 14, fontWeight: '600', color: BrandColors.navy },
  itemSub: { fontSize: 12, color: BrandColors.grey },
  itemError: { fontSize: 11, color: '#DC2626', marginTop: 2 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: BorderRadius.full },
  status_pending_sync: { backgroundColor: '#FEF3C7' },
  status_syncing: { backgroundColor: '#DBEAFE' },
  status_settled: { backgroundColor: '#DCFCE7' },
  status_rejected: { backgroundColor: '#FEE2E2' },
  statusBadgeText: { fontSize: 10, fontWeight: '700', color: '#1F2937' },
  actions: { rowGap: Spacing.two },
  syncButton: { backgroundColor: BrandColors.green, paddingVertical: Spacing.three, borderRadius: BorderRadius.md, alignItems: 'center' },
  disabledButton: { backgroundColor: '#E2E8F0', opacity: 0.7 },
  syncButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  clearButton: { paddingVertical: Spacing.two, alignItems: 'center' },
  clearButtonText: { color: BrandColors.grey, fontSize: 12 },
});

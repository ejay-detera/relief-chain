import { useCallback, useEffect, useRef, useState } from 'react';

import { useNetworkState } from '@/hooks/use-network-state';
import { preloadMerchantBeneficiariesCache } from '@/services/offline/manifest-presync';
import {
  clearSettledItems,
  getOfflineQueue,
  getQueueMetrics,
} from '@/services/offline/offline-sync-queue';
import {
  syncPendingOfflineRedemptions,
  type SyncExecutionResult,
} from '@/services/offline/sync-engine';
import { type OfflineSyncQueueItem } from '@/types/offline-sync';

export interface UseOfflineSyncResult {
  queue: OfflineSyncQueueItem[];
  pendingCount: number;
  settledCount: number;
  rejectedCount: number;
  cachedBeneficiariesCount: number;
  isSyncing: boolean;
  lastSyncResult: SyncExecutionResult | null;
  refreshQueue: () => Promise<void>;
  syncNow: () => Promise<SyncExecutionResult>;
  clearSettled: () => Promise<void>;
  preloadManifest: (force?: boolean) => Promise<void>;
}

export function useOfflineSync(merchantEntityId: string | null): UseOfflineSyncResult {
  const { isConnected, isOffline } = useNetworkState();
  const [queue, setQueue] = useState<OfflineSyncQueueItem[]>([]);
  const [metrics, setMetrics] = useState({ pendingCount: 0, settledCount: 0, rejectedCount: 0 });
  const [cachedBeneficiariesCount, setCachedBeneficiariesCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<SyncExecutionResult | null>(null);

  const prevIsOfflineRef = useRef(isOffline);
  const isSyncingRef = useRef(false);
  const lastSyncAttemptRef = useRef<number>(0);
  const prevPendingCountRef = useRef(metrics.pendingCount);

  const refreshQueue = useCallback(async () => {
    if (!merchantEntityId) {
      setQueue([]);
      setMetrics({ pendingCount: 0, settledCount: 0, rejectedCount: 0 });
      return;
    }
    const items = await getOfflineQueue(merchantEntityId);
    const m = await getQueueMetrics(merchantEntityId);
    setQueue(items);
    setMetrics({
      pendingCount: m.pendingCount,
      settledCount: m.settledCount,
      rejectedCount: m.rejectedCount,
    });
  }, [merchantEntityId]);

  const preloadManifest = useCallback(async (force = false) => {
    if (!merchantEntityId || isOffline || !isConnected) return;
    try {
      const res = await preloadMerchantBeneficiariesCache(merchantEntityId, { force });
      if (res.ok && res.count > 0) {
        setCachedBeneficiariesCount(res.count);
      }
    } catch {
      // Background pre-fetch should never break user workflow
    }
  }, [merchantEntityId, isOffline, isConnected]);

  const syncNow = useCallback(async (): Promise<SyncExecutionResult> => {
    if (!merchantEntityId) {
      return { ok: false, attemptedCount: 0, settledCount: 0, rejectedCount: 0, results: [], error: 'No merchant ID' };
    }

    if (isSyncingRef.current) {
      return { ok: false, attemptedCount: 0, settledCount: 0, rejectedCount: 0, results: [], error: 'Sync already running' };
    }

    const now = Date.now();
    if (now - lastSyncAttemptRef.current < 4000) {
      return { ok: false, attemptedCount: 0, settledCount: 0, rejectedCount: 0, results: [], error: 'Sync throttled' };
    }

    lastSyncAttemptRef.current = now;
    isSyncingRef.current = true;
    setIsSyncing(true);
    try {
      const res = await syncPendingOfflineRedemptions(merchantEntityId);
      setLastSyncResult(res);
      await refreshQueue();
      return res;
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  }, [merchantEntityId, refreshQueue]);

  const clearSettled = useCallback(async () => {
    if (!merchantEntityId) return;
    await clearSettledItems(merchantEntityId);
    await refreshQueue();
  }, [merchantEntityId, refreshQueue]);

  // Initial load: refresh queue & trigger automated manifest pre-caching
  useEffect(() => {
    void refreshQueue();
    if (!isOffline && isConnected && merchantEntityId) {
      void preloadManifest();
    }
  }, [refreshQueue, preloadManifest, isOffline, isConnected, merchantEntityId]);

  // Auto-sync on initial queue load or when pending count increases while online
  useEffect(() => {
    if (metrics.pendingCount > 0 && !isOffline && isConnected) {
      const isNewItem = metrics.pendingCount > prevPendingCountRef.current;
      const isInitialMount = prevPendingCountRef.current === 0;
      if (isNewItem || isInitialMount) {
        void syncNow();
      }
    }
    prevPendingCountRef.current = metrics.pendingCount;
  }, [metrics.pendingCount, isOffline, isConnected, syncNow]);

  // Auto-sync and manifest refresh trigger when network is restored: isOffline changed from true to false
  useEffect(() => {
    if (prevIsOfflineRef.current && !isOffline && isConnected) {
      if (metrics.pendingCount > 0) {
        void syncNow();
      }
      if (merchantEntityId) {
        void preloadManifest(true);
      }
    }
    prevIsOfflineRef.current = isOffline;
  }, [isOffline, isConnected, metrics.pendingCount, merchantEntityId, syncNow, preloadManifest]);

  return {
    queue,
    pendingCount: metrics.pendingCount,
    settledCount: metrics.settledCount,
    rejectedCount: metrics.rejectedCount,
    cachedBeneficiariesCount,
    isSyncing,
    lastSyncResult,
    refreshQueue,
    syncNow,
    clearSettled,
    preloadManifest,
  };
}


import type {
  OfflineRedemptionEnvelope,
  OfflineRejectionReason,
  OfflineSyncQueueItem,
  OfflineSyncStatus,
} from '../../types/offline-sync.ts';

const QUEUE_PREFIX = 'rc_merchant_pending_redemptions_v1_';
const MAX_QUEUE_SIZE = 250;

const secureStoreOptions = {
  keychainAccessible: 1, // WHEN_UNLOCKED_THIS_DEVICE_ONLY
};

interface StorageAdapter {
  getItemAsync(key: string, options?: unknown): Promise<string | null>;
  setItemAsync(key: string, value: string, options?: unknown): Promise<void>;
  deleteItemAsync(key: string, options?: unknown): Promise<void>;
}

let secureStoreModule: StorageAdapter | null = null;
let secureStoreChecked = false;

async function getStorage(): Promise<StorageAdapter | null> {
  if (secureStoreChecked) return secureStoreModule;
  secureStoreChecked = true;
  try {
    const mod = await import('expo-secure-store');
    secureStoreModule = mod;
    return mod;
  } catch {
    secureStoreModule = null;
    return null;
  }
}

// In-memory fallback for environments without SecureStore (Node test runner, mock environments)
const memoryStore = new Map<string, string>();

function getStorageKey(merchantId: string): string {
  return `${QUEUE_PREFIX}${merchantId || 'default'}`;
}

async function readRawQueue(storageKey: string): Promise<OfflineSyncQueueItem[]> {
  try {
    let raw: string | null = null;
    const storage = await getStorage();
    if (storage) {
      try {
        raw = await storage.getItemAsync(storageKey, secureStoreOptions);
      } catch {
        raw = memoryStore.get(storageKey) ?? null;
      }
    }

    if (!raw) {
      raw = memoryStore.get(storageKey) ?? null;
    }

    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    // Normalize existing legacy PendingOfflineRedemption items if present
    return parsed.map((item: any) => {
      if (item.envelope) {
        return item as OfflineSyncQueueItem;
      }
      const envelope: OfflineRedemptionEnvelope = {
        version: '1.0',
        nonce: item.id || `nonce-${Date.now()}`,
        programId: item.programId || '',
        programName: item.programName,
        voucherType: item.voucherType,
        beneficiaryId: item.beneficiaryIdentityId || item.beneficiaryWallet || '',
        beneficiaryWallet: item.beneficiaryWallet || '',
        beneficiaryName: item.beneficiaryName || 'Beneficiary',
        merchantId: item.merchantId || '',
        amountStroops: item.amountStroops || '0',
        amountPhp: item.amountPhp || '0',
        clientTimestamp: item.createdAt || new Date().toISOString(),
        transportMode: 'qr',
      };

      return {
        id: item.id || `item-${Date.now()}`,
        envelope,
        status: (item.status === 'settled' ? 'settled' : 'pending_sync') as OfflineSyncStatus,
        retryCount: 0,
        transactionHash: item.transactionHash,
        createdAt: item.createdAt || new Date().toISOString(),
        updatedAt: item.createdAt || new Date().toISOString(),
      };
    });
  } catch (err) {
    console.warn('[offline-sync-queue] Failed to read queue:', err);
    return [];
  }
}

async function writeRawQueue(storageKey: string, queue: OfflineSyncQueueItem[]): Promise<void> {
  const serialized = JSON.stringify(queue.slice(0, MAX_QUEUE_SIZE));
  memoryStore.set(storageKey, serialized);
  const storage = await getStorage();
  if (storage) {
    try {
      await storage.setItemAsync(storageKey, serialized, secureStoreOptions);
    } catch (err) {
      console.warn('[offline-sync-queue] Failed to persist to SecureStore, using memory fallback:', err);
    }
  }
}

/**
 * Enqueues a newly performed offline redemption into the persistent queue.
 */
export async function enqueueOfflineRedemption(
  envelope: OfflineRedemptionEnvelope
): Promise<OfflineSyncQueueItem> {
  const storageKey = getStorageKey(envelope.merchantId);
  const current = await readRawQueue(storageKey);

  // Check for duplicate nonce
  const existingIndex = current.findIndex((item) => item.envelope.nonce === envelope.nonce);
  if (existingIndex >= 0) {
    return current[existingIndex];
  }

  const newItem: OfflineSyncQueueItem = {
    id: `rc-off-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    envelope,
    status: 'pending_sync',
    retryCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const updated = [newItem, ...current];
  await writeRawQueue(storageKey, updated);
  return newItem;
}

/**
 * Retrieves all items in the queue for a merchant.
 */
export async function getOfflineQueue(merchantId: string): Promise<OfflineSyncQueueItem[]> {
  const storageKey = getStorageKey(merchantId);
  return readRawQueue(storageKey);
}

/**
 * Retrieves only items awaiting synchronization ('pending_sync' or 'syncing').
 */
export async function getPendingOfflineRedemptions(
  merchantId: string
): Promise<OfflineSyncQueueItem[]> {
  const all = await getOfflineQueue(merchantId);
  return all.filter((item) => item.status === 'pending_sync' || item.status === 'syncing');
}

/**
 * Updates the status of an item by its envelope nonce.
 */
export async function updateQueueItemStatus(params: {
  merchantId: string;
  nonce: string;
  status: OfflineSyncStatus;
  transactionHash?: string;
  errorReason?: OfflineRejectionReason | string;
}): Promise<void> {
  const { merchantId, nonce, status, transactionHash, errorReason } = params;
  const storageKey = getStorageKey(merchantId);
  const current = await readRawQueue(storageKey);

  let modified = false;
  const updated = current.map((item) => {
    if (item.envelope.nonce === nonce) {
      modified = true;
      return {
        ...item,
        status,
        transactionHash: transactionHash ?? item.transactionHash,
        lastError: errorReason ?? item.lastError,
        retryCount: status === 'pending_sync' ? item.retryCount + 1 : item.retryCount,
        updatedAt: new Date().toISOString(),
      };
    }
    return item;
  });

  if (modified) {
    await writeRawQueue(storageKey, updated);
  }
}

/**
 * Removes settled items older than 48 hours or when cleared by user.
 */
export async function clearSettledItems(merchantId: string): Promise<void> {
  const storageKey = getStorageKey(merchantId);
  const current = await readRawQueue(storageKey);
  const filtered = current.filter((item) => item.status !== 'settled');
  await writeRawQueue(storageKey, filtered);
}

/**
 * Clears the entire queue (useful for test resets).
 */
export async function clearEntireQueue(merchantId: string): Promise<void> {
  const storageKey = getStorageKey(merchantId);
  memoryStore.delete(storageKey);
  const storage = await getStorage();
  if (storage) {
    try {
      await storage.deleteItemAsync(storageKey, secureStoreOptions);
    } catch {
      // Ignore error
    }
  }
}

/**
 * Summary metrics for the offline queue.
 */
export async function getQueueMetrics(merchantId: string): Promise<{
  totalCount: number;
  pendingCount: number;
  settledCount: number;
  rejectedCount: number;
}> {
  const items = await getOfflineQueue(merchantId);
  return {
    totalCount: items.length,
    pendingCount: items.filter((i) => i.status === 'pending_sync').length,
    settledCount: items.filter((i) => i.status === 'settled').length,
    rejectedCount: items.filter((i) => i.status === 'rejected').length,
  };
}

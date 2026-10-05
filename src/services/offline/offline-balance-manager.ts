import type {
  OfflineBeneficiaryLookupRecord,
  OfflineVoucherBalanceItem,
} from '../../types/offline-sync.ts';
import { parseStroopAmount, type StroopAmount } from '../../types/blockchain.ts';

const BEN_CACHE_PREFIX = 'rc_merchant_ben_cache_v1_';

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

// In-memory fallback
const memoryCache = new Map<string, string>();

function getCacheKey(merchantId: string, beneficiaryIdentifier: string): string {
  const cleanId = (merchantId || 'default').replace(/[^a-zA-Z0-9_-]/g, '_');
  const cleanBen = (beneficiaryIdentifier || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${BEN_CACHE_PREFIX}${cleanId}_${cleanBen}`;
}

function getDirectCacheKey(beneficiaryIdentifier: string): string {
  const cleanBen = (beneficiaryIdentifier || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${BEN_CACHE_PREFIX}${cleanBen}`;
}

/**
 * Loads the cached beneficiary lookup for a specific merchant.
 * Checks both merchant-scoped key and direct beneficiary address key for complete interoperability.
 */
export async function getCachedBeneficiaryRecord(
  merchantId: string,
  beneficiaryIdentifier: string
): Promise<OfflineBeneficiaryLookupRecord | null> {
  const scopedKey = getCacheKey(merchantId, beneficiaryIdentifier);
  const directKey = getDirectCacheKey(beneficiaryIdentifier);

  try {
    const storage = await getStorage();
    let raw: string | null = null;

    if (storage) {
      try {
        raw = await storage.getItemAsync(scopedKey, secureStoreOptions);
        if (!raw) {
          raw = await storage.getItemAsync(directKey, secureStoreOptions);
        }
      } catch {
        raw = memoryCache.get(scopedKey) ?? memoryCache.get(directKey) ?? null;
      }
    }

    if (!raw) {
      raw = memoryCache.get(scopedKey) ?? memoryCache.get(directKey) ?? null;
    }

    if (!raw) return null;
    const parsed = JSON.parse(raw) as OfflineBeneficiaryLookupRecord;
    return parsed;
  } catch (err) {
    console.warn('[offline-balance-manager] Failed to read cached beneficiary:', err);
    return null;
  }
}

/**
 * Saves or updates a beneficiary's lookup cache.
 * Writes to both merchant-scoped key and direct key to guarantee accessibility.
 */
export async function setCachedBeneficiaryRecord(
  merchantId: string,
  beneficiaryIdentifier: string,
  record: OfflineBeneficiaryLookupRecord
): Promise<void> {
  const scopedKey = getCacheKey(merchantId, beneficiaryIdentifier);
  const directKey = getDirectCacheKey(beneficiaryIdentifier);
  const serialized = JSON.stringify(record, (_, val) =>
    typeof val === 'bigint' ? val.toString() : val
  );

  memoryCache.set(scopedKey, serialized);
  memoryCache.set(directKey, serialized);

  const storage = await getStorage();
  if (storage) {
    try {
      await storage.setItemAsync(scopedKey, serialized, secureStoreOptions);
      await storage.setItemAsync(directKey, serialized, secureStoreOptions);
    } catch (err) {
      console.warn('[offline-balance-manager] Failed to write cached beneficiary to SecureStore:', err);
    }
  }
}

/**
 * Pre-populates the local balance cache with an entire roster of beneficiaries
 * from an automated manifest pre-sync.
 */
export async function preloadBeneficiaryManifest(
  merchantId: string,
  records: OfflineBeneficiaryLookupRecord[]
): Promise<number> {
  let savedCount = 0;
  for (const record of records) {
    if (!record.beneficiaryWallet && !record.beneficiaryIdentityId) continue;
    const id = record.beneficiaryWallet || record.beneficiaryIdentityId;
    await setCachedBeneficiaryRecord(merchantId, id, record);
    if (record.beneficiaryIdentityId && record.beneficiaryIdentityId !== id) {
      await setCachedBeneficiaryRecord(merchantId, record.beneficiaryIdentityId, record);
    }
    savedCount++;
  }
  return savedCount;
}

/**
 * Clears in-memory cache entries (primarily for testing and resets).
 */
export function clearInMemoryBalanceCache(): void {
  memoryCache.clear();
}


/**
 * Deducts an amount from the local cached voucher balance upon offline redemption.
 * Validates against the full cached balance.
 */
export async function deductOfflineBalance(params: {
  merchantId: string;
  beneficiaryIdentifier: string;
  programId: string;
  amountStroops: StroopAmount;
  amountPhp: string;
}): Promise<{ ok: true; remainingBalanceStroops: StroopAmount; remainingBalancePhp: string } | { ok: false; error: string }> {
  const { merchantId, beneficiaryIdentifier, programId, amountStroops, amountPhp } = params;
  const record = await getCachedBeneficiaryRecord(merchantId, beneficiaryIdentifier);

  if (!record || !record.balances || record.balances.length === 0) {
    return {
      ok: false,
      error: 'Beneficiary balance is not cached on this device. Online sync required before offline redemption.',
    };
  }

  let voucherIndex = record.balances.findIndex((b) => b.programId === programId);
  if (voucherIndex < 0) {
    if (record.balances.length === 1) {
      voucherIndex = 0;
    } else {
      return { ok: false, error: 'Voucher for this relief program is not cached.' };
    }
  }

  const voucher = record.balances[voucherIndex];
  const currentStroopsBig = BigInt(String(voucher.availableStroops || '0'));
  const amountStroopsBig = BigInt(String(amountStroops || '0'));

  if (amountStroopsBig > currentStroopsBig) {
    return {
      ok: false,
      error: `Insufficient offline balance. Only ₱${voucher.availablePhp} available in cached balance.`,
    };
  }

  const newStroopsBig = currentStroopsBig - amountStroopsBig;
  const newStroopsStr = newStroopsBig.toString() as StroopAmount;
  const currentPhpNum = Number(voucher.availablePhp.replace(/[^0-9.]/g, '')) || 0;
  const deductPhpNum = Number(amountPhp) || (Number(amountStroopsBig) / 10_000_000);
  const newPhpNum = Math.max(0, currentPhpNum - deductPhpNum);
  const newPhp = newPhpNum.toFixed(2);

  const updatedVoucher: OfflineVoucherBalanceItem = {
    ...voucher,
    availableStroops: newStroopsStr,
    availablePhp: newPhp,
  };

  const updatedBalances = [...record.balances];
  updatedBalances[voucherIndex] = updatedVoucher;

  const updatedRecord: OfflineBeneficiaryLookupRecord = {
    ...record,
    balances: updatedBalances,
    isOffline: true,
    syncedAt: new Date().toISOString(),
  };

  await setCachedBeneficiaryRecord(merchantId, beneficiaryIdentifier, updatedRecord);

  return {
    ok: true,
    remainingBalanceStroops: newStroopsStr,
    remainingBalancePhp: newPhp,
  };
}

/**
 * Restores deducted balance if an offline redemption is cancelled or rejected.
 */
export async function restoreOfflineBalance(params: {
  merchantId: string;
  beneficiaryIdentifier: string;
  programId: string;
  amountStroops: StroopAmount;
  amountPhp: string;
}): Promise<void> {
  const { merchantId, beneficiaryIdentifier, programId, amountStroops, amountPhp } = params;
  const record = await getCachedBeneficiaryRecord(merchantId, beneficiaryIdentifier);
  if (!record || !record.balances) return;

  const voucherIndex = record.balances.findIndex((b) => b.programId === programId);
  if (voucherIndex < 0) return;

  const voucher = record.balances[voucherIndex];
  const currentStroopsBig = BigInt(String(voucher.availableStroops || '0'));
  const amountStroopsBig = BigInt(String(amountStroops || '0'));

  const newStroopsBig = currentStroopsBig + amountStroopsBig;
  const newStroopsStr = newStroopsBig.toString() as StroopAmount;
  const currentPhpNum = Number(voucher.availablePhp.replace(/[^0-9.]/g, '')) || 0;
  const addPhpNum = Number(amountPhp) || (Number(amountStroopsBig) / 10_000_000);
  const newPhp = (currentPhpNum + addPhpNum).toFixed(2);

  const updatedBalances = [...record.balances];
  updatedBalances[voucherIndex] = {
    ...voucher,
    availableStroops: newStroopsStr,
    availablePhp: newPhp,
  };

  await setCachedBeneficiaryRecord(merchantId, beneficiaryIdentifier, {
    ...record,
    balances: updatedBalances,
  });
}

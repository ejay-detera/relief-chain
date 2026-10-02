import * as SecureStore from 'expo-secure-store';

import type { ProjectionMetadata, PilotBalanceSummary } from '@/types/projection';

/**
 * On-device last-known-good cache for the beneficiary's reconciled balance
 * (US4: "If the balance cannot be fetched... the last-synced balance is
 * shown with a clear 'last updated' timestamp rather than a blank or
 * misleading value"). Previously a failed read set `status: 'unavailable'`
 * with no numeric value and nothing cached — there was no persisted "last
 * good balance" anywhere client-side to fall back to.
 *
 * Uses the same `expo-secure-store` + namespaced-key pattern as
 * `merchant-invoice-storage.ts`. Balance figures are non-sensitive
 * (testnet, no monetary value), but SecureStore is already the project's
 * established on-device persistence mechanism and avoids adding a new
 * dependency (e.g. AsyncStorage) for a single small JSON blob.
 */

const SECURE_STORE_PREFIX = 'rc_beneficiary_balance_cache_v1_';

const secureStoreOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

const storageKeyForUser = (userId: string): string =>
  `${SECURE_STORE_PREFIX}${userId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

export type CachedBeneficiaryBalance = Readonly<{
  summary: PilotBalanceSummary;
  metadata: ProjectionMetadata;
  /** When this cache entry was written on this device, independent of `metadata.reconciledAt`. */
  cachedAt: string;
}>;

/** Reads the last successfully reconciled balance cached for this user, or null if none exists. */
export async function getCachedBalance(userId: string): Promise<CachedBeneficiaryBalance | null> {
  if (!userId) return null;
  try {
    const raw = await SecureStore.getItemAsync(storageKeyForUser(userId), secureStoreOptions);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedBeneficiaryBalance;
    if (!parsed || typeof parsed !== 'object' || !parsed.summary || !parsed.metadata) return null;
    return parsed;
  } catch (error) {
    console.warn('[beneficiary-balance-cache] Failed to read cached balance:', error);
    return null;
  }
}

/** Persists the latest successfully reconciled balance for offline fallback. Never throws. */
export async function setCachedBalance(
  userId: string,
  summary: PilotBalanceSummary,
  metadata: ProjectionMetadata,
): Promise<void> {
  if (!userId) return;
  try {
    const entry: CachedBeneficiaryBalance = { summary, metadata, cachedAt: new Date().toISOString() };
    await SecureStore.setItemAsync(storageKeyForUser(userId), JSON.stringify(entry), secureStoreOptions);
  } catch (error) {
    console.warn('[beneficiary-balance-cache] Failed to cache balance:', error);
  }
}

import * as SecureStore from 'expo-secure-store';

import type { LedgerEvidence } from '@/types/blockchain';
import type { InvoiceHistoryStatus, MerchantInvoiceRecord } from '@/types/merchant-payment-history';

const SECURE_STORE_PREFIX = 'rc_merchant_invoices_v1_';
const MAX_STORED_INVOICES = 300;

const secureStoreOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

const storageKeyForMerchant = (merchantId: string): string =>
  `${SECURE_STORE_PREFIX}${merchantId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

/**
 * Loads all stored invoices for the specified merchant.
 * Returns an empty array if none exist or on read error.
 */
export async function getStoredInvoices(merchantId: string): Promise<readonly MerchantInvoiceRecord[]> {
  if (!merchantId) return [];
  try {
    const raw = await SecureStore.getItemAsync(storageKeyForMerchant(merchantId), secureStoreOptions);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return Object.freeze(parsed as MerchantInvoiceRecord[]);
  } catch (error) {
    console.warn('[merchant-invoice-storage] Failed to load invoices:', error);
    return [];
  }
}

/**
 * Saves or updates an invoice record for the specified merchant.
 * Enforces newest-first order and caps history at MAX_STORED_INVOICES.
 */
export async function saveInvoice(merchantId: string, record: MerchantInvoiceRecord): Promise<void> {
  if (!merchantId || !record?.id) return;
  try {
    const current = await getStoredInvoices(merchantId);
    // Remove if already exists with same nonce/id to de-duplicate
    const filtered = current.filter((item) => item.id !== record.id && item.invoice.nonce !== record.invoice.nonce);
    const updated = [record, ...filtered].slice(0, MAX_STORED_INVOICES);
    await SecureStore.setItemAsync(
      storageKeyForMerchant(merchantId),
      JSON.stringify(updated),
      secureStoreOptions,
    );
  } catch (error) {
    console.warn('[merchant-invoice-storage] Failed to save invoice:', error);
  }
}

/**
 * Retrieves a single stored invoice by its nonce or id.
 */
export async function getStoredInvoiceByNonce(
  merchantId: string,
  nonceOrId: string,
): Promise<MerchantInvoiceRecord | null> {
  if (!merchantId || !nonceOrId) return null;
  const invoices = await getStoredInvoices(merchantId);
  return invoices.find((item) => item.id === nonceOrId || item.invoice.nonce === nonceOrId) ?? null;
}

/**
 * Updates the status (and optional settlement evidence) of a stored invoice.
 */
export async function updateInvoiceStatus(
  merchantId: string,
  nonceOrId: string,
  status: InvoiceHistoryStatus,
  evidence?: LedgerEvidence | null,
): Promise<void> {
  if (!merchantId || !nonceOrId) return;
  try {
    const current = await getStoredInvoices(merchantId);
    let modified = false;
    const updated = current.map((item) => {
      if (item.id === nonceOrId || item.invoice.nonce === nonceOrId) {
        modified = true;
        return {
          ...item,
          status,
          ...(evidence !== undefined ? { settlementEvidence: evidence } : {}),
          updatedAt: new Date().toISOString(),
        };
      }
      return item;
    });

    if (modified) {
      await SecureStore.setItemAsync(
        storageKeyForMerchant(merchantId),
        JSON.stringify(updated),
        secureStoreOptions,
      );
    }
  } catch (error) {
    console.warn('[merchant-invoice-storage] Failed to update invoice status:', error);
  }
}

/**
 * Clears stored invoices for a merchant (useful for wallet reset or testing).
 */
export async function clearStoredInvoices(merchantId: string): Promise<void> {
  if (!merchantId) return;
  try {
    await SecureStore.deleteItemAsync(storageKeyForMerchant(merchantId), secureStoreOptions);
  } catch (error) {
    console.warn('[merchant-invoice-storage] Failed to clear invoices:', error);
  }
}

import assert from 'node:assert/strict';
import { test } from 'node:test';

// In-memory mock for SecureStore
const store = new Map();
const mockSecureStore = {
  getItemAsync: async (key) => store.get(key) ?? null,
  setItemAsync: async (key, val) => store.set(key, val),
  deleteItemAsync: async (key) => store.delete(key),
};

// Replicate storage logic with dependency injection for pure unit testing
const SECURE_STORE_PREFIX = 'rc_merchant_invoices_v1_';
const MAX_STORED_INVOICES = 300;

const storageKeyForMerchant = (merchantId) =>
  `${SECURE_STORE_PREFIX}${merchantId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

async function getStoredInvoices(merchantId, secureStore = mockSecureStore) {
  if (!merchantId) return [];
  const raw = await secureStore.getItemAsync(storageKeyForMerchant(merchantId));
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

async function saveInvoice(merchantId, record, secureStore = mockSecureStore) {
  if (!merchantId || !record?.id) return;
  const current = await getStoredInvoices(merchantId, secureStore);
  const filtered = current.filter(
    (item) => item.id !== record.id && item.invoice.nonce !== record.invoice.nonce,
  );
  const updated = [record, ...filtered].slice(0, MAX_STORED_INVOICES);
  await secureStore.setItemAsync(storageKeyForMerchant(merchantId), JSON.stringify(updated));
}

async function updateInvoiceStatus(merchantId, nonceOrId, status, evidence, secureStore = mockSecureStore) {
  if (!merchantId || !nonceOrId) return;
  const current = await getStoredInvoices(merchantId, secureStore);
  let modified = false;
  const updated = current.map((item) => {
    if (item.id === nonceOrId || item.invoice.nonce === nonceOrId) {
      modified = true;
      return {
        ...item,
        status,
        ...(evidence !== undefined ? { settlementEvidence: evidence } : {}),
        updatedAt: '2026-09-29T16:00:00.000Z',
      };
    }
    return item;
  });
  if (modified) {
    await secureStore.setItemAsync(storageKeyForMerchant(merchantId), JSON.stringify(updated));
  }
}

test('merchant-invoice-storage: saveInvoice stores and prepends newest record', async () => {
  store.clear();
  const merchantId = 'merchant-test-1';

  const invoice1 = {
    id: 'nonce-1',
    invoice: { nonce: 'nonce-1', amountStroops: '100000000' },
    transport: { mode: 'inline', qr: 'reliefchain:invoice:v1:test1' },
    createdAt: '2026-09-29T10:00:00.000Z',
    status: 'active',
  };

  const invoice2 = {
    id: 'nonce-2',
    invoice: { nonce: 'nonce-2', amountStroops: '250000000' },
    transport: { mode: 'inline', qr: 'reliefchain:invoice:v1:test2' },
    createdAt: '2026-09-29T10:05:00.000Z',
    status: 'active',
  };

  await saveInvoice(merchantId, invoice1);
  let list = await getStoredInvoices(merchantId);
  assert.equal(list.length, 1);
  assert.equal(list[0].id, 'nonce-1');

  await saveInvoice(merchantId, invoice2);
  list = await getStoredInvoices(merchantId);
  assert.equal(list.length, 2);
  assert.equal(list[0].id, 'nonce-2');
  assert.equal(list[1].id, 'nonce-1');
});

test('merchant-invoice-storage: saveInvoice de-duplicates identical nonce', async () => {
  store.clear();
  const merchantId = 'merchant-test-1';

  const invoice = {
    id: 'nonce-dup',
    invoice: { nonce: 'nonce-dup', amountStroops: '100000000' },
    transport: { mode: 'inline', qr: 'reliefchain:invoice:v1:dup' },
    createdAt: '2026-09-29T10:00:00.000Z',
    status: 'active',
  };

  await saveInvoice(merchantId, invoice);
  await saveInvoice(merchantId, invoice);
  const list = await getStoredInvoices(merchantId);
  assert.equal(list.length, 1);
});

test('merchant-invoice-storage: updateInvoiceStatus updates status and records evidence', async () => {
  store.clear();
  const merchantId = 'merchant-test-1';

  const invoice = {
    id: 'nonce-settle',
    invoice: { nonce: 'nonce-settle', amountStroops: '500000000' },
    transport: { mode: 'inline', qr: 'reliefchain:invoice:v1:settle' },
    createdAt: '2026-09-29T10:00:00.000Z',
    status: 'active',
  };

  await saveInvoice(merchantId, invoice);

  const evidence = {
    network: 'testnet',
    transactionHash: 'abc1234567890',
    ledgerSequence: 12345,
    confirmedAt: '2026-09-29T10:02:00.000Z',
    correlationId: 'nonce-settle',
  };

  await updateInvoiceStatus(merchantId, 'nonce-settle', 'settled', evidence);
  const list = await getStoredInvoices(merchantId);
  assert.equal(list[0].status, 'settled');
  assert.equal(list[0].settlementEvidence.transactionHash, 'abc1234567890');
});

test('merchant-invoice-storage: pagination & sorting logic correctly segments batches of 10', () => {
  const records = Array.from({ length: 25 }, (_, i) => ({
    id: `nonce-${i + 1}`,
    invoice: { nonce: `nonce-${i + 1}`, amountStroops: '100000000' },
    createdAt: new Date(Date.now() - i * 60000).toISOString(),
    status: i % 2 === 0 ? 'settled' : 'active',
  }));

  // Initial page of 10
  const pageSize = 10;
  let visibleCount = 10;
  let displayed = records.slice(0, visibleCount);
  assert.equal(displayed.length, 10);
  assert.equal(displayed[0].id, 'nonce-1');

  // Load more -> 20
  visibleCount += pageSize;
  displayed = records.slice(0, visibleCount);
  assert.equal(displayed.length, 20);

  // Load more -> all 25
  visibleCount += pageSize;
  displayed = records.slice(0, visibleCount);
  assert.equal(displayed.length, 25);

  // Oldest first sort
  const oldestFirst = [...records].sort(
    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
  );
  assert.equal(oldestFirst[0].id, 'nonce-25');
  assert.equal(oldestFirst[24].id, 'nonce-1');
});

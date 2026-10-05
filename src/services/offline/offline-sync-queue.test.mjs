import test from 'node:test';
import assert from 'node:assert/strict';

import {
  enqueueOfflineRedemption,
  getOfflineQueue,
  getPendingOfflineRedemptions,
  updateQueueItemStatus,
  clearSettledItems,
  clearEntireQueue,
  getQueueMetrics,
} from './offline-sync-queue.ts';

import {
  deductOfflineBalance,
  restoreOfflineBalance,
  setCachedBeneficiaryRecord,
  getCachedBeneficiaryRecord,
} from './offline-balance-manager.ts';

import {
  compressEnvelopeForQr,
  decompressEnvelopeFromQr,
} from './qr-transport.ts';

test('Offline Sync: QR transport envelope compression and decompression roundtrip', () => {
  const envelope = {
    version: '1.0',
    nonce: 'nonce-uuid-12345',
    programId: 'program-uuid-67890',
    programName: 'Disaster Food Relief',
    voucherType: 'Food Aid',
    beneficiaryId: 'ben-id-111',
    beneficiaryWallet: 'GBENEFICIARYWALLET1234567890ABCDEF',
    beneficiaryName: 'Juan Dela Cruz',
    merchantId: 'merch-id-222',
    merchantName: 'Aling Nena Store',
    amountStroops: '5000000000',
    amountPhp: '500.00',
    clientTimestamp: '2026-10-05T08:00:00.000Z',
    transportMode: 'qr',
  };

  const qrText = compressEnvelopeForQr(envelope);
  assert.ok(qrText.startsWith('RC-OFF-V1:'), 'QR string must begin with RC-OFF-V1: prefix');

  const decompressed = decompressEnvelopeFromQr(qrText);
  assert.ok(decompressed, 'Decompressed envelope must not be null');
  assert.equal(decompressed.nonce, envelope.nonce);
  assert.equal(decompressed.programId, envelope.programId);
  assert.equal(decompressed.beneficiaryWallet, envelope.beneficiaryWallet);
  assert.equal(decompressed.beneficiaryName, envelope.beneficiaryName);
  assert.equal(decompressed.amountPhp, envelope.amountPhp);
  assert.equal(decompressed.amountStroops, envelope.amountStroops);
  assert.equal(decompressed.transportMode, 'qr');
});

test('Offline Sync Queue: FIFO queueing, deduplication, and status transitions', async () => {
  const merchantId = 'test-merchant-queue-1';
  await clearEntireQueue(merchantId);

  const envelope1 = {
    version: '1.0',
    nonce: 'nonce-tx-001',
    programId: 'prog-1',
    beneficiaryId: 'ben-1',
    beneficiaryWallet: 'GBEN1',
    beneficiaryName: 'Beneficiary One',
    merchantId,
    amountStroops: '1000000000',
    amountPhp: '100.00',
    clientTimestamp: '2026-10-05T08:00:00.000Z',
    transportMode: 'qr',
  };

  const envelope2 = {
    version: '1.0',
    nonce: 'nonce-tx-002',
    programId: 'prog-1',
    beneficiaryId: 'ben-2',
    beneficiaryWallet: 'GBEN2',
    beneficiaryName: 'Beneficiary Two',
    merchantId,
    amountStroops: '2000000000',
    amountPhp: '200.00',
    clientTimestamp: '2026-10-05T08:01:00.000Z',
    transportMode: 'ble',
  };

  // 1. Enqueue items
  const item1 = await enqueueOfflineRedemption(envelope1);
  assert.equal(item1.status, 'pending_sync');
  assert.equal(item1.envelope.nonce, 'nonce-tx-001');

  const item2 = await enqueueOfflineRedemption(envelope2);
  assert.equal(item2.status, 'pending_sync');
  assert.equal(item2.envelope.nonce, 'nonce-tx-002');

  // 2. Duplicate nonce should be idempotent
  const dupItem = await enqueueOfflineRedemption(envelope1);
  assert.equal(dupItem.id, item1.id);

  let pending = await getPendingOfflineRedemptions(merchantId);
  assert.equal(pending.length, 2);

  // 3. Status transition: settle item1
  await updateQueueItemStatus({
    merchantId,
    nonce: 'nonce-tx-001',
    status: 'settled',
    transactionHash: 'stellar-hash-abc123',
  });

  // 4. Status transition: reject item2 due to overspend
  await updateQueueItemStatus({
    merchantId,
    nonce: 'nonce-tx-002',
    status: 'rejected',
    errorReason: 'BENEFICIARY_OVERSPENT_REJECTED',
  });

  const metrics = await getQueueMetrics(merchantId);
  assert.equal(metrics.totalCount, 2);
  assert.equal(metrics.pendingCount, 0);
  assert.equal(metrics.settledCount, 1);
  assert.equal(metrics.rejectedCount, 1);

  // 5. Clear settled
  await clearSettledItems(merchantId);
  const remaining = await getOfflineQueue(merchantId);
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].status, 'rejected');

  await clearEntireQueue(merchantId);
});

test('Offline Balance Manager: local cached balance deduction and overspend validation', async () => {
  const merchantId = 'test-merchant-balance-1';
  const beneficiaryWallet = 'GBENWALLETTEST999';
  const programId = 'prog-typhoon-relief';

  // Seed cached beneficiary lookup
  await setCachedBeneficiaryRecord(merchantId, beneficiaryWallet, {
    beneficiaryIdentityId: 'ben-identity-uuid',
    beneficiaryName: 'Maria Santos',
    beneficiaryWallet,
    isOffline: false,
    syncedAt: '2026-10-05T07:00:00.000Z',
    balances: [
      {
        programId,
        programName: 'Typhoon Relief Aid',
        organizationId: 'org-lgu',
        aidType: 'voucher',
        voucherType: 'Food Aid',
        category: 'Food',
        canonicalType: 'food',
        availableStroops: 10000000000n, // ₱1,000.00
        availablePhp: '1,000.00',
        reconciledAt: '2026-10-05T07:00:00.000Z',
        isAllowedForMerchant: true,
      },
    ],
  });

  // 1. Valid deduction within balance (₱350.00)
  const deduct1 = await deductOfflineBalance({
    merchantId,
    beneficiaryIdentifier: beneficiaryWallet,
    programId,
    amountStroops: 3500000000n,
    amountPhp: '350.00',
  });
  assert.ok(deduct1.ok, 'First deduction must succeed');
  assert.equal(deduct1.remainingBalancePhp, '650.00');

  // 2. Second valid deduction (₱650.00)
  const deduct2 = await deductOfflineBalance({
    merchantId,
    beneficiaryIdentifier: beneficiaryWallet,
    programId,
    amountStroops: 6500000000n,
    amountPhp: '650.00',
  });
  assert.ok(deduct2.ok, 'Second deduction must succeed');
  assert.equal(deduct2.remainingBalancePhp, '0.00');

  // 3. Overspend attempt: balance is ₱0.00, attempting ₱100.00 must fail
  const overspend = await deductOfflineBalance({
    merchantId,
    beneficiaryIdentifier: beneficiaryWallet,
    programId,
    amountStroops: 1000000000n,
    amountPhp: '100.00',
  });
  assert.equal(overspend.ok, false, 'Overspend attempt must fail');
  assert.match(overspend.error, /Insufficient offline balance/);

  // 4. Restore balance on rollback (restore ₱350.00)
  await restoreOfflineBalance({
    merchantId,
    beneficiaryIdentifier: beneficiaryWallet,
    programId,
    amountStroops: 3500000000n,
    amountPhp: '350.00',
  });

  const updatedRec = await getCachedBeneficiaryRecord(merchantId, beneficiaryWallet);
  assert.equal(updatedRec.balances[0].availablePhp, '350.00');
});

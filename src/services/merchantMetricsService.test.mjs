import test from 'node:test';
import assert from 'node:assert/strict';

export const calculateMerchantMetricsFromSettlements = (merchantId, rows) => {
  let totalStroops = 0n;
  let vouchersProcessed = 0;
  let latestIso = '';

  for (const row of rows) {
    if (row.amount_stroops != null) {
      try {
        totalStroops += BigInt(row.amount_stroops);
      } catch {
        // Ignore unparseable stroop value
      }
    }
    if (row.kind === 'voucher_redemption') {
      vouchersProcessed += 1;
    }
    const rowDate = row.confirmed_at || row.created_at;
    if (rowDate && (!latestIso || rowDate > latestIso)) {
      latestIso = rowDate;
    }
  }

  const totalSales = Number(totalStroops) / 10_000_000;

  return {
    merchantId,
    vouchersProcessed,
    totalSales,
    updatedAt: latestIso || new Date().toISOString(),
  };
};

test('calculateMerchantMetricsFromSettlements returns zero metrics when settlement list is empty', () => {
  const merchantId = 'test-merchant-1';
  const metrics = calculateMerchantMetricsFromSettlements(merchantId, []);

  assert.equal(metrics.merchantId, merchantId);
  assert.equal(metrics.totalSales, 0);
  assert.equal(metrics.vouchersProcessed, 0);
  assert.ok(typeof metrics.updatedAt === 'string');
});

test('calculateMerchantMetricsFromSettlements correctly sums total sales in PHP from Stroops', () => {
  const merchantId = 'test-merchant-2';
  const rows = [
    {
      amount_stroops: 5000000000n, // 500 PHP
      kind: 'voucher_redemption',
      confirmed_at: '2026-03-01T10:00:00Z',
    },
    {
      amount_stroops: 2500000000n, // 250 PHP
      kind: 'cash_payment',
      confirmed_at: '2026-03-02T12:00:00Z',
    },
  ];

  const metrics = calculateMerchantMetricsFromSettlements(merchantId, rows);

  assert.equal(metrics.merchantId, merchantId);
  assert.equal(metrics.totalSales, 750);
  assert.equal(metrics.vouchersProcessed, 1);
  assert.equal(metrics.updatedAt, '2026-03-02T12:00:00Z');
});

test('calculateMerchantMetricsFromSettlements only increments vouchersProcessed for voucher_redemption', () => {
  const merchantId = 'test-merchant-3';
  const rows = [
    { amount_stroops: 1000000000n, kind: 'voucher_redemption', confirmed_at: '2026-03-01T00:00:00Z' },
    { amount_stroops: 1500000000n, kind: 'voucher_redemption', confirmed_at: '2026-03-01T01:00:00Z' },
    { amount_stroops: 3000000000n, kind: 'cash_payment', confirmed_at: '2026-03-01T02:00:00Z' },
    { amount_stroops: 2000000000n, kind: 'voucher_redemption', confirmed_at: '2026-03-01T03:00:00Z' },
  ];

  const metrics = calculateMerchantMetricsFromSettlements(merchantId, rows);

  assert.equal(metrics.vouchersProcessed, 3);
  assert.equal(metrics.totalSales, 750); // (100 + 150 + 300 + 200) = 750 PHP
});

test('calculateMerchantMetricsFromSettlements handles string or number amount_stroops gracefully', () => {
  const merchantId = 'test-merchant-4';
  const rows = [
    { amount_stroops: '100000000', kind: 'voucher_redemption' }, // 10 PHP
    { amount_stroops: 200000000, kind: 'cash_payment' }, // 20 PHP
    { amount_stroops: null, kind: 'cash_payment' },
    { amount_stroops: 'invalid', kind: 'voucher_redemption' },
  ];

  const metrics = calculateMerchantMetricsFromSettlements(merchantId, rows);

  assert.equal(metrics.totalSales, 30);
  assert.equal(metrics.vouchersProcessed, 2);
});

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildLedgerReconciliation,
  calculateDateBounds,
  formatCurrency,
  truncateHash,
} from '../utils/report-utils.ts';

test('calculateDateBounds handles all presets accurately', () => {
  const allBounds = calculateDateBounds('all');
  assert.equal(allBounds.startDate, null);
  assert.equal(allBounds.endDate, null);
  assert.equal(allBounds.label, 'All Time');

  const sevenDays = calculateDateBounds('last_7_days');
  assert.ok(sevenDays.startDate instanceof Date);
  assert.ok(sevenDays.endDate instanceof Date);
  assert.equal(sevenDays.label, 'Last 7 Days');
  const diffDays7 = Math.round((sevenDays.endDate.getTime() - sevenDays.startDate.getTime()) / (24 * 3600 * 1000));
  assert.equal(diffDays7, 7);

  const thirtyDays = calculateDateBounds('last_30_days');
  assert.ok(thirtyDays.startDate instanceof Date);
  assert.equal(thirtyDays.label, 'Last 30 Days');

  const thisMonth = calculateDateBounds('this_month');
  assert.ok(thisMonth.startDate instanceof Date);
  assert.equal(thisMonth.startDate.getDate(), 1);
  assert.equal(thisMonth.label, 'This Month');

  const ninetyDays = calculateDateBounds('last_90_days');
  assert.ok(ninetyDays.startDate instanceof Date);
  assert.equal(ninetyDays.label, 'Last 90 Days');

  const custom = calculateDateBounds('all', '2026-01-01', '2026-03-31');
  assert.ok(custom.startDate instanceof Date);
  assert.ok(custom.endDate instanceof Date);
  assert.match(custom.label, /2026/);

  const specificDay = calculateDateBounds('specific_date', null, null, '2026-10-04');
  assert.ok(specificDay.startDate instanceof Date);
  assert.ok(specificDay.endDate instanceof Date);
  assert.match(specificDay.label, /Oct/);
  assert.match(specificDay.label, /2026/);
  assert.equal(specificDay.startDate.getFullYear(), 2026);
  assert.equal(specificDay.startDate.getMonth(), 9); // October = index 9
  assert.equal(specificDay.startDate.getDate(), 4);

  const customRange = calculateDateBounds('custom_range', '2026-06-01', '2026-06-30');
  assert.ok(customRange.startDate instanceof Date);
  assert.ok(customRange.endDate instanceof Date);
  assert.match(customRange.label, /Jun 1/);
  assert.match(customRange.label, /Jun 30/);
});

test('formatCurrency correctly formats Philippine Peso values', () => {
  assert.equal(formatCurrency(0), '₱0.00');
  assert.equal(formatCurrency(1500), '₱1,500.00');
  assert.equal(formatCurrency(2500000.5), '₱2,500,000.50');
});

test('truncateHash shortens hashes safely and preserves nulls', () => {
  assert.equal(truncateHash(null), 'N/A');
  assert.equal(truncateHash(undefined), 'N/A');
  assert.equal(truncateHash(''), 'N/A');
  assert.equal(truncateHash('0x1234'), '0x1234');
  assert.equal(truncateHash('0x1234567890abcdef1234567890'), '0x1234...567890');
});

test('buildLedgerReconciliation enforces zero drift against immutable ledger', () => {
  const recon = buildLedgerReconciliation(50000, 150000, 100000);
  assert.equal(recon.isReconciled, true);
  assert.equal(recon.ledgerAsset, 'RCPHP');
  assert.equal(recon.totalAllocated, 150000);
  assert.equal(recon.totalDisbursed, 100000);
  assert.equal(recon.treasuryBalance, 50000);
  assert.equal(recon.drift, 0);
  assert.ok(recon.ledgerProofHash.startsWith('0x'));
  assert.ok(recon.verifiedAt);
});

test('buildLedgerReconciliation detects drift when allocation exceeds disbursed and treasury', () => {
  const reconWithDrift = buildLedgerReconciliation(20000, 100000, 50000);
  assert.equal(reconWithDrift.isReconciled, false);
  assert.equal(reconWithDrift.drift, 30000);
});

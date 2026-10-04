import test from 'node:test';
import assert from 'node:assert/strict';

import { isNonCashVoucher, computeVoucherBreakdownAndTotal } from '../../../utils/voucher-balance-calculator.ts';

test('isNonCashVoucher correctly classifies non-cash voucher types and excludes cash', () => {
  // Non-cash vouchers
  assert.equal(isNonCashVoucher({ category: 'Food', purpose: 'Food relief' }), true);
  assert.equal(isNonCashVoucher({ category: 'Gas', purpose: 'Fuel voucher' }), true);
  assert.equal(isNonCashVoucher({ category: 'Travel', purpose: 'Evacuation travel' }), true);
  assert.equal(isNonCashVoucher({ category: 'Medicine', purpose: 'Health pack' }), true);
  assert.equal(isNonCashVoucher({ category: 'School Supplies', purpose: 'Back to school' }), true);
  assert.equal(isNonCashVoucher({ aidType: 'voucher', name: 'Disaster Relief Voucher' }), true);

  // Cash aid exclusions
  assert.equal(isNonCashVoucher({ aidType: 'cash' }), false);
  assert.equal(isNonCashVoucher({ category: 'Cash' }), false);
  assert.equal(isNonCashVoucher({ purpose: 'cash aid' }), false);
  assert.equal(isNonCashVoucher({ purpose: 'unrestricted cash' }), false);
  assert.equal(isNonCashVoucher({ name: 'Emergency Cash Assistance' }), false);
});

test('computeVoucherBreakdownAndTotal sums non-cash vouchers and excludes cash aid', () => {
  const programs = [
    {
      id: 'prog-food',
      name: 'Food Aid Program',
      approvalStatus: 'Approved',
      purpose: 'Food sustenance',
      expiresAt: '2026-12-31',
      category: 'Food',
      remainingVoucherStroops: 5_000_000_000, // 500 RCPHP
    },
    {
      id: 'prog-gas',
      name: 'Gasoline Assistance',
      approvalStatus: 'Approved',
      purpose: 'Fuel subsidy',
      expiresAt: '2026-12-31',
      category: 'Gas',
      allocatedAmountStroops: 3_000_000_000, // 300 RCPHP
    },
    {
      id: 'prog-cash',
      name: 'Direct Cash Grant',
      approvalStatus: 'Approved',
      purpose: 'Unrestricted cash aid',
      expiresAt: '2026-12-31',
      category: 'Cash',
      remainingVoucherStroops: 10_000_000_000, // 1000 RCPHP (Must be excluded!)
    },
  ];

  const result = computeVoucherBreakdownAndTotal(null, programs);

  // Total should be 500 + 300 = 800 RCPHP = 8_000_000_000 stroops (cash excluded)
  assert.equal(result.totalStroops, '8000000000');
  assert.equal(result.voucherCount, 2);
  assert.equal(result.breakdown.length, 2);
  assert.equal(result.breakdown[0].label, 'Food');
  assert.equal(result.breakdown[0].amountStroops, '5000000000');
  assert.equal(result.breakdown[1].label, 'Gas');
  assert.equal(result.breakdown[1].amountStroops, '3000000000');
});

test('computeVoucherBreakdownAndTotal prioritizes reconciled entitlement when present', () => {
  const programs = [
    {
      id: 'prog-travel',
      name: 'Travel Voucher',
      approvalStatus: 'Approved',
      purpose: 'Transit support',
      expiresAt: '2026-12-31',
      category: 'Travel',
      remainingVoucherStroops: 1_000_000_000, // 100 RCPHP unverified
    },
  ];

  const entitlements = [
    {
      programId: 'prog-travel',
      programName: 'Travel Voucher',
      purpose: 'Transit support',
      aidType: 'voucher',
      availableStroops: '750000000', // 75 RCPHP reconciled on-chain
      allocatedStroops: '1000000000',
      distributedStroops: '1000000000',
      redeemedStroops: '250000000',
      refundedStroops: '0',
      confirmedTransactionCount: 1,
      latestTransactionHash: '0xabc',
      assetCode: 'RCPHP',
      network: 'testnet',
      isAbandoned: false,
      abandonmentNote: null,
      abandonmentEvidenceRef: null,
      abandonedAt: null,
    },
  ];

  const result = computeVoucherBreakdownAndTotal(entitlements, programs);

  assert.equal(result.totalStroops, '750000000');
  assert.equal(result.voucherCount, 1);
  assert.equal(result.breakdown[0].amountStroops, '750000000');
});

test('computeVoucherBreakdownAndTotal handles empty programs and excludes abandoned entitlements', () => {
  const emptyResult = computeVoucherBreakdownAndTotal(null, []);
  assert.equal(emptyResult.totalStroops, '0');
  assert.equal(emptyResult.voucherCount, 0);
  assert.equal(emptyResult.breakdown.length, 0);

  const abandonedEntitlement = [
    {
      programId: 'prog-abandoned',
      programName: 'Abandoned Food Aid',
      purpose: 'Food',
      voucherType: 'Food',
      aidType: 'voucher',
      availableStroops: '1000000000',
      allocatedStroops: '1000000000',
      distributedStroops: '1000000000',
      redeemedStroops: '0',
      refundedStroops: '0',
      confirmedTransactionCount: 1,
      latestTransactionHash: '0x123',
      assetCode: 'RCPHP',
      network: 'testnet',
      isAbandoned: true,
      abandonmentNote: 'Lost SIM card',
      abandonmentEvidenceRef: 'ref-1',
      abandonedAt: '2026-09-01T00:00:00Z',
    },
  ];

  const resultWithAbandoned = computeVoucherBreakdownAndTotal(abandonedEntitlement, []);
  assert.equal(resultWithAbandoned.totalStroops, '0');
  assert.equal(resultWithAbandoned.voucherCount, 0);
  assert.equal(resultWithAbandoned.breakdown.length, 0);
});

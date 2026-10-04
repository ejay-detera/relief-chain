import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canMerchantRedeemVoucher,
  getVoucherTypeDetails,
  normalizeCategory,
  resolveCanonicalVoucherType,
} from './voucher-category-matcher.ts';

test('normalizeCategory cleans whitespace and special characters', () => {
  assert.equal(normalizeCategory(' Grocery / Retail '), 'grocery   retail');
  assert.equal(normalizeCategory('School-Supplies'), 'school supplies');
  assert.equal(normalizeCategory(null), '');
});

test('resolveCanonicalVoucherType maps terms correctly', () => {
  assert.equal(resolveCanonicalVoucherType('Food Assistance'), 'food');
  assert.equal(resolveCanonicalVoucherType('Emergency Groceries'), 'food');
  assert.equal(resolveCanonicalVoucherType('Pharmacy & First Aid'), 'medicine');
  assert.equal(resolveCanonicalVoucherType('Typhoon Shelter Kit'), 'shelter');
  assert.equal(resolveCanonicalVoucherType('School Supplies Program'), 'supplies');
  assert.equal(resolveCanonicalVoucherType('Fisherfolk Livelihood'), 'livelihood');
  assert.equal(resolveCanonicalVoucherType('Cash Aid'), 'cash');
  assert.equal(resolveCanonicalVoucherType(''), 'cash');
});

test('canMerchantRedeemVoucher allows matching categories', () => {
  // Grocery merchant with Food voucher
  const res1 = canMerchantRedeemVoucher('Grocery', 'Food Assistance');
  assert.equal(res1.allowed, true);

  // Pharmacy merchant with Medicine voucher
  const res2 = canMerchantRedeemVoucher('Pharmacy / Drugstore', 'Medicine Assistance');
  assert.equal(res2.allowed, true);

  // Hardware merchant with Shelter voucher
  const res3 = canMerchantRedeemVoucher(['hardware', 'construction'], 'Emergency Shelter');
  assert.equal(res3.allowed, true);

  // Cash is always allowed for any accredited merchant
  const resCash = canMerchantRedeemVoucher('Pharmacy', 'Cash');
  assert.equal(resCash.allowed, true);

  // General Merchandise merchant is allowed for all
  const resGeneral = canMerchantRedeemVoucher('General Merchandise', 'Food Assistance');
  assert.equal(resGeneral.allowed, true);
});

test('canMerchantRedeemVoucher blocks non-matching categories with clear reason', () => {
  // Grocery merchant trying to redeem Medicine
  const res1 = canMerchantRedeemVoucher('Grocery', 'Medicine Assistance');
  assert.equal(res1.allowed, false);
  assert.match(res1.reason, /Medicine & Health voucher/);
  assert.match(res1.reason, /Pharmacy/);

  // Pharmacy merchant trying to redeem Food
  const res2 = canMerchantRedeemVoucher('Pharmacy', 'Food Assistance');
  assert.equal(res2.allowed, false);
  assert.match(res2.reason, /Food Assistance voucher/);

  // No categories on record
  const res3 = canMerchantRedeemVoucher([], 'Food');
  assert.equal(res3.allowed, false);
  assert.match(res3.reason, /no accredited categories/);
});

test('getVoucherTypeDetails returns correct metadata', () => {
  const details = getVoucherTypeDetails('Food');
  assert.equal(details.key, 'food');
  assert.equal(details.label, 'Food Assistance');
  assert.ok(details.icon.length > 0);
});

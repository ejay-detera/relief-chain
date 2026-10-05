import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  preloadBeneficiaryManifest,
  getCachedBeneficiaryRecord,
  deductOfflineBalance,
  clearInMemoryBalanceCache,
} from './offline-balance-manager.ts';

test('Manifest Pre-sync & Air-Gapped Dynamic Voucher Admittance Suite', async (t) => {
  const merchantId = 'merchant-test-manifest-123';
  const beneficiaryWallet = 'GDENVOY7SAMPLEBENEFICIARYWALLETPRESYNC12345';
  const beneficiaryIdentityId = 'ben-identity-uuid-9999-0000';
  const programId = 'prog-food-aid-presync-456';

  await t.test('Pillar A: Preloads full beneficiary manifest without manual pre-scanning', async () => {
    clearInMemoryBalanceCache();

    const mockManifestRoster = [
      {
        beneficiaryIdentityId,
        beneficiaryName: 'Maria Santos',
        beneficiaryWallet,
        isOffline: true,
        syncedAt: new Date().toISOString(),
        balances: [
          {
            programId,
            programName: 'Typhoon Relief Food Aid',
            organizationId: 'org-red-cross',
            aidType: 'voucher',
            voucherType: 'Food Aid',
            category: 'Food',
            availableStroops: '1500000000', // 150.00 PHP
            availablePhp: '150.00',
            reconciledAt: null,
            isAllowedForMerchant: true,
          },
        ],
      },
    ];

    const count = await preloadBeneficiaryManifest(merchantId, mockManifestRoster);
    assert.equal(count, 1, 'Should pre-populate 1 beneficiary from the manifest');

    // Verify lookup by wallet
    const recordByWallet = await getCachedBeneficiaryRecord(merchantId, beneficiaryWallet);
    assert.ok(recordByWallet, 'Beneficiary record must be found by wallet address');
    assert.equal(recordByWallet.beneficiaryName, 'Maria Santos');
    assert.equal(recordByWallet.balances[0].availablePhp, '150.00');

    // Verify lookup by identity ID
    const recordById = await getCachedBeneficiaryRecord(merchantId, beneficiaryIdentityId);
    assert.ok(recordById, 'Beneficiary record must also be found by beneficiary identity ID');
    assert.equal(recordById.beneficiaryName, 'Maria Santos');

    // Verify cross-merchant direct key fallback
    const recordDirect = await getCachedBeneficiaryRecord('other-terminal', beneficiaryWallet);
    assert.ok(recordDirect, 'Direct address key fallback should resolve across terminal scopes');
    assert.equal(recordDirect.beneficiaryName, 'Maria Santos');
  });

  await t.test('Pillar A: Offline balance deduction functions immediately on pre-synced manifest', async () => {
    const deductRes = await deductOfflineBalance({
      merchantId,
      beneficiaryIdentifier: beneficiaryWallet,
      programId,
      amountStroops: '500000000', // 50.00 PHP
      amountPhp: '50.00',
    });

    assert.ok(deductRes.ok, 'Offline deduction on pre-synced record must succeed');
    assert.equal(deductRes.remainingBalancePhp, '100.00');
    assert.equal(deductRes.remainingBalanceStroops, '1000000000');

    // Verify balance is decremented in cache
    const updated = await getCachedBeneficiaryRecord(merchantId, beneficiaryWallet);
    assert.ok(updated);
    assert.equal(updated.balances[0].availablePhp, '100.00');
  });

  await t.test('Pillar B: Dynamic un-cached voucher admittance builds record on the fly', async () => {
    const newWallet = 'GNEWUNSEENBENEFICIARYWALLETAIRGAPPED99999';
    const newProgId = 'prog-emergency-shelter-789';

    // Verify initially un-cached
    const before = await getCachedBeneficiaryRecord(merchantId, newWallet);
    assert.equal(before, null, 'New unseen beneficiary must initially be un-cached');

    // Beneficiary presents self-contained signed voucher
    const dynamicRecord = {
      beneficiaryIdentityId: newWallet,
      beneficiaryName: 'Beneficiary (Signed Offline Voucher)',
      beneficiaryWallet: newWallet,
      isOffline: true,
      syncedAt: new Date().toISOString(),
      balances: [
        {
          programId: newProgId,
          programName: 'Emergency Shelter Voucher',
          organizationId: 'org-lgu',
          aidType: 'voucher',
          voucherType: 'Shelter',
          category: 'Shelter',
          availableStroops: '2000000000', // 200.00 PHP
          availablePhp: '200.00',
          reconciledAt: null,
          isAllowedForMerchant: true,
        },
      ],
    };

    // Terminal admits and preloads the dynamic record
    await preloadBeneficiaryManifest(merchantId, [dynamicRecord]);

    // Terminal can now execute offline deduction immediately
    const deductDynamic = await deductOfflineBalance({
      merchantId,
      beneficiaryIdentifier: newWallet,
      programId: newProgId,
      amountStroops: '750000000', // 75.00 PHP
      amountPhp: '75.00',
    });

    assert.ok(deductDynamic.ok, 'Offline deduction on dynamically admitted voucher must succeed');
    assert.equal(deductDynamic.remainingBalancePhp, '125.00');
  });

  await t.test('Pillar B: Scanned voucher program is correctly prioritized over existing cached programs', async () => {
    const multiBenWallet = 'GMULTIPROGRAMBENEFICIARYWALLETSAMPLE88888';

    // 1. Initial state: Beneficiary already has "Testingf" cached
    const initialRecord = {
      beneficiaryIdentityId: 'ben-multi-id',
      beneficiaryName: 'Beneficiary User',
      beneficiaryWallet: multiBenWallet,
      isOffline: true,
      syncedAt: new Date().toISOString(),
      balances: [
        {
          programId: 'prog-testingf-id',
          programName: 'Testingf',
          organizationId: 'org-test',
          aidType: 'voucher',
          voucherType: 'Food',
          category: 'Food',
          availableStroops: '1000000000',
          availablePhp: '100.00',
          reconciledAt: null,
          isAllowedForMerchant: true,
        },
      ],
    };
    await preloadBeneficiaryManifest(merchantId, [initialRecord]);

    // 2. Beneficiary now presents voucher specifically for "Before I Let You Go"
    const scannedTarget = {
      programId: 'prog-before-i-let-you-go-id',
      programName: 'Before I Let You Go',
      allocatedAmountStroops: '500000000',
      category: 'Food Aid',
      voucherType: 'Food Aid',
    };

    // Retrieve cached record and verify merging
    const cachedBefore = await getCachedBeneficiaryRecord(merchantId, multiBenWallet);
    assert.ok(cachedBefore);

    // Merge new voucher into cached balances
    const hasScannedProg = cachedBefore.balances.some(
      (b) => b.programId === scannedTarget.programId || b.programName === scannedTarget.programName
    );
    assert.equal(hasScannedProg, false, 'Scanned program is not yet in cached list');

    const mergedBalances = [
      {
        programId: scannedTarget.programId,
        programName: scannedTarget.programName,
        organizationId: '',
        aidType: 'voucher',
        voucherType: scannedTarget.voucherType,
        category: scannedTarget.category,
        availableStroops: scannedTarget.allocatedAmountStroops,
        availablePhp: '50.00',
        reconciledAt: null,
        isAllowedForMerchant: true,
      },
      ...cachedBefore.balances,
    ];

    await preloadBeneficiaryManifest(merchantId, [
      {
        ...cachedBefore,
        balances: mergedBalances,
      },
    ]);

    // 3. Verify lookup and targeted filter selects "Before I Let You Go", not "Testingf"
    const cachedAfter = await getCachedBeneficiaryRecord(merchantId, multiBenWallet);
    assert.ok(cachedAfter);
    assert.equal(cachedAfter.balances.length, 2);

    const isolated = cachedAfter.balances.filter(
      (b) =>
        b.programId === scannedTarget.programId ||
        b.programName.toLowerCase() === scannedTarget.programName.toLowerCase()
    );
    assert.equal(isolated.length, 1);
    assert.equal(isolated[0].programName, 'Before I Let You Go');
  });
});

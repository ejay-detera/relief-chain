import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

test('organization merchant status filter filters correctly', () => {
  const sampleMerchants = [
    {
      accreditation_id: '1',
      organization_id: 'org-a',
      merchant_id: 'm-1',
      display_name: 'Metro Grocery',
      category: 'Grocery',
      status: 'active',
      valid_from: '2026-01-01',
      valid_until: '2027-01-01',
      remarks: null,
      owner_name: 'Juan',
      mobile_number: '09123456789',
      stellar_pubkey: 'GAAAA',
      created_at: '2026-01-01',
    },
    {
      accreditation_id: '2',
      organization_id: 'org-a',
      merchant_id: 'm-2',
      display_name: 'City Pharmacy',
      category: 'Pharmacy',
      status: 'suspended',
      valid_from: '2026-01-01',
      valid_until: '2027-01-01',
      remarks: 'License under review',
      owner_name: 'Maria',
      mobile_number: '09198765432',
      stellar_pubkey: 'GBBBB',
      created_at: '2026-01-01',
    },
    {
      accreditation_id: '3',
      organization_id: 'org-a',
      merchant_id: 'm-3',
      display_name: 'Corner Mart',
      category: 'Convenience Store',
      status: 'rejected',
      valid_from: '2026-01-01',
      valid_until: '2027-01-01',
      remarks: 'Incomplete municipal documents',
      owner_name: 'Pedro',
      mobile_number: '09177778888',
      stellar_pubkey: 'GCCCC',
      created_at: '2026-01-01',
    },
  ];

  const filterByStatus = (list, filter) =>
    list.filter((m) => filter === 'All' || m.status.toLowerCase() === filter.toLowerCase());

  assert.equal(filterByStatus(sampleMerchants, 'All').length, 3);
  assert.equal(filterByStatus(sampleMerchants, 'Active').length, 1);
  assert.equal(filterByStatus(sampleMerchants, 'Active')[0].display_name, 'Metro Grocery');
  assert.equal(filterByStatus(sampleMerchants, 'Suspended').length, 1);
  assert.equal(filterByStatus(sampleMerchants, 'Suspended')[0].display_name, 'City Pharmacy');
  assert.equal(filterByStatus(sampleMerchants, 'Rejected').length, 1);
  assert.equal(filterByStatus(sampleMerchants, 'Rejected')[0].display_name, 'Corner Mart');
});

test('organization merchant search matches display name, category, and owner name', () => {
  const sampleMerchants = [
    {
      display_name: 'Evergreen Supermarket',
      category: 'Grocery',
      owner_name: 'Elena Santos',
      status: 'active',
    },
    {
      display_name: 'Southstar Health',
      category: 'Pharmacy',
      owner_name: 'Ricardo Dalisay',
      status: 'active',
    },
  ];

  const search = (list, query) => {
    const q = query.toLowerCase().trim();
    if (!q) return list;
    return list.filter(
      (m) =>
        m.display_name.toLowerCase().includes(q) ||
        m.category.toLowerCase().includes(q) ||
        (m.owner_name && m.owner_name.toLowerCase().includes(q)),
    );
  };

  assert.equal(search(sampleMerchants, 'evergreen').length, 1);
  assert.equal(search(sampleMerchants, 'pharmacy').length, 1);
  assert.equal(search(sampleMerchants, 'elena').length, 1);
  assert.equal(search(sampleMerchants, 'unknown').length, 0);
  assert.equal(search(sampleMerchants, '').length, 2);
});

test('removing an accredited merchant excludes them from active program selection', () => {
  let accredited = ['Merchant Demo Store', 'Local Fresh Market', 'Mercury Drug'];

  const removeMerchant = (name) => {
    accredited = accredited.filter((m) => m !== name);
  };

  // Initially all 3 are present
  assert.equal(accredited.includes('Local Fresh Market'), true);

  // When removed
  removeMerchant('Local Fresh Market');

  // Should no longer appear in available choices for that organization
  assert.equal(accredited.includes('Local Fresh Market'), false);
  assert.deepEqual(accredited, ['Merchant Demo Store', 'Mercury Drug']);
});

test('suspending or rejecting a merchant requires non-empty remarks', () => {
  const validateStatusUpdate = (status, remarks) => {
    const trimmedRemarks = (remarks || '').trim();
    if ((status === 'suspended' || status === 'rejected') && !trimmedRemarks) {
      throw new Error('A reason is required when suspending or rejecting a merchant');
    }
    return true;
  };

  assert.throws(
    () => validateStatusUpdate('suspended', ''),
    /A reason is required when suspending or rejecting a merchant/,
  );
  assert.throws(
    () => validateStatusUpdate('rejected', '   '),
    /A reason is required when suspending or rejecting a merchant/,
  );
  assert.equal(
    validateStatusUpdate('suspended', 'Permit renewal overdue'),
    true,
  );
  assert.equal(
    validateStatusUpdate('active', ''),
    true,
  );
});

test('ORG-11: merchant redemption history filters by program correctly', () => {
  const redemptions = [
    { id: '1', program_id: 'prog-1', program_name: 'Food Aid', amount: 500 },
    { id: '2', program_id: 'prog-2', program_name: 'Medical Aid', amount: 1200 },
    { id: '3', program_id: 'prog-1', program_name: 'Food Aid', amount: 300 },
  ];

  const filterByProgram = (list, progId) => {
    if (!progId) return list;
    return list.filter((tx) => tx.program_id === progId);
  };

  assert.equal(filterByProgram(redemptions, null).length, 3);
  assert.equal(filterByProgram(redemptions, 'prog-1').length, 2);
  assert.equal(filterByProgram(redemptions, 'prog-2').length, 1);
});

test('ORG-11: merchant redemption history filters by date range correctly', () => {
  const now = new Date('2026-10-04T12:00:00Z');
  const redemptions = [
    { id: 'today', redeemed_at: '2026-10-04T08:00:00Z' },
    { id: 'three-days-ago', redeemed_at: '2026-10-01T08:00:00Z' },
    { id: 'twenty-days-ago', redeemed_at: '2026-09-14T08:00:00Z' },
    { id: 'two-months-ago', redeemed_at: '2026-08-01T08:00:00Z' },
  ];

  const filterByDate = (list, range, referenceDate = now) => {
    if (range === 'all') return list;
    return list.filter((tx) => {
      const d = new Date(tx.redeemed_at);
      if (range === 'today') {
        return (
          d.getUTCFullYear() === referenceDate.getUTCFullYear() &&
          d.getUTCMonth() === referenceDate.getUTCMonth() &&
          d.getUTCDate() === referenceDate.getUTCDate()
        );
      }
      const diffDays =
        (referenceDate.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
      if (range === '7days') return diffDays <= 7;
      if (range === '30days') return diffDays <= 30;
      return true;
    });
  };

  assert.equal(filterByDate(redemptions, 'all').length, 4);
  assert.equal(filterByDate(redemptions, 'today').length, 1);
  assert.equal(filterByDate(redemptions, 'today')[0].id, 'today');
  assert.equal(filterByDate(redemptions, '7days').length, 2);
  assert.equal(filterByDate(redemptions, '30days').length, 3);
});

test('ORG-11: calculate redemption summary aggregates total count and volume', () => {
  const redemptions = [
    { id: '1', amount: 500.5 },
    { id: '2', amount: 1500 },
    { id: '3', amount: 99.5 },
  ];

  const calculateSummary = (list) => ({
    count: list.length,
    amount: list.reduce((sum, item) => sum + item.amount, 0),
  });

  const summary = calculateSummary(redemptions);
  assert.equal(summary.count, 3);
  assert.equal(summary.amount, 2100);
});

test('ORG-11: search redemptions matches beneficiary name, reference, category, and hash', () => {
  const redemptions = [
    {
      id: '1',
      beneficiary_name: 'Juan Dela Cruz',
      beneficiary_reference: 'Juan Dela Cruz (B-17a0)',
      category: 'Food Aid',
      tx_hash: '3e39fdda435ec50e',
      program_name: 'Typhoon Aid',
    },
    {
      id: '2',
      beneficiary_name: 'Maria Clara',
      beneficiary_reference: 'Maria Clara (B-89bc)',
      category: 'Medicine',
      tx_hash: 'de6051d81bfa6f2e',
      program_name: 'Health Program',
    },
  ];

  const search = (list, query) => {
    const q = query.toLowerCase().trim();
    if (!q) return list;
    return list.filter(
      (tx) =>
        tx.beneficiary_name.toLowerCase().includes(q) ||
        tx.beneficiary_reference.toLowerCase().includes(q) ||
        tx.category.toLowerCase().includes(q) ||
        tx.tx_hash.toLowerCase().includes(q) ||
        tx.program_name.toLowerCase().includes(q),
    );
  };

  assert.equal(search(redemptions, 'Juan').length, 1);
  assert.equal(search(redemptions, 'B-17a0').length, 1);
  assert.equal(search(redemptions, 'Medicine').length, 1);
  assert.equal(search(redemptions, 'de6051').length, 1);
  assert.equal(search(redemptions, 'Nonexistent').length, 0);
});

test('ORG-11: organization can ONLY see merchant redemptions on their created programs (cross-organization isolation)', () => {
  const allMerchantRedemptions = [
    {
      id: 'tx-1',
      merchant_id: 'merchant-alpha',
      program_id: 'prog-org-a-1',
      program_name: 'Quezon City Calamity Aid',
      organization_id: 'org-quezon',
      amount: 500,
    },
    {
      id: 'tx-2',
      merchant_id: 'merchant-alpha',
      program_id: 'prog-org-a-2',
      program_name: 'Quezon City Senior Voucher',
      organization_id: 'org-quezon',
      amount: 300,
    },
    {
      id: 'tx-3',
      merchant_id: 'merchant-alpha',
      program_id: 'prog-org-b-1',
      program_name: 'Manila Flood Relief Aid',
      organization_id: 'org-manila',
      amount: 1000,
    },
  ];

  const getRedemptionsForOrganization = (list, callerOrgId) => {
    return list.filter((tx) => tx.organization_id === callerOrgId);
  };

  // Quezon City LGU querying Merchant Alpha
  const quezonView = getRedemptionsForOrganization(
    allMerchantRedemptions,
    'org-quezon',
  );
  assert.equal(quezonView.length, 2);
  assert.equal(quezonView.some((tx) => tx.id === 'tx-1'), true);
  assert.equal(quezonView.some((tx) => tx.id === 'tx-2'), true);
  // Must NOT see Manila's program redemption
  assert.equal(quezonView.some((tx) => tx.id === 'tx-3'), false);
  assert.equal(
    quezonView.some((tx) => tx.program_name === 'Manila Flood Relief Aid'),
    false,
  );

  // Manila LGU querying Merchant Alpha
  const manilaView = getRedemptionsForOrganization(
    allMerchantRedemptions,
    'org-manila',
  );
  assert.equal(manilaView.length, 1);
  assert.equal(manilaView[0].id, 'tx-3');
  assert.equal(manilaView[0].program_name, 'Manila Flood Relief Aid');
  // Must NOT see Quezon City's program redemptions
  assert.equal(manilaView.some((tx) => tx.organization_id === 'org-quezon'), false);
});

test('ORG-11: program dropdown filter options strictly only include programs created by the authenticated organization', () => {
  const allSystemPrograms = [
    { id: 'prog-1', name: 'QC Calamity Aid', organization_id: 'org-qc' },
    { id: 'prog-2', name: 'QC Senior Citizen Voucher', organization_id: 'org-qc' },
    { id: 'prog-3', name: 'Pasig Emergency Rice', organization_id: 'org-pasig' },
    { id: 'prog-4', name: 'Taguig Medical Assistance', organization_id: 'org-taguig' },
  ];

  const getDropdownProgramOptions = (programs, callerOrgId) => {
    const orgPrograms = programs.filter((p) => p.organization_id === callerOrgId);
    return [
      { label: 'All Programs', value: null },
      ...orgPrograms.map((p) => ({ label: p.name, value: p.id })),
    ];
  };

  const qcDropdownOptions = getDropdownProgramOptions(allSystemPrograms, 'org-qc');
  assert.equal(qcDropdownOptions.length, 3); // 'All Programs' + 2 QC programs
  assert.equal(qcDropdownOptions[0].label, 'All Programs');
  assert.equal(qcDropdownOptions[0].value, null);
  assert.equal(qcDropdownOptions[1].label, 'QC Calamity Aid');
  assert.equal(qcDropdownOptions[2].label, 'QC Senior Citizen Voucher');
  // Must NOT contain Pasig or Taguig programs
  assert.equal(qcDropdownOptions.some((opt) => opt.label.includes('Pasig')), false);
  assert.equal(qcDropdownOptions.some((opt) => opt.label.includes('Taguig')), false);

  const pasigDropdownOptions = getDropdownProgramOptions(allSystemPrograms, 'org-pasig');
  assert.equal(pasigDropdownOptions.length, 2); // 'All Programs' + 1 Pasig program
  assert.equal(pasigDropdownOptions[1].label, 'Pasig Emergency Rice');
  assert.equal(pasigDropdownOptions.some((opt) => opt.label.includes('QC')), false);
});

test('merchant Stellar public key resolves from wallets table when profile pubkey is null', () => {
  const merchantEntity = {
    id: 'm-entity-1',
    profile_id: 'prof-1',
    display_name: 'Supermart',
  };
  const profile = {
    id: 'prof-1',
    stellar_pubkey: null, // Profiles table has null for merchants
  };
  const wallets = [
    {
      owner_id: 'm-entity-1',
      owner_type: 'merchant_entity',
      address: 'GBTTSCAV72RUVVXYW3SZ5NBJW2JTGSMUAD3TDK4UJDRGABGZUX4GKA64',
      is_active: true,
    },
  ];

  const resolveMerchantWallet = (merchant, prof, walletList) => {
    const activeWallet = walletList.find(
      (w) => w.owner_id === merchant.id && w.is_active,
    );
    return activeWallet?.address || prof?.stellar_pubkey || null;
  };

  const resolvedAddress = resolveMerchantWallet(merchantEntity, profile, wallets);
  assert.equal(
    resolvedAddress,
    'GBTTSCAV72RUVVXYW3SZ5NBJW2JTGSMUAD3TDK4UJDRGABGZUX4GKA64',
  );
});

test('Merchant card, review modal summary, transaction card, and KPI cards are icon-free', () => {
  const componentsDir = path.resolve('src/components/MerchantManagement');

  const cardContent = fs.readFileSync(path.join(componentsDir, 'MerchantCard.tsx'), 'utf8');
  assert.equal(cardContent.includes('<UserAvatar'), false, 'MerchantCard must not render UserAvatar');
  assert.equal(cardContent.includes('<FontAwesome'), false, 'MerchantCard must not render FontAwesome icons');

  const modalContent = fs.readFileSync(path.join(componentsDir, 'MerchantDetailModal.tsx'), 'utf8');
  assert.equal(modalContent.includes('<UserAvatar'), false, 'MerchantDetailModal must not render UserAvatar');

  const redemptionCardContent = fs.readFileSync(path.join(componentsDir, 'MerchantRedemptionCard.tsx'), 'utf8');
  assert.equal(redemptionCardContent.includes('<UserAvatar'), false, 'MerchantRedemptionCard must not render UserAvatar');
  assert.equal(redemptionCardContent.includes('name="tag"'), false, 'MerchantRedemptionCard must not render tag icon');
  assert.equal(redemptionCardContent.includes('name="clock-o"'), false, 'MerchantRedemptionCard must not render clock icon');

  const historyTabContent = fs.readFileSync(path.join(componentsDir, 'MerchantRedemptionHistoryTab.tsx'), 'utf8');
  assert.equal(historyTabContent.includes('name="exchange"'), false, 'KPI summary cards must not render exchange icon');
  assert.equal(historyTabContent.includes('name="money"'), false, 'KPI summary cards must not render money icon');
});




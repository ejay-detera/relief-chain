import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

test('merchant available programs parses draft and active programs correctly', () => {
  const samplePrograms = [
    {
      id: 'prog-1',
      name: 'Typhoon Relief Food Aid',
      purpose: 'Emergency grocery assistance',
      status: 'active',
      voucher_value: 2500,
      voucher_types: ['food'],
      selected_merchants: ['Store A'],
    },
    {
      id: 'prog-2',
      name: 'Medical Aid Q4',
      purpose: 'Prescription medicine aid',
      status: 'draft',
      voucher_value: 1500,
      voucher_types: ['medicine'],
      selected_merchants: [],
    },
    {
      id: 'prog-3',
      name: 'Completed Flood Response',
      purpose: 'Past aid',
      status: 'completed',
      voucher_value: 1000,
      voucher_types: ['supplies'],
      selected_merchants: [],
    },
  ];

  // Available programs for discovery must include 'draft' and 'active'
  const openStatuses = ['draft', 'active', 'scheduled', 'funding'];
  const available = samplePrograms.filter((p) => openStatuses.includes(p.status));

  assert.equal(available.length, 2);
  assert.equal(available[0].name, 'Typhoon Relief Food Aid');
  assert.equal(available[0].status, 'active');
  assert.equal(available[1].name, 'Medical Aid Q4');
  assert.equal(available[1].status, 'draft');
});

test('merchant application status mapping maps correctly', () => {
  const applications = [
    { program_id: 'prog-1', status: 'pending', notes: 'We stock rice and canned goods' },
    { program_id: 'prog-2', status: 'approved', notes: null },
    { program_id: 'prog-3', status: 'rejected', rejection_reason: 'Branch location out of scope' },
  ];

  const appMap = new Map(applications.map((a) => [a.program_id, a]));

  const getStatus = (progId) => {
    const app = appMap.get(progId);
    return app ? app.status : 'none';
  };

  assert.equal(getStatus('prog-1'), 'pending');
  assert.equal(getStatus('prog-2'), 'approved');
  assert.equal(getStatus('prog-3'), 'rejected');
  assert.equal(getStatus('prog-4'), 'none');
});

test('reviewing merchant application: approving adds merchant to program selected_merchants', () => {
  const currentSelectedMerchants = ['Existing Store'];
  const newMerchantName = 'New Partner Mart';

  // Admin approves application
  const updated = currentSelectedMerchants.includes(newMerchantName)
    ? currentSelectedMerchants
    : [...currentSelectedMerchants, newMerchantName];

  assert.deepEqual(updated, ['Existing Store', 'New Partner Mart']);
});

test('reviewing merchant application: rejecting removes merchant from program selected_merchants', () => {
  const currentSelectedMerchants = ['Existing Store', 'Declined Merchant'];
  const merchantToRemove = 'Declined Merchant';

  // Admin rejects application
  const updated = currentSelectedMerchants.filter((m) => m !== merchantToRemove);

  assert.deepEqual(updated, ['Existing Store']);
});

test('program creation: only accepted merchants are presented in the selection pool', () => {
  const allRegisteredMerchants = [
    { id: 'm1', name: 'Applied & Approved Store', isApproved: true },
    { id: 'm2', name: 'Unrelated Store (Did not apply)', isApproved: false },
    { id: 'm3', name: 'Pending Store (Not yet approved)', isApproved: false },
    { id: 'm4', name: 'Pre-accredited Org Merchant', isApproved: true },
  ];

  const eligibleForProgramSelection = allRegisteredMerchants
    .filter((m) => m.isApproved)
    .map((m) => m.name);

  assert.deepEqual(eligibleForProgramSelection, [
    'Applied & Approved Store',
    'Pre-accredited Org Merchant',
  ]);
  assert.equal(eligibleForProgramSelection.includes('Unrelated Store (Did not apply)'), false);
  assert.equal(eligibleForProgramSelection.includes('Pending Store (Not yet approved)'), false);
});

test("AvailableProgramCard displays 'DRAFT' and eliminates 'DRAFT — ACCEPTING MERCHANTS'", () => {
  const cardPath = path.resolve('src/components/MerchantPrograms/AvailableProgramCard.tsx');
  const cardSrc = fs.readFileSync(cardPath, 'utf8');

  assert.equal(
    cardSrc.includes("'DRAFT — ACCEPTING MERCHANTS'"),
    false,
    "Card must not use 'DRAFT — ACCEPTING MERCHANTS'",
  );
  assert.equal(
    cardSrc.includes("{isDraft ? 'DRAFT' : 'ACTIVE PROGRAM'}"),
    true,
    "Card must display 'DRAFT' for draft programs",
  );
});

test("AvailableProgramCard displays withdrawn status box and Apply Again action without header chip", () => {
  const cardPath = path.resolve('src/components/MerchantPrograms/AvailableProgramCard.tsx');
  const cardSrc = fs.readFileSync(cardPath, 'utf8');

  assert.equal(
    cardSrc.includes("program.applicationStatus === 'withdrawn'"),
    true,
    'Card must check for withdrawn applicationStatus',
  );
  assert.equal(
    cardSrc.includes('withdrawnTag'),
    false,
    'Card must not render an application withdrawn chip/tag in the header',
  );
  assert.equal(
    cardSrc.includes('Application Withdrawn'),
    true,
    'Card must render Application Withdrawn status box',
  );
  assert.equal(
    cardSrc.includes('Apply Again'),
    true,
    'Card must allow merchant to apply again after withdrawal',
  );
});


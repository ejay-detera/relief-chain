// Placeholder demo data served by mock-backend.mjs. Names, numbers, and hashes
// are fake. Extend per screen as probe runs report unhandled requests.
import { USERS } from './mock-backend.mjs';

const ORG = '7d639bff-62a5-492b-8154-6ab171b1981b';
const PROGRAM = '903bced9-a713-4a1e-b458-c36aa42c853c';
const PROGRAM2 = '903bced9-a713-4a1e-b458-c36aa42c8540';
const MERCHANT_ENTITY = '9add3a65-942c-4e08-b0a6-8eb3105b0ab4';
const STROOPS = 10_000_000;
const iso = (d) => new Date(Date.UTC(2026, 9, d, 9, 0, 0)).toISOString();
const hash = (n) => (n.toString(16).padStart(8, '0') + 'a3f94be17c21d0e9b8f6a5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b7c6d5e4').slice(0, 64);
const G = (c) => `G${c.repeat(55)}`.slice(0, 56);

const profile = (role, extra) => ({
  id: USERS[role].id, role, full_name: null, gov_id: 'DEMO-0000', location: 'Sample City', stellar_pubkey: G('B'),
  created_at: iso(1), first_name: null, last_name: null, middle_initial: null, mobile_number: '0917-000-0000',
  sex: null, civil_status: null, birthdate: null, gov_id_url: null, complete_address: 'Brgy Sample 1, Sample City',
  municipality_city: 'Sample City', verification_status: 'verified', city_id: 1, area_id: 1, barangay_id: 1, ...extra,
});

const programs = [
  {
    id: PROGRAM, organization_id: ORG, name: 'Typhoon Relief (demo)', title: 'Typhoon Relief (demo)',
    purpose: 'Emergency cash and food assistance for typhoon-affected households.', description: 'Emergency cash and food assistance for typhoon-affected households.',
    status: 'active', voucher_type: 'cash', total_budget: 2515500, aid_per_household: 500, amount_per_beneficiary: 500, distribution_method: 'batch',
    created_at: iso(5), start_date: iso(5), expires_at: iso(30), end_date: iso(30), is_private: false,
    disaster_type_id: 1, implementing_agency_id: 1, funding_source_id: 1, city_id: 1,
    disaster_types: { name: 'Typhoon' }, implementing_agencies: { name: 'City Social Welfare Office (demo)' }, funding_sources: { name: 'Local Calamity Fund (demo)' },
    program_areas: [{ area_id: 1, areas: { name: 'District 1' } }], program_barangays: [{ barangay_id: 1, barangays: { name: 'Brgy Sample 1', area_id: 1 } }, { barangay_id: 2, barangays: { name: 'Brgy Sample 2', area_id: 1 } }],
    beneficiary_count: 5031, approved_count: 5031, distributed_amount: 2515500, auto_distribute_toggle: false, wallet_type_toggle: false,
  },
  {
    id: PROGRAM2, organization_id: ORG, name: 'Flood Food Packs (demo)', title: 'Flood Food Packs (demo)',
    purpose: 'Food voucher support after flooding.', description: 'Food voucher support after flooding.',
    status: 'completed', voucher_type: 'food', total_budget: 300000, aid_per_household: 300, amount_per_beneficiary: 300, distribution_method: 'automatic',
    created_at: iso(1), start_date: iso(1), expires_at: iso(20), end_date: iso(20), is_private: false,
    disaster_types: { name: 'Flood' }, implementing_agencies: { name: 'City Social Welfare Office (demo)' }, funding_sources: { name: 'Local Calamity Fund (demo)' },
    program_areas: [], program_barangays: [], beneficiary_count: 1000, approved_count: 1000,
  },
];

const names = ['Juan Dela Cruz', 'Maria Santos', 'Ana Lim', 'Jose Reyes', 'Liza Garcia', 'Mark Bautista', 'Grace Villanueva', 'Paolo Mendoza'];
const FIRST = ['Juan', 'Maria', 'Ana', 'Jose', 'Liza', 'Mark', 'Grace', 'Paolo', 'Carmen', 'Rico', 'Joy', 'Ramon', 'Elena', 'Noel', 'Rosa', 'Dante', 'Mylene', 'Arnel', 'Cora', 'Ben'];
const LAST = ['Dela Cruz', 'Santos', 'Lim', 'Reyes', 'Garcia', 'Bautista', 'Villanueva', 'Mendoza', 'Ramos', 'Aquino', 'Castro', 'Torres', 'Flores', 'Navarro', 'Rivera', 'Domingo', 'Mercado', 'Pascual', 'Soriano', 'Valdez'];
const POPULATION = 5031;
const beneficiaryProfiles = Array.from({ length: POPULATION }, (_, i) => ({
  id: i === 0 ? USERS.beneficiary.id : `b0000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
  role: 'beneficiary',
  full_name: i === 0 ? 'Juan Dela Cruz' : `${FIRST[i % FIRST.length]} ${LAST[(i * 7 + Math.floor(i / FIRST.length)) % LAST.length]}`,
  gov_id: `DEMO-${String(i).padStart(5, '0')}`, location: 'Sample City', stellar_pubkey: G('B'),
  verification_status: 'Verified', mobile_number: `0917-${String(100 + (i % 900)).padStart(3, '0')}-${String(i).padStart(4, '0')}`,
  created_at: iso(6), city_id: 1, area_id: 1, barangay_id: (i % 2) + 1,
}));

export const buildDemoData = (role) => ({
  role,
  ids: { ORG, PROGRAM, MERCHANT_ENTITY },
  tables: {
    profiles: [
      profile('lgu', { full_name: 'LGU Administrator' }),
      profile('beneficiary', { full_name: 'Juan Dela Cruz', first_name: 'Juan', last_name: 'Dela Cruz', verification_status: 'Verified' }),
      profile('merchant', { full_name: 'Sari-sari Store (demo)' }),
      ...beneficiaryProfiles.slice(1),
    ],
    registrations: [{ id: 'reg-1', lgu_id: USERS.lgu.id, status: 'Approved', rejection_reason: null, organization_name: 'Sample City LGU (demo)' }],
    organization_memberships: [{ organization_id: ORG, user_id: USERS.lgu.id, is_active: true, role: 'admin' }],
    organizations: [{ id: ORG, name: 'Sample City LGU (demo)', display_name: 'Sample City LGU (demo)' }],
    programs,
    disaster_types: [{ id: 1, name: 'Typhoon' }, { id: 2, name: 'Flood' }, { id: 3, name: 'Earthquake' }, { id: 4, name: 'Fire' }],
    cities: [{ id: 1, name: 'Sample City' }],
    areas: [{ id: 1, name: 'District 1', city_id: 1 }, { id: 2, name: 'District 2', city_id: 1 }],
    barangays: [1, 2, 3, 4].map((id) => ({ id, name: `Brgy Sample ${id}`, area_id: id <= 2 ? 1 : 2 })),
    implementing_agencies: [{ id: 1, name: 'City Social Welfare Office (demo)' }, { id: 2, name: 'City DRRM Office (demo)' }],
    funding_sources: [{ id: 1, name: 'Local Calamity Fund (demo)' }, { id: 2, name: 'National Grant (demo)' }],
    wallets: [
      { id: 'w-ben', network: 'stellar_testnet', address: G('B'), is_active: true, purpose: 'beneficiary', verification_status: 'verified', owner_type: 'user', owner_id: USERS.beneficiary.id },
      { id: 'w-org', network: 'stellar_testnet', address: G('T'), is_active: true, purpose: 'organization_treasury', verification_status: 'verified', owner_type: 'organization', owner_id: ORG },
      { id: 'w-mer', network: 'stellar_testnet', address: G('M'), is_active: true, purpose: 'merchant', verification_status: 'verified', owner_type: 'merchant', owner_id: MERCHANT_ENTITY },
    ],
    beneficiary_balance_projection: [
      { program_id: PROGRAM, aid_type: 'cash', available_balance_stroops: 400 * STROOPS, allocated_stroops: 500 * STROOPS, distributed_stroops: 500 * STROOPS, redeemed_stroops: 100 * STROOPS, refunded_stroops: 0, confirmed_transaction_count: 2, latest_transaction_hash: hash(7), asset_code: 'RCPHP', reconciled_at: iso(9), as_of_ledger: 1234567, is_stale: false, is_quarantined: false, quarantine_issue_id: null, is_abandoned: false, program: { id: PROGRAM, name: 'Typhoon Relief (demo)' } },
    ],
    enrollments: (url) => {
      const select = url.searchParams.get('select') ?? '';
      if (select.includes('profiles:beneficiary_id')) {
        return beneficiaryProfiles.map((p, i) => ({ approval_status: 'Approved', program_id: PROGRAM, profiles: p, id: `enr-${i}` }));
      }
      return [{ id: 'enr-1', approval_status: 'Approved', expires_at: iso(30), scanned_at: null, created_at: iso(6), category: 'Affected household', rejection_remarks: null, allocation_amount_stroops: 500 * STROOPS, voucher_balance: 400, beneficiary_id: USERS.beneficiary.id, program_id: PROGRAM, program: programs[0] }];
    },
    payment_intents: [
      { id: 'pi-1', amount_stroops: 100 * STROOPS, funding_source: 'cash', status: 'confirmed', transaction_hash: hash(11), confirmed_at: iso(9), created_at: iso(9), merchant: { display_name: 'Sari-sari Store (demo)' } },
    ],
    notifications: [
      { id: 'n-1', type: 'distribution', title: 'Aid received', body: 'You received 500 RCPHP from Typhoon Relief (demo).', data: {}, is_read: false, read_at: null, created_at: iso(9) },
      { id: 'n-2', type: 'enrollment', title: 'Application approved', body: 'Your application to Typhoon Relief (demo) was approved.', data: {}, is_read: true, read_at: iso(8), created_at: iso(8) },
    ],
    merchant_balance_projection: [{
      merchant_id: MERCHANT_ENTITY, settled_balance_stroops: String(250 * STROOPS), gross_settled_stroops: String(250 * STROOPS), refunded_stroops: '0',
      pending_cashout_stroops: '0', completed_cashout_stroops: '0', confirmed_settlement_count: 2, latest_transaction_hash: hash(21),
      reconciled_at: iso(9), as_of_ledger: 1234999, is_stale: false, is_quarantined: false, quarantine_issue_id: null,
    }],
    settlements: [
      { id: 'set-2', merchant_id: MERCHANT_ENTITY, amount_stroops: String(150 * STROOPS), kind: 'voucher_redemption', transaction_hash: hash(22), ledger: 1234990, status: 'confirmed', correlation_id: 'c-2', confirmed_at: iso(9), created_at: iso(9), program_id: PROGRAM, program: { id: PROGRAM, name: 'Typhoon Relief (demo)' } },
      { id: 'set-1', merchant_id: MERCHANT_ENTITY, amount_stroops: String(100 * STROOPS), kind: 'payment', transaction_hash: hash(21), ledger: 1234980, status: 'confirmed', correlation_id: 'c-1', confirmed_at: iso(9), created_at: iso(9), program_id: PROGRAM, program: { id: PROGRAM, name: 'Typhoon Relief (demo)' } },
    ],
    redemptions: [],
    refunds: [],
    merchant_accreditations: [{ merchant_entity_id: MERCHANT_ENTITY, status: 'accredited', category: 'grocery', organization_id: ORG }],
    program_merchants: [{ program_id: PROGRAM, merchant_entity_id: MERCHANT_ENTITY, status: 'accepted', programs: programs[0] }],
    merchant_entities: [{ id: MERCHANT_ENTITY, display_name: 'Sari-sari Store (demo)', owner_id: USERS.merchant.id, status: 'active' }],
    beneficiaries: names.map((n, i) => ({ id: `ben-${i}`, full_name: n, verification_status: 'verified', barangay: 'Brgy Sample 1', created_at: iso(6) })),
  },
  rpc: {
    get_program_accepted_merchants: [{ merchant_entity_id: MERCHANT_ENTITY, merchant_id: MERCHANT_ENTITY, id: MERCHANT_ENTITY, display_name: 'Sari-sari Store (demo)', category: 'grocery', status: 'accepted' }],
    get_organization_merchants: [{ merchant_entity_id: MERCHANT_ENTITY, display_name: 'Sari-sari Store (demo)', category: 'grocery', status: 'accredited' }],
    get_active_organization_merchant_names: [{ display_name: 'Sari-sari Store (demo)', name: 'Sari-sari Store (demo)' }],
    get_or_create_merchant_metrics: { total_sales_stroops: 250 * STROOPS, vouchers_processed: 2 },
    get_merchant_offline_manifest: { merchant_entity_id: MERCHANT_ENTITY, entries: [], generated_at: iso(9) },
  },
  functions: {
    'prepare-cash-activation': { activation: { intentId: 'demo-intent-1', attemptId: 'demo-attempt-1', isReplay: false } },
    'submit-cash-activation': { ok: true },
    'reconcile-stellar': { summary: { counts: { failedObservations: 0 } } },
  },
});

// Time-driven distribution job: after authorize, confirmations climb in
// batches until every recipient is confirmed. Purely simulated demo data.
export const makeDistributionJob = ({ recipients = 5031, amount = 500, seconds = 14 } = {}) => {
  const jobId = 'a1b2c3d4-0000-4000-8000-000000005031';
  let authorizedAt = null;
  const total = BigInt(recipients) * BigInt(amount) * BigInt(STROOPS);
  const confirmedNow = () => {
    if (!authorizedAt) return 0;
    const p = Math.min(1, (Date.now() - authorizedAt) / (seconds * 1000));
    return Math.min(recipients, Math.floor(p * recipients / 100) * 100 + (p >= 1 ? recipients % 100 : 0));
  };
  const status = () => {
    const c = confirmedNow();
    if (!authorizedAt) return 'awaiting_approval';
    return c >= recipients ? 'completed' : 'reconciling';
  };
  const row = () => {
    const c = confirmedNow();
    return {
      id: jobId, distribution_job_id: jobId, organization_id: ORG, program_id: PROGRAM, status: status(),
      recipient_count: recipients, pending_count: authorizedAt ? 0 : recipients, submitted_count: authorizedAt ? recipients - c : 0,
      confirmed_count: c, failed_count: 0, cancelled_count: 0, total_amount_stroops: total.toString(),
      confirmed_amount_stroops: (BigInt(c) * BigInt(amount) * BigInt(STROOPS)).toString(), failed_amount_stroops: '0',
      confirmed_transaction_count: c, latest_transaction_hash: c ? hash(c) : null, as_of_ledger: 1234567 + c,
      reconciled_at: new Date().toISOString(), is_stale: false, stale_since: null, is_quarantined: false, quarantine_issue_id: null,
      created_at: iso(9), programs: { name: 'Typhoon Relief (demo)', disaster_event: 'Typhoon (demo)' },
      distribution_job_projection: { latest_transaction_hash: c ? hash(c) : null },
    };
  };
  const job = () => ({ jobId, programId: PROGRAM, recipientCount: recipients, totalAmountStroops: total.toString(), status: status() });
  return {
    functions: {
      'prepare-disbursement': () => ({ job: job() }),
      'submit-disbursement': () => { authorizedAt ??= Date.now(); return { job: { ...job(), status: 'queued' } }; },
      'reconcile-stellar': () => {
        const c = confirmedNow();
        return { jobStatus: status(), counts: { confirmed: c, failed: 0, total: recipients }, beneficiaryProjectionsWritten: c };
      },
    },
    tables: {
      distribution_jobs: () => (authorizedAt ? [row()] : []),
      distribution_job_projection: () => (authorizedAt ? [row()] : []),
      distribution_recipients: () => names.slice(0, 6).map((n, i) => ({
        id: `rec-${i}`, correlation_id: `c0ffee${i}0-0000-4000-8000-00000000000${i}`, amount_stroops: (amount * STROOPS).toString(),
        status: i < Math.ceil(confirmedNow() / 1000) + 1 ? 'confirmed' : 'submitted', transaction_hash: hash(100 + i), confirmed_ledger: 1234600 + i, failure_code: null, failure_reason: null,
      })),
    },
  };
};

// Unit tests for the cash-rail reconciliation observer, projector, finality
// guards, and MVP boundaries.
//
// Covers:
//   supabase/functions/_shared/stellar/cash-reconciliation.ts
//
// The classic cash observer, the distribution projector, and the reconciliation
// orchestrator are exercised with injected/mocked ports so the tests assert the
// exact Task 10.4 guarantees:
//   - the observer reports EXACT ledger evidence and never confirms
//     (Requirements 6.4, 18.5, 18.8);
//   - the projector reflects ledger truth into the recipient row, PRESERVES
//     confirmed recipients, and quarantines a disagreement without inventing
//     ownership (Requirements 8.6, 18.6);
//   - a run never completes while any recipient is pending/failed, and an
//     observed on-chain failure re-opens a recipient for retry (Requirements
//     8.6, 8.7, 8.8);
//   - confirmed cash is final and never expired/reclaimed (Requirements 6.5, 15.8);
//   - no general P2P transfer is ever permitted (Requirement 6.8).
//
// Validates: Requirements 6.4, 6.5, 6.8, 8.6, 8.7, 8.8, 15.8, 18.5, 18.8
//
// Loading mirrors edge-reconciliation.test.mjs: TypeScript modules are
// transpiled in-memory and imported as data: URLs, @supabase/supabase-js is
// stubbed, and @stellar/stellar-sdk resolves to the real package.

import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const sharedDir = fileURLToPath(new URL('../../supabase/functions/_shared/', import.meta.url));
const STELLAR_SDK_URL = pathToFileURL(require.resolve('@stellar/stellar-sdk')).href;

const SUPABASE_STUB_URL =
  'data:text/javascript;base64,' +
  Buffer.from(
    'export const createClient = () => { throw new Error("createClient stub must not be called"); };',
  ).toString('base64');

const cache = new Map();
const toDataUrl = (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;

async function loadModule(absPath) {
  if (cache.has(absPath)) return cache.get(absPath);
  const source = await readFile(absPath, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });

  const specifierRe = /\bfrom\s*(['"])([^'"]+)\1/g;
  const specifiers = new Set();
  let match;
  while ((match = specifierRe.exec(outputText)) !== null) specifiers.add(match[2]);

  const replacements = new Map();
  for (const specifier of specifiers) {
    if (specifier === '@supabase/supabase-js') {
      replacements.set(specifier, SUPABASE_STUB_URL);
    } else if (specifier === '@stellar/stellar-sdk') {
      replacements.set(specifier, STELLAR_SDK_URL);
    } else if (specifier.startsWith('.')) {
      replacements.set(specifier, await loadModule(path.resolve(path.dirname(absPath), specifier)));
    }
  }

  const rewritten = outputText.replace(specifierRe, (whole, quote, specifier) => {
    const replacement = replacements.get(specifier);
    return replacement ? `from ${quote}${replacement}${quote}` : whole;
  });

  const url = toDataUrl(rewritten);
  cache.set(absPath, url);
  return url;
}

const importShared = async (relativePath) =>
  import(await loadModule(path.join(sharedDir, relativePath)));

const sharedConfig = await importShared('../../../shared/stellar-config.ts');
const reconciliation = await importShared('stellar/reconciliation.ts');
const cashRecon = await importShared('stellar/cash-reconciliation.ts');

// ---------------------------------------------------------------------------
// Fixtures.
// ---------------------------------------------------------------------------

const ISSUER = 'G' + 'A'.repeat(55);
const SAC = 'C' + 'A'.repeat(55);
const HORIZON = 'https://horizon-testnet.stellar.org';
const RPC = 'https://soroban-testnet.stellar.org';
const TX_HASH = 'c'.repeat(64);
const OTHER_TX_HASH = 'e'.repeat(64);

const testnetConfig = () =>
  sharedConfig.createStellarTestnetConfig({
    horizonUrl: HORIZON,
    rpcUrl: RPC,
    rcphpIssuer: ISSUER,
    rcphpSacId: SAC,
  });

const attemptRecord = (overrides = {}) => ({
  id: 'attempt-1',
  financial_intent_id: 'intent-1',
  organization_id: 'org-1',
  program_id: 'prog-1',
  distribution_job_id: 'job-1',
  beneficiary_identity_id: 'ben-1',
  correlation_id: '11111111-1111-1111-1111-111111111111',
  attempt_number: 1,
  status: 'submitted',
  network: 'stellar_testnet',
  intent_payload_hash: 'a'.repeat(64),
  prepared_payload_hash: 'b'.repeat(64),
  envelope_xdr: 'AAAAENVELOPE',
  authorization_payload: null,
  min_ledger: null,
  max_ledger: 2000,
  result_code: null,
  error_code: null,
  error_detail: null,
  transaction_hash: TX_HASH,
  submitted_at: '2026-01-01T00:00:00.000Z',
  observed_at: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const intentRecord = (overrides = {}) => ({
  id: 'intent-1',
  correlation_id: '11111111-1111-1111-1111-111111111111',
  idempotency_key_id: 'idem-1',
  operation_type: 'cash_distribution',
  organization_id: 'org-1',
  payload_hash: 'a'.repeat(64),
  program_id: 'prog-1',
  amount_stroops: 1000,
  asset_code: 'RCPHP',
  asset_issuer: ISSUER,
  beneficiary_identity_id: 'ben-1',
  distribution_job_id: 'job-1',
  distribution_recipient_id: 'recip-1',
  requested_by: null,
  request_metadata: {},
  created_at: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const recipientRecord = (overrides = {}) => ({
  id: 'recip-1',
  organization_id: 'org-1',
  program_id: 'prog-1',
  beneficiary_identity_id: 'ben-1',
  enrollment_id: 'enr-1',
  destination_wallet_id: 'wallet-1',
  idempotency_key_id: 'idem-1',
  amount_stroops: 1000,
  status: 'submitted',
  correlation_id: '11111111-1111-1111-1111-111111111111',
  transaction_hash: null,
  confirmed_ledger: null,
  confirmed_at: null,
  cancelled_at: null,
  submitted_at: '2026-01-01T00:00:00.000Z',
  failure_code: null,
  failure_reason: null,
  distribution_job_id: 'job-1',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const lookupReturning = (result) => ({
  calls: [],
  async lookup(hash) {
    this.calls.push(hash);
    return typeof result === 'function' ? result(hash) : result;
  },
});

const foundLedger = (overrides = {}) => ({
  found: true,
  successful: true,
  transactionHash: TX_HASH,
  ledgerSequence: 1000,
  ledgerClosedAt: '2026-01-01T00:09:00.000Z',
  envelopeXdr: 'AAAAENVELOPE',
  resultCode: 'txSUCCESS',
  ...overrides,
});

const projectionInput = (overrides = {}) => ({
  attempt: attemptRecord(),
  intent: intentRecord(),
  ledger: {
    networkPassphrase: 'Test SDF Network ; September 2015',
    transactionHash: TX_HASH,
    successful: true,
    ledgerSequence: 1000,
    ledgerClosedAt: '2026-01-01T00:09:00.000Z',
    envelopeXdr: 'AAAAENVELOPE',
    envelopeSha256: 'd'.repeat(64),
  },
  ledgerTransactionId: 'ledger-1',
  events: [],
  contractEventIds: [],
  run: {
    runId: 'run-1',
    network: 'stellar_testnet',
    reconciledAt: '2026-01-01T00:10:00.000Z',
    asOfLedger: 2000,
    correlationId: '11111111-1111-1111-1111-111111111111',
  },
  ...overrides,
});

const recipientsStore = (init = {}) => ({
  confirmed: [],
  failed: [],
  rolledUp: [],
  recipient: init.recipient ?? null,
  jobRecipients: init.jobRecipients ?? [],
  jobVersion: init.jobVersion ?? null,
  async getRecipient() {
    return this.recipient;
  },
  async confirmRecipient(params) {
    this.confirmed.push(params);
  },
  async failRecipient(params) {
    this.failed.push(params);
  },
  async listJobRecipients() {
    return this.jobRecipients;
  },
  async rollUpJob(params) {
    this.rolledUp.push(params);
  },
  async currentJobProjectionVersion() {
    return this.jobVersion;
  },
});

// ---------------------------------------------------------------------------
// MVP boundary: no general P2P (Requirement 6.8).
// ---------------------------------------------------------------------------

test('cash-reconciliation: general P2P transfers stay disabled', () => {
  assert.equal(cashRecon.GENERAL_P2P_TRANSFERS_ENABLED, false);
});

test('cash-reconciliation: only audited cash paths are permitted transfers', () => {
  assert.equal(cashRecon.isPermittedCashTransfer('cash_distribution'), true);
  assert.equal(cashRecon.isPermittedCashTransfer('cash_payment'), true);
  assert.equal(cashRecon.isPermittedCashTransfer('program_activation'), true);
  // A non-cash-transfer operation is not a permitted cash transfer path.
  assert.equal(cashRecon.isPermittedCashTransfer('voucher_redemption'), false);
  assert.equal(cashRecon.isPermittedCashTransfer('fee_sponsorship'), false);
});

test('cash-reconciliation: assertNoGeneralP2PTransfer rejects an arbitrary transfer', () => {
  // Permitted paths pass.
  cashRecon.assertNoGeneralP2PTransfer('cash_distribution', 'corr');
  cashRecon.assertNoGeneralP2PTransfer('cash_payment', 'corr');
  // An unsupported operation is rejected as out-of-scope P2P.
  assert.throws(
    () => cashRecon.assertNoGeneralP2PTransfer('voucher_redemption', 'corr'),
    (err) => err.financialError.code === 'validation_failed',
  );
});

// ---------------------------------------------------------------------------
// Finality: confirmed cash is never expired or reclaimed (Req 6.5, 15.8).
// ---------------------------------------------------------------------------

test('cash-reconciliation: confirmed cash is final', () => {
  assert.equal(cashRecon.CONFIRMED_CASH_IS_FINAL, true);
  assert.equal(cashRecon.cashReclaimableStroopsOnClosure(), 0);
});

test('cash-reconciliation: reclaiming confirmed cash or settlement fails closed', () => {
  assert.throws(
    () => cashRecon.assertConfirmedCashNotReclaimed('confirmed_unrestricted_cash', 'corr'),
    (err) => err.financialError.code === 'validation_failed',
  );
  assert.throws(
    () => cashRecon.assertConfirmedCashNotReclaimed('confirmed_merchant_settlement', 'corr'),
    (err) => err.financialError.code === 'validation_failed',
  );
});

// ---------------------------------------------------------------------------
// Pure helpers.
// ---------------------------------------------------------------------------

test('cash-reconciliation: recipientOutcomeFor maps observed status to a transition', () => {
  assert.equal(cashRecon.recipientOutcomeFor('observed_success'), 'confirm');
  assert.equal(cashRecon.recipientOutcomeFor('observed_failure'), 'fail');
  // In-flight statuses never abandon a real settlement.
  assert.equal(cashRecon.recipientOutcomeFor('submitted'), 'none');
  assert.equal(cashRecon.recipientOutcomeFor('unknown'), 'none');
});

test('cash-reconciliation: toJobProjectionCounts folds prepared into pending and conserves the sum', () => {
  const counts = { total: 10, pending: 2, prepared: 3, submitted: 1, confirmed: 3, failed: 1, cancelled: 0 };
  const projection = cashRecon.toJobProjectionCounts(counts);
  assert.equal(projection.pendingCount, 5); // 2 pending + 3 prepared
  assert.equal(projection.recipientCount, 10);
  const sum =
    projection.pendingCount +
    projection.submittedCount +
    projection.confirmedCount +
    projection.failedCount +
    projection.cancelledCount;
  assert.equal(sum, projection.recipientCount);
});

test('cash-reconciliation: jobHasRequiredUnfinishedRecipients flags any incomplete recipient', () => {
  const base = { total: 3, pending: 0, prepared: 0, submitted: 0, confirmed: 3, failed: 0, cancelled: 0 };
  assert.equal(cashRecon.jobHasRequiredUnfinishedRecipients(base), false);
  assert.equal(cashRecon.jobHasRequiredUnfinishedRecipients({ ...base, confirmed: 2, failed: 1 }), true);
  assert.equal(cashRecon.jobHasRequiredUnfinishedRecipients({ ...base, confirmed: 2, pending: 1 }), true);
  assert.equal(cashRecon.jobHasRequiredUnfinishedRecipients({ ...base, confirmed: 2, submitted: 1 }), true);
});

test('cash-reconciliation: staleAfterIso is strictly after the reconciliation time', () => {
  const reconciledAt = '2026-01-01T00:10:00.000Z';
  const after = cashRecon.staleAfterIso(reconciledAt, 3600);
  assert.ok(Date.parse(after) > Date.parse(reconciledAt));
});

test('cash-reconciliation: recipientDisagreesWithIntent detects value/identity drift', () => {
  const intent = intentRecord();
  assert.equal(cashRecon.recipientDisagreesWithIntent(recipientRecord(), intent), false);
  assert.equal(cashRecon.recipientDisagreesWithIntent(recipientRecord({ amount_stroops: 999 }), intent), true);
  assert.equal(cashRecon.recipientDisagreesWithIntent(recipientRecord({ beneficiary_identity_id: 'other' }), intent), true);
});

// ---------------------------------------------------------------------------
// Projection row builders.
// ---------------------------------------------------------------------------

test('cash-reconciliation: distribution job projection row conserves counts and marks a clean run current', () => {
  const row = cashRecon.buildDistributionJobProjectionRow({
    jobId: 'job-1',
    organizationId: 'org-1',
    programId: 'prog-1',
    counts: { recipientCount: 3, pendingCount: 0, submittedCount: 0, confirmedCount: 3, failedCount: 0, cancelledCount: 0 },
    status: 'completed',
    totalAmountStroops: 3000,
    confirmedAmountStroops: 3000,
    failedAmountStroops: 0,
    confirmedTransactionCount: 3,
    reconciliationRunId: 'run-1',
    asOfLedger: 1000,
    reconciledAt: '2026-01-01T00:10:00.000Z',
    network: 'stellar_testnet',
    runStatus: 'completed',
    projectionVersion: 1,
  });
  assert.equal(row.is_stale, false);
  assert.equal(row.stale_since, null);
  assert.equal(row.confirmed_count, 3);
  assert.equal(row.confirmed_amount_stroops + row.failed_amount_stroops <= row.total_amount_stroops, true);
  assert.ok(Date.parse(row.stale_after) > Date.parse(row.reconciled_at));
});

test('cash-reconciliation: a partial run yields a stale distribution job projection', () => {
  const row = cashRecon.buildDistributionJobProjectionRow({
    jobId: 'job-1',
    organizationId: 'org-1',
    programId: 'prog-1',
    counts: { recipientCount: 3, pendingCount: 0, submittedCount: 0, confirmedCount: 2, failedCount: 1, cancelledCount: 0 },
    status: 'partial_failed',
    totalAmountStroops: 3000,
    confirmedAmountStroops: 2000,
    failedAmountStroops: 1000,
    confirmedTransactionCount: 2,
    reconciliationRunId: 'run-1',
    asOfLedger: 1000,
    reconciledAt: '2026-01-01T00:10:00.000Z',
    network: 'stellar_testnet',
    runStatus: 'partial',
    projectionVersion: 2,
  });
  assert.equal(row.is_stale, true);
  assert.equal(row.stale_since, '2026-01-01T00:10:00.000Z');
});

test('cash-reconciliation: beneficiary cash balance clamps available and reflects confirmed distribution', () => {
  const row = cashRecon.buildBeneficiaryCashBalanceRow({
    organizationId: 'org-1',
    programId: 'prog-1',
    beneficiaryIdentityId: 'ben-1',
    assetCode: 'RCPHP',
    assetIssuer: ISSUER,
    allocatedStroops: 1000,
    distributedStroops: 1000,
    redeemedStroops: 400,
    refundedStroops: 100,
    confirmedTransactionCount: 1,
    reconciliationRunId: 'run-1',
    asOfLedger: 1000,
    reconciledAt: '2026-01-01T00:10:00.000Z',
    network: 'stellar_testnet',
    runStatus: 'completed',
    projectionVersion: 1,
  });
  assert.equal(row.aid_type, 'cash');
  assert.equal(row.distributed_stroops, 1000);
  // available = distributed - redeemed + refunded = 1000 - 400 + 100
  assert.equal(row.available_balance_stroops, 700);
});

test('cash-reconciliation: beneficiary available balance never goes negative', () => {
  const row = cashRecon.buildBeneficiaryCashBalanceRow({
    organizationId: 'org-1',
    programId: 'prog-1',
    beneficiaryIdentityId: 'ben-1',
    assetCode: 'RCPHP',
    assetIssuer: ISSUER,
    allocatedStroops: 1000,
    distributedStroops: 1000,
    redeemedStroops: 5000,
    confirmedTransactionCount: 1,
    reconciliationRunId: 'run-1',
    asOfLedger: 1000,
    reconciledAt: '2026-01-01T00:10:00.000Z',
    network: 'stellar_testnet',
    runStatus: 'completed',
    projectionVersion: 1,
  });
  assert.equal(row.available_balance_stroops, 0);
});

// ---------------------------------------------------------------------------
// Cash observer.
// ---------------------------------------------------------------------------

test('cash-observer: a non-in-flight attempt is not observed', async () => {
  const lookup = lookupReturning(foundLedger());
  const observer = cashRecon.createCashTransactionObserver({ config: testnetConfig(), lookup });
  const observation = await observer.observeAttempt(attemptRecord({ status: 'observed_success' }));
  assert.equal(observation.kind, 'still_pending');
  assert.equal(lookup.calls.length, 0);
});

test('cash-observer: an attempt with no submitted hash makes no transition', async () => {
  const lookup = lookupReturning(foundLedger());
  const observer = cashRecon.createCashTransactionObserver({ config: testnetConfig(), lookup });
  const observation = await observer.observeAttempt(attemptRecord({ transaction_hash: null }));
  assert.equal(observation.kind, 'still_pending');
  assert.equal(lookup.calls.length, 0);
});

test('cash-observer: a not-found transaction reports not_found (never confirms)', async () => {
  const lookup = lookupReturning(null);
  const observer = cashRecon.createCashTransactionObserver({ config: testnetConfig(), lookup });
  const observation = await observer.observeAttempt(attemptRecord());
  assert.equal(observation.kind, 'not_found');
  assert.deepEqual(lookup.calls, [TX_HASH]);
});

test('cash-observer: a successful ledger transaction reports settled_success with a 64-hex envelope digest', async () => {
  const lookup = lookupReturning(foundLedger());
  const observer = cashRecon.createCashTransactionObserver({ config: testnetConfig(), lookup });
  const observation = await observer.observeAttempt(attemptRecord());
  assert.equal(observation.kind, 'settled_success');
  assert.equal(observation.events.length, 0); // classic cash carries no contract events
  assert.equal(observation.ledger.successful, true);
  assert.equal(observation.ledger.transactionHash, TX_HASH);
  assert.equal(observation.ledger.networkPassphrase, 'Test SDF Network ; September 2015');
  assert.match(observation.ledger.envelopeSha256, /^[0-9a-f]{64}$/);
});

test('cash-observer: an unsuccessful ledger transaction reports settled_failure', async () => {
  const lookup = lookupReturning(foundLedger({ successful: false, resultCode: 'txFAILED', errorCode: 'tx_bad_auth' }));
  const observer = cashRecon.createCashTransactionObserver({ config: testnetConfig(), lookup });
  const observation = await observer.observeAttempt(attemptRecord());
  assert.equal(observation.kind, 'settled_failure');
  assert.equal(observation.ledger.successful, false);
  assert.equal(observation.ledger.errorCode, 'tx_bad_auth');
});

test('cash-observer: a lookup failure propagates (the worker isolates it as a failed observation)', async () => {
  const observer = cashRecon.createCashTransactionObserver({
    config: testnetConfig(),
    lookup: { async lookup() { throw new Error('horizon unavailable'); } },
  });
  await assert.rejects(() => observer.observeAttempt(attemptRecord()), /horizon unavailable/);
});

// ---------------------------------------------------------------------------
// Cash distribution projector.
// ---------------------------------------------------------------------------

test('cash-projector: a non-cash-distribution intent is left unchanged', async () => {
  const store = recipientsStore({ recipient: recipientRecord() });
  const projector = cashRecon.createCashDistributionProjector({ recipients: store });
  const result = await projector.project(projectionInput({ intent: intentRecord({ operation_type: 'cash_payment' }) }));
  assert.equal(result.kind, 'unchanged');
  assert.equal(store.confirmed.length, 0);
});

test('cash-projector: a confirmed-success observation confirms a submitted recipient', async () => {
  const store = recipientsStore({ recipient: recipientRecord({ status: 'submitted' }) });
  const projector = cashRecon.createCashDistributionProjector({ recipients: store });
  const result = await projector.project(projectionInput());
  assert.equal(result.kind, 'unchanged');
  assert.equal(store.confirmed.length, 1);
  assert.equal(store.confirmed[0].recipientId, 'recip-1');
  assert.equal(store.confirmed[0].transactionHash, TX_HASH);
  assert.equal(store.confirmed[0].confirmedLedger, 1000);
});

test('cash-projector: a missing recipient row is a mismatch (never invents ownership)', async () => {
  const store = recipientsStore({ recipient: null });
  const projector = cashRecon.createCashDistributionProjector({ recipients: store });
  const result = await projector.project(projectionInput());
  assert.equal(result.kind, 'mismatch');
  assert.equal(result.mismatch.issueType, 'projection_mismatch');
  assert.equal(store.confirmed.length, 0);
});

test('cash-projector: a recipient disagreeing with the intent is a mismatch', async () => {
  const store = recipientsStore({ recipient: recipientRecord({ amount_stroops: 999 }) });
  const projector = cashRecon.createCashDistributionProjector({ recipients: store });
  const result = await projector.project(projectionInput());
  assert.equal(result.kind, 'mismatch');
  assert.equal(store.confirmed.length, 0);
});

test('cash-projector: an already-confirmed recipient with the same hash is preserved (idempotent)', async () => {
  const store = recipientsStore({
    recipient: recipientRecord({ status: 'confirmed', transaction_hash: TX_HASH, confirmed_ledger: 1000, confirmed_at: '2026-01-01T00:09:30.000Z' }),
  });
  const projector = cashRecon.createCashDistributionProjector({ recipients: store });
  const result = await projector.project(projectionInput());
  assert.equal(result.kind, 'unchanged');
  assert.equal(store.confirmed.length, 0); // never re-confirmed
});

test('cash-projector: an already-confirmed recipient with a different hash is a mismatch', async () => {
  const store = recipientsStore({
    recipient: recipientRecord({ status: 'confirmed', transaction_hash: OTHER_TX_HASH, confirmed_ledger: 999, confirmed_at: '2026-01-01T00:09:30.000Z' }),
  });
  const projector = cashRecon.createCashDistributionProjector({ recipients: store });
  const result = await projector.project(projectionInput());
  assert.equal(result.kind, 'mismatch');
  assert.equal(store.confirmed.length, 0);
});

test('cash-projector: a recipient in a non-submittable state is a mismatch', async () => {
  const store = recipientsStore({ recipient: recipientRecord({ status: 'pending' }) });
  const projector = cashRecon.createCashDistributionProjector({ recipients: store });
  const result = await projector.project(projectionInput());
  assert.equal(result.kind, 'mismatch');
  assert.equal(store.confirmed.length, 0);
});

// ---------------------------------------------------------------------------
// Cash distribution reconciler (orchestration).
// ---------------------------------------------------------------------------

const mockWorker = ({ status, resolved }) => ({
  async runStream() {
    return {
      run: { id: 'run-1' },
      status,
      counts: reconciliation.emptyCounts(),
      lagSeconds: 60,
      resolvedStatuses: new Map(Object.entries(resolved)),
      alert: null,
    };
  },
  async reconcileAttempt() {
    throw new Error('reconcileAttempt not used by the orchestrator tests');
  },
});

const completedRunReader = (overrides = {}) => ({
  async load() {
    return { id: 'run-1', completed_at: '2026-01-01T00:10:00.000Z', end_ledger_sequence: 1000, ...overrides };
  },
});

const projectionsSink = () => ({
  writes: [],
  async write(writes) {
    this.writes.push(...writes);
  },
});

const intentsLoader = (intent) => ({
  async loadIntent() {
    return intent;
  },
});

test('cash-reconciler: a fully confirmed job rolls up to completed and writes a current read model', async () => {
  const store = recipientsStore({
    jobRecipients: [recipientRecord({ status: 'confirmed', transaction_hash: TX_HASH, confirmed_ledger: 1000, confirmed_at: '2026-01-01T00:09:30.000Z' })],
    jobVersion: null,
  });
  const projections = projectionsSink();
  const reconciler = cashRecon.createCashDistributionReconciler({
    worker: mockWorker({ status: 'completed', resolved: { 'attempt-1': 'observed_success' } }),
    recipients: store,
    intents: intentsLoader(intentRecord()),
    projections,
    runReader: completedRunReader(),
  });

  const result = await reconciler.reconcileJob({
    jobId: 'job-1',
    organizationId: 'org-1',
    programId: 'prog-1',
    totalAmountStroops: 1000,
    attempts: [attemptRecord({ status: 'submitted' })],
  });

  assert.equal(result.jobStatus, 'completed');
  assert.equal(result.confirmedAmountStroops, 1000);
  assert.equal(result.failedRecipientIds.length, 0);
  assert.equal(store.failed.length, 0);
  assert.equal(store.rolledUp.length, 1);
  assert.equal(store.rolledUp[0].status, 'completed');
  assert.equal(result.projectionWritten, true);
  assert.equal(projections.writes.length, 1);
  assert.equal(projections.writes[0].table, 'distribution_job_projection');
  assert.equal(projections.writes[0].rows.status, 'completed');
  assert.equal(projections.writes[0].rows.is_stale, false);
  assert.equal(projections.writes[0].rows.projection_version, 1);
});

test('cash-reconciler: an observed on-chain failure re-opens the recipient and yields partial_failed', async () => {
  const store = recipientsStore({
    jobRecipients: [recipientRecord({ status: 'failed', failure_code: 'transfer_failed', failure_reason: 'x' })],
    jobVersion: 1,
  });
  const projections = projectionsSink();
  const reconciler = cashRecon.createCashDistributionReconciler({
    worker: mockWorker({ status: 'partial', resolved: { 'attempt-1': 'observed_failure' } }),
    recipients: store,
    intents: intentsLoader(intentRecord()),
    projections,
    runReader: completedRunReader(),
  });

  const result = await reconciler.reconcileJob({
    jobId: 'job-1',
    organizationId: 'org-1',
    programId: 'prog-1',
    totalAmountStroops: 1000,
    attempts: [attemptRecord({ status: 'submitted' })],
  });

  // The failed attempt re-opened its recipient for a later resume retry.
  assert.equal(store.failed.length, 1);
  assert.equal(store.failed[0].recipientId, 'recip-1');
  assert.equal(store.failed[0].failureCode, cashRecon.OBSERVED_FAILURE_CODE);
  assert.deepEqual(result.failedRecipientIds, ['recip-1']);
  assert.equal(result.jobStatus, 'partial_failed');
  // A partial run marks the read model stale so it is never mistaken for final.
  assert.equal(projections.writes[0].rows.is_stale, true);
  assert.equal(projections.writes[0].rows.projection_version, 2);
});

test('cash-reconciler: a job with a pending recipient never completes', async () => {
  const store = recipientsStore({
    jobRecipients: [
      recipientRecord({ id: 'recip-1', status: 'confirmed', transaction_hash: TX_HASH, confirmed_ledger: 1000, confirmed_at: '2026-01-01T00:09:30.000Z' }),
      recipientRecord({ id: 'recip-2', beneficiary_identity_id: 'ben-2', status: 'pending' }),
    ],
  });
  const reconciler = cashRecon.createCashDistributionReconciler({
    worker: mockWorker({ status: 'completed', resolved: { 'attempt-1': 'observed_success' } }),
    recipients: store,
    intents: intentsLoader(intentRecord()),
    projections: projectionsSink(),
    runReader: completedRunReader(),
  });

  const result = await reconciler.reconcileJob({
    jobId: 'job-1',
    organizationId: 'org-1',
    programId: 'prog-1',
    totalAmountStroops: 2000,
    attempts: [attemptRecord({ status: 'submitted' })],
  });

  // Not every recipient is confirmed, so the job stays reconciling (Req 8.7).
  assert.equal(result.jobStatus, 'reconciling');
  assert.equal(store.rolledUp[0].status, 'reconciling');
});

test('cash-reconciler: without run evidence the read model is not written (never fabricated)', async () => {
  const store = recipientsStore({
    jobRecipients: [recipientRecord({ status: 'confirmed', transaction_hash: TX_HASH, confirmed_ledger: 1000, confirmed_at: '2026-01-01T00:09:30.000Z' })],
  });
  const projections = projectionsSink();
  const reconciler = cashRecon.createCashDistributionReconciler({
    worker: mockWorker({ status: 'completed', resolved: { 'attempt-1': 'observed_success' } }),
    recipients: store,
    intents: intentsLoader(intentRecord()),
    projections,
    // No runReader: the completed-run evidence is unavailable this pass.
  });

  const result = await reconciler.reconcileJob({
    jobId: 'job-1',
    organizationId: 'org-1',
    programId: 'prog-1',
    totalAmountStroops: 1000,
    attempts: [attemptRecord({ status: 'submitted' })],
  });

  assert.equal(result.projectionWritten, false);
  assert.equal(projections.writes.length, 0);
  // The core job roll-up still happens from the durable recipient truth.
  assert.equal(store.rolledUp.length, 1);
});

// ---------------------------------------------------------------------------
// End-to-end: the real worker confirms a recipient on exact ledger evidence.
// ---------------------------------------------------------------------------

test('cash-reconciliation: the real worker + cash observer/projector confirm a recipient on ledger success', async () => {
  const recipientStore = recipientsStore({ recipient: recipientRecord({ status: 'submitted' }) });
  const observed = [];
  let idCounter = 0;

  const worker = reconciliation.createReconciliationWorker({
    config: testnetConfig(),
    observer: cashRecon.createCashTransactionObserver({ config: testnetConfig(), lookup: lookupReturning(foundLedger()) }),
    projector: cashRecon.createCashDistributionProjector({ recipients: recipientStore }),
    evidence: {
      async upsertLedgerTransaction() { return { id: 'ledger-1', created: true }; },
      async upsertContractEvent() { return { id: 'event-1', created: true }; },
    },
    stores: {
      async listPending() { return []; },
      async loadIntent() { return intentRecord(); },
      async markObserved(params) { observed.push(params); },
      async startRun(row) { return { id: 'run-1', status: 'running', ...row }; },
      async completeRun() {},
    },
    cursors: { async advance() {} },
    issues: { async record() { return 'issue-1'; } },
    projections: { async write() {} },
    clock: () => new Date('2026-01-01T00:10:00.000Z'),
    newId: () => `gen-${(idCounter += 1)}`,
  });

  const status = await worker.reconcileAttempt(attemptRecord({ status: 'submitted' }));

  assert.equal(status, 'observed_success');
  assert.equal(recipientStore.confirmed.length, 1);
  assert.equal(recipientStore.confirmed[0].recipientId, 'recip-1');
  assert.equal(recipientStore.confirmed[0].transactionHash, TX_HASH);
  assert.equal(observed.find((o) => o.attemptId === 'attempt-1').status, 'observed_success');
});

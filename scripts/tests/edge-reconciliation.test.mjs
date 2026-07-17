// Unit tests for the shared reconciliation worker and projection writer.
//
// Covers the invariant and orchestration logic of:
//   supabase/functions/_shared/stellar/reconciliation.ts
//
// The rail-specific observer and projector, plus every persistence port, are
// mocked, so the tests assert exactly the invariants the worker itself owns:
//   - only exact, successful, configured-network evidence for the exact attempt
//     reaches `observed_success` (a submission / wrong network / wrong hash never
//     confirms — design Property 4 / Requirements 18.1, 18.8);
//   - observed transactions/events append (deduplicated) and the attempt
//     transitions; a never-landed submission becomes `unknown`;
//   - a projection mismatch is quarantined with a recorded issue and never
//     invents ownership (Requirement 18.6);
//   - the cursor advances, the run is recorded with lag/counts, and health/lag
//     alerts fire (Requirements 18.5, 22.5, 22.6);
//   - one attempt's observation failure never blocks the rest of the run.
//
// Validates: Requirements 18.1, 18.5, 18.6, 18.7, 18.8, 22.5, 22.6
//
// Loading mirrors edge-protocol.test.mjs: TypeScript modules are transpiled
// in-memory and imported as data: URLs, @supabase/supabase-js is stubbed
// (clients are injected), and @stellar/stellar-sdk resolves to the real package.

import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
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

// ---------------------------------------------------------------------------
// Fixtures.
// ---------------------------------------------------------------------------

const ISSUER = 'G' + 'A'.repeat(55);
const SAC = 'C' + 'A'.repeat(55);
const CONTRACT_ID = 'C' + 'B'.repeat(55);
const HORIZON = 'https://horizon-testnet.stellar.org';
const RPC = 'https://soroban-testnet.stellar.org';
const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';
const OTHER_PASSPHRASE = 'Public Global Stellar Network ; September 2015';
const TX_HASH = 'c'.repeat(64);
const OTHER_TX_HASH = 'e'.repeat(64);
const ENVELOPE_SHA = 'd'.repeat(64);
const EVENT_SHA = 'f'.repeat(64);

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
  distribution_job_id: null,
  beneficiary_identity_id: null,
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

const observedLedger = (overrides = {}) => ({
  networkPassphrase: TESTNET_PASSPHRASE,
  transactionHash: TX_HASH,
  successful: true,
  ledgerSequence: 1000,
  ledgerClosedAt: '2026-01-01T00:09:00.000Z',
  envelopeXdr: 'AAAAENVELOPE',
  envelopeSha256: ENVELOPE_SHA,
  resultCode: 'txSUCCESS',
  ...overrides,
});

const observedEvent = (overrides = {}) => ({
  contractId: CONTRACT_ID,
  ledgerSequence: 1000,
  eventIndex: 0,
  eventType: 'redeemed',
  eventTopics: ['redeemed'],
  eventPayload: { amount: '1000' },
  eventXdr: 'AAAAEVENT',
  eventSha256: EVENT_SHA,
  ...overrides,
});

// Ports.
const observerReturning = (observation) => ({
  calls: 0,
  async observeAttempt() {
    this.calls += 1;
    return observation;
  },
});

const observerThrowing = (error) => ({
  calls: 0,
  async observeAttempt() {
    this.calls += 1;
    throw error;
  },
});

const projectorReturning = (result) => ({
  calls: [],
  async project(input) {
    this.calls.push(input);
    return result;
  },
});

const makeEvidence = () => {
  const ledgers = [];
  const events = [];
  return {
    ledgers,
    events,
    ledgerExists: false,
    async upsertLedgerTransaction(insert) {
      ledgers.push(insert);
      return { id: 'ledger-1', created: !this.ledgerExists };
    },
    async upsertContractEvent(insert) {
      events.push(insert);
      return { id: `event-${events.length}`, created: true };
    },
  };
};

const runRecord = (row) => ({
  id: row.id ?? 'run-1',
  stream_name: row.stream_name,
  network: row.network ?? 'stellar_testnet',
  status: 'running',
  started_at: row.started_at ?? '2026-01-01T00:10:00.000Z',
  completed_at: null,
  organization_id: row.organization_id ?? null,
  program_id: row.program_id ?? null,
  cursor_before: row.cursor_before ?? null,
  cursor_after: null,
  start_ledger_sequence: null,
  end_ledger_sequence: null,
  observed_transaction_count: 0,
  observed_event_count: 0,
  confirmed_intent_count: 0,
  failed_intent_count: 0,
  mismatch_count: 0,
  quarantined_count: 0,
  reconciliation_lag_seconds: null,
  error_code: null,
  error_message: null,
  error_details: {},
  correlation_id: row.correlation_id,
});

const makeStores = (init = {}) => {
  const observed = [];
  const runsStarted = [];
  const runsCompleted = [];
  return {
    observed,
    runsStarted,
    runsCompleted,
    async listPending() {
      return [...(init.pending ?? [])];
    },
    async loadIntent() {
      return init.intent ?? null;
    },
    async markObserved(params) {
      observed.push(params);
    },
    async startRun(row) {
      const record = runRecord(row);
      runsStarted.push(record);
      return record;
    },
    async completeRun(params) {
      runsCompleted.push(params);
    },
  };
};

const makeCursors = () => ({
  calls: [],
  async advance(params) {
    this.calls.push(params);
  },
});

const makeIssues = (id = 'issue-1') => ({
  calls: [],
  async record(params) {
    this.calls.push(params);
    return id;
  },
});

const makeProjections = () => ({
  writes: [],
  async write(writes) {
    this.writes.push(...writes);
  },
});

const makeAlerts = () => ({
  emitted: [],
  emit(alert) {
    this.emitted.push(alert);
  },
});

let idCounter = 0;
const worker = (over = {}) =>
  reconciliation.createReconciliationWorker({
    config: testnetConfig(),
    observer: over.observer ?? observerReturning({ kind: 'still_pending' }),
    projector: over.projector ?? projectorReturning({ kind: 'unchanged' }),
    evidence: over.evidence ?? makeEvidence(),
    stores: over.stores ?? makeStores(),
    cursors: over.cursors ?? makeCursors(),
    issues: over.issues ?? makeIssues(),
    projections: over.projections ?? makeProjections(),
    alerts: over.alerts,
    clock: () => new Date('2026-01-01T00:10:00.000Z'),
    newId: () => `gen-${(idCounter += 1)}`,
  });

// ---------------------------------------------------------------------------
// Pure helpers.
// ---------------------------------------------------------------------------

test('reconciliation: dispositionFor never confirms without settled success', () => {
  assert.equal(reconciliation.dispositionFor({ kind: 'settled_success', ledger: {}, events: [] }, 'submitted'), 'observed_success');
  assert.equal(reconciliation.dispositionFor({ kind: 'settled_failure', ledger: {} }, 'submitted'), 'observed_failure');
  assert.equal(reconciliation.dispositionFor({ kind: 'still_pending' }, 'submitted'), 'pending');
  assert.equal(reconciliation.dispositionFor({ kind: 'not_found' }, 'submitted'), 'unknown');
  // A not-found already-unknown attempt makes no transition.
  assert.equal(reconciliation.dispositionFor({ kind: 'not_found' }, 'unknown'), 'pending');
});

test('reconciliation: computeLagSeconds handles null, normal, skew, and invalid', () => {
  const now = new Date('2026-01-01T00:10:00.000Z');
  assert.equal(reconciliation.computeLagSeconds(null, now), null);
  assert.equal(reconciliation.computeLagSeconds('2026-01-01T00:09:00.000Z', now), 60);
  // Future close (clock skew) clamps to zero rather than going negative.
  assert.equal(reconciliation.computeLagSeconds('2026-01-01T00:11:00.000Z', now), 0);
  assert.equal(reconciliation.computeLagSeconds('not-a-date', now), null);
});

test('reconciliation: classifyRunHealth is completed only when clean', () => {
  const clean = reconciliation.classifyRunHealth(reconciliation.emptyCounts(), { lagSeconds: 10, maxLagSeconds: 300 });
  assert.equal(clean.status, 'completed');
  assert.equal(clean.alert, null);
});

test('reconciliation: classifyRunHealth degrades and alerts on mismatch', () => {
  const counts = { ...reconciliation.emptyCounts(), mismatches: 1, quarantined: 1 };
  const health = reconciliation.classifyRunHealth(counts, { lagSeconds: 10, maxLagSeconds: 300 });
  assert.equal(health.status, 'partial');
  assert.equal(health.alert.severity, 'critical');
  assert.ok(health.alert.reasons.includes('projection_mismatch'));
  assert.ok(health.alert.reasons.includes('projection_quarantined'));
});

test('reconciliation: classifyRunHealth raises a lag warning without degrading counts', () => {
  const health = reconciliation.classifyRunHealth(reconciliation.emptyCounts(), { lagSeconds: 400, maxLagSeconds: 300 });
  assert.equal(health.status, 'completed');
  assert.equal(health.alert.severity, 'warning');
  assert.deepEqual(health.alert.reasons, ['reconciliation_lag']);
});

test('reconciliation: classifyRunHealth flags a failed observation as partial', () => {
  const counts = { ...reconciliation.emptyCounts(), failedObservations: 1 };
  const health = reconciliation.classifyRunHealth(counts, { lagSeconds: 0, maxLagSeconds: 300 });
  assert.equal(health.status, 'partial');
  assert.equal(health.alert.severity, 'warning');
  assert.deepEqual(health.alert.reasons, ['observation_failure']);
});

test('reconciliation: stableStringify sorts object keys deterministically', () => {
  assert.equal(reconciliation.stableStringify({ b: 1, a: 2 }), '{"a":2,"b":1}');
  assert.equal(reconciliation.stableStringify([{ z: 1, a: 2 }]), '[{"a":2,"z":1}]');
});

test('reconciliation: computeMismatchFingerprint is deterministic 64-hex', async () => {
  const input = {
    network: 'stellar_testnet',
    issueType: 'balance_mismatch',
    subjectType: 'beneficiary',
    subjectIdentifier: 'ben-1',
    expectedState: { a: 1 },
    observedState: { a: 2 },
  };
  const one = await reconciliation.computeMismatchFingerprint(input);
  const two = await reconciliation.computeMismatchFingerprint({ ...input });
  assert.match(one, /^[0-9a-f]{64}$/);
  assert.equal(one, two);
  const different = await reconciliation.computeMismatchFingerprint({ ...input, subjectIdentifier: 'ben-2' });
  assert.notEqual(one, different);
});

test('reconciliation: buildLedgerTransactionInsert keeps a success error-free', () => {
  const row = reconciliation.buildLedgerTransactionInsert(attemptRecord(), observedLedger(), 'ledger-1', 'corr');
  assert.equal(row.successful, true);
  assert.equal(row.error_code, null);
  assert.equal(row.transaction_attempt_id, 'attempt-1');
  assert.equal(row.transaction_hash, TX_HASH);
});

test('reconciliation: buildLedgerTransactionInsert defaults an error code on failure', () => {
  const row = reconciliation.buildLedgerTransactionInsert(
    attemptRecord(),
    observedLedger({ successful: false, resultCode: 'txFAILED', errorCode: null }),
    'ledger-1',
    'corr',
  );
  assert.equal(row.successful, false);
  assert.equal(row.error_code, 'tx_failed');
});

test('reconciliation: buildLedgerTransactionInsert rejects a non-hex hash', () => {
  assert.throws(
    () => reconciliation.buildLedgerTransactionInsert(attemptRecord(), observedLedger({ transactionHash: 'nope' }), 'l', 'c'),
    (err) => err.financialError.code === 'reconciliation_failed',
  );
});

test('reconciliation: buildContractEventInsert rejects a bad contract id or type', () => {
  assert.throws(
    () => reconciliation.buildContractEventInsert(attemptRecord(), observedLedger(), observedEvent({ contractId: 'X' }), 'l', 'e', 'c'),
    (err) => err.financialError.code === 'reconciliation_failed',
  );
  assert.throws(
    () => reconciliation.buildContractEventInsert(attemptRecord(), observedLedger(), observedEvent({ eventType: 'Bad Type' }), 'l', 'e', 'c'),
    (err) => err.financialError.code === 'reconciliation_failed',
  );
});

// ---------------------------------------------------------------------------
// Worker — confirmation integrity.
// ---------------------------------------------------------------------------

test('reconciliation: reconcileAttempt confirms only on exact successful testnet evidence', async () => {
  const evidence = makeEvidence();
  const stores = makeStores();
  const status = await worker({
    observer: observerReturning({ kind: 'settled_success', ledger: observedLedger(), events: [] }),
    evidence,
    stores,
  }).reconcileAttempt(attemptRecord());

  assert.equal(status, 'observed_success');
  assert.equal(evidence.ledgers.length, 1);
  assert.equal(evidence.ledgers[0].successful, true);
  const marked = stores.observed.find((o) => o.attemptId === 'attempt-1');
  assert.equal(marked.status, 'observed_success');
});

test('reconciliation: reconcileAttempt refuses to confirm foreign-network evidence', async () => {
  const evidence = makeEvidence();
  const stores = makeStores();
  const status = await worker({
    observer: observerReturning({
      kind: 'settled_success',
      ledger: observedLedger({ networkPassphrase: OTHER_PASSPHRASE }),
      events: [],
    }),
    evidence,
    stores,
  }).reconcileAttempt(attemptRecord());

  // Wrong network is caught per attempt: no ledger appended, no confirmation.
  assert.equal(status, 'submitted');
  assert.equal(evidence.ledgers.length, 0);
  assert.equal(stores.observed.length, 0);
  // The run records the failed observation.
  assert.equal(stores.runsCompleted[0].status, 'partial');
  assert.equal(stores.runsCompleted[0].counts.failedObservations, 1);
});

test('reconciliation: reconcileAttempt raises an issue and refuses a mismatched hash', async () => {
  const issues = makeIssues();
  const stores = makeStores();
  const status = await worker({
    observer: observerReturning({
      kind: 'settled_success',
      ledger: observedLedger({ transactionHash: OTHER_TX_HASH }),
      events: [],
    }),
    issues,
    stores,
  }).reconcileAttempt(attemptRecord());

  assert.equal(status, 'submitted');
  assert.equal(issues.calls.length, 1);
  assert.equal(issues.calls[0].issueType, 'transaction_mismatch');
  assert.equal(stores.observed.length, 0);
});

test('reconciliation: reconcileAttempt records observed_failure with ledger evidence', async () => {
  const evidence = makeEvidence();
  const stores = makeStores();
  const status = await worker({
    observer: observerReturning({
      kind: 'settled_failure',
      ledger: observedLedger({ successful: false, resultCode: 'txFAILED', errorCode: 'tx_bad_seq' }),
    }),
    evidence,
    stores,
  }).reconcileAttempt(attemptRecord());

  assert.equal(status, 'observed_failure');
  assert.equal(evidence.ledgers[0].successful, false);
  assert.equal(stores.observed[0].status, 'observed_failure');
  assert.equal(stores.observed[0].errorCode, 'tx_bad_seq');
});

test('reconciliation: a never-landed submission becomes unknown, not confirmed', async () => {
  const stores = makeStores();
  const status = await worker({ observer: observerReturning({ kind: 'not_found' }), stores }).reconcileAttempt(attemptRecord());
  assert.equal(status, 'unknown');
  assert.equal(stores.observed[0].status, 'unknown');
});

test('reconciliation: a still-pending submission makes no transition', async () => {
  const stores = makeStores();
  const status = await worker({ observer: observerReturning({ kind: 'still_pending' }), stores }).reconcileAttempt(attemptRecord());
  assert.equal(status, 'submitted');
  assert.equal(stores.observed.length, 0);
});

test('reconciliation: an already-terminal attempt is a no-op (never re-observed)', async () => {
  const observer = observerReturning({ kind: 'settled_success', ledger: observedLedger(), events: [] });
  const status = await worker({ observer }).reconcileAttempt(attemptRecord({ status: 'observed_success' }));
  assert.equal(status, 'observed_success');
  assert.equal(observer.calls, 0);
});

// ---------------------------------------------------------------------------
// Worker — projection repair / quarantine and events.
// ---------------------------------------------------------------------------

test('reconciliation: a repaired projection is written and the attempt confirms', async () => {
  const projections = makeProjections();
  const stores = makeStores();
  const write = { table: 'beneficiary_balance_projection', rows: { beneficiary_identity_id: 'ben-1' }, onConflict: 'id' };
  const status = await worker({
    observer: observerReturning({ kind: 'settled_success', ledger: observedLedger(), events: [observedEvent()] }),
    projector: projectorReturning({ kind: 'repaired', writes: [write] }),
    projections,
    stores,
  }).reconcileAttempt(attemptRecord());

  assert.equal(status, 'observed_success');
  assert.equal(projections.writes.length, 1);
  assert.equal(projections.writes[0].table, 'beneficiary_balance_projection');
});

test('reconciliation: a projection mismatch quarantines with a recorded issue', async () => {
  const issues = makeIssues('issue-42');
  const projections = makeProjections();
  const stores = makeStores();
  const mismatch = {
    kind: 'mismatch',
    mismatch: {
      issueType: 'balance_mismatch',
      subjectType: 'beneficiary',
      subjectIdentifier: 'ben-1',
      projectionTable: 'beneficiary_balance_projection',
      projectionKey: { beneficiary_identity_id: 'ben-1' },
      expectedState: { available: '1000' },
      observedState: { available: '900' },
      quarantine: (issueId) => [
        { table: 'beneficiary_balance_projection', rows: { id: 'proj-1', is_quarantined: true, quarantine_issue_id: issueId } },
      ],
    },
  };
  const status = await worker({
    observer: observerReturning({ kind: 'settled_success', ledger: observedLedger(), events: [] }),
    projector: projectorReturning(mismatch),
    issues,
    projections,
    stores,
  }).reconcileAttempt(attemptRecord());

  // Ledger truth still confirms the attempt even though the read model is held.
  assert.equal(status, 'observed_success');
  assert.equal(issues.calls.length, 1);
  assert.equal(issues.calls[0].issueType, 'balance_mismatch');
  assert.equal(projections.writes.length, 1);
  assert.equal(projections.writes[0].rows.is_quarantined, true);
  assert.equal(projections.writes[0].rows.quarantine_issue_id, 'issue-42');
  assert.equal(stores.runsCompleted[0].counts.quarantined, 1);
});

test('reconciliation: observed contract events are appended and bound to their ledger', async () => {
  const evidence = makeEvidence();
  await worker({
    observer: observerReturning({ kind: 'settled_success', ledger: observedLedger(), events: [observedEvent(), observedEvent({ eventIndex: 1 })] }),
    evidence,
  }).reconcileAttempt(attemptRecord());
  assert.equal(evidence.events.length, 2);
  assert.equal(evidence.events[0].ledger_transaction_id, 'ledger-1');
  assert.equal(evidence.events[1].event_index, 1);
});

// ---------------------------------------------------------------------------
// Worker — runStream aggregation, cursor, alerts, resilience.
// ---------------------------------------------------------------------------

test('reconciliation: runStream advances the cursor and records a completed run', async () => {
  const cursors = makeCursors();
  const stores = makeStores();
  const summary = await worker({
    observer: observerReturning({ kind: 'settled_success', ledger: observedLedger(), events: [] }),
    cursors,
    stores,
  }).runStream({
    attempts: [attemptRecord()],
    streamName: 'cash_payments',
    cursorValue: 'cursor-1000',
  });

  assert.equal(summary.status, 'completed');
  assert.equal(summary.counts.confirmedIntents, 1);
  assert.equal(summary.lagSeconds, 60);
  assert.equal(cursors.calls.length, 1);
  assert.equal(cursors.calls[0].cursorValue, 'cursor-1000');
  assert.equal(cursors.calls[0].lastLedgerSequence, 1000);
  const completed = stores.runsCompleted[0];
  assert.equal(completed.status, 'completed');
  assert.equal(completed.cursorAfter, 'cursor-1000');
  assert.equal(completed.endLedgerSequence, 1000);
});

test('reconciliation: runStream does not advance the cursor without observed progress', async () => {
  const cursors = makeCursors();
  await worker({ observer: observerReturning({ kind: 'still_pending' }), cursors }).runStream({
    attempts: [attemptRecord()],
    streamName: 'cash_payments',
    cursorValue: 'cursor-1000',
  });
  assert.equal(cursors.calls.length, 0);
});

test('reconciliation: runStream emits a health alert on mismatch', async () => {
  const alerts = makeAlerts();
  await worker({
    observer: observerReturning({ kind: 'settled_success', ledger: observedLedger(), events: [] }),
    projector: projectorReturning({
      kind: 'mismatch',
      mismatch: { issueType: 'projection_mismatch', subjectType: 'program', subjectIdentifier: 'prog-1' },
    }),
    alerts,
  }).runStream({ attempts: [attemptRecord()], streamName: 'voucher_events' });

  assert.equal(alerts.emitted.length, 1);
  assert.equal(alerts.emitted[0].severity, 'critical');
  assert.equal(alerts.emitted[0].streamName, 'voucher_events');
});

test('reconciliation: one observation failure never blocks the rest of the run', async () => {
  const stores = makeStores();
  let call = 0;
  const observer = {
    async observeAttempt() {
      call += 1;
      if (call === 1) throw new Error('horizon unavailable');
      return { kind: 'settled_success', ledger: observedLedger(), events: [] };
    },
  };
  const summary = await worker({ observer, stores }).runStream({
    attempts: [attemptRecord({ id: 'attempt-1' }), attemptRecord({ id: 'attempt-2' })],
    streamName: 'cash_payments',
  });

  assert.equal(summary.status, 'partial');
  assert.equal(summary.counts.failedObservations, 1);
  assert.equal(summary.counts.confirmedIntents, 1);
  assert.equal(summary.resolvedStatuses.get('attempt-1'), 'submitted');
  assert.equal(summary.resolvedStatuses.get('attempt-2'), 'observed_success');
});

test('reconciliation: a dependency outage keeps reconciliation from confirming', async () => {
  // The observer failing (dependency outage) must never fabricate a confirmation.
  const stores = makeStores();
  const status = await worker({
    observer: observerThrowing(new Error('rpc down')),
    stores,
  }).reconcileAttempt(attemptRecord());
  assert.equal(status, 'submitted');
  assert.equal(stores.observed.length, 0);
  assert.equal(stores.runsCompleted[0].counts.failedObservations, 1);
});

// Unit tests for the reusable prepare/build/authorize/submit protocol.
//
// Covers the invariant and orchestration logic of:
//   supabase/functions/_shared/stellar/protocol.ts
//
// The protocol composes the Task 6.1/6.2 modules; here the operation-specific
// build/verify strategy and every persistence port are mocked, so the tests
// assert exactly the invariants the protocol itself owns:
//   - an immutable intent is persisted once per business idempotency key, and a
//     replay reconciles the prior intent instead of persisting a second one;
//   - an `accepted` attempt binds itself to the intent payload hash and records
//     the prepared payload hash + ledger bounds;
//   - authorize returns ONLY the client signing package;
//   - submit marks `submitted` (never confirmed) after network acceptance;
//   - a retry reconciles an in-flight submission before building a fresh attempt
//     under the same intent, and never re-sends an already-settled operation.
//
// Validates: Requirements 3.6, 18.3, 18.4, 18.8, 20.6
//
// Loading convention mirrors edge-stellar-clients.test.mjs: TypeScript modules
// are transpiled in-memory and imported as data: URLs, @supabase/supabase-js is
// stubbed (clients are injected), and @stellar/stellar-sdk resolves to the real
// installed package so the built envelope is genuine testnet XDR.

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

const sdk = await import('@stellar/stellar-sdk');
const sharedConfig = await importShared('../../../shared/stellar-config.ts');
const protocol = await importShared('stellar/protocol.ts');

// ---------------------------------------------------------------------------
// Fixtures.
// ---------------------------------------------------------------------------

const ISSUER = 'G' + 'A'.repeat(55);
const SAC = 'C' + 'A'.repeat(55);
const HORIZON = 'https://horizon-testnet.stellar.org';
const RPC = 'https://soroban-testnet.stellar.org';
const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';
const HEX64 = 'a'.repeat(64);
const HEX64_B = 'b'.repeat(64);

const testnetConfig = () =>
  sharedConfig.createStellarTestnetConfig({
    horizonUrl: HORIZON,
    rpcUrl: RPC,
    rcphpIssuer: ISSUER,
    rcphpSacId: SAC,
  });

// A genuine, unsigned testnet transaction envelope for the build result.
const builtEnvelopeXdr = () => {
  const account = new sdk.Account(sdk.Keypair.random().publicKey(), '0');
  const tx = new sdk.TransactionBuilder(account, {
    fee: '100',
    networkPassphrase: TESTNET_PASSPHRASE,
  })
    .addOperation(sdk.Operation.bumpSequence({ bumpTo: '0' }))
    .setTimeout(0)
    .build();
  return tx.toXDR();
};

const intentRecord = (overrides = {}) => ({
  id: 'intent-1',
  correlation_id: 'corr-1',
  idempotency_key_id: 'idem-1',
  operation_type: 'cash_distribution',
  organization_id: 'org-1',
  program_id: 'prog-1',
  payload_hash: HEX64,
  amount_stroops: 1000,
  asset_code: 'RCPHP',
  asset_issuer: ISSUER,
  beneficiary_identity_id: null,
  distribution_job_id: null,
  distribution_recipient_id: null,
  requested_by: null,
  request_metadata: {},
  created_at: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const attemptRecord = (overrides = {}) => ({
  id: 'attempt-1',
  financial_intent_id: 'intent-1',
  organization_id: 'org-1',
  program_id: 'prog-1',
  distribution_job_id: null,
  beneficiary_identity_id: null,
  correlation_id: 'corr-1',
  attempt_number: 1,
  status: 'accepted',
  network: 'stellar_testnet',
  intent_payload_hash: HEX64,
  prepared_payload_hash: HEX64_B,
  envelope_xdr: null,
  authorization_payload: null,
  min_ledger: null,
  max_ledger: null,
  result_code: null,
  error_code: null,
  error_detail: null,
  submitted_at: null,
  observed_at: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const buildResult = (overrides = {}) => ({
  network: 'stellar_testnet',
  envelopeXdr: builtEnvelopeXdr(),
  preparedPayloadHash: HEX64_B,
  minLedger: null,
  maxLedger: 500,
  signingPackage: {
    kind: 'classic_envelope',
    unsignedEnvelopeXdr: 'UNSIGNED',
    transactionHash: HEX64_B,
    networkPassphrase: TESTNET_PASSPHRASE,
  },
  ...overrides,
});

// A mocked strategy whose build/verify are recorded.
const stubStrategy = (over = {}) => ({
  operationType: 'cash_distribution',
  built: null,
  verifyCalls: 0,
  async build() {
    this.built = over.build ? over.build() : buildResult();
    return this.built;
  },
  async verifyAndAssemble() {
    this.verifyCalls += 1;
    return {
      transactionHash: HEX64_B,
      submit: async () => ({ transactionHash: HEX64_B, resultCode: 'txSUCCESS' }),
    };
  },
  ...over.overrides,
});

// Mocked ports.
const makeIntentStore = () => {
  const byKey = new Map();
  const inserted = [];
  return {
    inserted,
    byKey,
    async insertIntent(row) {
      inserted.push(row);
      const record = intentRecord({ ...row });
      byKey.set(row.idempotency_key_id, record);
      return record;
    },
    async findByIdempotencyKeyId(id) {
      return byKey.get(id) ?? null;
    },
  };
};

const makeAttemptStore = (initial = []) => {
  const attempts = [...initial];
  const submitted = [];
  return {
    attempts,
    submitted,
    async insertAttempt(row) {
      const record = attemptRecord({ ...row });
      attempts.push(record);
      return record;
    },
    async listAttempts() {
      return [...attempts];
    },
    async markSubmitted(params) {
      submitted.push(params);
    },
  };
};

const makeReconciler = (status) => ({
  calls: 0,
  async reconcileAttempt() {
    this.calls += 1;
    return status;
  },
});

const freshClaim = (isReplay = false) => async () => ({
  record: { id: 'idem-1', first_seen_at: 't', last_seen_at: isReplay ? 't2' : 't' },
  isReplay,
});

const engine = (over = {}) =>
  protocol.createTransactionProtocol({
    config: testnetConfig(),
    signers: /** dummy — strategy is mocked */ { has: () => false },
    claim: over.claim ?? freshClaim(false),
    intents: over.intents ?? makeIntentStore(),
    attempts: over.attempts ?? makeAttemptStore(),
    reconciler: over.reconciler ?? makeReconciler('unknown'),
    clock: () => new Date('2026-01-01T00:00:00.000Z'),
    newId: over.newId ?? (() => 'generated-id'),
  });

const prepareRequest = (overrides = {}) => ({
  organizationId: 'org-1',
  programId: 'prog-1',
  operationType: 'cash_distribution',
  scope: 'cash_distribution',
  idempotencyKey: 'key-1',
  payloadHash: HEX64,
  correlationId: 'corr-1',
  amountStroops: 1000,
  ...overrides,
});

// ---------------------------------------------------------------------------
// Pure helpers.
// ---------------------------------------------------------------------------

test('protocol: nextAttemptNumber is gap-free and 1-based', () => {
  assert.equal(protocol.nextAttemptNumber([]), 1);
  assert.equal(protocol.nextAttemptNumber([{ attempt_number: 1 }, { attempt_number: 2 }]), 3);
  assert.equal(protocol.nextAttemptNumber([{ attempt_number: 5 }]), 6);
});

test('protocol: assertAttemptSubmittable only accepts an accepted attempt', () => {
  assert.doesNotThrow(() => protocol.assertAttemptSubmittable({ status: 'accepted' }, 'c'));
  for (const status of ['submitted', 'observed_success', 'observed_failure', 'unknown']) {
    assert.throws(
      () => protocol.assertAttemptSubmittable({ status }, 'c'),
      (err) => err.financialError.code === 'validation_failed',
    );
  }
});

test('protocol: assertWithinLedgerBounds rejects an expired transaction', () => {
  assert.doesNotThrow(() => protocol.assertWithinLedgerBounds({ min_ledger: null, max_ledger: 100 }, 50, 'c'));
  assert.doesNotThrow(() => protocol.assertWithinLedgerBounds({ min_ledger: null, max_ledger: null }, 999, 'c'));
  assert.throws(
    () => protocol.assertWithinLedgerBounds({ min_ledger: null, max_ledger: 100 }, 100, 'c'),
    (err) => err.financialError.code === 'validation_failed',
  );
});

test('protocol: classifyRetry gates on the latest attempt status', () => {
  assert.equal(protocol.classifyRetry(null).action, 'build_fresh');
  assert.equal(protocol.classifyRetry(attemptRecord({ status: 'accepted' })).action, 'build_fresh');
  assert.equal(protocol.classifyRetry(attemptRecord({ status: 'observed_failure' })).action, 'build_fresh');
  assert.equal(protocol.classifyRetry(attemptRecord({ status: 'observed_success' })).action, 'already_settled');
  assert.equal(protocol.classifyRetry(attemptRecord({ status: 'submitted' })).action, 'reconcile_first');
  assert.equal(protocol.classifyRetry(attemptRecord({ status: 'unknown' })).action, 'reconcile_first');
});

test('protocol: buildIntentInsert captures the immutable requested operation', () => {
  const row = protocol.buildIntentInsert(prepareRequest(), 'idem-1', 'corr-1', 'intent-1', new Date('2026-01-01T00:00:00Z'));
  assert.equal(row.id, 'intent-1');
  assert.equal(row.idempotency_key_id, 'idem-1');
  assert.equal(row.payload_hash, HEX64);
  assert.equal(row.operation_type, 'cash_distribution');
  assert.equal(row.organization_id, 'org-1');
  assert.equal(row.amount_stroops, 1000);
});

test('protocol: buildIntentInsert rejects a non-hex payload hash', () => {
  assert.throws(
    () => protocol.buildIntentInsert(prepareRequest({ payloadHash: 'not-hex' }), 'idem-1', 'c', 'i', new Date()),
    (err) => err.financialError.code === 'validation_failed',
  );
});

test('protocol: buildAcceptedAttemptInsert binds the attempt to the intent payload hash', () => {
  const row = protocol.buildAcceptedAttemptInsert(intentRecord(), buildResult(), 1, 'corr-1', 'attempt-1');
  assert.equal(row.status, 'accepted');
  assert.equal(row.intent_payload_hash, HEX64);
  assert.equal(row.prepared_payload_hash, HEX64_B);
  assert.equal(row.attempt_number, 1);
  assert.equal(row.network, 'stellar_testnet');
  assert.equal(row.max_ledger, 500);
  assert.ok(typeof row.envelope_xdr === 'string' && row.envelope_xdr.length > 0);
});

// ---------------------------------------------------------------------------
// prepare.
// ---------------------------------------------------------------------------

test('protocol: prepare persists a single immutable intent on a fresh claim', async () => {
  const intents = makeIntentStore();
  const proto = engine({ intents, claim: freshClaim(false) });
  const prepared = await proto.prepare(prepareRequest());
  assert.equal(prepared.isReplay, false);
  assert.equal(intents.inserted.length, 1);
  assert.equal(prepared.intent.payload_hash, HEX64);
  assert.equal(intents.inserted[0].idempotency_key_id, 'idem-1');
});

test('protocol: prepare reconciles the prior intent on a replay without a second insert', async () => {
  const intents = makeIntentStore();
  intents.byKey.set('idem-1', intentRecord({ id: 'prior-intent' }));
  const proto = engine({ intents, claim: freshClaim(true) });
  const prepared = await proto.prepare(prepareRequest());
  assert.equal(prepared.isReplay, true);
  assert.equal(prepared.intent.id, 'prior-intent');
  assert.equal(intents.inserted.length, 0);
});

test('protocol: prepare rejects a non-hex payload hash before claiming', async () => {
  let claimed = false;
  const proto = engine({ claim: async () => { claimed = true; return { record: { id: 'x' }, isReplay: false }; } });
  await assert.rejects(
    () => proto.prepare(prepareRequest({ payloadHash: 'bad' })),
    (err) => err.financialError.code === 'validation_failed',
  );
  assert.equal(claimed, false);
});

// ---------------------------------------------------------------------------
// build + authorize.
// ---------------------------------------------------------------------------

test('protocol: build persists an accepted attempt and returns only the signing package', async () => {
  const attempts = makeAttemptStore();
  const proto = engine({ attempts });
  const strategy = stubStrategy();
  const built = await proto.build(intentRecord(), strategy);

  assert.equal(built.attempt.status, 'accepted');
  assert.equal(built.attempt.intent_payload_hash, HEX64);
  assert.equal(built.attempt.attempt_number, 1);
  // authorize is a pure selection of the client-signable package.
  const pkg = proto.authorize(built);
  assert.equal(pkg.kind, 'classic_envelope');
  assert.equal(pkg.unsignedEnvelopeXdr, 'UNSIGNED');
  // The returned package must not carry the fully-built submittable envelope.
  assert.notEqual(pkg.unsignedEnvelopeXdr, built.build.envelopeXdr);
});

test('protocol: build increments the attempt number over prior attempts', async () => {
  const attempts = makeAttemptStore([attemptRecord({ attempt_number: 1, status: 'observed_failure' })]);
  const proto = engine({ attempts });
  const built = await proto.build(intentRecord(), stubStrategy());
  assert.equal(built.attempt.attempt_number, 2);
});

test('protocol: build rejects a strategy that does not match the intent operation', async () => {
  const proto = engine();
  const wrong = stubStrategy({ overrides: { operationType: 'voucher_redemption' } });
  await assert.rejects(
    () => proto.build(intentRecord(), wrong),
    (err) => err.financialError.code === 'validation_failed',
  );
});

// ---------------------------------------------------------------------------
// submit.
// ---------------------------------------------------------------------------

test('protocol: submit marks submitted (never confirmed) after network acceptance', async () => {
  const attempts = makeAttemptStore();
  const proto = engine({ attempts });
  const strategy = stubStrategy();
  const attempt = attemptRecord({ status: 'accepted', envelope_xdr: builtEnvelopeXdr() });

  const result = await proto.submit(
    { intent: intentRecord(), attempt },
    { kind: 'classic_envelope', signedEnvelopeXdr: 'SIGNED' },
    strategy,
  );

  assert.equal(result.status, 'submitted');
  assert.equal(result.transactionHash, HEX64_B);
  assert.equal(attempts.submitted.length, 1);
  assert.equal(attempts.submitted[0].attemptId, 'attempt-1');
  assert.equal(attempts.submitted[0].transactionHash, HEX64_B);
  assert.equal(strategy.verifyCalls, 1);
});

test('protocol: submit refuses an attempt that is not awaiting submission', async () => {
  const proto = engine();
  const attempt = attemptRecord({ status: 'submitted', envelope_xdr: builtEnvelopeXdr() });
  await assert.rejects(
    () => proto.submit({ intent: intentRecord(), attempt }, { kind: 'classic_envelope', signedEnvelopeXdr: 'X' }, stubStrategy()),
    (err) => err.financialError.code === 'validation_failed',
  );
});

test('protocol: submit parses the built envelope with the configured passphrase and fails closed on garbage', async () => {
  // The submitted transaction is always parsed with the trusted testnet
  // passphrase (never a client-supplied one), so a malformed built envelope is
  // rejected before any host is reached rather than silently proceeding.
  const proto = engine();
  const attempt = attemptRecord({ status: 'accepted', envelope_xdr: 'not-valid-xdr' });
  await assert.rejects(
    () => proto.submit({ intent: intentRecord(), attempt }, { kind: 'classic_envelope', signedEnvelopeXdr: 'X' }, stubStrategy()),
    /Unable to parse transaction envelope/i,
  );
});

test('protocol: submit fails closed when the attempt has no prepared transaction', async () => {
  const proto = engine();
  const attempt = attemptRecord({ status: 'accepted', envelope_xdr: null });
  await assert.rejects(
    () => proto.submit({ intent: intentRecord(), attempt }, { kind: 'classic_envelope', signedEnvelopeXdr: 'X' }, stubStrategy()),
    (err) => err.financialError.code === 'dependency_unavailable',
  );
});

// ---------------------------------------------------------------------------
// retry.
// ---------------------------------------------------------------------------

test('protocol: retry returns already-settled without a new attempt on observed success', async () => {
  const attempts = makeAttemptStore([attemptRecord({ status: 'observed_success' })]);
  const proto = engine({ attempts });
  const outcome = await proto.retry(intentRecord(), stubStrategy());
  assert.equal(outcome.settled, true);
  assert.equal(outcome.status, 'observed_success');
  assert.equal(attempts.attempts.length, 1);
});

test('protocol: retry reconciles an in-flight submission before building fresh', async () => {
  const attempts = makeAttemptStore([attemptRecord({ status: 'submitted' })]);
  const reconciler = makeReconciler('observed_failure');
  const proto = engine({ attempts, reconciler });
  const outcome = await proto.retry(intentRecord(), stubStrategy());
  assert.equal(reconciler.calls, 1);
  assert.equal(outcome.settled, false);
  assert.equal(outcome.built.attempt.attempt_number, 2);
});

test('protocol: retry treats a reconciled success as settled and does not re-send', async () => {
  const attempts = makeAttemptStore([attemptRecord({ status: 'unknown' })]);
  const reconciler = makeReconciler('observed_success');
  const proto = engine({ attempts, reconciler });
  const outcome = await proto.retry(intentRecord(), stubStrategy());
  assert.equal(reconciler.calls, 1);
  assert.equal(outcome.settled, true);
  assert.equal(attempts.attempts.length, 1);
});

test('protocol: retry refuses to build while a submission is still pending', async () => {
  const attempts = makeAttemptStore([attemptRecord({ status: 'submitted' })]);
  const reconciler = makeReconciler('unknown');
  const proto = engine({ attempts, reconciler });
  await assert.rejects(
    () => proto.retry(intentRecord(), stubStrategy()),
    (err) => err.financialError.code === 'submission_unknown' && err.financialError.retryable === true,
  );
  assert.equal(attempts.attempts.length, 1);
});

test('protocol: retry builds a fresh first attempt when none exist', async () => {
  const attempts = makeAttemptStore();
  const proto = engine({ attempts });
  const outcome = await proto.retry(intentRecord(), stubStrategy());
  assert.equal(outcome.settled, false);
  assert.equal(outcome.built.attempt.attempt_number, 1);
});

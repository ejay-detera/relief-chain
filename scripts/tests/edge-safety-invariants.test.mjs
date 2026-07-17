// Integrative safety-invariant tests for the shared Edge modules.
//
// Task 6.9 — Edge security, queue, sponsor, and reconciliation tests.
//
// The Task 6 focused suites (edge-shared-security, edge-stellar-clients,
// edge-protocol, edge-reconciliation, edge-operational-controls,
// approval-policy) already prove each module's behaviour in isolation. This
// suite deliberately does NOT duplicate them. Instead it composes the SAME real
// shared modules around one small shared "settlement ledger" model and asserts
// the single cross-cutting invariant that Requirement 23.8 demands of every
// safety-critical failure path:
//
//   Every safety-critical failure conserves balances and creates no duplicate
//   settlement.
//
// Concretely, for each failure this suite drives the real module(s) to their
// refusal and asserts:
//   - value conservation — the modelled on-chain balances are byte-for-byte
//     unchanged (no value created, moved, or destroyed on the failing path), and
//   - no duplicate settlement — no settlement/submission is recorded for the
//     logical operation (a refused submission never calls markSubmitted; an
//     idempotency conflict never inserts a second intent; a paused switch /
//     depleted sponsor / exhausted rate bucket blocks admission before any
//     value movement; a quarantine never invents ownership).
//
// Positive controls prove the ledger DOES record exactly one settlement on a
// genuine confirmed success and never a second one on a safe retry, so the
// conservation assertions are meaningful rather than trivially true.
//
// Failure paths covered (Requirements 20.7, 22.4, 22.6, 23.4, 23.8):
//   wrong network, payload mutation, invalid signature, expired signature,
//   insufficient funds, idempotency conflict, unknown submission result,
//   queue recovery, sponsor depletion, mismatch quarantine, rate limit,
//   kill switch.
//
// Loading convention mirrors edge-protocol.test.mjs / edge-reconciliation.test.mjs:
// TypeScript modules are transpiled in-memory and imported as data: URLs,
// @supabase/supabase-js is stubbed (every client is injected), and
// @stellar/stellar-sdk resolves to the real installed package so built
// envelopes and Soroban auth entries are genuine testnet bytes.

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
const errors = await importShared('errors.ts');
const protocol = await importShared('stellar/protocol.ts');
const reconciliation = await importShared('stellar/reconciliation.ts');
const idempotency = await importShared('stellar/idempotency.ts');
const sponsorship = await importShared('stellar/sponsorship.ts');
const sorobanAuth = await importShared('stellar/soroban-auth.ts');
const guardModule = await importShared('stellar/network-guard.ts');
const switches = await importShared('operation-switches.ts');
const rateLimit = await importShared('rate-limit.ts');
const workQueue = await importShared('work-queue.ts');

// ---------------------------------------------------------------------------
// Shared fixtures.
// ---------------------------------------------------------------------------

const ISSUER = 'G' + 'A'.repeat(55);
const SAC = 'C' + 'A'.repeat(55);
const CONTRACT_ID = sdk.Address.contract(Buffer.alloc(32, 7)).toString();
const HORIZON = 'https://horizon-testnet.stellar.org';
const RPC = 'https://soroban-testnet.stellar.org';
const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';
const MAINNET_PASSPHRASE = 'Public Global Stellar Network ; September 2015';
const HEX64 = 'a'.repeat(64);
const HEX64_B = 'b'.repeat(64);
const TX_HASH = 'c'.repeat(64);
const ENVELOPE_SHA = 'd'.repeat(64);

const testnetConfig = () =>
  sharedConfig.createStellarTestnetConfig({
    horizonUrl: HORIZON,
    rpcUrl: RPC,
    rcphpIssuer: ISSUER,
    rcphpSacId: SAC,
  });

// A genuine, unsigned testnet transaction envelope for a built attempt.
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

// A genuine Soroban authorization entry (real SDK bytes).
const authEntryXdr = ({ authorizer, contractId = CONTRACT_ID, functionName = 'redeem', sigExp = 1000, nonce = 7 }) => {
  const cred = sdk.xdr.SorobanCredentials.sorobanCredentialsAddress(
    new sdk.xdr.SorobanAddressCredentials({
      address: sdk.Address.fromString(authorizer).toScAddress(),
      nonce: new sdk.xdr.Int64(nonce),
      signatureExpirationLedger: sigExp,
      signature: sdk.xdr.ScVal.scvVoid(),
    }),
  );
  const invocation = new sdk.xdr.SorobanAuthorizedInvocation({
    function: sdk.xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
      new sdk.xdr.InvokeContractArgs({
        contractAddress: sdk.Address.fromString(contractId).toScAddress(),
        functionName,
        args: [],
      }),
    ),
    subInvocations: [],
  });
  return new sdk.xdr.SorobanAuthorizationEntry({ credentials: cred, rootInvocation: invocation }).toXDR('base64');
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
  correlation_id: '11111111-1111-1111-1111-111111111111',
  attempt_number: 1,
  status: 'accepted',
  network: 'stellar_testnet',
  intent_payload_hash: HEX64,
  prepared_payload_hash: HEX64_B,
  envelope_xdr: null,
  authorization_payload: null,
  min_ledger: null,
  max_ledger: 2000,
  result_code: null,
  error_code: null,
  error_detail: null,
  transaction_hash: TX_HASH,
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

// ---------------------------------------------------------------------------
// The shared settlement ledger model + invariant assertions.
// ---------------------------------------------------------------------------
//
// A tiny model of authoritative (on-chain) value. Only a GENUINE confirmed
// movement calls `settle`, which moves value between accounts AND records a
// settlement keyed by the logical operation. `markSubmitted` records the
// earliest illegitimate progression toward settlement for submission paths.
// Conservation is asserted as byte-for-byte balance equality across a failure.

const createLedger = (initial) => {
  const balances = { ...initial };
  const settlements = [];
  const submissions = [];
  const quarantines = [];
  return {
    balances,
    settlements,
    submissions,
    quarantines,
    total() {
      return Object.values(balances).reduce((sum, value) => sum + value, 0);
    },
    snapshot() {
      return JSON.stringify(balances);
    },
    settle({ key, from, to, amount }) {
      if (typeof balances[from] !== 'number' || typeof balances[to] !== 'number') {
        throw new Error(`ledger.settle referenced an unknown account: ${from} -> ${to}`);
      }
      balances[from] -= amount;
      balances[to] += amount;
      settlements.push({ key, amount });
    },
    markSubmitted(key) {
      submissions.push({ key });
    },
    quarantine(subject) {
      quarantines.push(subject);
    },
    settlementCount(key) {
      return settlements.filter((entry) => entry.key === key).length;
    },
    submissionCount(key) {
      return submissions.filter((entry) => entry.key === key).length;
    },
  };
};

// Asserts the safety-critical invariant of Requirement 23.8 for a failure path:
// balances are conserved (unchanged) and no settlement/submission was recorded.
const assertConservedAndNoSettlement = (ledger, before, key) => {
  assert.equal(ledger.snapshot(), before, 'balances must be conserved on a failure path');
  assert.equal(ledger.settlementCount(key), 0, 'a failure must record no settlement');
  assert.equal(ledger.submissionCount(key), 0, 'a failure must record no submission');
};

// ---------------------------------------------------------------------------
// Ledger-aware ports for the real protocol engine.
// ---------------------------------------------------------------------------

const makeIntentStore = () => {
  const inserted = [];
  const byKey = new Map();
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

// The AttemptStore's markSubmitted is the earliest progression toward a
// settlement; wiring it to the ledger lets a refused submission be proven to
// never have advanced.
const makeAttemptStore = (ledger, key, initial = []) => {
  const attempts = [...initial];
  const inserted = [];
  return {
    attempts,
    inserted,
    async insertAttempt(row) {
      const record = attemptRecord({ ...row });
      attempts.push(record);
      inserted.push(record);
      return record;
    },
    async listAttempts() {
      return [...attempts];
    },
    async markSubmitted() {
      ledger.markSubmitted(key);
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

// A real idempotency claim composed over an injected RPC client.
const rpcClient = (result) => ({
  async rpc() {
    return result;
  },
});

const realClaim = (result) => (params) => idempotency.claimIdempotencyKey(rpcClient(result), params);

const protocolEngine = (over = {}) =>
  protocol.createTransactionProtocol({
    config: testnetConfig(),
    signers: { has: () => false },
    claim: over.claim ?? realClaim({ data: { id: 'idem-1', first_seen_at: 't', last_seen_at: 't', payload_hash: HEX64 }, error: null }),
    intents: over.intents ?? makeIntentStore(),
    attempts: over.attempts ?? makeAttemptStore(createLedger({}), 'unused'),
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

// A strategy whose build/verify behaviour is supplied per test so we can drive
// exactly one refusal (invalid signature, expired signature, payload mutation,
// insufficient funds) through the REAL engine.
const strategy = ({ operationType = 'cash_distribution', build, verify } = {}) => ({
  operationType,
  async build(context) {
    if (build) return build(context);
    return buildResult();
  },
  async verifyAndAssemble(context) {
    if (verify) return verify(context);
    return {
      transactionHash: HEX64_B,
      submit: async () => ({ transactionHash: HEX64_B, resultCode: 'txSUCCESS' }),
    };
  },
});

// ---------------------------------------------------------------------------
// Ledger-aware ports for the real reconciliation worker.
// ---------------------------------------------------------------------------

const observerReturning = (observation) => ({
  calls: 0,
  async observeAttempt() {
    this.calls += 1;
    return observation;
  },
});

const projectorReturning = (result) => ({
  calls: 0,
  async project() {
    this.calls += 1;
    return result;
  },
});

const makeEvidence = () => ({
  ledgers: [],
  events: [],
  async upsertLedgerTransaction(insert) {
    this.ledgers.push(insert);
    return { id: 'ledger-1', created: true };
  },
  async upsertContractEvent(insert) {
    this.events.push(insert);
    return { id: `event-${this.events.length}`, created: true };
  },
});

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
  correlation_id: row.correlation_id,
});

const makeStores = () => ({
  observed: [],
  runsCompleted: [],
  async listPending() {
    return [];
  },
  async loadIntent() {
    return null;
  },
  async markObserved(params) {
    this.observed.push(params);
  },
  async startRun(row) {
    return runRecord(row);
  },
  async completeRun(params) {
    this.runsCompleted.push(params);
  },
});

const makeCursors = () => ({ calls: [], async advance(params) { this.calls.push(params); } });
const makeIssues = (id = 'issue-1') => ({ calls: [], async record(params) { this.calls.push(params); return id; } });

// A projections writer bound to the ledger: a `credit` descriptor represents a
// genuine confirmed settlement into the read model; a quarantine row records a
// held projection WITHOUT moving value (never invents ownership).
const makeProjections = (ledger) => ({
  writes: [],
  async write(writes) {
    for (const write of writes) {
      this.writes.push(write);
      if (write.credit) ledger.settle(write.credit);
      if (write.rows && write.rows.is_quarantined) ledger.quarantine(write.rows);
    }
  },
});

let reconIdCounter = 0;
const reconciliationWorker = (over = {}) =>
  reconciliation.createReconciliationWorker({
    config: testnetConfig(),
    observer: over.observer ?? observerReturning({ kind: 'still_pending' }),
    projector: over.projector ?? projectorReturning({ kind: 'unchanged' }),
    evidence: over.evidence ?? makeEvidence(),
    stores: over.stores ?? makeStores(),
    cursors: over.cursors ?? makeCursors(),
    issues: over.issues ?? makeIssues(),
    projections: over.projections ?? makeProjections(createLedger({})),
    alerts: over.alerts,
    clock: () => new Date('2026-01-01T00:10:00.000Z'),
    newId: () => `gen-${(reconIdCounter += 1)}`,
  });

// A minimal in-memory durable queue store with leasing (mirrors the fixture in
// edge-operational-controls.test.mjs), reused here to prove queue recovery
// conserves value and never settles a logical item twice.
const makeMemoryStore = () => {
  const items = new Map();
  let leaseSeq = 0;
  return {
    dead: [],
    enqueue({ id, payload }) {
      if (!items.has(id)) items.set(id, { id, payload, attempts: 0, leased: null });
      return Promise.resolve({ accepted: true, depth: items.size });
    },
    depth: () => Promise.resolve(items.size),
    claim(limit) {
      const claimed = [];
      for (const item of items.values()) {
        if (claimed.length >= limit) break;
        if (item.leased === null) {
          leaseSeq += 1;
          item.leased = `lease-${leaseSeq}`;
          claimed.push({ id: item.id, payload: item.payload, attempts: item.attempts, leaseToken: item.leased });
        }
      }
      return Promise.resolve(claimed);
    },
    complete(id, leaseToken) {
      const item = items.get(id);
      if (item && item.leased === leaseToken) items.delete(id);
      return Promise.resolve();
    },
    release({ id, leaseToken, requeue }) {
      const item = items.get(id);
      if (item && item.leased === leaseToken) {
        item.leased = null;
        item.attempts += 1;
        if (!requeue) {
          items.delete(id);
          this.dead.push(id);
        }
      }
      return Promise.resolve();
    },
    _size: () => items.size,
  };
};

// ===========================================================================
// POSITIVE CONTROLS — the ledger records exactly one settlement on a genuine
// confirmed success and never a second one on a safe retry. Without these the
// conservation assertions on the failure paths could pass trivially.
// ===========================================================================

test('invariant baseline: a confirmed reconciliation settles exactly once and re-observation never double-settles', async () => {
  const ledger = createLedger({ escrow: 1000, merchant: 0 });
  const key = 'op-confirm-1';
  const credit = { key, from: 'escrow', to: 'merchant', amount: 1000 };
  const projections = makeProjections(ledger);
  const observer = observerReturning({ kind: 'settled_success', ledger: observedLedger(), events: [] });
  const worker = reconciliationWorker({
    observer,
    projector: projectorReturning({
      kind: 'repaired',
      writes: [{ table: 'merchant_settlement_projection', rows: { id: 'm-1' }, credit }],
    }),
    projections,
  });

  const first = await worker.reconcileAttempt(attemptRecord({ status: 'submitted' }));
  assert.equal(first, 'observed_success');
  assert.equal(ledger.settlementCount(key), 1, 'a confirmed settlement is recorded exactly once');
  assert.equal(ledger.balances.merchant, 1000);
  assert.equal(ledger.total(), 1000, 'value is conserved through a settlement');

  // Re-observing an already-terminal attempt is a no-op: the observer is never
  // consulted and no second settlement is created.
  const second = await worker.reconcileAttempt(attemptRecord({ status: 'observed_success' }));
  assert.equal(second, 'observed_success');
  assert.equal(observer.calls, 1, 'a terminal attempt is never re-observed');
  assert.equal(ledger.settlementCount(key), 1, 'no duplicate settlement on re-observation');
});

test('invariant baseline: a submitted attempt marks submitted exactly once', async () => {
  const ledger = createLedger({ treasury: 1000, beneficiary: 0 });
  const key = 'op-submit-1';
  const attempts = makeAttemptStore(ledger, key);
  const proto = protocolEngine({ attempts });
  const attempt = attemptRecord({ status: 'accepted', envelope_xdr: builtEnvelopeXdr() });

  const result = await proto.submit({ intent: intentRecord(), attempt }, { kind: 'classic_envelope', signedEnvelopeXdr: 'SIGNED' }, strategy());
  assert.equal(result.status, 'submitted');
  assert.equal(ledger.submissionCount(key), 1, 'a genuine submission marks submitted exactly once');
});

// ===========================================================================
// FAILURE PATHS — each conserves balances and creates no duplicate settlement.
// ===========================================================================

// --- Wrong network -------------------------------------------------------

test('wrong network: foreign-network ledger evidence never confirms and never settles', async () => {
  const ledger = createLedger({ escrow: 1000, merchant: 0 });
  const key = 'op-wrong-network';
  const before = ledger.snapshot();
  const stores = makeStores();
  const projections = makeProjections(ledger);
  const status = await reconciliationWorker({
    observer: observerReturning({ kind: 'settled_success', ledger: observedLedger({ networkPassphrase: MAINNET_PASSPHRASE }), events: [] }),
    projector: projectorReturning({ kind: 'repaired', writes: [{ credit: { key, from: 'escrow', to: 'merchant', amount: 1000 } }] }),
    projections,
    stores,
  }).reconcileAttempt(attemptRecord({ status: 'submitted' }));

  // Foreign-network evidence is refused per attempt: no confirmation, no
  // projection write, and therefore no value movement.
  assert.equal(status, 'submitted');
  assert.equal(projections.writes.length, 0, 'no projection is written for foreign-network evidence');
  assert.equal(stores.runsCompleted[0].counts.failedObservations, 1);
  assertConservedAndNoSettlement(ledger, before, key);
});

test('wrong network: an infrastructure/mainnet override is refused before any admission', () => {
  const ledger = createLedger({ treasury: 1000, beneficiary: 0 });
  const key = 'op-mainnet-override';
  const before = ledger.snapshot();
  const guard = guardModule.createNetworkGuard(testnetConfig());

  // A mainnet override fails closed; the settle below is never reached.
  assert.throws(() => {
    guard.rejectInfrastructureOverride({ network: 'mainnet' });
    ledger.settle({ key, from: 'treasury', to: 'beneficiary', amount: 1000 });
  }, /network cannot be overridden/i);
  assertConservedAndNoSettlement(ledger, before, key);
});

// --- Payload mutation ----------------------------------------------------

test('payload mutation: a signed submission whose fields differ from the intent never marks submitted', async () => {
  const ledger = createLedger({ treasury: 1000, beneficiary: 0 });
  const key = 'op-payload-mutation';
  const before = ledger.snapshot();
  const attempts = makeAttemptStore(ledger, key);
  const proto = protocolEngine({ attempts });
  const attempt = attemptRecord({ status: 'accepted', envelope_xdr: builtEnvelopeXdr() });

  // The strategy verifies the returned signed object against the exact built
  // transaction the server persisted; a mutated payload is refused and
  // markSubmitted is never reached.
  const verifyingStrategy = strategy({
    verify: (context) => {
      if (context.signed.signedEnvelopeXdr !== context.attempt.envelope_xdr) {
        throw errors.FinancialErrorException.of(
          'validation_failed',
          'The signed payload does not match the prepared transaction.',
          { correlationId: context.correlationId },
        );
      }
      return { transactionHash: HEX64_B, submit: async () => ({ transactionHash: HEX64_B }) };
    },
  });

  await assert.rejects(
    () => proto.submit({ intent: intentRecord(), attempt }, { kind: 'classic_envelope', signedEnvelopeXdr: 'MUTATED' }, verifyingStrategy),
    (err) => err.financialError.code === 'validation_failed',
  );
  assertConservedAndNoSettlement(ledger, before, key);
});

// --- Invalid signature ---------------------------------------------------

test('invalid signature: a Soroban auth entry signed by the wrong wallet never marks submitted', async () => {
  const ledger = createLedger({ escrow: 1000, merchant: 0 });
  const key = 'op-invalid-signature';
  const before = ledger.snapshot();
  const attempts = makeAttemptStore(ledger, key);
  const proto = protocolEngine({ attempts });

  const beneficiary = sdk.Keypair.random().publicKey();
  const attacker = sdk.Keypair.random().publicKey();
  const intent = intentRecord({ operation_type: 'voucher_redemption' });
  const attempt = attemptRecord({ status: 'accepted', envelope_xdr: builtEnvelopeXdr() });

  // verifyAndAssemble runs the REAL soroban-auth check: the returned entry is
  // signed by the wrong wallet, so it fails closed before any submission.
  const voucher = strategy({
    operationType: 'voucher_redemption',
    verify: () => {
      const parsed = sorobanAuth.parseAndReadAuthorizationEntry(authEntryXdr({ authorizer: attacker }));
      sorobanAuth.assertAuthorizationMatches(parsed, { authorizer: beneficiary, contractId: CONTRACT_ID, functionName: 'redeem', currentLedger: 500 });
      return { transactionHash: HEX64_B, submit: async () => ({ transactionHash: HEX64_B }) };
    },
  });

  await assert.rejects(
    () => proto.submit({ intent, attempt }, { kind: 'soroban_auth_entry', signedAuthEntryXdr: 'X' }, voucher),
    /not signed by the expected wallet/i,
  );
  assertConservedAndNoSettlement(ledger, before, key);
});

// --- Expired signature ---------------------------------------------------

test('expired signature: an expired Soroban auth entry never marks submitted', async () => {
  const ledger = createLedger({ escrow: 1000, merchant: 0 });
  const key = 'op-expired-signature';
  const before = ledger.snapshot();
  const attempts = makeAttemptStore(ledger, key);
  const proto = protocolEngine({ attempts });

  const beneficiary = sdk.Keypair.random().publicKey();
  const intent = intentRecord({ operation_type: 'voucher_redemption' });
  const attempt = attemptRecord({ status: 'accepted', envelope_xdr: builtEnvelopeXdr() });

  const voucher = strategy({
    operationType: 'voucher_redemption',
    verify: () => {
      const parsed = sorobanAuth.parseAndReadAuthorizationEntry(authEntryXdr({ authorizer: beneficiary, sigExp: 1000 }));
      // currentLedger at/after the expiration ledger -> expired.
      sorobanAuth.assertAuthorizationMatches(parsed, { authorizer: beneficiary, contractId: CONTRACT_ID, functionName: 'redeem', currentLedger: 1000 });
      return { transactionHash: HEX64_B, submit: async () => ({ transactionHash: HEX64_B }) };
    },
  });

  await assert.rejects(
    () => proto.submit({ intent, attempt }, { kind: 'soroban_auth_entry', signedAuthEntryXdr: 'X' }, voucher),
    /signature has expired/i,
  );
  assertConservedAndNoSettlement(ledger, before, key);
});

// --- Insufficient funds --------------------------------------------------

test('insufficient funds: a build that fails funding checks persists no attempt and settles nothing', async () => {
  const ledger = createLedger({ treasury: 100, beneficiary: 0 });
  const key = 'op-insufficient-funds';
  const before = ledger.snapshot();
  const attempts = makeAttemptStore(ledger, key);
  const proto = protocolEngine({ attempts });

  // The strategy models a server-side funding check refusing the operation.
  const underfunded = strategy({
    build: (context) => {
      throw errors.FinancialErrorException.of('insufficient_budget', 'The program treasury cannot cover this transfer.', {
        correlationId: context.correlationId,
      });
    },
  });

  await assert.rejects(
    () => proto.build(intentRecord({ amount_stroops: 1000 }), underfunded),
    (err) => err.financialError.code === 'insufficient_budget',
  );
  assert.equal(attempts.inserted.length, 0, 'a refused build persists no attempt');
  assertConservedAndNoSettlement(ledger, before, key);
});

// --- Idempotency conflict ------------------------------------------------

test('idempotency conflict: reusing a key with a different payload inserts no second intent', async () => {
  const ledger = createLedger({ treasury: 1000, beneficiary: 0 });
  const key = 'op-idempotency-conflict';
  const before = ledger.snapshot();
  const intents = makeIntentStore();
  // A prior intent already exists for this business key.
  intents.byKey.set('idem-1', intentRecord({ id: 'prior-intent' }));

  // The real idempotency claim raises the payload-conflict SQLSTATE.
  const proto = protocolEngine({
    intents,
    claim: realClaim({ data: null, error: { code: '23514', message: 'idempotency key payload hash conflict' } }),
  });

  await assert.rejects(
    () => proto.prepare(prepareRequest({ payloadHash: HEX64_B })),
    (err) => err.financialError.code === 'validation_failed' && err.financialError.retryable === false,
  );
  assert.equal(intents.inserted.length, 0, 'a conflicting key must never insert a second intent');
  assertConservedAndNoSettlement(ledger, before, key);
});

test('idempotency replay: an identical repeat reconciles the prior intent without a second insert', async () => {
  const intents = makeIntentStore();
  intents.byKey.set('idem-1', intentRecord({ id: 'prior-intent' }));

  // A safe replay: the RPC advances last_seen_at for an identical request.
  const proto = protocolEngine({
    intents,
    claim: realClaim({ data: { id: 'idem-1', first_seen_at: 't1', last_seen_at: 't2', payload_hash: HEX64 }, error: null }),
  });

  const prepared = await proto.prepare(prepareRequest());
  assert.equal(prepared.isReplay, true);
  assert.equal(prepared.intent.id, 'prior-intent');
  assert.equal(intents.inserted.length, 0, 'a replay reuses the prior intent (no duplicate operation)');
});

// --- Unknown submission result -------------------------------------------

test('unknown result: a never-landed submission becomes unknown and never settles', async () => {
  const ledger = createLedger({ escrow: 1000, merchant: 0 });
  const key = 'op-unknown-result';
  const before = ledger.snapshot();
  const projections = makeProjections(ledger);
  const stores = makeStores();
  const status = await reconciliationWorker({
    observer: observerReturning({ kind: 'not_found' }),
    projections,
    stores,
  }).reconcileAttempt(attemptRecord({ status: 'submitted' }));

  assert.equal(status, 'unknown');
  assert.equal(projections.writes.length, 0, 'an unknown result writes no projection');
  assertConservedAndNoSettlement(ledger, before, key);
});

test('unknown result: a retry over an unresolved submission reconciles first and never re-sends', async () => {
  const ledger = createLedger({ treasury: 1000, beneficiary: 0 });
  const key = 'op-unknown-retry';
  const before = ledger.snapshot();
  const attempts = makeAttemptStore(ledger, key, [attemptRecord({ status: 'submitted' })]);
  const proto = protocolEngine({ attempts, reconciler: makeReconciler('unknown') });

  // The prior submission is still unresolved; the retry must refuse to build a
  // second attempt (which could double-settle) and demand another reconcile.
  await assert.rejects(
    () => proto.retry(intentRecord(), strategy()),
    (err) => err.financialError.code === 'submission_unknown' && err.financialError.retryable === true,
  );
  assert.equal(attempts.inserted.length, 0, 'no fresh attempt is built while a submission is unresolved');
  assertConservedAndNoSettlement(ledger, before, key);
});

test('unknown result: a retry after an observed success returns settled without a new attempt', async () => {
  const ledger = createLedger({ escrow: 1000, merchant: 1000 });
  const key = 'op-already-settled';
  const attempts = makeAttemptStore(ledger, key, [attemptRecord({ status: 'observed_success' })]);
  const proto = protocolEngine({ attempts, reconciler: makeReconciler('observed_success') });

  const outcome = await proto.retry(intentRecord(), strategy());
  assert.equal(outcome.settled, true);
  assert.equal(attempts.inserted.length, 0, 'an already-settled operation is never re-sent');
  assert.equal(ledger.settlementCount(key), 0, 'the retry itself records no additional settlement');
});

// --- Queue recovery ------------------------------------------------------

test('queue recovery: a transient failure is requeued and settles exactly once; a poison item dead-letters with no settlement', async () => {
  const ledger = createLedger({ escrow: 3000, ok: 0, flaky: 0, poison: 0 });
  const store = makeMemoryStore();
  const queue = workQueue.createDurableWorkQueue({ store, maxDepth: 10, maxConcurrency: 3, maxAttempts: 2 });

  await queue.accept({ payload: { id: 'ok' }, correlationId: 'c-ok' });
  await queue.accept({ payload: { id: 'flaky' }, correlationId: 'c-flaky' });
  await queue.accept({ payload: { id: 'poison' }, correlationId: 'c-poison' });

  let flakyAttempts = 0;
  const process = async (item) => {
    const id = item.payload.id;
    if (id === 'poison') throw new Error('permanent failure');
    if (id === 'flaky') {
      flakyAttempts += 1;
      if (flakyAttempts === 1) throw new Error('transient failure');
    }
    // A genuine confirmed unit of work settles exactly once.
    ledger.settle({ key: id, from: 'escrow', to: id, amount: 1000 });
  };

  // Drain repeatedly until the queue is empty (recovery across cycles).
  for (let i = 0; i < 5 && (await queue.depth()) > 0; i += 1) {
    await queue.drain(process, 10);
  }

  assert.equal(await queue.depth(), 0, 'no accepted work is lost');
  assert.equal(ledger.settlementCount('ok'), 1);
  assert.equal(ledger.settlementCount('flaky'), 1, 'the requeued item settles exactly once, not twice');
  assert.equal(ledger.settlementCount('poison'), 0, 'a dead-lettered item never settles');
  assert.equal(store.dead.length, 1, 'exactly one item is dead-lettered');
  // escrow funded 3000; only ok + flaky settled (2000) -> value conserved.
  assert.equal(ledger.total(), 3000);
  assert.equal(ledger.balances.escrow, 1000);
});

// --- Sponsor depletion ---------------------------------------------------

test('sponsor depletion: a sponsor below its reserve floor blocks admission and settles nothing', async () => {
  const ledger = createLedger({ treasury: 1000, beneficiary: 0 });
  const key = 'op-sponsor-depletion';
  const before = ledger.snapshot();
  const thresholds = { minReserveStroops: 1000, maxSpendPerWindowStroops: 5000, maxOperationsPerWindow: 3, windowSeconds: 3600 };

  // Reserve-floor guard is a pure decision first (Requirement 14.5).
  const decision = sponsorship.evaluateSponsorship(
    { availableStroops: 1200, spentInWindowStroops: 0, operationsInWindow: 0 },
    thresholds,
    { estimatedCostStroops: 500 },
  );
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, 'reserve_floor');

  const governor = sponsorship.createSponsorGovernor({
    thresholds,
    usage: { loadUsage: async () => ({ availableStroops: 1200, spentInWindowStroops: 0, operationsInWindow: 0 }) },
    audit: { record: async () => {} },
    clock: () => new Date('2026-01-01T00:00:00Z'),
  });

  // Admission is gated on the sponsor; the settle below is never reached.
  await assert.rejects(async () => {
    await governor.authorize({ estimatedCostStroops: 500, purpose: 'fee_bump', correlationId: key });
    ledger.settle({ key, from: 'treasury', to: 'beneficiary', amount: 1000 });
  }, (err) => err.financialError.code === 'sponsor_unavailable' && err.financialError.retryable === true);
  assertConservedAndNoSettlement(ledger, before, key);
});

// --- Mismatch quarantine -------------------------------------------------

test('mismatch quarantine: a projection mismatch is quarantined without inventing ownership', async () => {
  const ledger = createLedger({ escrow: 1000, beneficiary: 0 });
  const key = 'op-mismatch-quarantine';
  const before = ledger.snapshot();
  const issues = makeIssues('issue-77');
  const projections = makeProjections(ledger);
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
  const status = await reconciliationWorker({
    observer: observerReturning({ kind: 'settled_success', ledger: observedLedger(), events: [] }),
    projector: projectorReturning(mismatch),
    issues,
    projections,
  }).reconcileAttempt(attemptRecord({ status: 'submitted' }));

  // Ledger truth still confirms the attempt, but the disagreeing read model is
  // HELD (quarantined) rather than credited: no value is invented or moved.
  assert.equal(status, 'observed_success');
  assert.equal(issues.calls.length, 1);
  assert.equal(issues.calls[0].issueType, 'balance_mismatch');
  assert.equal(ledger.quarantines.length, 1, 'the disagreeing projection is quarantined');
  assert.equal(ledger.quarantines[0].is_quarantined, true);
  assertConservedAndNoSettlement(ledger, before, key);
});

// --- Rate limit ----------------------------------------------------------

test('rate limit: an exhausted bucket blocks the admitted operation and settles nothing', async () => {
  const ledger = createLedger({ treasury: 3000, beneficiary: 0 });
  let now = 0;
  const buckets = new Map();
  const store = rateLimit.createRepositoryRateLimitStore({
    read: async (repoKey) => buckets.get(repoKey) ?? null,
    write: async (repoKey, next) => {
      buckets.set(repoKey, next);
    },
  });
  const limiter = rateLimit.createRateLimiter({
    store,
    nowMs: () => now,
    policies: { payment_attempt: { capacity: 2, refillPerSecond: 1 } },
  });

  const attempt = async (key) => {
    await limiter.enforce({ category: 'payment_attempt', subject: 'ben-1', correlationId: key });
    ledger.settle({ key, from: 'treasury', to: 'beneficiary', amount: 1000 });
  };

  // Two admissions fit the bucket.
  await attempt('rl-1');
  await attempt('rl-2');

  // The third is denied; snapshot right before it and assert nothing changes.
  const before = ledger.snapshot();
  await assert.rejects(
    () => attempt('rl-3'),
    (err) => err.financialError.code === 'dependency_unavailable' && err.financialError.retryable === true,
  );
  assertConservedAndNoSettlement(ledger, before, 'rl-3');
  assert.equal(ledger.settlementCount('rl-1'), 1);
  assert.equal(ledger.settlementCount('rl-2'), 1);
});

// --- Kill switch ---------------------------------------------------------

test('kill switch: a paused operation blocks admission while leaving other switches and reconciliation intact', async () => {
  const ledger = createLedger({ escrow: 1000, merchant: 0 });
  const key = 'op-kill-switch';
  const before = ledger.snapshot();

  let state = { records: [] };
  const governor = switches.createOperationSwitchGovernor({
    store: {
      loadSnapshot: async () => state,
      saveToggle: async (record) => {
        state = switches.applyToggle(state, record);
      },
    },
    clock: () => new Date('2026-01-01T00:00:00Z'),
  });
  await governor.pause({ operation: 'redemption', reason: 'incident', updatedBy: 'op-1' });

  // The paused operation fails closed; the settle below is never reached.
  await assert.rejects(async () => {
    await governor.assertEnabled('redemption', key);
    ledger.settle({ key, from: 'escrow', to: 'merchant', amount: 1000 });
  }, (err) => err.financialError.code === 'contract_paused' && err.financialError.retryable === false);
  assertConservedAndNoSettlement(ledger, before, key);

  // Independence: other operations remain enabled.
  await assert.doesNotReject(() => governor.assertEnabled('distribution', key));

  // Reconciliation is never a controlled operation, so confirmed settlement
  // still flows while redemption is paused (Requirement 22.6).
  assert.equal(switches.RECONCILIATION_IS_GATED, false);
  const settleLedger = createLedger({ escrow: 1000, merchant: 0 });
  const projections = makeProjections(settleLedger);
  const status = await reconciliationWorker({
    observer: observerReturning({ kind: 'settled_success', ledger: observedLedger(), events: [] }),
    projector: projectorReturning({ kind: 'repaired', writes: [{ credit: { key: 'recon-during-pause', from: 'escrow', to: 'merchant', amount: 1000 } }] }),
    projections,
  }).reconcileAttempt(attemptRecord({ status: 'submitted' }));
  assert.equal(status, 'observed_success');
  assert.equal(settleLedger.settlementCount('recon-during-pause'), 1, 'reconciliation stays readable during a kill switch');
});

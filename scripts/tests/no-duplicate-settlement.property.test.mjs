// Property 2: No Duplicate Settlement
//
// "Reusing a business idempotency key, invoice nonce, signed payload, or
//  transaction attempt cannot produce a second transfer."
//
// Validates: Requirements 7.8, 8.5, 10.6, 11.7
//
// Property-testing library (pinned): fast-check 3.23.2 (see package.json
// devDependencies).
//
// Property 2 spans two layers. This suite is the BACKEND layer of the property
// (the CONTRACT layer — one-time invoice / refund nonces on-chain — lives in the
// Rust seeded-generator test `prop_no_duplicate_settlement_*` in
// contracts/voucher/src/test.rs). Here the invariant is proven against the
// shared idempotency / protocol modules that guard the classic + Soroban rails:
//   - supabase/functions/_shared/stellar/idempotency.ts (the authoritative
//     business-key claim: a fresh key claims once, an identical replay returns
//     the SAME prior claim, and a key reused with a different payload / operation
//     / program is rejected as a non-retryable conflict; Req 8.5, 18.3)
//   - supabase/functions/_shared/stellar/protocol.ts    (prepare persists ONE
//     immutable intent per business key and reconciles the prior intent on a
//     replay — never a second intent; submit marks only `submitted`; a retry
//     reconciles an in-flight submission BEFORE building a fresh attempt and
//     never re-sends an already-settled operation; Req 7.8, 10.6, 11.7, 8.5)
//
// This suite has two layers, mirroring the sibling property suites
// (scripts/tests/authorization-integrity.property.test.mjs,
//  scripts/tests/confirmation-integrity.property.test.mjs):
//
//   1. MODEL LAYER (always runs): fast-check generates retries that reuse / vary
//      business idempotency keys, payload hashes, operations, programs, signed
//      submissions, and reconciler outcomes, then drives them through the REAL
//      `claimIdempotencyKey` (backed by an in-memory faithful reproduction of the
//      `claim_financial_idempotency_key` Postgres RPC) and the REAL
//      `createTransactionProtocol`. Genuine testnet transaction XDR is produced
//      with the installed Stellar SDK, so the protocol's network-bound envelope
//      parse runs for real rather than against a mock.
//
//      The property asserts, across every generated scenario, that a logical
//      operation (an (organization, scope, business-key) triple) yields AT MOST
//      one immutable intent and AT MOST one settled (observed_success) attempt —
//      a replay reconciles the prior intent (no second intent, no second
//      submission) and a conflicting key is always rejected without creating any
//      intent or attempt.
//
//   2. DATABASE LAYER (runs when a local Supabase stack is reachable): the same
//      dedup is asserted against the authoritative Postgres — the
//      `(organization_id, scope, idempotency_key)` unique constraint plus the
//      service-only `claim_financial_idempotency_key` RPC make a duplicate claim
//      structurally impossible, and no authenticated client can forge one
//      (`idempotency_keys` is service-only for writes). It is skipped with a
//      clear blocker message when the local stack is unavailable (no hosted
//      project is ever touched). Point it at a local database with SUPABASE_DB_URL.
//
// Minimized counterexamples and replay seeds: fast-check shrinks failing cases
// and reports the seed. Set FC_SEED to replay a specific run.

import fc from 'fast-check';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

// ---------------------------------------------------------------------------
// Recursive TypeScript module loader (repo test-harness convention, mirrors
// scripts/tests/edge-protocol.test.mjs). Relative dependencies are transpiled
// recursively; the bare `@stellar/stellar-sdk` specifier is remapped to the
// installed package so the built envelope is genuine testnet XDR, and
// `@supabase/supabase-js` is stubbed (the client is injected).
// ---------------------------------------------------------------------------

const require = createRequire(import.meta.url);
const sharedDir = fileURLToPath(new URL('../../supabase/functions/_shared/', import.meta.url));
const STELLAR_SDK_URL = pathToFileURL(require.resolve('@stellar/stellar-sdk')).href;

const SUPABASE_STUB_URL =
  'data:text/javascript;base64,' +
  Buffer.from(
    'export const createClient = () => { throw new Error("createClient stub must not be called"); };',
  ).toString('base64');

const moduleCache = new Map();
const toDataUrl = (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;

async function loadModule(absPath) {
  if (moduleCache.has(absPath)) return moduleCache.get(absPath);
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
  moduleCache.set(absPath, url);
  return url;
}

const importShared = async (relativePath) => import(await loadModule(path.join(sharedDir, relativePath)));

const sdk = await import('@stellar/stellar-sdk');
const sharedConfig = await importShared('../../../shared/stellar-config.ts');
const idempotency = await importShared('stellar/idempotency.ts');
const protocol = await importShared('stellar/protocol.ts');

// Replay seed support: `FC_SEED=<n> node --test ...` reproduces a run exactly.
const seedFromEnv = Number.parseInt(process.env.FC_SEED ?? '', 10);
const fcConfig = {
  numRuns: Number.parseInt(process.env.FC_NUM_RUNS ?? '250', 10),
  endOnFailure: true,
  ...(Number.isFinite(seedFromEnv) ? { seed: seedFromEnv } : {}),
};

// ---------------------------------------------------------------------------
// Deterministic fixtures.
// ---------------------------------------------------------------------------

const ISSUER = 'G' + 'A'.repeat(55);
const SAC = 'C' + 'A'.repeat(55);
const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';
const HEX_A = 'a'.repeat(64);
const HEX_B = 'b'.repeat(64);
const HEX_C = 'c'.repeat(64);
const PAYLOADS = [HEX_A, HEX_B, HEX_C];
const OPERATIONS = ['cash_distribution', 'voucher_redemption'];

const testnetConfig = () =>
  sharedConfig.createStellarTestnetConfig({
    horizonUrl: 'https://horizon-testnet.stellar.org',
    rpcUrl: 'https://soroban-testnet.stellar.org',
    rcphpIssuer: ISSUER,
    rcphpSacId: SAC,
  });

// A genuine, unsigned testnet transaction envelope for the build result. The
// protocol parses this with the trusted testnet passphrase during build/submit,
// so it must be real XDR.
const builtEnvelopeXdr = () => {
  const account = new sdk.Account(sdk.Keypair.random().publicKey(), '0');
  return new sdk.TransactionBuilder(account, { fee: '100', networkPassphrase: TESTNET_PASSPHRASE })
    .addOperation(sdk.Operation.bumpSequence({ bumpTo: '0' }))
    .setTimeout(0)
    .build()
    .toXDR();
};

// ---------------------------------------------------------------------------
// In-memory faithful reproduction of the `claim_financial_idempotency_key`
// Postgres RPC (supabase/migrations/20260716080000_add_distribution_financial_workflow.sql).
// The claim is keyed by the exact DB unique constraint
// `(organization_id, scope, idempotency_key)`; a repeat with a different
// payload_hash / operation_type / program_id raises SQLSTATE 23514, and an
// identical repeat advances last_seen_at (so the caller sees a replay).
// ---------------------------------------------------------------------------

function makeIdempotencyDatabase() {
  const rows = new Map(); // `${org}\u0000${scope}\u0000${key}` -> row
  let idSeq = 0;
  let tick = 0;
  const now = () => `t${++tick}`;

  const rpc = async (fn, params) => {
    assert.equal(fn, 'claim_financial_idempotency_key', 'unexpected RPC name');
    const composite = `${params.p_organization_id}\u0000${params.p_scope}\u0000${params.p_idempotency_key}`;
    const existing = rows.get(composite);

    if (!existing) {
      const t = now();
      const row = {
        id: `idem-${++idSeq}`,
        organization_id: params.p_organization_id,
        program_id: params.p_program_id ?? null,
        scope: params.p_scope,
        idempotency_key: params.p_idempotency_key,
        payload_hash: params.p_payload_hash,
        operation_type: params.p_operation_type,
        correlation_id: params.p_correlation_id,
        // Fresh insert: both timestamps equal now() (isReplay derives to false).
        first_seen_at: t,
        last_seen_at: t,
      };
      rows.set(composite, row);
      return { data: { ...row }, error: null };
    }

    // A reused key with different content is a hard conflict (never a second
    // transfer). Mirrors the RPC's `is distinct from` checks exactly.
    if (
      existing.payload_hash !== params.p_payload_hash ||
      existing.operation_type !== params.p_operation_type ||
      (existing.program_id ?? null) !== (params.p_program_id ?? null)
    ) {
      return {
        data: null,
        error: { code: '23514', message: 'idempotency key payload hash conflict' },
      };
    }

    // Identical replay: advance last_seen_at (isReplay derives to true) and
    // return the SAME stored row (same id => same prior intent).
    existing.last_seen_at = now();
    return { data: { ...existing }, error: null };
  };

  return { rows, rpc: (fn, params) => rpc(fn, params) };
}

// ---------------------------------------------------------------------------
// Injected persistence ports (in-memory; mutate status so retry classification
// sees real state transitions).
// ---------------------------------------------------------------------------

function makeIntentStore() {
  const byKeyId = new Map(); // idempotency_key_id -> intent record
  const inserted = [];
  return {
    byKeyId,
    inserted,
    async insertIntent(row) {
      const record = { ...row };
      inserted.push(record);
      byKeyId.set(row.idempotency_key_id, record);
      return record;
    },
    async findByIdempotencyKeyId(id) {
      return byKeyId.get(id) ?? null;
    },
  };
}

function makeAttemptStore() {
  const attempts = [];
  return {
    attempts,
    async insertAttempt(row) {
      const record = { ...row, transaction_hash: row.transaction_hash ?? null, result_code: null };
      attempts.push(record);
      return record;
    },
    async listAttempts(intentId) {
      return attempts
        .filter((a) => a.financial_intent_id === intentId)
        .sort((a, b) => a.attempt_number - b.attempt_number);
    },
    async markSubmitted({ attemptId, transactionHash, resultCode }) {
      const stored = attempts.find((a) => a.id === attemptId);
      if (stored) {
        stored.status = 'submitted';
        stored.transaction_hash = transactionHash;
        stored.result_code = resultCode ?? null;
      }
    },
  };
}

// A reconciliation gateway whose per-attempt outcome is supplied by the
// scenario. It reflects a terminal outcome back into the attempt store so the
// next retry classification observes the resolved state (as the real reconciler
// would).
function makeReconciler(attemptStore, outcomeFor) {
  const calls = [];
  return {
    calls,
    async reconcileAttempt(attempt) {
      const outcome = outcomeFor(attempt); // observed_success | observed_failure | unknown
      calls.push({ attemptId: attempt.id, outcome });
      const stored = attemptStore.attempts.find((a) => a.id === attempt.id);
      if (stored && (outcome === 'observed_success' || outcome === 'observed_failure')) {
        stored.status = outcome;
      }
      return outcome;
    },
  };
}

// A strategy whose build returns a genuine testnet envelope and whose
// verify/submit always accepts. `submit` reports acceptance only (never
// confirmation — that stays reconciliation-owned).
const strategyFor = (operationType) => ({
  operationType,
  async build() {
    return {
      network: 'stellar_testnet',
      envelopeXdr: builtEnvelopeXdr(),
      preparedPayloadHash: HEX_B,
      minLedger: null,
      maxLedger: 500,
      signingPackage: {
        kind: 'classic_envelope',
        unsignedEnvelopeXdr: 'UNSIGNED',
        transactionHash: HEX_B,
        networkPassphrase: TESTNET_PASSPHRASE,
      },
    };
  },
  async verifyAndAssemble() {
    return {
      transactionHash: HEX_B,
      submit: async () => ({ transactionHash: HEX_B, resultCode: 'txSUCCESS' }),
    };
  },
});

function makeEngine({ db, intents, attempts, reconciler }) {
  let idSeq = 0;
  return protocol.createTransactionProtocol({
    config: testnetConfig(),
    signers: { has: () => false }, // strategy is injected; no institutional signing here
    claim: (params) => idempotency.claimIdempotencyKey(db, params),
    intents,
    attempts,
    reconciler,
    clock: () => new Date('2026-01-01T00:00:00.000Z'),
    newId: () => `gen-${++idSeq}`,
  });
}

const prepareRequest = (over = {}) => ({
  organizationId: 'org-1',
  programId: 'prog-1',
  operationType: 'cash_distribution',
  scope: 'cash_distribution',
  idempotencyKey: 'key-1',
  payloadHash: HEX_A,
  correlationId: randomUUID(),
  amountStroops: 1000,
  assetCode: 'RCPHP',
  assetIssuer: ISSUER,
  ...over,
});

const isConflict = (err) =>
  err &&
  err.financialError &&
  err.financialError.code === 'validation_failed' &&
  err.financialError.retryable === false;

// ---------------------------------------------------------------------------
// MODEL LAYER — Property 2, business-key dedup on prepare (Req 8.5, 18.3).
//
// Any sequence of prepares that reuse / vary an (org, scope, key) triple yields
// AT MOST one immutable intent per triple: the first successful claim fixes the
// canonical (payload, operation, program); an identical repeat is a replay that
// reconciles the SAME prior intent (no second intent); a differing repeat is
// rejected as a non-retryable conflict that creates nothing.
// ---------------------------------------------------------------------------

const KEYS = ['key-a', 'key-b', 'key-c'];
const PROGRAMS = ['prog-1', 'prog-2'];

const prepareOpArb = fc.record({
  keyIdx: fc.nat({ max: KEYS.length - 1 }),
  payloadIdx: fc.nat({ max: PAYLOADS.length - 1 }),
  operationIdx: fc.nat({ max: OPERATIONS.length - 1 }),
  programIdx: fc.nat({ max: PROGRAMS.length - 1 }),
});

test('property: reusing a business idempotency key yields at most one intent per logical operation', async () => {
  await fc.assert(
    fc.asyncProperty(fc.array(prepareOpArb, { minLength: 1, maxLength: 30 }), async (ops) => {
      const db = makeIdempotencyDatabase();
      const intents = makeIntentStore();
      const attempts = makeAttemptStore();
      const reconciler = makeReconciler(attempts, () => 'unknown');
      const engine = makeEngine({ db, intents, attempts, reconciler });

      // Independent reference: the canonical (payload, operation, program) fixed
      // by the FIRST successful claim of each (scope, key) triple.
      const canonical = new Map(); // scope\u0000key -> { payload, operation, program, intentId }

      for (const op of ops) {
        const key = KEYS[op.keyIdx];
        const payloadHash = PAYLOADS[op.payloadIdx];
        const operationType = OPERATIONS[op.operationIdx];
        const programId = PROGRAMS[op.programIdx];
        const scope = operationType; // scope namespaces the key by operation
        const triple = `${scope}\u0000${key}`;
        const request = prepareRequest({
          scope,
          operationType,
          programId,
          idempotencyKey: key,
          payloadHash,
        });

        const priorInsertCount = intents.inserted.length;
        const ref = canonical.get(triple);
        const shouldConflict =
          ref !== undefined &&
          (ref.payload !== payloadHash || ref.operation !== operationType || ref.program !== programId);

        if (shouldConflict) {
          await assert.rejects(
            () => engine.prepare(request),
            (err) => isConflict(err),
            `a reused key with different content must be a non-retryable conflict: ${triple}`,
          );
          // A rejected conflict creates neither an intent nor an attempt.
          assert.equal(intents.inserted.length, priorInsertCount, 'a conflict must not persist an intent');
          continue;
        }

        const prepared = await engine.prepare(request);

        if (ref === undefined) {
          // First claim for the triple: a fresh immutable intent is persisted.
          assert.equal(prepared.isReplay, false, 'a first claim must not be a replay');
          assert.equal(intents.inserted.length, priorInsertCount + 1, 'a fresh claim persists exactly one intent');
          canonical.set(triple, {
            payload: payloadHash,
            operation: operationType,
            program: programId,
            intentId: prepared.intent.id,
          });
        } else {
          // Identical repeat: a replay reconciles the SAME prior intent and
          // never persists a second one.
          assert.equal(prepared.isReplay, true, 'an identical repeat must be a replay');
          assert.equal(intents.inserted.length, priorInsertCount, 'a replay must not persist a second intent');
          assert.equal(prepared.intent.id, ref.intentId, 'a replay must reconcile the SAME prior intent');
        }
      }

      // Global invariant: exactly one immutable intent and one claim row per
      // distinct logical operation that was successfully first-claimed.
      assert.equal(intents.inserted.length, canonical.size, 'one intent per logical operation');
      assert.equal(db.rows.size, canonical.size, 'one authoritative claim row per logical operation');
      const intentIds = new Set(intents.inserted.map((i) => i.id));
      assert.equal(intentIds.size, intents.inserted.length, 'intents are distinct — none was duplicated');
      return true;
    }),
    fcConfig,
  );
});

// ---------------------------------------------------------------------------
// MODEL LAYER — Property 2, at most one settlement across retries (Req 7.8,
// 8.5, 10.6, 11.7).
//
// For a single logical operation, an initial prepare/build/submit followed by
// any number of retries produces AT MOST one settled (observed_success) attempt
// and never re-sends an already-settled operation. A submitted / unknown attempt
// is always reconciled BEFORE a fresh attempt is built, so a real settlement is
// never abandoned and duplicated.
// ---------------------------------------------------------------------------

const retryOutcomeArb = fc.constantFrom('observed_success', 'observed_failure', 'unknown');

test('property: retries settle a logical operation at most once and never re-send a settled one', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.record({
        operationType: fc.constantFrom(...OPERATIONS),
        retryOutcomes: fc.array(retryOutcomeArb, { minLength: 0, maxLength: 12 }),
      }),
      async ({ operationType, retryOutcomes }) => {
        const db = makeIdempotencyDatabase();
        const intents = makeIntentStore();
        const attempts = makeAttemptStore();

        // The reconciler outcome for a given attempt is fixed the first time it
        // is observed (a real ledger result does not oscillate).
        const fixedOutcomes = new Map();
        let cursor = 0;
        const reconciler = makeReconciler(attempts, (attempt) => {
          if (!fixedOutcomes.has(attempt.id)) {
            fixedOutcomes.set(attempt.id, retryOutcomes[cursor % Math.max(retryOutcomes.length, 1)] ?? 'unknown');
            cursor += 1;
          }
          return fixedOutcomes.get(attempt.id);
        });
        const engine = makeEngine({ db, intents, attempts, reconciler });
        const strategy = strategyFor(operationType);

        const request = prepareRequest({ scope: operationType, operationType });

        // Initial prepare -> build -> submit (one submission for the operation).
        const prepared = await engine.prepare(request);
        assert.equal(prepared.isReplay, false);
        const built = await engine.build(prepared.intent, strategy);
        await engine.submit(
          { intent: prepared.intent, attempt: built.attempt },
          { kind: 'classic_envelope', signedEnvelopeXdr: 'SIGNED' },
          strategy,
        );

        let submissionCount = 1;

        for (const _ of retryOutcomes) {
          let outcome;
          try {
            outcome = await engine.retry(prepared.intent, strategy);
          } catch (err) {
            // An in-flight (unknown/pending) prior submission refuses a retry
            // with a retryable submission_unknown — it must NOT create a second
            // submission.
            assert.equal(err.financialError.code, 'submission_unknown');
            assert.equal(err.financialError.retryable, true);
            continue;
          }

          if (outcome.settled) {
            // Already settled: no fresh attempt was built, nothing re-sent.
            assert.equal(outcome.status, 'observed_success');
            continue;
          }

          // A fresh attempt is only built after the prior attempt was observed to
          // have FAILED (never after a success, never while still in flight).
          const built2 = outcome.built;
          assert.equal(built2.attempt.status, 'accepted');
          await engine.submit(
            { intent: prepared.intent, attempt: built2.attempt },
            { kind: 'classic_envelope', signedEnvelopeXdr: 'SIGNED' },
            strategy,
          );
          submissionCount += 1;
        }

        // Exactly one intent for the logical operation, regardless of retries.
        assert.equal(intents.inserted.length, 1, 'retries never create a second intent');

        // AT MOST one settled (observed_success) attempt: value moves at most
        // once per logical operation.
        const settled = attempts.attempts.filter((a) => a.status === 'observed_success');
        assert.ok(settled.length <= 1, `at most one settlement per logical operation, saw ${settled.length}`);

        // Every submission is a distinct attempt of the SAME intent (no attempt
        // was ever double-submitted).
        const submittedOrTerminal = attempts.attempts.filter((a) =>
          ['submitted', 'observed_success', 'observed_failure'].includes(a.status),
        );
        assert.equal(submittedOrTerminal.length, submissionCount, 'each submission is one distinct attempt');
        for (const a of attempts.attempts) {
          assert.equal(a.financial_intent_id, prepared.intent.id, 'all attempts belong to the one intent');
        }
        const attemptNumbers = attempts.attempts.map((a) => a.attempt_number);
        assert.equal(new Set(attemptNumbers).size, attemptNumbers.length, 'attempt numbers are unique (gap-free)');
        return true;
      },
    ),
    fcConfig,
  );
});

// ---------------------------------------------------------------------------
// MODEL LAYER — conflict rejection is exhaustive (Req 8.5).
//
// Systematically vary a single dimension (payload / operation / program) of a
// reused key: any single deviation is always rejected as a non-retryable
// conflict, and creates nothing.
// ---------------------------------------------------------------------------

test('property: any single-dimension reuse deviation is rejected without creating a claim', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.record({
        dimension: fc.constantFrom('payload', 'operation', 'program'),
      }),
      async ({ dimension }) => {
        const db = makeIdempotencyDatabase();
        const intents = makeIntentStore();
        const attempts = makeAttemptStore();
        const engine = makeEngine({ db, intents, attempts, reconciler: makeReconciler(attempts, () => 'unknown') });

        const base = prepareRequest({
          scope: 'cash_distribution',
          operationType: 'cash_distribution',
          programId: 'prog-1',
          idempotencyKey: 'key-x',
          payloadHash: HEX_A,
        });

        // First claim fixes the canonical content.
        const first = await engine.prepare(base);
        assert.equal(first.isReplay, false);
        const rowsAfterFirst = db.rows.size;

        // Reuse the SAME key but deviate in exactly one dimension.
        const deviated = {
          ...base,
          correlationId: randomUUID(),
          ...(dimension === 'payload' ? { payloadHash: HEX_B } : {}),
          ...(dimension === 'operation' ? { operationType: 'voucher_redemption' } : {}),
          ...(dimension === 'program' ? { programId: 'prog-2' } : {}),
        };

        await assert.rejects(
          () => engine.prepare(deviated),
          (err) => isConflict(err),
          `a ${dimension} deviation on a reused key must be a non-retryable conflict`,
        );

        // The conflict created nothing: no second intent, no new claim row.
        assert.equal(intents.inserted.length, 1, 'a conflict must not persist a second intent');
        assert.equal(db.rows.size, rowsAfterFirst, 'a conflict must not create a second claim row');
        return true;
      },
    ),
    fcConfig,
  );
});

// ---------------------------------------------------------------------------
// Positive coverage guard: the invariant must not be vacuously true — an
// identical replay DOES reconcile the prior intent without a second submission,
// and a genuine settlement DOES occur exactly once.
// ---------------------------------------------------------------------------

test('property is not vacuous: an identical replay reconciles the one intent and settles once', async () => {
  const db = makeIdempotencyDatabase();
  const intents = makeIntentStore();
  const attempts = makeAttemptStore();
  const reconciler = makeReconciler(attempts, () => 'observed_success');
  const engine = makeEngine({ db, intents, attempts, reconciler });
  const strategy = strategyFor('cash_distribution');
  const request = prepareRequest();

  // First operation prepares, builds, submits.
  const first = await engine.prepare(request);
  assert.equal(first.isReplay, false);
  const built = await engine.build(first.intent, strategy);
  await engine.submit(
    { intent: first.intent, attempt: built.attempt },
    { kind: 'classic_envelope', signedEnvelopeXdr: 'SIGNED' },
    strategy,
  );

  // A byte-identical replay of the SAME business key returns the prior intent
  // and persists nothing new.
  const replay = await engine.prepare({ ...request, correlationId: randomUUID() });
  assert.equal(replay.isReplay, true);
  assert.equal(replay.intent.id, first.intent.id);
  assert.equal(intents.inserted.length, 1);

  // Retrying observes the prior success and settles exactly once; no re-send.
  const outcome = await engine.retry(first.intent, strategy);
  assert.equal(outcome.settled, true);
  assert.equal(outcome.status, 'observed_success');
  assert.equal(attempts.attempts.filter((a) => a.status === 'observed_success').length, 1);
  assert.equal(attempts.attempts.filter((a) => a.status === 'submitted').length, 0);

  // A conflicting reuse of the same key is rejected outright.
  await assert.rejects(
    () => engine.prepare({ ...request, payloadHash: HEX_C, correlationId: randomUUID() }),
    (err) => isConflict(err),
  );
  assert.equal(intents.inserted.length, 1);
});

// ---------------------------------------------------------------------------
// DATABASE LAYER (runs against reset local fixtures when reachable).
//
// Proves the dedup at the authoritative Postgres: the
// `(organization_id, scope, idempotency_key)` unique constraint makes a
// duplicate claim structurally impossible, and `idempotency_keys` is service-
// only for writes so no authenticated client can forge a second claim. No hosted
// project is contacted.
// ---------------------------------------------------------------------------

const DB_URL = process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

async function openDatabase() {
  let pg;
  try {
    ({ default: pg } = await import('pg'));
  } catch {
    return null; // pg not installed
  }
  const client = new pg.Client({ connectionString: DB_URL, connectionTimeoutMillis: 2000 });
  try {
    await client.connect();
    return client;
  } catch {
    try {
      await client.end();
    } catch {
      /* ignore */
    }
    return null;
  }
}

async function insertAuthUser(client, id, email) {
  await client.query(
    `insert into auth.users (
       id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
       raw_app_meta_data, raw_user_meta_data, created_at, updated_at
     ) values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated',
       'authenticated', $2, '', now(),
       '{"provider":"email","providers":["email"]}', '{}', now(), now())`,
    [id, email],
  );
}

async function actAs(client, sub) {
  const claims = JSON.stringify({
    sub,
    role: 'authenticated',
    aal: 'aal2',
    amr: [{ method: 'totp', timestamp: Math.floor(Date.now() / 1000) }],
  });
  await client.query('set local role authenticated');
  await client.query(`select set_config('request.jwt.claims', $1, true)`, [claims]);
  await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [sub]);
}

test('property: the authoritative claim admits no duplicate settlement key (database)', async (t) => {
  const client = await openDatabase();
  if (!client) {
    t.skip(
      `local Supabase database unavailable at ${DB_URL}. ` +
        'Run `npx supabase start` and `npx supabase db reset`, then re-run the property suite. ' +
        'No hosted project is contacted.',
    );
    return;
  }

  try {
    // A service-role connection to exercise the claim RPC end to end.
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          repeats: fc.integer({ min: 1, max: 5 }),
          conflictAfter: fc.boolean(),
        }),
        async (scenario) => {
          await client.query('begin');
          try {
            // Minimal fixture: one organization owning the claim.
            const orgId = randomUUID();
            await client.query(
              `insert into public.organizations (id, name, slug, organization_type, status)
               values ($1, 'Prop Org', $2, 'lgu', 'active')`,
              [orgId, `prop-${orgId.slice(0, 8)}`],
            );

            const key = `dedupe-${randomUUID()}`;
            const scope = 'cash_distribution';
            const correlation = randomUUID();

            const claim = (payloadHash, programId = null) =>
              client.query(
                `select id, first_seen_at, last_seen_at
                 from public.claim_financial_idempotency_key($1, $2, $3, $4, $5, $6, $7)`,
                [orgId, programId, scope, key, payloadHash, 'cash_distribution', correlation],
              );

            // The first claim inserts exactly one row.
            const first = await claim(HEX_A);
            const claimedId = first.rows[0].id;

            // Any number of identical repeats reconcile the SAME row — never a
            // second one.
            for (let i = 0; i < scenario.repeats; i += 1) {
              const again = await claim(HEX_A);
              assert.equal(again.rows[0].id, claimedId, 'an identical claim must return the same row');
            }

            const count = await client.query(
              `select count(*)::int as n from public.idempotency_keys
               where organization_id = $1 and scope = $2 and idempotency_key = $3`,
              [orgId, scope, key],
            );
            assert.equal(count.rows[0].n, 1, 'exactly one claim row exists for the logical operation');

            // A reused key with a different payload is rejected outright.
            if (scenario.conflictAfter) {
              await assert.rejects(
                () => claim(HEX_B),
                /payload hash conflict/i,
                'a reused key with a different payload must be rejected',
              );
            }

            // An authenticated (non-service) client can neither call the claim
            // RPC nor write the table directly, so it can never forge a claim.
            const userId = randomUUID();
            await insertAuthUser(client, userId, `user-${userId}@example.test`);
            await actAs(client, userId);
            await assert.rejects(
              client.query(
                `insert into public.idempotency_keys
                   (organization_id, scope, idempotency_key, payload_hash, operation_type, correlation_id)
                 values ($1, $2, $3, $4, 'cash_distribution', $5)`,
                [orgId, scope, `forged-${randomUUID()}`, HEX_C, correlation],
              ),
              /row-level security|permission denied/i,
              'an authenticated client must not write idempotency_keys directly',
            );
            await client.query('reset role');

            return true;
          } finally {
            await client.query('rollback');
          }
        },
      ),
      { numRuns: Number.parseInt(process.env.FC_DB_NUM_RUNS ?? '15', 10), endOnFailure: true },
    );
  } finally {
    await client.end();
  }
});

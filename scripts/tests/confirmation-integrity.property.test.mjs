// Property 4: Confirmation Integrity
//
// "No projection or UI state becomes confirmed without matching ledger evidence
//  on the configured network."
//
// Validates: Requirements 6.4, 11.8, 18.1, 18.8, 21.4
//
// Property-testing library (pinned): fast-check 3.23.2 (see package.json
// devDependencies).
//
// This suite has two layers, mirroring the sibling property suites
// (scripts/tests/authorization-integrity.property.test.mjs,
//  scripts/tests/tenant-isolation.property.test.mjs,
//  scripts/tests/monotonic-auditability.property.test.mjs,
//  scripts/tests/policy-immutability.property.test.mjs):
//
//   1. MODEL LAYER (always runs): fast-check generates immutable intents,
//      in-flight / terminal transaction attempts, observed networks,
//      transaction / contract identifiers, ledger outcomes, and projection
//      writes, then drives them through the CANONICAL shared confirmation logic:
//        - supabase/functions/_shared/stellar/reconciliation.ts  (the ONLY place
//          an in-flight attempt transitions to `observed_success` — and only
//          after exact configured-network + matching-tx-hash ledger evidence;
//          Task 6.4, Req 18.1, 18.8, 6.4, 11.8)
//        - supabase/functions/_shared/stellar/protocol.ts        (submit marks
//          only `submitted`, never confirmed; confirmation is reconciler-owned)
//      The real reconciliation worker is transpiled in-memory and imported as a
//      data: URL, then bound to in-memory observer / projector / evidence /
//      issue / projection ports. Confirmation is therefore proven against the
//      genuine worker rather than a mock, using a real testnet
//      {@link StellarTestnetConfig} and its fail-closed network guard.
//
//      The property asserts, across every generated scenario, that an attempt
//      newly reaches `observed_success` (ledger-confirmed) IFF it was in flight
//      and the observation was an exact successful configured-network settlement
//      whose transaction hash matched the exact submitted hash. A submission
//      alone, a wrong network, a mismatched hash, a still-pending or never-landed
//      observation, or a settlement failure NEVER confirms. A projection is
//      written `confirmed` (not quarantined) only when observed evidence matched;
//      a projection mismatch is quarantined and never invented into ownership.
//
//   2. DATABASE LAYER (runs when a local Supabase stack is reachable): the same
//      confirmation boundary is asserted against the authoritative Postgres RLS
//      on reset local fixtures — an authenticated client can never fabricate
//      confirmation evidence, because `ledger_transactions` and
//      `reconciliation_runs` are service-only. It is skipped with a clear blocker
//      message when the local stack is unavailable (no hosted project is ever
//      touched). Point it at a local database with SUPABASE_DB_URL.
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
// scripts/tests/authorization-integrity.property.test.mjs). Relative
// dependencies are transpiled recursively; the bare `@stellar/stellar-sdk`
// specifier is remapped to the installed package and `@supabase/supabase-js` is
// stubbed (never called on the reconciliation path).
// ---------------------------------------------------------------------------

const require = createRequire(import.meta.url);
const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const sharedDir = path.join(repoRoot, 'supabase/functions/_shared/');
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

const importAbs = async (absPath) => import(await loadModule(absPath));

const sdk = await import('@stellar/stellar-sdk');
const reconciliationModule = await importAbs(path.join(sharedDir, 'stellar/reconciliation.ts'));
const stellarConfigModule = await importAbs(path.join(repoRoot, 'shared/stellar-config.ts'));

const { createReconciliationWorker, PILOT_WALLET_NETWORK } = reconciliationModule;
const { createStellarTestnetConfig, STELLAR_TESTNET_NETWORK_PASSPHRASE } = stellarConfigModule;

// Replay seed support: `FC_SEED=<n> node --test ...` reproduces a run exactly.
const seedFromEnv = Number.parseInt(process.env.FC_SEED ?? '', 10);
const fcConfig = {
  numRuns: Number.parseInt(process.env.FC_NUM_RUNS ?? '300', 10),
  endOnFailure: true,
  ...(Number.isFinite(seedFromEnv) ? { seed: seedFromEnv } : {}),
};

// ---------------------------------------------------------------------------
// Deterministic evidence constants (all valid ledger shapes).
// ---------------------------------------------------------------------------

const CONFIG = createStellarTestnetConfig();
const WRONG_PASSPHRASE = 'Public Global Stellar Network ; September 2015';
const ATTEMPT_HASH = 'a'.repeat(64); // the exact submitted tx hash for an attempt
const OTHER_HASH = 'b'.repeat(64); // a different (mismatched) observed tx hash
const ENVELOPE_SHA = 'c'.repeat(64);
const EVENT_SHA = 'd'.repeat(64);
const CONTRACT_ID = sdk.Address.contract(Buffer.alloc(32, 1)).toString();

const IN_FLIGHT = new Set(['submitted', 'unknown']);
const isInFlight = (status) => IN_FLIGHT.has(status);

// ---------------------------------------------------------------------------
// In-memory world: the CANONICAL reconciliation worker bound to injected ports
// that record everything the worker writes. A fresh world is built per scenario
// so no state leaks between generated cases.
// ---------------------------------------------------------------------------

function makeWorld({ observation, projectionOutcome, intent }) {
  const captured = {
    projectionWrites: [],
    issues: [],
    ledgerInserts: [],
    contractEventInserts: [],
    markObserved: [],
  };

  const observer = {
    async observeAttempt() {
      return observation;
    },
  };

  const projector = {
    async project(input) {
      if (projectionOutcome === 'repaired') {
        return {
          kind: 'repaired',
          writes: [
            {
              table: 'distribution_recipient_projections',
              rows: {
                attempt_id: input.attempt.id,
                is_quarantined: false,
                reconciled_at: input.run.reconciledAt,
              },
            },
          ],
        };
      }
      if (projectionOutcome === 'mismatch') {
        return {
          kind: 'mismatch',
          mismatch: {
            issueType: 'balance_mismatch',
            subjectType: 'projection',
            subjectIdentifier: input.attempt.id,
            projectionTable: 'distribution_recipient_projections',
            projectionKey: { attempt_id: input.attempt.id },
            expectedState: { confirmed: false },
            observedState: { confirmed: true },
            quarantine: (issueId) => [
              {
                table: 'distribution_recipient_projections',
                rows: {
                  attempt_id: input.attempt.id,
                  is_quarantined: true,
                  quarantine_issue_id: issueId,
                },
              },
            ],
          },
        };
      }
      return { kind: 'unchanged' };
    },
  };

  const evidence = {
    async upsertLedgerTransaction(insert) {
      captured.ledgerInserts.push(insert);
      return { id: randomUUID(), created: true };
    },
    async upsertContractEvent(insert) {
      captured.contractEventInserts.push(insert);
      return { id: randomUUID(), created: true };
    },
  };

  const stores = {
    async listPending() {
      return [];
    },
    async loadIntent() {
      return intent;
    },
    async markObserved(params) {
      captured.markObserved.push(params);
    },
    async startRun(insert) {
      return { ...insert };
    },
    async completeRun() {
      /* recorded elsewhere; not needed for the invariant */
    },
  };

  const cursors = {
    async advance() {
      /* no cursor value is supplied by the gateway path */
    },
  };

  const issues = {
    async record(params) {
      captured.issues.push(params);
      return randomUUID();
    },
  };

  const projections = {
    async write(writes) {
      for (const w of writes) captured.projectionWrites.push(w);
    },
  };

  const worker = createReconciliationWorker({
    config: CONFIG,
    observer,
    projector,
    evidence,
    stores,
    cursors,
    issues,
    projections,
  });

  return { worker, captured };
}

// ---------------------------------------------------------------------------
// Scenario generator: intents, attempts, networks, tx/contract identifiers,
// ledger outcomes, and projection writes.
// ---------------------------------------------------------------------------

const scenarioArb = fc.record({
  // The attempt's starting state. Only `submitted` / `unknown` are in flight and
  // eligible to transition; the rest must pass through unchanged.
  attemptStatus: fc.constantFrom('submitted', 'unknown', 'accepted', 'observed_success', 'observed_failure'),
  // Whether the attempt carries a submitted transaction hash. When null the
  // reconciler cannot compare hashes (it accepts the observed hash directly).
  attemptHasHash: fc.boolean(),
  // Whether an immutable intent is loadable behind the attempt.
  hasIntent: fc.boolean(),
  // What the ledger observation reports.
  observationKind: fc.constantFrom('settled_success', 'settled_failure', 'still_pending', 'not_found'),
  // Whether the observed network is the configured testnet.
  networkCorrect: fc.boolean(),
  // Whether the observed tx hash matches the attempt's submitted hash.
  hashMatches: fc.boolean(),
  // How the rail-specific projector reconciles the read model on a confirmation.
  projectionOutcome: fc.constantFrom('unchanged', 'repaired', 'mismatch'),
  // Number of observed contract events accompanying a successful settlement.
  eventCount: fc.integer({ min: 0, max: 2 }),
  ledgerSequence: fc.integer({ min: 1, max: 5_000_000 }),
});

const buildAttempt = (scenario) => ({
  id: randomUUID(),
  financial_intent_id: scenario.hasIntent ? randomUUID() : null,
  organization_id: randomUUID(),
  program_id: null,
  distribution_job_id: null,
  beneficiary_identity_id: null,
  correlation_id: randomUUID(),
  attempt_number: 1,
  status: scenario.attemptStatus,
  network: PILOT_WALLET_NETWORK,
  intent_payload_hash: null,
  prepared_payload_hash: null,
  envelope_xdr: 'AAAAAgAAAAA=',
  authorization_payload: null,
  transaction_hash: scenario.attemptHasHash ? ATTEMPT_HASH : null,
  min_ledger: null,
  max_ledger: scenario.ledgerSequence + 100,
});

const buildObservedLedger = (scenario) => ({
  networkPassphrase: scenario.networkCorrect ? STELLAR_TESTNET_NETWORK_PASSPHRASE : WRONG_PASSPHRASE,
  // If the attempt has a hash we honour the matches flag; otherwise a valid hash
  // is used directly (there is nothing to compare against).
  transactionHash: !scenario.attemptHasHash
    ? ATTEMPT_HASH
    : scenario.hashMatches
      ? ATTEMPT_HASH
      : OTHER_HASH,
  successful: scenario.observationKind === 'settled_success',
  ledgerSequence: scenario.ledgerSequence,
  ledgerClosedAt: new Date(Date.now() - 30_000).toISOString(),
  envelopeXdr: 'AAAAAgAAAAA=',
  envelopeSha256: ENVELOPE_SHA,
  resultCode: scenario.observationKind === 'settled_success' ? 'tx_success' : 'tx_failed',
  errorCode: scenario.observationKind === 'settled_success' ? null : 'tx_failed',
  errorMessage: null,
  errorDetails: {},
});

const buildEvents = (scenario) =>
  Array.from({ length: scenario.eventCount }, (_, i) => ({
    contractId: CONTRACT_ID,
    ledgerSequence: scenario.ledgerSequence,
    eventIndex: i,
    eventType: 'redeem',
    eventTopics: ['redeem'],
    eventPayload: { index: i },
    eventXdr: 'AAAAAA==',
    eventSha256: EVENT_SHA,
  }));

const buildObservation = (scenario) => {
  switch (scenario.observationKind) {
    case 'settled_success':
      return { kind: 'settled_success', ledger: buildObservedLedger(scenario), events: buildEvents(scenario) };
    case 'settled_failure':
      return { kind: 'settled_failure', ledger: buildObservedLedger(scenario) };
    case 'still_pending':
      return { kind: 'still_pending' };
    case 'not_found':
      return { kind: 'not_found' };
    default:
      throw new Error(`unhandled observation kind ${scenario.observationKind}`);
  }
};

const buildIntent = (attempt) =>
  attempt.financial_intent_id === null
    ? null
    : {
        id: attempt.financial_intent_id,
        correlation_id: attempt.correlation_id,
        operation_type: 'cash_distribution',
        organization_id: attempt.organization_id,
        program_id: null,
        payload_hash: 'e'.repeat(64),
        amount_stroops: 1_000,
        asset_code: 'RCPHP',
        asset_issuer: null,
        beneficiary_identity_id: null,
        distribution_job_id: null,
        distribution_recipient_id: null,
        requested_by: null,
        request_metadata: {},
        created_at: new Date().toISOString(),
      };

// Reference confirmation decision, encoded INDEPENDENTLY of the worker: an
// in-flight attempt is newly confirmed IFF the observation is an exact
// successful settlement on the configured network whose hash matches the exact
// submitted hash (or there was no submitted hash to contradict).
const referenceHashOk = (scenario) => (scenario.attemptHasHash ? scenario.hashMatches : true);
const referenceShouldConfirm = (scenario) =>
  isInFlight(scenario.attemptStatus) &&
  scenario.observationKind === 'settled_success' &&
  scenario.networkCorrect &&
  referenceHashOk(scenario);

// Reference resolved status for the full state machine.
const referenceResolvedStatus = (scenario) => {
  const status = scenario.attemptStatus;
  if (!isInFlight(status)) return status; // idempotent passthrough
  switch (scenario.observationKind) {
    case 'settled_success':
      // Wrong network throws (caught, stays in flight); mismatched hash raises an
      // integrity issue and stays in flight; only an exact match confirms.
      return scenario.networkCorrect && referenceHashOk(scenario) ? 'observed_success' : status;
    case 'settled_failure':
      return scenario.networkCorrect ? 'observed_failure' : status;
    case 'not_found':
      return 'unknown'; // submitted -> unknown; unknown stays unknown
    case 'still_pending':
      return status;
    default:
      throw new Error('unreachable');
  }
};

// ---------------------------------------------------------------------------
// MODEL LAYER — confirmation integrity (Req 6.4, 11.8, 18.1, 18.8, 21.4).
// ---------------------------------------------------------------------------

test('property: an attempt reaches confirmed only from exact successful configured-network ledger evidence', async () => {
  await fc.assert(
    fc.asyncProperty(scenarioArb, async (scenario) => {
      const attempt = buildAttempt(scenario);
      const { worker, captured } = makeWorld({
        observation: buildObservation(scenario),
        projectionOutcome: scenario.projectionOutcome,
        intent: buildIntent(attempt),
      });

      const resolved = await worker.reconcileAttempt(attempt);

      // 1. The full state machine matches the independent reference.
      assert.equal(
        resolved,
        referenceResolvedStatus(scenario),
        `resolved status mismatch for ${JSON.stringify(scenario)}`,
      );

      // 2. The core invariant: a NEW confirmation happens IFF exact successful
      //    configured-network evidence with a matching hash was observed for an
      //    in-flight attempt. A submission alone, wrong network, mismatched hash,
      //    pending / not-found observation, or failure never newly confirms.
      const newlyConfirmed = isInFlight(scenario.attemptStatus) && resolved === 'observed_success';
      assert.equal(
        newlyConfirmed,
        referenceShouldConfirm(scenario),
        `confirmation must require exact success evidence for ${JSON.stringify(scenario)}`,
      );

      // 3. A pre-resolved (non-in-flight) attempt is never re-observed or
      //    re-confirmed; it passes through unchanged with no side effects.
      if (!isInFlight(scenario.attemptStatus)) {
        assert.equal(resolved, scenario.attemptStatus);
        assert.equal(captured.ledgerInserts.length, 0, 'a terminal attempt must not append ledger evidence');
        assert.equal(captured.projectionWrites.length, 0, 'a terminal attempt must not write projections');
      }

      // 4. Ledger evidence is appended only when a settlement was observed on the
      //    configured network with a matching hash (the confirmation gate). No
      //    wrong-network / mismatched-hash observation ever lands evidence.
      if (captured.ledgerInserts.length > 0) {
        assert.ok(
          isInFlight(scenario.attemptStatus) &&
            (scenario.observationKind === 'settled_success' || scenario.observationKind === 'settled_failure') &&
            scenario.networkCorrect &&
            (scenario.observationKind === 'settled_failure' || referenceHashOk(scenario)),
          `ledger evidence must only be appended for verified settlements: ${JSON.stringify(scenario)}`,
        );
      }

      // 5. Projection confirmation integrity: a projection is written for a
      //    confirmation only, a `confirmed` (non-quarantined) projection appears
      //    only when observed evidence matched AND the projector repaired it, and
      //    any mismatch is quarantined with an issue reference — never invented
      //    into confirmed ownership.
      if (captured.projectionWrites.length > 0) {
        assert.ok(
          referenceShouldConfirm(scenario),
          `projections are written only on confirmation: ${JSON.stringify(scenario)}`,
        );
        for (const write of captured.projectionWrites) {
          const rows = write.rows;
          if (rows.is_quarantined === false) {
            assert.equal(
              scenario.projectionOutcome,
              'repaired',
              'a confirmed (non-quarantined) projection requires matching repaired evidence',
            );
          } else {
            assert.equal(rows.is_quarantined, true, 'a non-repaired projection write must be quarantined');
            assert.ok(rows.quarantine_issue_id, 'a quarantined projection must reference its issue');
          }
        }
      }

      // 6. A mismatched hash on an otherwise-successful configured-network
      //    settlement raises an integrity issue rather than confirming falsely.
      if (
        isInFlight(scenario.attemptStatus) &&
        scenario.observationKind === 'settled_success' &&
        scenario.networkCorrect &&
        scenario.attemptHasHash &&
        !scenario.hashMatches
      ) {
        assert.notEqual(resolved, 'observed_success', 'a mismatched hash must never confirm');
        assert.ok(
          captured.issues.some((i) => i.issueType === 'transaction_mismatch'),
          'a mismatched hash must raise a transaction_mismatch integrity issue',
        );
        assert.equal(captured.ledgerInserts.length, 0, 'a mismatched hash must not append ledger evidence');
      }

      return true;
    }),
    fcConfig,
  );
});

test('property: a submission alone (still pending or never landed) never confirms', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.record({
        attemptStatus: fc.constantFrom('submitted', 'unknown'),
        observationKind: fc.constantFrom('still_pending', 'not_found'),
        attemptHasHash: fc.boolean(),
      }),
      async (partial) => {
        const scenario = {
          ...partial,
          hasIntent: false,
          networkCorrect: true,
          hashMatches: true,
          projectionOutcome: 'unchanged',
          eventCount: 0,
          ledgerSequence: 42,
        };
        const attempt = buildAttempt(scenario);
        const { worker, captured } = makeWorld({
          observation: buildObservation(scenario),
          projectionOutcome: 'unchanged',
          intent: null,
        });
        const resolved = await worker.reconcileAttempt(attempt);
        assert.notEqual(resolved, 'observed_success', 'a pending / not-found observation must never confirm');
        assert.equal(captured.ledgerInserts.length, 0, 'nothing is appended without a settlement');
        assert.equal(captured.projectionWrites.length, 0, 'nothing is confirmed without a settlement');
        return true;
      },
    ),
    fcConfig,
  );
});

test('property: a wrong-network or mismatched-hash settlement never confirms', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.record({
        attemptStatus: fc.constantFrom('submitted', 'unknown'),
        // At least one of these makes the evidence non-matching.
        breakNetwork: fc.boolean(),
        breakHash: fc.boolean(),
      }),
      async ({ attemptStatus, breakNetwork, breakHash }) => {
        // Ensure the evidence is genuinely non-matching in at least one dimension.
        const networkCorrect = breakNetwork ? false : breakHash ? true : false;
        const hashMatches = breakHash ? false : true;
        const scenario = {
          attemptStatus,
          attemptHasHash: true,
          hasIntent: false,
          observationKind: 'settled_success',
          networkCorrect,
          hashMatches,
          projectionOutcome: 'repaired',
          eventCount: 1,
          ledgerSequence: 99,
        };
        const attempt = buildAttempt(scenario);
        const { worker, captured } = makeWorld({
          observation: buildObservation(scenario),
          projectionOutcome: 'repaired',
          intent: null,
        });
        const resolved = await worker.reconcileAttempt(attempt);
        assert.notEqual(resolved, 'observed_success', 'non-matching evidence must never confirm');
        assert.equal(
          captured.projectionWrites.length,
          0,
          'no projection is confirmed from non-matching evidence',
        );
        return true;
      },
    ),
    fcConfig,
  );
});

// ---------------------------------------------------------------------------
// Positive coverage guard: the invariant must not be vacuously true — a genuine
// exact settlement DOES confirm, and concrete deviations do NOT.
// ---------------------------------------------------------------------------

test('property is not vacuous: exact evidence confirms while deviations do not', async () => {
  const base = {
    attemptStatus: 'submitted',
    attemptHasHash: true,
    hasIntent: true,
    observationKind: 'settled_success',
    networkCorrect: true,
    hashMatches: true,
    projectionOutcome: 'repaired',
    eventCount: 1,
    ledgerSequence: 1234,
  };

  // Exact successful configured-network settlement with a matching hash confirms
  // and writes a confirmed (non-quarantined) projection.
  {
    const attempt = buildAttempt(base);
    const { worker, captured } = makeWorld({
      observation: buildObservation(base),
      projectionOutcome: 'repaired',
      intent: buildIntent(attempt),
    });
    const resolved = await worker.reconcileAttempt(attempt);
    assert.equal(resolved, 'observed_success');
    assert.equal(captured.ledgerInserts.length, 1);
    assert.ok(captured.projectionWrites.every((w) => w.rows.is_quarantined === false));
  }

  // A confirmed settlement whose projection disagrees is quarantined — the
  // attempt reflects ledger truth but no confirmed projection is invented.
  {
    const attempt = buildAttempt(base);
    const { worker, captured } = makeWorld({
      observation: buildObservation(base),
      projectionOutcome: 'mismatch',
      intent: buildIntent(attempt),
    });
    const resolved = await worker.reconcileAttempt(attempt);
    assert.equal(resolved, 'observed_success');
    assert.ok(captured.projectionWrites.length > 0);
    assert.ok(captured.projectionWrites.every((w) => w.rows.is_quarantined === true));
    assert.ok(captured.issues.length > 0);
  }

  // Wrong network never confirms and appends nothing.
  {
    const scenario = { ...base, networkCorrect: false };
    const attempt = buildAttempt(scenario);
    const { worker, captured } = makeWorld({
      observation: buildObservation(scenario),
      projectionOutcome: 'repaired',
      intent: buildIntent(attempt),
    });
    const resolved = await worker.reconcileAttempt(attempt);
    assert.equal(resolved, 'submitted');
    assert.equal(captured.ledgerInserts.length, 0);
    assert.equal(captured.projectionWrites.length, 0);
  }

  // Mismatched hash never confirms; a transaction_mismatch issue is raised.
  {
    const scenario = { ...base, hashMatches: false };
    const attempt = buildAttempt(scenario);
    const { worker, captured } = makeWorld({
      observation: buildObservation(scenario),
      projectionOutcome: 'repaired',
      intent: buildIntent(attempt),
    });
    const resolved = await worker.reconcileAttempt(attempt);
    assert.equal(resolved, 'submitted');
    assert.equal(captured.ledgerInserts.length, 0);
    assert.ok(captured.issues.some((i) => i.issueType === 'transaction_mismatch'));
  }
});

// ---------------------------------------------------------------------------
// DATABASE LAYER (runs against reset local fixtures when reachable).
//
// Proves the confirmation boundary at the authoritative Postgres RLS: an
// authenticated client can never FABRICATE confirmation evidence, because
// `ledger_transactions` and `reconciliation_runs` are service-only. Confirmation
// therefore cannot originate anywhere but the server reconciler observing the
// ledger. No hosted project is contacted.
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

test('property: RLS refuses client-side fabrication of confirmation evidence (database)', async (t) => {
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
    await fc.assert(
      fc.asyncProperty(
        fc.record({ successful: fc.boolean(), sequence: fc.integer({ min: 1, max: 5_000_000 }) }),
        async (scenario) => {
          await client.query('begin');
          try {
            const userId = randomUUID();
            await insertAuthUser(client, userId, `user-${userId}@example.test`);
            await actAs(client, userId);

            // A client can never INSERT ledger_transactions: confirmation evidence
            // is service-only and can only be appended by the reconciler.
            await assert.rejects(
              client.query(
                `insert into public.ledger_transactions
                   (network, transaction_hash, envelope_xdr, envelope_sha256, ledger_sequence,
                    ledger_closed_at, successful)
                 values ('stellar_testnet', $1, 'AAAA', $2, $3, now(), $4)`,
                [ATTEMPT_HASH, ENVELOPE_SHA, scenario.sequence, scenario.successful],
              ),
              /row-level security|permission denied/i,
              'a client must not fabricate a confirmed ledger_transactions row',
            );

            // A client can never INSERT reconciliation_runs: reconciliation is
            // driven solely by the server reconciler.
            await assert.rejects(
              client.query(
                `insert into public.reconciliation_runs (stream_name, network, status, started_at)
                 values ('client_forged', 'stellar_testnet', 'running', now())`,
              ),
              /row-level security|permission denied/i,
              'a client must not fabricate a reconciliation run',
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

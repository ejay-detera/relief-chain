// Unit tests for the scheduled Soroban TTL keeper and archived-data recovery.
//
// Covers the pure planning/gate logic and the keeper orchestration of:
//   supabase/functions/_shared/stellar/ttl-maintenance.ts
//
// The ledger clock, entry reader, extender, restorer, and alert sink are all
// mocked, so the tests assert exactly the behavior the module owns:
//   - threshold-driven classification: which live entries need extension, which
//     are below the pre-expiry alert threshold, and which are archived;
//   - the scheduled keeper extends only what needs extending, raises pre-expiry
//     and archived alerts, and reports an archived incident (Requirements 22.5,
//     22.7);
//   - idempotent archived-data restore: it restores + re-extends archived
//     entries, and a second run is a safe no-op (Requirement 22.5);
//   - the activation gate makes the keeper a prerequisite: archived data or a
//     missing/short-runway instance/WASM entry blocks activation (24.7).
//
// Validates: Requirements 22.5, 22.7, 24.7
//
// Loading mirrors edge-reconciliation.test.mjs: TypeScript modules are
// transpiled in-memory and imported as data: URLs, @supabase/supabase-js is
// stubbed (unused here), and @stellar/stellar-sdk resolves to the real package.

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
const ttl = await importShared('stellar/ttl-maintenance.ts');

// ---------------------------------------------------------------------------
// Fixtures.
// ---------------------------------------------------------------------------

const ISSUER = 'G' + 'A'.repeat(55);
const SAC = 'C' + 'A'.repeat(55);
const HORIZON = 'https://horizon-testnet.stellar.org';
const RPC = 'https://soroban-testnet.stellar.org';

const testnetConfig = () =>
  sharedConfig.createStellarTestnetConfig({
    horizonUrl: HORIZON,
    rpcUrl: RPC,
    rcphpIssuer: ISSUER,
    rcphpSacId: SAC,
  });

const CURRENT_LEDGER = 100_000;
// refundWindow(1000) + safetyBuffer(500) = extendTo 1500; alert at <= 2000 ledgers.
const policy = () => ({ refundWindowLedgers: 1000, safetyBufferLedgers: 500, alertThresholdLedgers: 2000 });

const entry = (over = {}) => ({
  key: over.key ?? 'k-1',
  kind: over.kind ?? 'persistent',
  liveUntilLedger:
    over.liveUntilLedger === undefined ? CURRENT_LEDGER + 5000 : over.liveUntilLedger,
  archived: over.archived,
  ledgerKeyXdr: over.ledgerKeyXdr ?? null,
});

// A healthy instance + wasm pair, both extended well beyond target.
const healthyInstance = () => entry({ key: 'instance', kind: 'instance', liveUntilLedger: CURRENT_LEDGER + 5000 });
const healthyWasm = () => entry({ key: 'wasm', kind: 'wasm', liveUntilLedger: CURRENT_LEDGER + 5000 });

// Ports.
const clockAt = (ledger) => ({
  calls: 0,
  async currentLedger() {
    this.calls += 1;
    return ledger;
  },
});

const readerOf = (world) => ({
  async readEntries() {
    return world.entries.map((e) => ({ ...e }));
  },
});

const recordingExtender = () => ({
  calls: [],
  async extend(params) {
    this.calls.push(params);
    return { submitted: true, transactionHash: 'a'.repeat(64), entryCount: params.entries.length };
  },
});

// A restorer that mutates the shared world so a re-read shows the entries live —
// this is what makes restore idempotent (a second run finds nothing archived).
const worldRestorer = (world) => ({
  calls: [],
  async restore(params) {
    this.calls.push(params);
    const restoredKeys = new Set(params.entries.map((e) => e.key));
    for (const e of world.entries) {
      if (restoredKeys.has(e.key)) {
        e.archived = false;
        e.liveUntilLedger = CURRENT_LEDGER + 1500;
      }
    }
    return { submitted: true, transactionHash: 'b'.repeat(64), entryCount: params.entries.length };
  },
});

const recordingAlerts = () => ({
  emitted: [],
  emit(alert) {
    this.emitted.push(alert);
  },
});

const keeper = (world, over = {}) =>
  ttl.createTtlKeeper({
    config: testnetConfig(),
    policy: over.policy ?? policy(),
    ledger: over.ledger ?? clockAt(CURRENT_LEDGER),
    reader: over.reader ?? readerOf(world),
    extender: over.extender ?? recordingExtender(),
    restorer: over.restorer ?? worldRestorer(world),
    alerts: over.alerts,
    newCorrelationId: () => 'corr-fixed',
  });

// ---------------------------------------------------------------------------
// Pure policy validation and planning.
// ---------------------------------------------------------------------------

test('ttl: assertValidTtlPolicy rejects a non-positive refund window', () => {
  assert.throws(
    () => ttl.assertValidTtlPolicy({ refundWindowLedgers: 0, safetyBufferLedgers: 0, alertThresholdLedgers: 0 }),
    (err) => err.financialError.code === 'validation_failed',
  );
});

test('ttl: assertValidTtlPolicy rejects a negative buffer or alert threshold', () => {
  assert.throws(
    () => ttl.assertValidTtlPolicy({ refundWindowLedgers: 10, safetyBufferLedgers: -1, alertThresholdLedgers: 0 }),
    (err) => err.financialError.code === 'validation_failed',
  );
  assert.throws(
    () => ttl.assertValidTtlPolicy({ refundWindowLedgers: 10, safetyBufferLedgers: 0, alertThresholdLedgers: -5 }),
    (err) => err.financialError.code === 'validation_failed',
  );
});

test('ttl: planTtlMaintenance rejects a non-positive current ledger', () => {
  assert.throws(
    () => ttl.planTtlMaintenance([], 0, policy()),
    (err) => err.financialError.code === 'validation_failed',
  );
});

test('ttl: assessEntry classifies a healthy live entry as no-action', () => {
  const a = ttl.assessEntry(entry({ liveUntilLedger: CURRENT_LEDGER + 5000 }), CURRENT_LEDGER, policy());
  assert.equal(a.archived, false);
  assert.equal(a.remainingLedgers, 5000);
  assert.equal(a.needsExtension, false);
  assert.equal(a.belowAlertThreshold, false);
});

test('ttl: assessEntry flags a low-runway entry for extension and pre-expiry alert', () => {
  const a = ttl.assessEntry(entry({ liveUntilLedger: CURRENT_LEDGER + 1000 }), CURRENT_LEDGER, policy());
  assert.equal(a.needsExtension, true); // 1000 < 1500 target
  assert.equal(a.belowAlertThreshold, true); // 1000 <= 2000
});

test('ttl: assessEntry alerts near expiry without extending when above target', () => {
  const a = ttl.assessEntry(entry({ liveUntilLedger: CURRENT_LEDGER + 1800 }), CURRENT_LEDGER, policy());
  assert.equal(a.needsExtension, false); // 1800 >= 1500 target
  assert.equal(a.belowAlertThreshold, true); // 1800 <= 2000 alert threshold
});

test('ttl: assessEntry treats an expired, explicitly-flagged, or unknown entry as archived', () => {
  const expired = ttl.assessEntry(entry({ liveUntilLedger: CURRENT_LEDGER - 1 }), CURRENT_LEDGER, policy());
  const flagged = ttl.assessEntry(entry({ liveUntilLedger: CURRENT_LEDGER + 5000, archived: true }), CURRENT_LEDGER, policy());
  const unknown = ttl.assessEntry(entry({ liveUntilLedger: null }), CURRENT_LEDGER, policy());
  for (const a of [expired, flagged, unknown]) {
    assert.equal(a.archived, true);
    assert.equal(a.remainingLedgers, null);
    assert.equal(a.needsExtension, false);
    assert.equal(a.belowAlertThreshold, true);
  }
});

test('ttl: planTtlMaintenance partitions extend, restore, and alert buckets', () => {
  const plan = ttl.planTtlMaintenance(
    [
      healthyInstance(),
      healthyWasm(),
      entry({ key: 'low', liveUntilLedger: CURRENT_LEDGER + 1000 }), // extend + alert
      entry({ key: 'nearish', liveUntilLedger: CURRENT_LEDGER + 1800 }), // alert only
      entry({ key: 'dead', liveUntilLedger: CURRENT_LEDGER - 5 }), // archived
    ],
    CURRENT_LEDGER,
    policy(),
  );

  assert.equal(plan.targetLiveUntilLedger, CURRENT_LEDGER + 1500);
  assert.equal(plan.extendToLedgers, 1500);
  assert.deepEqual(plan.toExtend.map((e) => e.key), ['low']);
  assert.deepEqual(plan.toRestore.map((e) => e.key), ['dead']);
  assert.equal(plan.archivedCount, 1);

  const preExpiry = plan.alerts.filter((x) => x.reason === 'pre_expiry').map((x) => x.entryKey).sort();
  assert.deepEqual(preExpiry, ['low', 'nearish']);
  const archived = plan.alerts.filter((x) => x.reason === 'archived');
  assert.equal(archived.length, 1);
  assert.equal(archived[0].severity, 'critical');
});

// ---------------------------------------------------------------------------
// Activation gate.
// ---------------------------------------------------------------------------

test('ttl: assertActivationTtlSafe passes when instance/wasm are healthy and nothing archived', () => {
  const plan = ttl.planTtlMaintenance([healthyInstance(), healthyWasm()], CURRENT_LEDGER, policy());
  assert.doesNotThrow(() => ttl.assertActivationTtlSafe(plan));
});

test('ttl: assertActivationTtlSafe blocks activation while data is archived', () => {
  const plan = ttl.planTtlMaintenance(
    [healthyInstance(), healthyWasm(), entry({ key: 'dead', liveUntilLedger: CURRENT_LEDGER - 1 })],
    CURRENT_LEDGER,
    policy(),
  );
  assert.throws(
    () => ttl.assertActivationTtlSafe(plan),
    (err) => err.financialError.code === 'contract_archived',
  );
});

test('ttl: assertActivationTtlSafe blocks activation when the instance is missing', () => {
  const plan = ttl.planTtlMaintenance([healthyWasm()], CURRENT_LEDGER, policy());
  assert.throws(
    () => ttl.assertActivationTtlSafe(plan),
    (err) => err.financialError.code === 'validation_failed',
  );
});

test('ttl: assertActivationTtlSafe blocks activation when the wasm entry lacks runway', () => {
  const plan = ttl.planTtlMaintenance(
    [healthyInstance(), entry({ key: 'wasm', kind: 'wasm', liveUntilLedger: CURRENT_LEDGER + 100 })],
    CURRENT_LEDGER,
    policy(),
  );
  assert.throws(
    () => ttl.assertActivationTtlSafe(plan),
    (err) => err.financialError.code === 'validation_failed',
  );
});

// ---------------------------------------------------------------------------
// Keeper — scheduled maintenance.
// ---------------------------------------------------------------------------

test('ttl: runMaintenance reports healthy and extends nothing when all entries have runway', async () => {
  const world = { entries: [healthyInstance(), healthyWasm()] };
  const extender = recordingExtender();
  const alerts = recordingAlerts();
  const summary = await keeper(world, { extender, alerts }).runMaintenance();

  assert.equal(summary.status, 'healthy');
  assert.equal(extender.calls.length, 0);
  assert.equal(alerts.emitted.length, 0);
  assert.equal(summary.archivedCount, 0);
});

test('ttl: runMaintenance extends low-runway entries beyond the refund window', async () => {
  const world = { entries: [healthyInstance(), healthyWasm(), entry({ key: 'low', liveUntilLedger: CURRENT_LEDGER + 800 })] };
  const extender = recordingExtender();
  const alerts = recordingAlerts();
  const summary = await keeper(world, { extender, alerts }).runMaintenance();

  assert.equal(summary.status, 'extended');
  assert.equal(extender.calls.length, 1);
  assert.equal(extender.calls[0].extendToLedgers, 1500);
  assert.deepEqual(extender.calls[0].entries.map((e) => e.key), ['low']);
  // The low-runway entry is also below the alert threshold, so a warning fires.
  assert.equal(alerts.emitted.length, 1);
  assert.equal(alerts.emitted[0].reason, 'pre_expiry');
  assert.equal(alerts.emitted[0].correlationId, 'corr-fixed');
});

test('ttl: runMaintenance raises a pre-expiry alert without extending a still-above-target entry', async () => {
  const world = { entries: [healthyInstance(), healthyWasm(), entry({ key: 'nearish', liveUntilLedger: CURRENT_LEDGER + 1800 })] };
  const extender = recordingExtender();
  const alerts = recordingAlerts();
  const summary = await keeper(world, { extender, alerts }).runMaintenance();

  assert.equal(summary.status, 'healthy');
  assert.equal(extender.calls.length, 0);
  assert.equal(alerts.emitted.length, 1);
  assert.equal(alerts.emitted[0].reason, 'pre_expiry');
  assert.equal(alerts.emitted[0].severity, 'warning');
});

test('ttl: runMaintenance reports an archived incident with a critical alert but does not auto-restore', async () => {
  const world = { entries: [healthyInstance(), healthyWasm(), entry({ key: 'dead', liveUntilLedger: CURRENT_LEDGER - 3 })] };
  const restorer = worldRestorer(world);
  const alerts = recordingAlerts();
  const summary = await keeper(world, { restorer, alerts }).runMaintenance();

  assert.equal(summary.status, 'archived_incident');
  assert.equal(summary.archivedCount, 1);
  assert.equal(restorer.calls.length, 0); // maintenance never auto-restores
  const critical = alerts.emitted.filter((a) => a.reason === 'archived');
  assert.equal(critical.length, 1);
  assert.equal(critical[0].severity, 'critical');
});

// ---------------------------------------------------------------------------
// Keeper — idempotent archived-data recovery.
// ---------------------------------------------------------------------------

test('ttl: restoreArchived restores and re-extends archived entries', async () => {
  const world = { entries: [healthyInstance(), healthyWasm(), entry({ key: 'dead', liveUntilLedger: CURRENT_LEDGER - 10 })] };
  const restorer = worldRestorer(world);
  const extender = recordingExtender();
  const summary = await keeper(world, { restorer, extender }).restoreArchived();

  assert.equal(summary.status, 'restored');
  assert.equal(summary.restoredCount, 1);
  assert.equal(restorer.calls.length, 1);
  assert.deepEqual(restorer.calls[0].entries.map((e) => e.key), ['dead']);
  // Restored entries are re-extended beyond the refund window.
  assert.equal(extender.calls.length, 1);
  assert.deepEqual(extender.calls[0].entries.map((e) => e.key), ['dead']);
  assert.equal(extender.calls[0].extendToLedgers, 1500);
});

test('ttl: restoreArchived is idempotent — a second run is a safe no-op', async () => {
  const world = { entries: [healthyInstance(), healthyWasm(), entry({ key: 'dead', liveUntilLedger: CURRENT_LEDGER - 10 })] };
  const restorer = worldRestorer(world);
  const extender = recordingExtender();
  const k = keeper(world, { restorer, extender });

  const first = await k.restoreArchived();
  assert.equal(first.status, 'restored');

  // The world now shows the entry live; a second recovery run finds nothing.
  const second = await k.restoreArchived();
  assert.equal(second.status, 'noop');
  assert.equal(second.restoredCount, 0);
  assert.equal(second.restore, null);
  assert.equal(second.extension, null);
  // Restore/extend were only ever called for the first run.
  assert.equal(restorer.calls.length, 1);
  assert.equal(extender.calls.length, 1);
});

test('ttl: restoreArchived on already-healthy data is an immediate no-op', async () => {
  const world = { entries: [healthyInstance(), healthyWasm()] };
  const restorer = worldRestorer(world);
  const extender = recordingExtender();
  const summary = await keeper(world, { restorer, extender }).restoreArchived();

  assert.equal(summary.status, 'noop');
  assert.equal(restorer.calls.length, 0);
  assert.equal(extender.calls.length, 0);
});

// ---------------------------------------------------------------------------
// Keeper — defense in depth.
// ---------------------------------------------------------------------------

test('ttl: createTtlKeeper rejects an invalid policy at construction', () => {
  const world = { entries: [] };
  assert.throws(
    () =>
      ttl.createTtlKeeper({
        config: testnetConfig(),
        policy: { refundWindowLedgers: 0, safetyBufferLedgers: 0, alertThresholdLedgers: 0 },
        ledger: clockAt(CURRENT_LEDGER),
        reader: readerOf(world),
        extender: recordingExtender(),
        restorer: worldRestorer(world),
      }),
    (err) => err.financialError.code === 'validation_failed',
  );
});

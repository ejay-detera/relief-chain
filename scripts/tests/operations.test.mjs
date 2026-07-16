// Unit tests for the executable operational recovery and health commands.
//
// Covers scripts/operations.mjs:
//   * redacted operational health for the six components (Requirement 22.5)
//   * idempotent recovery plans that keep reconciliation readable while
//     disabling financial operations (Requirements 22.7, 24.7)
//   * the non-interactive CLI surface and its secret redaction
//
// A drift guard transpiles the shared kill-switch module and asserts the CLI's
// controlled-operation list matches it exactly, so the two can never diverge.

import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

import {
    CONTROLLED_OPERATIONS,
    HEALTH_COMPONENTS,
    HEALTH_STATUS,
    RECONCILIATION_OPERATION,
    RECOVERY_COMMANDS,
    applySwitchToggle,
    buildHealthReport,
    classifyComponent,
    planRecovery,
    recoveryCommandNames,
    runCli
} from '../operations.mjs';

// ---------------------------------------------------------------------------
// Drift guard: CLI controlled operations must equal the shared kill switches.
// ---------------------------------------------------------------------------

const sharedDir = fileURLToPath(new URL('../../supabase/functions/_shared/', import.meta.url));
const SUPABASE_STUB_URL =
  'data:text/javascript;base64,' +
  Buffer.from('export const createClient = () => { throw new Error("stub"); };').toString('base64');
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
    if (specifier === '@supabase/supabase-js') replacements.set(specifier, SUPABASE_STUB_URL);
    else if (specifier.startsWith('.')) {
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

test('drift guard: CLI controlled operations match the shared kill switches', async () => {
  const switches = await import(await loadModule(path.join(sharedDir, 'operation-switches.ts')));
  assert.deepEqual([...CONTROLLED_OPERATIONS].sort(), [...switches.CONTROLLED_OPERATIONS].sort());
  assert.equal(switches.RECONCILIATION_IS_GATED, false);
  assert.equal(switches.CONTROLLED_OPERATIONS.includes(RECONCILIATION_OPERATION), false);
});

// ---------------------------------------------------------------------------
// Health status (Requirement 22.5)
// ---------------------------------------------------------------------------

test('health: reports all six components required by 22.5', () => {
  assert.deepEqual(
    [...HEALTH_COMPONENTS].sort(),
    ['contract_events', 'edge_functions', 'failed_transactions', 'reconciliation_lag', 'sponsor_balance', 'transaction_queues'],
  );
});

test('health: an unobserved component is unavailable, never assumed healthy', () => {
  const report = buildHealthReport({ observations: {}, now: new Date('2026-01-01T00:00:00Z') });
  assert.equal(report.overall, HEALTH_STATUS.UNAVAILABLE);
  for (const component of report.components) {
    assert.equal(component.status, HEALTH_STATUS.UNAVAILABLE);
    assert.equal(component.detail, 'not observed');
  }
});

test('health: sponsor balance classification honors the reserve floor', () => {
  assert.equal(
    classifyComponent('sponsor_balance', { availableStroops: '500', minReserveStroops: '1000' }).status,
    HEALTH_STATUS.UNAVAILABLE,
  );
  assert.equal(
    classifyComponent('sponsor_balance', { availableStroops: '1500', minReserveStroops: '1000' }).status,
    HEALTH_STATUS.DEGRADED,
  );
  assert.equal(
    classifyComponent('sponsor_balance', { availableStroops: '5000', minReserveStroops: '1000' }).status,
    HEALTH_STATUS.HEALTHY,
  );
});

test('health: reconciliation lag and queue depth degrade then fail', () => {
  assert.equal(classifyComponent('reconciliation_lag', { lagSeconds: 30, thresholdSeconds: 60 }).status, HEALTH_STATUS.HEALTHY);
  assert.equal(classifyComponent('reconciliation_lag', { lagSeconds: 120, thresholdSeconds: 60 }).status, HEALTH_STATUS.DEGRADED);
  assert.equal(classifyComponent('reconciliation_lag', { lagSeconds: 300, thresholdSeconds: 60 }).status, HEALTH_STATUS.UNAVAILABLE);

  assert.equal(classifyComponent('transaction_queues', { depth: 10, maxDepth: 100 }).status, HEALTH_STATUS.HEALTHY);
  assert.equal(classifyComponent('transaction_queues', { depth: 90, maxDepth: 100 }).status, HEALTH_STATUS.DEGRADED);
  assert.equal(classifyComponent('transaction_queues', { depth: 120, maxDepth: 100 }).status, HEALTH_STATUS.UNAVAILABLE);
});

test('health: overall status is the worst component', () => {
  const report = buildHealthReport({
    observations: {
      edge_functions: { reachable: true, checkedFunctions: 5, failing: 0 },
      transaction_queues: { depth: 1, maxDepth: 100 },
      sponsor_balance: { availableStroops: '5000', minReserveStroops: '1000' },
      reconciliation_lag: { lagSeconds: 10, thresholdSeconds: 60 },
      failed_transactions: { failedCount: 0, threshold: 5 },
      contract_events: { lastIngestedLedger: 100, currentLedger: 100, maxLagLedgers: 10 },
    },
  });
  assert.equal(report.overall, HEALTH_STATUS.HEALTHY);

  const degraded = buildHealthReport({
    observations: {
      edge_functions: { reachable: true, checkedFunctions: 5, failing: 1 },
      transaction_queues: { depth: 1, maxDepth: 100 },
      sponsor_balance: { availableStroops: '5000', minReserveStroops: '1000' },
      reconciliation_lag: { lagSeconds: 10, thresholdSeconds: 60 },
      failed_transactions: { failedCount: 0, threshold: 5 },
      contract_events: { lastIngestedLedger: 100, currentLedger: 100, maxLagLedgers: 10 },
    },
  });
  assert.equal(degraded.overall, HEALTH_STATUS.DEGRADED);
});

// ---------------------------------------------------------------------------
// Recovery commands (Requirements 22.7, 24.7)
// ---------------------------------------------------------------------------

test('recovery: catalog covers every required procedure', () => {
  for (const name of [
    'testnet-reset',
    'signer-rotation',
    'stalled-jobs',
    'sponsor-depletion',
    'pause',
    'resume',
    'ttl-restore',
    'reconciliation-backlog',
    'disaster-recovery',
    'partner-outage',
  ]) {
    assert.ok(recoveryCommandNames.includes(name), `missing recovery command ${name}`);
  }
});

test('recovery: no command ever pauses reconciliation', () => {
  for (const name of recoveryCommandNames) {
    const command = RECOVERY_COMMANDS[name];
    if (command.targeted) continue;
    assert.equal(command.pauses.includes(RECONCILIATION_OPERATION), false, `${name} must not pause reconciliation`);
    for (const operation of command.pauses) {
      assert.ok(CONTROLLED_OPERATIONS.includes(operation), `${name} pauses non-controlled ${operation}`);
    }
  }
});

test('recovery: a plan disables financial operations but keeps reconciliation readable', () => {
  const plan = planRecovery('disaster-recovery', { now: new Date('2026-01-01T00:00:00Z') });
  assert.equal(plan.reconciliationReadable, true);
  assert.deepEqual([...plan.operations].sort(), [...CONTROLLED_OPERATIONS].sort());
  for (const record of plan.resultingSwitches.records) {
    assert.equal(record.state, 'paused');
    assert.notEqual(record.operation, RECONCILIATION_OPERATION);
  }
});

test('recovery: plans are idempotent — applying twice yields the same switch state', () => {
  const now = new Date('2026-01-01T00:00:00Z');
  const first = planRecovery('sponsor-depletion', { now });
  const second = planRecovery('sponsor-depletion', { snapshot: first.resultingSwitches, now });
  assert.deepEqual(first.resultingSwitches.records, second.resultingSwitches.records);
});

test('recovery: targeted pause/resume toggles exactly one operation', () => {
  const paused = planRecovery('pause', { operation: 'redemption', reason: 'incident 9', now: new Date('2026-01-01T00:00:00Z') });
  assert.deepEqual(paused.operations, ['redemption']);
  assert.equal(paused.resultingSwitches.records.length, 1);
  assert.equal(paused.resultingSwitches.records[0].state, 'paused');

  const resumed = planRecovery('resume', { operation: 'redemption', snapshot: paused.resultingSwitches, now: new Date('2026-01-01T00:01:00Z') });
  assert.equal(resumed.resultingSwitches.records[0].state, 'enabled');
  assert.equal(resumed.resultingSwitches.records[0].reason, null);
});

test('recovery: pausing one operation leaves the others untouched (independence)', () => {
  let snapshot = { records: [] };
  snapshot = applySwitchToggle(snapshot, { operation: 'sponsorship', state: 'paused', reason: 'x' });
  const plan = planRecovery('pause', { operation: 'refund', snapshot });
  const paused = plan.resultingSwitches.records.filter((r) => r.state === 'paused').map((r) => r.operation).sort();
  assert.deepEqual(paused, ['refund', 'sponsorship']);
});

test('recovery: a targeted command without --operation fails closed', () => {
  assert.throws(() => planRecovery('pause', {}), /requires an --operation/);
});

test('recovery: an unknown command is rejected', () => {
  assert.throws(() => planRecovery('nope', {}), /Unknown recovery command/);
});

// ---------------------------------------------------------------------------
// CLI surface + redaction (non-interactive, no secrets)
// ---------------------------------------------------------------------------

test('cli: health with no input reports unavailable and exits non-zero', () => {
  const result = runCli(['health'], { environment: {} });
  assert.equal(result.exitCode, 1);
  assert.match(result.stdout, /UNAVAILABLE/);
});

test('cli: list enumerates every recovery command', () => {
  const result = runCli(['list'], { environment: {} });
  assert.equal(result.exitCode, 0);
  for (const name of recoveryCommandNames) assert.ok(result.stdout.includes(name), `list missing ${name}`);
});

test('cli: unknown command returns a usage error', () => {
  const result = runCli(['frobnicate'], { environment: {} });
  assert.equal(result.exitCode, 2);
  assert.match(result.stderr, /Unknown command/);
});

test('cli: recovery plan output never leaks a secret from the reason', () => {
  // A Stellar secret seed is 'S' followed by exactly 55 base32 characters.
  const secretSeed = `S${'A'.repeat(55)}`;
  const result = runCli(
    ['pause', '--operation', 'redemption', '--reason', `leaked ${secretSeed}`],
    { environment: {} },
  );
  assert.equal(result.exitCode, 0);
  assert.ok(!result.stdout.includes(secretSeed), 'a Stellar-secret-shaped token must be redacted');
  assert.match(result.stdout, /\[REDACTED\]/);
});

test('cli: health reads observations from an --input file and redacts env secrets', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ops-health-'));
  const inputPath = path.join(dir, 'health.json');
  writeFileSync(
    inputPath,
    JSON.stringify({
      sponsor_balance: { availableStroops: '500', minReserveStroops: '1000' },
    }),
  );
  const result = runCli(['health', '--input', inputPath], { environment: { API_SECRET: 'supersecretvalue1234' } });
  assert.equal(result.exitCode, 1); // sponsor below floor -> unavailable overall
  assert.match(result.stdout, /below floor/);
  assert.ok(!result.stdout.includes('supersecretvalue1234'));
});

test('cli: json output is emitted when --json is passed', () => {
  const result = runCli(['ttl-restore', '--json'], { environment: {} });
  assert.equal(result.exitCode, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.command, 'ttl-restore');
  assert.equal(parsed.reconciliationReadable, true);
});

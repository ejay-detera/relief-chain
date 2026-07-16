import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { effectiveExitCode, redactText, runValidationCommand } from '../validation-runner.mjs';

const fixture = resolve('scripts/tests/fixtures/validation-child.mjs');
const fixedTimes = [new Date('2026-01-01T00:00:00.000Z'), new Date('2026-01-01T00:00:00.125Z')];

function createRun(t, mode, overrides = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'relief-chain-validation-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  let timeIndex = 0;
  const artifactPath = join(directory, `${mode}.json`);
  return {
    artifactPath,
    promise: runValidationCommand({
      name: mode,
      executable: process.execPath,
      args: [fixture, mode],
      cwd: process.cwd(),
      timeoutMs: 2_000,
      artifactPath,
      now: () => fixedTimes[Math.min(timeIndex++, fixedTimes.length - 1)],
      ...overrides,
    }),
  };
}

function readArtifact(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

test('records a successful one-shot command in a stable artifact', async (t) => {
  const run = createRun(t, 'success');
  const { artifact } = await run.promise;
  assert.equal(artifact.exitCode, 0);
  assert.equal(artifact.stdout, 'fixture completed\n');
  assert.equal(artifact.stderr, '');
  assert.equal(artifact.startedAt, '2026-01-01T00:00:00.000Z');
  assert.equal(artifact.endedAt, '2026-01-01T00:00:00.125Z');
  assert.equal(artifact.durationMs, 125);
  assert.deepEqual(readArtifact(run.artifactPath), artifact);
});

test('keeps stdout and stderr separate', async (t) => {
  const { artifact } = await createRun(t, 'streams').promise;
  assert.equal(artifact.stdout, 'stdout only\n');
  assert.equal(artifact.stderr, 'stderr only\n');
});

test('preserves non-zero exit code and specific diagnostics', async (t) => {
  const { artifact } = await createRun(t, 'failure').promise;
  assert.equal(artifact.exitCode, 23);
  assert.equal(effectiveExitCode(artifact), 23);
  assert.match(artifact.stderr, /specific child failure/);
  assert.match(artifact.stderr, /powershell\.exe exited with code 23/);
  assert.equal(artifact.spawnError, null);
});

test('records a missing executable without replacing the spawn diagnosis', async (t) => {
  const run = createRun(t, 'missing', {
    executable: `relief-chain-missing-executable-${process.pid}`,
    args: [],
  });
  const { artifact } = await run.promise;
  assert.equal(artifact.exitCode, null);
  assert.equal(artifact.spawnError.code, 'ENOENT');
  assert.match(artifact.spawnError.message, /relief-chain-missing-executable/);
  assert.equal(artifact.timedOut, false);
});

test('terminates and records a timed-out child', async (t) => {
  const run = createRun(t, 'timeout', {
    timeoutMs: 50,
    now: () => new Date(),
  });
  const { artifact } = await run.promise;
  assert.equal(artifact.timedOut, true);
  assert.notEqual(artifact.exitCode, 0);
  assert.equal(artifact.spawnError, null);
});

test('redacts secrets independently in stdout and stderr', async (t) => {
  const secret = 'fixture-token-value-123456789';
  const environment = { ...process.env, VALIDATION_TEST_TOKEN: secret };
  const { artifact } = await createRun(t, 'secrets', { environment }).promise;
  assert.doesNotMatch(artifact.stdout, new RegExp(secret));
  assert.doesNotMatch(artifact.stderr, new RegExp(secret));
  assert.equal(artifact.stdout, 'token=[REDACTED]\n');
  assert.equal(artifact.stderr, 'Authorization: [REDACTED] [REDACTED]\n');
});

test('property: redaction is idempotent and removes supported secret forms', () => {
  const secrets = [
    'alpha-secret-1234',
    'token.with.parts.5678',
    `S${'A'.repeat(55)}`,
  ];
  for (const secret of secrets) {
    const environment = { SAMPLE_SECRET: secret };
    const input = `secret=${secret} Authorization: Bearer ${secret}`;
    const once = redactText(input, environment);
    assert.equal(redactText(once, environment), once);
    assert.doesNotMatch(once, new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

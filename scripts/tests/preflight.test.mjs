import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
    checkExpo,
    checkLinkedProject,
    checkLocalProject,
    classifyExpoVersion,
    classifyWasmTarget,
    collectChecks,
    formatReport,
    runPreflight,
    summarize,
} from '../preflight.mjs';

function tempRoot(t) {
  const directory = mkdtempSync(join(tmpdir(), 'relief-chain-preflight-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test('classifyExpoVersion accepts major 57 only', () => {
  assert.deepEqual(classifyExpoVersion('57.0.4'), { version: '57.0.4', isExpo57: true });
  assert.equal(classifyExpoVersion('56.0.0').isExpo57, false);
  assert.equal(classifyExpoVersion('58.1.0').isExpo57, false);
  assert.deepEqual(classifyExpoVersion(undefined), { version: null, isExpo57: false });
});

test('classifyWasmTarget detects either supported target', () => {
  assert.deepEqual(classifyWasmTarget('wasm32-unknown-unknown\n'), {
    found: true,
    target: 'wasm32-unknown-unknown',
  });
  assert.deepEqual(classifyWasmTarget('x86_64-unknown-linux-gnu\nwasm32v1-none\n'), {
    found: true,
    target: 'wasm32v1-none',
  });
  assert.deepEqual(classifyWasmTarget('x86_64-pc-windows-msvc\n'), { found: false, target: null });
});

test('checkExpo reports missing when the package is absent', (t) => {
  const root = tempRoot(t);
  const result = checkExpo({ root });
  assert.equal(result.status, 'missing');
  assert.equal(result.required, true);
  assert.match(result.remediation, /Expo SDK 57/);
});

test('checkExpo reports available for a version 57 manifest', (t) => {
  const root = tempRoot(t);
  const expoDir = join(root, 'node_modules', 'expo');
  mkdirSync(expoDir, { recursive: true });
  writeFileSync(join(expoDir, 'package.json'), JSON.stringify({ version: '57.0.4' }), 'utf8');
  const result = checkExpo({ root });
  assert.equal(result.status, 'available');
  assert.equal(result.version, '57.0.4');
});

test('checkExpo flags a non-57 installed version as missing', (t) => {
  const root = tempRoot(t);
  const expoDir = join(root, 'node_modules', 'expo');
  mkdirSync(expoDir, { recursive: true });
  writeFileSync(join(expoDir, 'package.json'), JSON.stringify({ version: '56.0.0' }), 'utf8');
  const result = checkExpo({ root });
  assert.equal(result.status, 'missing');
});

test('checkLocalProject depends on supabase/config.toml presence', (t) => {
  const root = tempRoot(t);
  assert.equal(checkLocalProject({ root }).status, 'missing');
  mkdirSync(join(root, 'supabase'), { recursive: true });
  writeFileSync(join(root, 'supabase', 'config.toml'), 'project_id = "local"\n', 'utf8');
  assert.equal(checkLocalProject({ root }).status, 'available');
});

test('checkLinkedProject stays unavailable and non-blocking', () => {
  const result = checkLinkedProject();
  assert.equal(result.status, 'unavailable');
  assert.equal(result.required, false);
  assert.match(result.detail, /separate authorization/i);
});

test('summarize fails only on missing required checks', () => {
  const checks = [
    { id: 'a', label: 'A', required: true, status: 'available' },
    { id: 'b', label: 'B', required: true, status: 'missing' },
    { id: 'c', label: 'Linked', required: false, status: 'unavailable' },
  ];
  const summary = summarize(checks);
  assert.equal(summary.exitCode, 1);
  assert.equal(summary.failures.length, 1);
  assert.equal(summary.failures[0].id, 'b');
});

test('summarize passes when every required check is available regardless of unavailable optional checks', () => {
  const checks = [
    { id: 'a', label: 'A', required: true, status: 'available' },
    { id: 'linked', label: 'Linked', required: false, status: 'unavailable' },
  ];
  const summary = summarize(checks);
  assert.equal(summary.exitCode, 0);
  assert.equal(summary.failures.length, 0);
});

test('formatReport lists remediation for failing required checks only', () => {
  const checks = [
    { id: 'b', label: 'Rust', required: true, status: 'missing', version: null, detail: 'not found', remediation: 'install rust' },
    { id: 'linked', label: 'Linked', required: false, status: 'unavailable', version: null, detail: 'separate authorization', remediation: 'authorize later' },
  ];
  const report = formatReport(checks, summarize(checks));
  assert.match(report, /\[MISSING\] Rust/);
  assert.match(report, /fix: install rust/);
  assert.match(report, /\[UNAVAILABLE\] Linked/);
  assert.doesNotMatch(report, /fix: authorize later/);
});

test('collectChecks always includes the non-blocking linked-project entry', () => {
  const checks = collectChecks();
  const linked = checks.find((check) => check.id === 'linked-project');
  assert.ok(linked);
  assert.equal(linked.required, false);
  assert.equal(linked.status, 'unavailable');
});

test('runPreflight returns a coherent report and summary', () => {
  const { checks, summary, report } = runPreflight();
  assert.equal(typeof report, 'string');
  assert.equal(checks.length, summary.total);
  assert.ok(report.includes('prerequisite preflight'));
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
    REQUIRED_ENUMS,
    REQUIRED_PROJECTIONS,
    REQUIRED_PROJECTION_FIELDS,
    REQUIRED_RPCS,
    REQUIRED_TABLES,
    parseFunctionArgNames,
    parsePublicEnumNames,
    parsePublicFunctionNames,
    parsePublicTableNames,
    parseTableRowFields,
    verifySchemaContract,
} from '../schema-types-contract.mjs';
import { diffSummary, generateLocalTypes, normalizeTypes, runDriftCheck } from '../schema-types-drift.mjs';

const repositoryRoot = resolve(fileURLToPath(import.meta.url), '..', '..', '..');
const committedTypesPath = resolve(repositoryRoot, 'src', 'types', 'database.types.ts');
const committedTypes = readFileSync(committedTypesPath, 'utf8');

test('committed types satisfy the full blockchain-domain schema contract', () => {
  const { ok, failures } = verifySchemaContract(committedTypes);
  assert.deepEqual(failures, []);
  assert.equal(ok, true);
});

test('every required blockchain-domain table is present in the committed types', () => {
  const tables = new Set(parsePublicTableNames(committedTypes));
  for (const table of REQUIRED_TABLES) {
    assert.ok(tables.has(table), `expected table ${table}`);
  }
});

test('every projection exposes reconciliation metadata fields', () => {
  for (const projection of REQUIRED_PROJECTIONS) {
    const fields = new Set(parseTableRowFields(committedTypes, projection));
    for (const field of REQUIRED_PROJECTION_FIELDS) {
      assert.ok(fields.has(field), `${projection} should expose ${field}`);
    }
  }
});

test('every required enum is present in the committed types', () => {
  const enums = new Set(parsePublicEnumNames(committedTypes));
  for (const name of REQUIRED_ENUMS) {
    assert.ok(enums.has(name), `expected enum ${name}`);
  }
});

test('every required RPC signature is present with its expected arguments', () => {
  const functions = new Set(parsePublicFunctionNames(committedTypes));
  for (const [rpc, requiredArgs] of Object.entries(REQUIRED_RPCS)) {
    assert.ok(functions.has(rpc), `expected RPC ${rpc}`);
    const args = new Set(parseFunctionArgNames(committedTypes, rpc));
    for (const arg of requiredArgs) {
      assert.ok(args.has(arg), `${rpc} should accept ${arg}`);
    }
  }
});

test('verifySchemaContract reports a missing table', () => {
  const mutated = committedTypes.replace(/^ {6}audit_events: \{/m, '      audit_events_removed: {');
  const { ok, failures } = verifySchemaContract(mutated);
  assert.equal(ok, false);
  assert.ok(failures.some((failure) => failure.includes('audit_events')));
});

test('verifySchemaContract reports a missing projection reconciliation field', () => {
  // Rename is_stale only within the beneficiary projection Row block.
  const anchor = committedTypes.indexOf('beneficiary_balance_projection: {');
  const before = committedTypes.slice(0, anchor);
  const after = committedTypes.slice(anchor).replace('is_stale:', 'is_stale_removed:');
  const { ok, failures } = verifySchemaContract(before + after);
  assert.equal(ok, false);
  assert.ok(failures.some((failure) => failure.includes('is_stale')));
});

test('verifySchemaContract reports a missing RPC argument', () => {
  const mutated = committedTypes.replace('p_sensitive_data_access?: boolean', 'p_sensitive_flag_removed?: boolean');
  const { failures } = verifySchemaContract(mutated);
  assert.ok(failures.some((failure) => failure.includes('p_sensitive_data_access')));
});

test('normalizeTypes ignores CRLF and trailing whitespace differences', () => {
  const left = 'export type Json = string\nexport type Database = {}\n';
  const right = 'export type Json = string  \r\nexport type Database = {}\r\n\n\n';
  assert.equal(normalizeTypes(left), normalizeTypes(right));
});

test('diffSummary detects a schema line difference', () => {
  const committed = 'line one\n      wallet_network: string\nline three\n';
  const replayed = 'line one\n      wallet_network: number\nline three\n';
  const result = diffSummary(committed, replayed);
  assert.equal(result.identical, false);
  assert.ok(result.lines.some((line) => line.includes('L2')));
});

test('diffSummary treats normalized-equal text as identical', () => {
  const result = diffSummary('a\nb\n', 'a  \r\nb\n\n');
  assert.equal(result.identical, true);
  assert.deepEqual(result.lines, []);
});

test('generateLocalTypes flags a missing CLI without throwing', () => {
  const runner = () => ({ error: { code: 'ENOENT' }, status: null, stdout: '', stderr: '' });
  const result = generateLocalTypes({ runner });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'ENOENT');
});

test('generateLocalTypes rejects output that is not a generated module', () => {
  const runner = () => ({ error: null, status: 0, stdout: 'Cannot connect to the Docker daemon', stderr: '' });
  const result = generateLocalTypes({ runner });
  assert.equal(result.ok, false);
  assert.equal(result.looksLikeTypes, false);
});

test('runDriftCheck passes when the local replay matches the committed file', () => {
  const generate = () => ({ ok: true, status: 0, stdout: committedTypes, stderr: '', looksLikeTypes: true });
  const { exitCode, report } = runDriftCheck({ generate });
  assert.equal(exitCode, 0, report);
  assert.match(report, /No drift/);
});

test('runDriftCheck fails and stays local-only when the stack is unavailable', () => {
  const generate = () => ({ ok: false, status: 1, stdout: '', stderr: 'connection refused', looksLikeTypes: false, error: null });
  const { exitCode, report } = runDriftCheck({ generate });
  assert.equal(exitCode, 1);
  assert.match(report, /never connects to the hosted project/);
});

test('runDriftCheck reports drift when the replay differs from the committed file', () => {
  const generate = () => ({
    ok: true,
    status: 0,
    stdout: `${committedTypes}\n      extra_drift_marker: string\n`,
    stderr: '',
    looksLikeTypes: true,
  });
  const { exitCode, report } = runDriftCheck({ generate });
  assert.equal(exitCode, 1);
  assert.match(report, /drifted from the local replay/);
});

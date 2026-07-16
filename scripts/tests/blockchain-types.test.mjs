import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../../src/types/blockchain.ts', import.meta.url), 'utf8');
const { outputText, diagnostics = [] } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  reportDiagnostics: true,
});
assert.equal(diagnostics.length, 0);
const domain = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('parseStroopAmount accepts canonical bigint-safe values without precision loss', () => {
  assert.equal(domain.parseStroopAmount('9007199254740993123456789'), '9007199254740993123456789');
  assert.equal(domain.parseStroopAmount(42n), '42');
  assert.equal(domain.parseStroopAmount(Number.MAX_SAFE_INTEGER), String(Number.MAX_SAFE_INTEGER));
});

test('parseStroopAmount rejects decimals, negatives, unsafe numbers, and non-canonical strings', () => {
  for (const value of ['1.5', '-1', '01', '', (1n << 127n).toString(), -1n, Number.MAX_SAFE_INTEGER + 1, null]) {
    assert.throws(() => domain.parseStroopAmount(value), TypeError);
  }
});

test('isStroopAmount distinguishes canonical database strings', () => {
  assert.equal(domain.isStroopAmount('0'), true);
  assert.equal(domain.isStroopAmount('10000000'), true);
  assert.equal(domain.isStroopAmount(10000000), false);
});

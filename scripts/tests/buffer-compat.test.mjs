import assert from 'node:assert/strict';
import { Buffer as NodeBuffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(
  new URL('../../src/utils/buffer-compat.ts', import.meta.url),
  'utf8',
);
const { outputText, diagnostics = [] } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  reportDiagnostics: true,
});
assert.equal(diagnostics.length, 0);
const compat = await import(
  `data:text/javascript;base64,${NodeBuffer.from(outputText).toString('base64')}`
);

test('repair restores Buffer decoding on a species-broken subarray view', () => {
  // Simulates the Hermes behavior from the on-device diagnosis
  // (ctor=Uint8Array, comma-joined toString): a view over the same bytes
  // without the Buffer prototype.
  const bytes = NodeBuffer.from('RCPHP\0\0\0\0\0\0\0', 'latin1');
  const broken = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.length);
  assert.equal(broken.constructor.name, 'Uint8Array');
  assert.equal(broken.toString(), '82,67,80,72,80,0,0,0,0,0,0,0');

  const repaired = compat.repairBufferSubarrayView(broken);
  assert.equal(repaired.toString('utf8'), 'RCPHP\0\0\0\0\0\0\0');
});

test('repair is a no-op when the view already decodes as a Buffer', () => {
  const bytes = NodeBuffer.from('RCPHP\0\0\0\0\0\0\0', 'latin1');
  const intact = bytes.subarray(0, 12);
  const repaired = compat.repairBufferSubarrayView(intact);
  assert.equal(repaired, intact);
  assert.equal(repaired.toString('utf8'), 'RCPHP\0\0\0\0\0\0\0');
});

test('startup subarray patch is idempotent and keeps views decoding', () => {
  compat.ensureBufferSubarrayReturnsBuffer();
  compat.ensureBufferSubarrayReturnsBuffer();
  const buf = NodeBuffer.from('RCPHP\0\0\0\0\0\0\0', 'latin1');
  const view = buf.subarray(0, 12);
  assert.equal(view.toString('utf8'), 'RCPHP\0\0\0\0\0\0\0');
});

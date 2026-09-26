import assert from 'node:assert/strict';
import { Buffer as NodeBuffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(
  new URL('../../src/utils/program-status.ts', import.meta.url),
  'utf8',
);
const { outputText, diagnostics = [] } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  reportDiagnostics: true,
});
assert.equal(diagnostics.length, 0);
const workflow = await import(
  `data:text/javascript;base64,${NodeBuffer.from(outputText).toString('base64')}`
);

const complete = {
  name: 'Typhoon Relief',
  totalBudget: 1000000,
  aidType: 'cash',
  maxBeneficiaries: 100,
};

test('pre-live states route to the activation flow, never a direct write', () => {
  assert.deepEqual(workflow.programStatusActions('draft'), [
    { kind: 'flow', flow: 'activation', label: 'Fund & Activate', headline: 'Start treasury funding and activation' },
  ]);
  assert.deepEqual(workflow.programStatusActions('funding'), [
    { kind: 'flow', flow: 'activation', label: 'Complete Activation', headline: 'Resume funding and reconcile to active' },
  ]);
  assert.deepEqual(workflow.programStatusActions('funding_failed'), [
    { kind: 'flow', flow: 'activation', label: 'Retry Funding', headline: 'Retry treasury funding and activation' },
  ]);
});

test('live states offer exactly one direct write each', () => {
  assert.deepEqual(workflow.programStatusActions('active'), [
    { kind: 'write', to: 'closing', label: 'Begin Closing', headline: 'Begin closing' },
  ]);
  assert.deepEqual(workflow.programStatusActions('closing'), [
    { kind: 'write', to: 'closed', label: 'Close Program', headline: 'Close program' },
  ]);
});

test('terminal and unknown states offer no actions', () => {
  for (const status of ['completed', 'closed', 'scheduled', 'archived', '']) {
    assert.deepEqual(workflow.programStatusActions(status), [], status);
  }
});

test('direct writes are limited to active-closing and closing-closed', () => {
  assert.equal(workflow.isAllowedDirectWrite('active', 'closing'), true);
  assert.equal(workflow.isAllowedDirectWrite('closing', 'closed'), true);
  assert.equal(workflow.isAllowedDirectWrite('draft', 'funding'), false);
  assert.equal(workflow.isAllowedDirectWrite('funding', 'active'), false);
  assert.equal(workflow.isAllowedDirectWrite('active', 'closed'), false);
  assert.equal(workflow.isAllowedDirectWrite('closing', 'active'), false);
  assert.equal(workflow.isAllowedDirectWrite('draft', 'completed'), false);
});

test('direct writes to flow-owned states explain the correct path', () => {
  assert.match(
    workflow.validateDirectWrite('funding', 'active', complete),
    /reached through the funding and activation flow/,
  );
  assert.match(
    workflow.validateDirectWrite('draft', 'closed', complete),
    /cannot move from 'draft' to 'closed' by direct edit/,
  );
  assert.match(
    workflow.validateDirectWrite('closed', 'closing', complete),
    /have no further transitions/,
  );
  assert.match(
    workflow.validateDirectWrite('active', 'active', complete),
    /already in this status/,
  );
  assert.equal(workflow.validateDirectWrite('active', 'closing', complete), null);
  assert.equal(workflow.validateDirectWrite('closing', 'closed', complete), null);
});

test('activation gate lists every missing completeness item', () => {
  assert.deepEqual([...workflow.activationBlockers(complete)], []);
  assert.deepEqual(
    [...workflow.activationBlockers({ name: '  ', totalBudget: 0, aidType: '', maxBeneficiaries: 0 })],
    ['a program name', 'a positive budget', 'an aid type', 'a positive beneficiary count'],
  );
});

import assert from 'node:assert/strict';
import { Buffer as NodeBuffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(
  new URL('../../src/utils/financial-error.ts', import.meta.url),
  'utf8',
);
const { outputText, diagnostics = [] } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  reportDiagnostics: true,
});
assert.equal(diagnostics.length, 0);
const errors = await import(
  `data:text/javascript;base64,${NodeBuffer.from(outputText).toString('base64')}`
);

const invokeError = (body, { throws = false } = {}) => ({
  name: 'FunctionsHttpError',
  message: 'Edge Function returned a non-2xx status code',
  context: {
    status: 400,
    json: async () => {
      if (throws) throw new Error('body already consumed');
      return body;
    },
  },
});

test('extracts the server envelope instead of the transport generic', async () => {
  const result = await errors.extractEdgeErrorEnvelope(
    invokeError({
      error: {
        code: 'validation_failed',
        message: 'No recipient had an approved enrollment and an active verified wallet.',
        retryable: false,
        correlationId: 'corr-1',
        fieldErrors: { programId: ['no eligible recipients'] },
      },
    }),
  );
  assert.equal(result.code, 'validation_failed');
  assert.equal(result.message, 'No recipient had an approved enrollment and an active verified wallet.');
  assert.equal(result.retryable, false);
  assert.equal(result.correlationId, 'corr-1');
  assert.deepEqual(result.fieldErrors, { programId: ['no eligible recipients'] });
});

test('accepts a bare code/message body without the envelope wrapper', async () => {
  const result = await errors.extractEdgeErrorEnvelope(
    invokeError({ code: 'insufficient_balance', message: 'Not enough balance.' }),
  );
  assert.equal(result.code, 'insufficient_balance');
  assert.equal(result.message, 'Not enough balance.');
  assert.equal(result.retryable, false);
  assert.equal(result.correlationId, 'client-unresolved');
});

test('returns null for malformed, unknown-code, or unreadable bodies', async () => {
  assert.equal(await errors.extractEdgeErrorEnvelope(invokeError({})), null);
  assert.equal(await errors.extractEdgeErrorEnvelope(invokeError({ error: {} })), null);
  assert.equal(
    await errors.extractEdgeErrorEnvelope(
      invokeError({ error: { code: 'not_a_real_code', message: 'x' } }),
    ),
    null,
  );
  assert.equal(await errors.extractEdgeErrorEnvelope(invokeError({}, { throws: true })), null);
});

test('the legacy fallback path hides the server message (the bug being fixed)', async () => {
  // toFinancialError only sees the transport wrapper, so it can only repeat
  // the generic message — this documents why the envelope reader is needed.
  const legacy = errors.toFinancialError(
    invokeError({
      error: { code: 'validation_failed', message: 'No recipient had an approved enrollment.' },
    }).context ?? {},
    'Edge Function returned a non-2xx status code',
  );
  assert.equal(legacy.message, 'Edge Function returned a non-2xx status code');
});

test('returns null when there is no response context to read', async () => {
  assert.equal(await errors.extractEdgeErrorEnvelope(null), null);
  assert.equal(await errors.extractEdgeErrorEnvelope({ message: 'boom' }), null);
  assert.equal(
    await errors.extractEdgeErrorEnvelope({ context: { status: 500 } }),
    null,
  );
});

// Distribution reconcile tests (Item 1).
//
// Covers the authorized LGU "Check distribution status" path that mirrors the
// merchant settlement check:
//
//   - submit-disbursement must not emit an unauthenticated background
//     `functions.invoke('reconcile-stellar', ...)` (static module-graph check).
//   - the distribution reconcile service maps the reconciler-owned job-branch
//     response honestly: success/confirmed/failed are never fabricated
//     client-side, numerics fail closed, transport errors stay typed.
//   - the service source invokes the job branch with a jobId body using the
//     caller's (LGU) session — never service-role, never anonymous.
//
// The service is dependency-injected (invoke passed in): no real network, no
// Supabase client, no Horizon contact. Runtime imports are alias-free so the
// transpiled module loads under plain node --test.

import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { asyncProperty, assert as fcAssert, integer } from 'fast-check';
import ts from 'typescript';

const rootDir = fileURLToPath(new URL('../../', import.meta.url));

const toDataUrl = (code) =>
  `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;

const cache = new Map();

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
    if (specifier.startsWith('@/')) {
      throw new Error(
        `distribution-reconcile-service must stay runtime alias-free (found ${specifier})`,
      );
    } else if (specifier.startsWith('.')) {
      const resolved = specifier.endsWith('.ts')
        ? path.resolve(path.dirname(absPath), specifier)
        : path.resolve(path.dirname(absPath), `${specifier}.ts`);
      replacements.set(specifier, await loadModule(resolved));
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

const loadService = async () =>
  import(await loadModule(path.join(rootDir, 'src/services/distribution-reconcile-service.ts')));

// ---------------------------------------------------------------------------
// 1. submit-disbursement must not emit an unauthenticated background reconcile.
// ---------------------------------------------------------------------------

test('submit-disbursement emits no background reconcile invoke (confirmation stays reconciler-owned)', async () => {
  const source = await readFile(
    path.join(rootDir, 'supabase/functions/submit-disbursement/index.ts'),
    'utf8',
  );
  assert.ok(
    !source.includes('reconcile-stellar'),
    'submit-disbursement must not reference reconcile-stellar (no background invoke)',
  );
  assert.ok(
    !source.includes('functions.invoke'),
    'submit-disbursement must not call functions.invoke with the service-role client',
  );
});

// ---------------------------------------------------------------------------
// 2. Service source stays authorized: jobId body, no service-role/anonymous.
// ---------------------------------------------------------------------------

test('distribution reconcile service invokes the job branch with jobId and no elevated credentials', async () => {
  const source = await readFile(
    path.join(rootDir, 'src/services/distribution-reconcile-service.ts'),
    'utf8',
  );
  assert.ok(
    source.includes('reconcile-stellar'),
    'service must relay to the reconcile-stellar Edge Function',
  );
  assert.ok(source.includes('jobId'), 'service must send the jobId the job branch accepts');
  assert.ok(
    !source.toLowerCase().includes('service-role') &&
      !source.toLowerCase().includes('service_role'),
    'service must never use the service-role key (LGU session only)',
  );
  assert.ok(
    !source.includes('SUPABASE_SERVICE_ROLE_KEY'),
    'service must never reference the service-role key',
  );
});

// ---------------------------------------------------------------------------
// 3. Distribution reconcile service: honest mapping (mock invoke, never network).
// ---------------------------------------------------------------------------

const successEnvelope = (payload) => ({ data: payload, error: null });

const jobPayload = (counts, extra = {}) => ({
  jobStatus: 'completed',
  counts,
  confirmedAmountStroops: '20000000000',
  failedAmountStroops: '0',
  failedRecipientIds: [],
  projectionWritten: true,
  beneficiaryProjectionsWritten: 1,
  ...extra,
});

test('maps a confirmed reconcile response honestly with the authorized jobId call shape', async () => {
  const { reconcileDistributionJob } = await loadService();
  const seen = [];
  const invoke = async (name, options) => {
    seen.push({ name, options });
    return successEnvelope(
      jobPayload({ total: 1, pending: 0, prepared: 0, submitted: 0, confirmed: 1, failed: 0, cancelled: 0 }),
    );
  };
  const result = await reconcileDistributionJob({ jobId: 'job-6c4a0887' }, invoke);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].name, 'reconcile-stellar');
  assert.deepEqual(seen[0].options, { body: { jobId: 'job-6c4a0887' } });
  assert.equal(result.ok, true);
  assert.equal(result.data.confirmedCount, 1);
  assert.equal(result.data.failedCount, 0);
  assert.equal(result.data.jobStatus, 'completed');
  assert.equal(result.data.projectionWritten, true);
});

test('maps an empty (nothing confirmed yet) response as zero, never fabricated confirmed', async () => {
  const { reconcileDistributionJob } = await loadService();
  const invoke = async () =>
    successEnvelope(
      jobPayload(
        { total: 1, pending: 0, prepared: 0, submitted: 1, confirmed: 0, failed: 0, cancelled: 0 },
        { jobStatus: 'reconciling', projectionWritten: false, beneficiaryProjectionsWritten: 0 },
      ),
    );
  const result = await reconcileDistributionJob({ jobId: 'job-1' }, invoke);
  assert.equal(result.ok, true);
  assert.equal(result.data.confirmedCount, 0);
  assert.equal(result.data.jobStatus, 'reconciling');
  assert.equal(result.data.projectionWritten, false);
});

test('maps a transport error to a typed FinancialError without fabricating success', async () => {
  const { reconcileDistributionJob } = await loadService();
  const invoke = async () => ({
    data: null,
    error: {
      message: 'Edge Function returned a non-2xx status code',
      context: {
        status: 401,
        error: {
          code: 'authentication_required',
          message: 'A valid authentication token is required.',
          retryable: false,
          correlationId: 'corr-1',
        },
      },
    },
  });
  const result = await reconcileDistributionJob({ jobId: 'job-1' }, invoke);
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'authentication_required');
});

test('fails closed on unsafe numerics instead of coercing', async () => {
  const { reconcileDistributionJob } = await loadService();
  const invoke = async () =>
    successEnvelope(
      jobPayload({
        total: 1,
        pending: 0,
        prepared: 0,
        submitted: 0,
        confirmed: Number.MAX_SAFE_INTEGER + 1,
        failed: 0,
        cancelled: 0,
      }),
    );
  const result = await reconcileDistributionJob({ jobId: 'job-1' }, invoke);
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'validation_failed');
});

test('rejects a missing jobId without invoking', async () => {
  const { reconcileDistributionJob } = await loadService();
  let called = 0;
  const invoke = async () => {
    called += 1;
    return successEnvelope(jobPayload({ total: 0, pending: 0, prepared: 0, submitted: 0, confirmed: 0, failed: 0, cancelled: 0 }));
  };
  const result = await reconcileDistributionJob({ jobId: '' }, invoke);
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'validation_failed');
  assert.equal(called, 0);
});

test('property: safe non-negative counts map exactly (never inflated)', async () => {
  const { reconcileDistributionJob } = await loadService();
  await fcAssert(
    asyncProperty(
      integer({ min: 0, max: 50 }),
      integer({ min: 0, max: 50 }),
      async (confirmed, failed) => {
        const invoke = async () =>
          successEnvelope(
            jobPayload({
              total: confirmed + failed,
              pending: 0,
              prepared: 0,
              submitted: 0,
              confirmed,
              failed,
              cancelled: 0,
            }),
          );
        const result = await reconcileDistributionJob({ jobId: 'job-prop' }, invoke);
        assert.equal(result.ok, true);
        assert.equal(result.data.confirmedCount, confirmed);
        assert.equal(result.data.failedCount, failed);
      },
    ),
    { numRuns: 25 },
  );
});

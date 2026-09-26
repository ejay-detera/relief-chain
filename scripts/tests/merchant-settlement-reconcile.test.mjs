// Merchant settlement reconcile tests.
//
// Covers the authorized merchant "Check settlement status" path that replaces
// the removed service-key background invoke in `submit-payment`:
//
//   - submit-payment must not emit an unauthenticated background
//     `functions.invoke('reconcile-stellar', ...)` (static module-graph check).
//   - the merchant reconcile service maps the reconciler-owned response
//     honestly: success/confirmed/failed are never fabricated client-side,
//     numerics fail closed, transport errors stay typed.
//
// The service is dependency-injected (invoke passed in): no real network, no
// Supabase client, no Horizon contact.
//
// Validates: Requirements 11.8, 18.8, 21.4 (reconciler-owned confirmation).

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
      const rel = specifier.slice(2);
      const resolved = path.join(rootDir, 'src', rel);
      const candidate = resolved.endsWith('.ts') ? resolved : `${resolved}.ts`;
      replacements.set(specifier, await loadModule(candidate));
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
  import(await loadModule(path.join(rootDir, 'src/services/merchant-settlement-service.ts')));

// ---------------------------------------------------------------------------
// 1. submit-payment must not emit an unauthenticated background reconcile.
// ---------------------------------------------------------------------------

test('submit-payment emits no background reconcile invoke (no service-role fire-and-forget)', async () => {
  const source = await readFile(
    path.join(rootDir, 'supabase/functions/submit-payment/index.ts'),
    'utf8',
  );
  assert.ok(
    !source.includes('reconcile-stellar'),
    'submit-payment must not reference reconcile-stellar (background invoke removed)',
  );
  assert.ok(
    !source.includes('functions.invoke'),
    'submit-payment must not call functions.invoke with the service-role client',
  );
});

// ---------------------------------------------------------------------------
// 2. Merchant reconcile service: honest mapping (mock invoke, never network).
// ---------------------------------------------------------------------------

const successEnvelope = (counts, projectionWritten = true) => ({
  data: { summary: { counts, status: 'completed' }, merchantProjectionWritten: projectionWritten },
  error: null,
});

test('maps a confirmed reconcile response honestly with the authorized call shape', async () => {
  const { reconcileMerchantSettlement } = await loadService();
  const seen = [];
  const invoke = async (name, options) => {
    seen.push({ name, options });
    return successEnvelope(
      {
        observedTransactions: 1,
        observedEvents: 1,
        confirmedIntents: 1,
        failedIntents: 0,
        mismatches: 0,
        quarantined: 0,
        failedObservations: 0,
      },
      true,
    );
  };
  const result = await reconcileMerchantSettlement(
    { merchantId: 'merchant-1', organizationId: 'org-1' },
    invoke,
  );
  assert.equal(seen.length, 1);
  assert.equal(seen[0].name, 'reconcile-stellar');
  assert.deepEqual(seen[0].options, {
    body: { merchantId: 'merchant-1', organizationId: 'org-1' },
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.confirmedCount, 1);
  assert.equal(result.data.failedCount, 0);
  assert.equal(result.data.projectionWritten, true);
});

test('maps an empty (nothing confirmed yet) response as zero, never fabricated confirmed', async () => {
  const { reconcileMerchantSettlement } = await loadService();
  const invoke = async () =>
    successEnvelope(
      {
        observedTransactions: 0,
        observedEvents: 0,
        confirmedIntents: 0,
        failedIntents: 0,
        mismatches: 0,
        quarantined: 0,
        failedObservations: 0,
      },
      false,
    );
  const result = await reconcileMerchantSettlement(
    { merchantId: 'merchant-1', organizationId: 'org-1' },
    invoke,
  );
  assert.equal(result.ok, true);
  assert.equal(result.data.confirmedCount, 0);
  assert.equal(result.data.projectionWritten, false);
});

test('maps a transport error to a typed FinancialError without fabricating success', async () => {
  const { reconcileMerchantSettlement } = await loadService();
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
  const result = await reconcileMerchantSettlement(
    { merchantId: 'merchant-1', organizationId: 'org-1' },
    invoke,
  );
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'authentication_required');
});

test('fails closed on unsafe numerics instead of coercing', async () => {
  const { reconcileMerchantSettlement } = await loadService();
  const invoke = async () =>
    successEnvelope(
      {
        observedTransactions: 1,
        observedEvents: 0,
        confirmedIntents: Number.MAX_SAFE_INTEGER + 1,
        failedIntents: 0,
        mismatches: 0,
        quarantined: 0,
        failedObservations: 0,
      },
      true,
    );
  const result = await reconcileMerchantSettlement(
    { merchantId: 'merchant-1', organizationId: 'org-1' },
    invoke,
  );
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'validation_failed');
});

test('property: safe non-negative counts map exactly (never inflated)', async () => {
  const { reconcileMerchantSettlement } = await loadService();
  await fcAssert(
    asyncProperty(
      integer({ min: 0, max: 100 }),
      integer({ min: 0, max: 100 }),
      async (confirmed, failed) => {
        const invoke = async () =>
          successEnvelope(
            {
              observedTransactions: confirmed + failed,
              observedEvents: 0,
              confirmedIntents: confirmed,
              failedIntents: failed,
              mismatches: 0,
              quarantined: 0,
              failedObservations: 0,
            },
            false,
          );
        const result = await reconcileMerchantSettlement(
          { merchantId: 'm', organizationId: 'o' },
          invoke,
        );
        assert.equal(result.ok, true);
        assert.equal(result.data.confirmedCount, confirmed);
        assert.equal(result.data.failedCount, failed);
      },
    ),
    { numRuns: 25 },
  );
});

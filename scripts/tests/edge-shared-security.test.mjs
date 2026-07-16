// Unit tests for the shared Edge security utilities.
//
// Covers the pure, injectable logic of:
//   supabase/functions/_shared/errors.ts       (typed envelope + classification)
//   supabase/functions/_shared/response.ts     (HTTP mapping)
//   supabase/functions/_shared/redaction.ts    (secret / PII redaction)
//   supabase/functions/_shared/auth.ts         (JWT, step-up, RLS reads, least-privilege writer)
//   supabase/functions/_shared/stellar/idempotency.ts (claim + conflict)
//
// Validates: Requirements 2.5, 18.3, 20.5, 20.6, 20.8
//
// Loading convention (repo test harness): the TypeScript modules are transpiled
// in-memory and imported as data: URLs. Because these modules import each other
// and @supabase/supabase-js at runtime, the loader below recursively transpiles
// relative dependencies and stubs the Supabase client factory (never invoked —
// the client is always injected). A shared cache guarantees a single module
// instance so error classes keep one identity across the graph.

import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const sharedDir = fileURLToPath(new URL('../../supabase/functions/_shared/', import.meta.url));

// A tiny stub for @supabase/supabase-js: createClient is never called because
// every function accepts an injected client, so it throws if reached.
const SUPABASE_STUB_URL =
  'data:text/javascript;base64,' +
  Buffer.from(
    'export const createClient = () => { throw new Error("createClient stub must not be called"); };',
  ).toString('base64');

const cache = new Map();

const toDataUrl = (code) =>
  `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;

async function loadModule(absPath) {
  if (cache.has(absPath)) return cache.get(absPath);

  const source = await readFile(absPath, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });

  // Resolve each remaining runtime import specifier to something importable.
  const specifiers = new Set();
  const specifierRe = /\bfrom\s*(['"])([^'"]+)\1/g;
  let match;
  while ((match = specifierRe.exec(outputText)) !== null) {
    specifiers.add(match[2]);
  }

  const replacements = new Map();
  for (const specifier of specifiers) {
    if (specifier === '@supabase/supabase-js') {
      replacements.set(specifier, SUPABASE_STUB_URL);
    } else if (specifier.startsWith('.')) {
      const childAbs = path.resolve(path.dirname(absPath), specifier);
      replacements.set(specifier, await loadModule(childAbs));
    }
    // Anything else (e.g. type-only src/types paths) is elided by transpile and
    // will not appear here.
  }

  const rewritten = outputText.replace(specifierRe, (whole, quote, specifier) => {
    const replacement = replacements.get(specifier);
    return replacement ? `from ${quote}${replacement}${quote}` : whole;
  });

  const url = toDataUrl(rewritten);
  cache.set(absPath, url);
  return url;
}

const importShared = async (relativePath) =>
  import(await loadModule(path.join(sharedDir, relativePath)));

const errors = await importShared('errors.ts');
const response = await importShared('response.ts');
const redaction = await importShared('redaction.ts');
const auth = await importShared('auth.ts');
const idempotency = await importShared('stellar/idempotency.ts');

// ---------------------------------------------------------------------------
// errors.ts
// ---------------------------------------------------------------------------

test('errors: classification matches the design retry rules and statuses', () => {
  assert.equal(errors.httpStatusForCode('authentication_required'), 401);
  assert.equal(errors.httpStatusForCode('authorization_failed'), 403);
  assert.equal(errors.httpStatusForCode('validation_failed'), 400);
  assert.equal(errors.httpStatusForCode('submission_unknown'), 504);

  // Validation / authorization / used-invoice are never auto-retryable.
  assert.equal(errors.defaultRetryable('validation_failed'), false);
  assert.equal(errors.defaultRetryable('authorization_failed'), false);
  assert.equal(errors.defaultRetryable('invoice_used'), false);
  assert.equal(errors.defaultRetryable('reconciliation_mismatch'), false);

  // Unknown submission and transient dependency issues are retryable.
  assert.equal(errors.defaultRetryable('submission_unknown'), true);
  assert.equal(errors.defaultRetryable('dependency_unavailable'), true);
  assert.equal(errors.defaultRetryable('sponsor_unavailable'), true);
});

test('errors: makeFinancialError produces a frozen, user-safe envelope', () => {
  const error = errors.makeFinancialError('validation_failed', 'Bad input', {
    correlationId: 'corr-1',
    fieldErrors: { amount: ['required'] },
  });
  assert.equal(error.code, 'validation_failed');
  assert.equal(error.message, 'Bad input');
  assert.equal(error.retryable, false);
  assert.equal(error.correlationId, 'corr-1');
  assert.deepEqual(error.fieldErrors, { amount: ['required'] });
  assert.ok(Object.isFrozen(error));
});

test('errors: newCorrelationId returns distinct UUIDs', () => {
  const a = errors.newCorrelationId();
  const b = errors.newCorrelationId();
  assert.match(a, /^[0-9a-f-]{36}$/);
  assert.notEqual(a, b);
});

test('errors: toFinancialError passes through known exceptions and hides unknowns', () => {
  const known = errors.FinancialErrorException.of('insufficient_budget', 'No budget', {
    correlationId: 'c1',
  });
  assert.strictEqual(errors.toFinancialError(known, 'c2').code, 'insufficient_budget');

  // Any raw thrown value collapses to an opaque dependency error.
  const hidden = errors.toFinancialError(new Error('raw provider stack trace'), 'c3');
  assert.equal(hidden.code, 'dependency_unavailable');
  assert.equal(hidden.correlationId, 'c3');
  assert.notEqual(hidden.message, 'raw provider stack trace');
});

// ---------------------------------------------------------------------------
// response.ts
// ---------------------------------------------------------------------------

test('response: successResponse carries data, status, and correlation header', async () => {
  const res = response.successResponse({ value: 42 }, 'corr-ok');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('x-correlation-id'), 'corr-ok');
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const body = await res.json();
  assert.deepEqual(body, { ok: true, data: { value: 42 }, correlationId: 'corr-ok' });
});

test('response: errorResponse maps code to status and envelopes the error', async () => {
  const error = errors.makeFinancialError('authorization_failed', 'Denied', {
    correlationId: 'corr-err',
  });
  const res = response.errorResponse(error);
  assert.equal(res.status, 403);
  assert.equal(res.headers.get('x-correlation-id'), 'corr-err');
  const body = await res.json();
  assert.deepEqual(body, { error });
});

// ---------------------------------------------------------------------------
// redaction.ts
// ---------------------------------------------------------------------------

test('redaction: sensitive keys and secret-shaped values are removed', () => {
  const stellarSecret = 'S' + 'A'.repeat(55);
  const jwt = 'aaaa.bbbb.cccc';
  const input = {
    userId: 'user-1',
    walletAddress: 'GABC1234',
    secretSeed: stellarSecret,
    nested: { authorization: 'Bearer token', beneficiaryEmail: 'a@b.test' },
    signature: 'deadbeef',
    note: stellarSecret, // caught by value shape even though key is innocuous
    token: jwt,
    amountStroops: 1000,
  };

  const out = redaction.redact(input);
  assert.equal(out.userId, 'user-1');
  assert.equal(out.walletAddress, 'GABC1234'); // public key preserved
  assert.equal(out.secretSeed, redaction.REDACTED);
  assert.equal(out.nested.authorization, redaction.REDACTED);
  assert.equal(out.nested.beneficiaryEmail, redaction.REDACTED);
  assert.equal(out.signature, redaction.REDACTED);
  assert.equal(out.note, redaction.REDACTED); // value-shape match
  assert.equal(out.token, redaction.REDACTED);
  assert.equal(out.amountStroops, 1000);
});

test('redaction: handles circular references without throwing', () => {
  const node = { name: 'x' };
  node.self = node;
  const out = redaction.redact({ node });
  assert.equal(out.node.self, '[CIRCULAR]');
});

test('redaction: key and value classifiers', () => {
  assert.equal(redaction.isSensitiveKey('privateKey'), true);
  assert.equal(redaction.isSensitiveKey('service_role_key'), true);
  assert.equal(redaction.isSensitiveKey('governmentId'), true);
  assert.equal(redaction.isSensitiveKey('programId'), false);
  assert.equal(redaction.isSensitiveValue('S' + 'B'.repeat(55)), true);
  assert.equal(redaction.isSensitiveValue('GABCDEF'), false);
});

// ---------------------------------------------------------------------------
// auth.ts — pure JWT / step-up logic
// ---------------------------------------------------------------------------

const base64Url = (obj) =>
  Buffer.from(JSON.stringify(obj)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const makeJwt = (claims) => `${base64Url({ alg: 'HS256', typ: 'JWT' })}.${base64Url(claims)}.sig`;

test('auth: extractBearerToken parses and rejects malformed headers', () => {
  assert.equal(auth.extractBearerToken('Bearer abc.def.ghi'), 'abc.def.ghi');
  assert.throws(() => auth.extractBearerToken(null), /authentication token is required/i);
  assert.throws(() => auth.extractBearerToken('Basic xyz'), /malformed/i);
});

test('auth: decodeJwtClaims extracts sub, aal, and amr', () => {
  const token = makeJwt({
    sub: 'user-9',
    aal: 'aal2',
    amr: [{ method: 'totp', timestamp: 1_700_000_000 }],
    exp: 1_800_000_000,
  });
  const claims = auth.decodeJwtClaims(token);
  assert.equal(claims.sub, 'user-9');
  assert.equal(claims.aal, 'aal2');
  assert.deepEqual(claims.amr, [{ method: 'totp', timestamp: 1_700_000_000 }]);
});

test('auth: decodeJwtClaims rejects malformed tokens', () => {
  assert.throws(() => auth.decodeJwtClaims('only.two'), /malformed/i);
});

test('auth: hasRecentStepUp mirrors the database recent-step-up rule', () => {
  const now = new Date('2026-01-01T00:00:00Z');
  const nowSeconds = Math.floor(now.getTime() / 1000);

  const freshTotp = {
    userId: 'u',
    aal: 'aal2',
    authMethods: [{ method: 'totp', timestamp: nowSeconds - 60 }],
    token: 't',
    correlationId: 'c',
  };
  assert.equal(auth.hasRecentStepUp(freshTotp, now), true);

  // Password is not a step-up method.
  const passwordOnly = { ...freshTotp, authMethods: [{ method: 'password', timestamp: nowSeconds }] };
  assert.equal(auth.hasRecentStepUp(passwordOnly, now), false);

  // Stale step-up (older than default 10 minutes) fails.
  const stale = { ...freshTotp, authMethods: [{ method: 'totp', timestamp: nowSeconds - 3600 }] };
  assert.equal(auth.hasRecentStepUp(stale, now), false);

  // aal1 never satisfies step-up.
  const aal1 = { ...freshTotp, aal: 'aal1' };
  assert.equal(auth.hasRecentStepUp(aal1, now), false);

  // maxAge above the one-hour ceiling is rejected.
  assert.equal(auth.hasRecentStepUp(freshTotp, now, 7200), false);
});

// ---------------------------------------------------------------------------
// auth.ts — RLS-scoped membership reads (injected caller client)
// ---------------------------------------------------------------------------

const session = (overrides = {}) => ({
  userId: 'user-1',
  aal: 'aal2',
  authMethods: [],
  token: 't',
  correlationId: 'corr-x',
  ...overrides,
});

// Chainable stub mirroring the PostgREST builder used by requireOrganizationMembership.
const membershipClient = (result) => {
  const builder = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: () => Promise.resolve(result),
  };
  return { from: () => builder };
};

test('auth: requireOrganizationMembership returns the role for an active member', async () => {
  const client = membershipClient({ data: { role: 'finance_approver' }, error: null });
  const role = await auth.requireOrganizationMembership(client, session(), 'org-1');
  assert.equal(role, 'finance_approver');
});

test('auth: requireOrganizationMembership denies a non-member', async () => {
  const client = membershipClient({ data: null, error: null });
  await assert.rejects(
    () => auth.requireOrganizationMembership(client, session(), 'org-1'),
    (err) => err.financialError.code === 'authorization_failed',
  );
});

test('auth: requireOrganizationMembership surfaces read failures as retryable dependency errors', async () => {
  const client = membershipClient({ data: null, error: { message: 'boom' } });
  await assert.rejects(
    () => auth.requireOrganizationMembership(client, session(), 'org-1'),
    (err) => err.financialError.code === 'dependency_unavailable' && err.financialError.retryable === true,
  );
});

test('auth: requireOrganizationRole enforces the allowed role set', async () => {
  const approver = membershipClient({ data: { role: 'finance_approver' }, error: null });
  await assert.doesNotReject(() =>
    auth.requireOrganizationRole(approver, session(), 'org-1', ['finance_approver', 'organization_administrator']),
  );

  const auditor = membershipClient({ data: { role: 'auditor' }, error: null });
  await assert.rejects(
    () => auth.requireOrganizationRole(auditor, session(), 'org-1', ['finance_approver']),
    (err) => err.financialError.code === 'authorization_failed',
  );
});

test('auth: requireAAL2 and requireRecentStepUp gate sensitive actions', () => {
  assert.throws(
    () => auth.requireAAL2(session({ aal: 'aal1' })),
    (err) => err.financialError.code === 'authentication_required',
  );
  assert.doesNotThrow(() => auth.requireAAL2(session({ aal: 'aal2' })));

  const now = new Date('2026-01-01T00:00:00Z');
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const stepped = session({ authMethods: [{ method: 'webauthn', timestamp: nowSeconds - 30 }] });
  assert.doesNotThrow(() => auth.requireRecentStepUp(stepped, now));
  assert.throws(
    () => auth.requireRecentStepUp(session({ authMethods: [] }), now),
    (err) => err.financialError.code === 'authentication_required',
  );
});

// ---------------------------------------------------------------------------
// auth.ts — least-privilege service writer
// ---------------------------------------------------------------------------

const recordingServiceClient = () => {
  const calls = [];
  return {
    calls,
    from(table) {
      return {
        insert(values) {
          calls.push({ op: 'insert', table, values });
          return Promise.resolve({ error: null });
        },
        upsert(values, options) {
          calls.push({ op: 'upsert', table, values, options });
          return Promise.resolve({ error: null });
        },
      };
    },
  };
};

test('service writer: appends to allowlisted append-only tables', async () => {
  const client = recordingServiceClient();
  const writer = auth.createServiceWriter(client, 'corr-w');
  await writer.appendRows('financial_intents', { id: 'fi-1' });
  assert.equal(client.calls.length, 1);
  assert.equal(client.calls[0].op, 'insert');
  assert.equal(client.calls[0].table, 'financial_intents');
  assert.deepEqual(client.calls[0].values, [{ id: 'fi-1' }]);
});

test('service writer: upserts allowlisted projection tables', async () => {
  const client = recordingServiceClient();
  const writer = auth.createServiceWriter(client, 'corr-w');
  await writer.writeProjection('beneficiary_balance_projection', { id: 'p-1' }, { onConflict: 'id' });
  assert.equal(client.calls[0].op, 'upsert');
  assert.equal(client.calls[0].table, 'beneficiary_balance_projection');
  assert.deepEqual(client.calls[0].options, { onConflict: 'id' });
});

test('service writer: refuses tables outside the least-privilege allowlists', async () => {
  const client = recordingServiceClient();
  const writer = auth.createServiceWriter(client, 'corr-w');

  // A non-append-only table cannot be appended.
  await assert.rejects(() => writer.appendRows('wallets', {}), /refused non-append-only/i);
  // A projection call cannot target an append-only table (and vice versa).
  await assert.rejects(
    () => writer.writeProjection('financial_intents', {}),
    /refused non-projection/i,
  );
  await assert.rejects(() => writer.appendRows('beneficiary_balance_projection', {}), /refused/i);
  assert.equal(client.calls.length, 0, 'no query should be issued for refused tables');
});

// ---------------------------------------------------------------------------
// stellar/idempotency.ts
// ---------------------------------------------------------------------------

const rpcClient = (result) => ({
  lastArgs: null,
  rpc(fn, args) {
    this.lastArgs = { fn, args };
    return Promise.resolve(result);
  },
});

const claimParams = (overrides = {}) => ({
  organizationId: 'org-1',
  programId: 'prog-1',
  scope: 'cash_distribution',
  idempotencyKey: 'key-1',
  payloadHash: 'hash-1',
  operationType: 'cash_distribution',
  correlationId: 'corr-i',
  ...overrides,
});

test('idempotency: a fresh claim is not a replay', async () => {
  const record = {
    id: 'idem-1',
    first_seen_at: '2026-01-01T00:00:00Z',
    last_seen_at: '2026-01-01T00:00:00Z',
    payload_hash: 'hash-1',
  };
  const client = rpcClient({ data: record, error: null });
  const claim = await idempotency.claimIdempotencyKey(client, claimParams());
  assert.equal(claim.isReplay, false);
  assert.equal(claim.record.id, 'idem-1');
  assert.equal(client.lastArgs.fn, 'claim_financial_idempotency_key');
  assert.equal(client.lastArgs.args.p_idempotency_key, 'key-1');
});

test('idempotency: an identical repeat is a safe replay', async () => {
  const record = {
    id: 'idem-1',
    first_seen_at: '2026-01-01T00:00:00Z',
    last_seen_at: '2026-01-01T00:05:00Z',
    payload_hash: 'hash-1',
  };
  const client = rpcClient({ data: record, error: null });
  const claim = await idempotency.claimIdempotencyKey(client, claimParams());
  assert.equal(claim.isReplay, true);
});

test('idempotency: a payload-hash conflict is a non-retryable validation error', async () => {
  const client = rpcClient({
    data: null,
    error: { code: '23514', message: 'idempotency key payload hash conflict' },
  });
  await assert.rejects(
    () => idempotency.claimIdempotencyKey(client, claimParams()),
    (err) =>
      err.financialError.code === 'validation_failed' &&
      err.financialError.retryable === false &&
      Boolean(err.financialError.fieldErrors?.idempotencyKey),
  );
});

test('idempotency: an unexpected RPC error is a retryable dependency error', async () => {
  const client = rpcClient({ data: null, error: { code: '08006', message: 'connection failure' } });
  await assert.rejects(
    () => idempotency.claimIdempotencyKey(client, claimParams()),
    (err) => err.financialError.code === 'dependency_unavailable' && err.financialError.retryable === true,
  );
});

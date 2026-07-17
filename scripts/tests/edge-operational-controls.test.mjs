// Unit tests for the shared operational-control modules.
//
// Covers the pure, injectable logic of:
//   supabase/functions/_shared/operation-switches.ts (independent kill switches)
//   supabase/functions/_shared/rate-limit.ts          (token-bucket rate limits)
//   supabase/functions/_shared/stellar/sponsorship.ts (sponsor guardrails + audit)
//   supabase/functions/_shared/work-queue.ts          (durable queue + concurrency)
//
// Validates: Requirements 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7, 20.7, 22.4, 22.6, 24.7
//
// Loading convention (repo test harness): the TypeScript modules are transpiled
// in-memory and imported as data: URLs, with relative imports resolved
// recursively and @supabase/supabase-js stubbed (never invoked — every client is
// injected). A shared cache keeps a single module instance so the error class
// keeps one identity across the graph.

import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const sharedDir = fileURLToPath(new URL('../../supabase/functions/_shared/', import.meta.url));

const SUPABASE_STUB_URL =
  'data:text/javascript;base64,' +
  Buffer.from(
    'export const createClient = () => { throw new Error("createClient stub must not be called"); };',
  ).toString('base64');

const cache = new Map();
const toDataUrl = (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;

async function loadModule(absPath) {
  if (cache.has(absPath)) return cache.get(absPath);

  const source = await readFile(absPath, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });

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

const switches = await importShared('operation-switches.ts');
const rateLimit = await importShared('rate-limit.ts');
const sponsorship = await importShared('stellar/sponsorship.ts');
const workQueue = await importShared('work-queue.ts');

// ---------------------------------------------------------------------------
// operation-switches.ts — independent kill switches
// ---------------------------------------------------------------------------

test('switches: an absent switch is enabled and passes the gate', () => {
  const snapshot = { records: [] };
  assert.equal(switches.isOperationPaused(snapshot, 'distribution'), false);
  assert.doesNotThrow(() => switches.assertOperationEnabled(snapshot, 'distribution', 'corr-1'));
});

test('switches: a paused operation fails closed with a contract_paused incident', () => {
  const snapshot = { records: [{ operation: 'redemption', state: 'paused', reason: 'incident 7' }] };
  assert.equal(switches.isOperationPaused(snapshot, 'redemption'), true);
  assert.equal(switches.pauseReasonFor(snapshot, 'redemption'), 'incident 7');
  assert.throws(
    () => switches.assertOperationEnabled(snapshot, 'redemption', 'corr-2'),
    (err) => err.financialError.code === 'contract_paused' && err.financialError.retryable === false,
  );
});

test('switches: pausing one operation leaves every other switch untouched (independence)', () => {
  let snapshot = { records: [] };
  snapshot = switches.applyToggle(snapshot, { operation: 'sponsorship', state: 'paused', reason: 'low balance' });
  snapshot = switches.applyToggle(snapshot, { operation: 'refund', state: 'paused' });

  // The two paused operations are independent; the other six remain enabled.
  assert.equal(switches.isOperationPaused(snapshot, 'sponsorship'), true);
  assert.equal(switches.isOperationPaused(snapshot, 'refund'), true);
  for (const op of ['issuance', 'activation', 'distribution', 'redemption', 'rotation', 'cash_out']) {
    assert.equal(switches.isOperationPaused(snapshot, op), false, `${op} must stay enabled`);
  }

  // Resuming one does not disturb the other.
  snapshot = switches.applyToggle(snapshot, { operation: 'sponsorship', state: 'enabled' });
  assert.equal(switches.isOperationPaused(snapshot, 'sponsorship'), false);
  assert.equal(switches.isOperationPaused(snapshot, 'refund'), true);
});

test('switches: reconciliation is never a controlled operation (stays readable)', () => {
  assert.equal(switches.RECONCILIATION_IS_GATED, false);
  assert.equal(switches.CONTROLLED_OPERATIONS.includes('reconciliation'), false);
  assert.deepEqual(
    [...switches.CONTROLLED_OPERATIONS].sort(),
    ['activation', 'cash_out', 'distribution', 'issuance', 'redemption', 'refund', 'rotation', 'sponsorship'],
  );
});

test('switches: governor pauses and resumes exactly one switch through the store', async () => {
  const saved = [];
  let state = { records: [] };
  const store = {
    loadSnapshot: () => Promise.resolve(state),
    saveToggle: (record) => {
      saved.push(record);
      state = switches.applyToggle(state, record);
      return Promise.resolve();
    },
  };
  const governor = switches.createOperationSwitchGovernor({
    store,
    clock: () => new Date('2026-01-01T00:00:00Z'),
  });

  await governor.pause({ operation: 'cash_out', reason: 'partner outage', updatedBy: 'op-1' });
  await assert.rejects(
    () => governor.assertEnabled('cash_out', 'corr-3'),
    (err) => err.financialError.code === 'contract_paused',
  );
  await assert.doesNotReject(() => governor.assertEnabled('distribution', 'corr-3'));

  await governor.resume({ operation: 'cash_out', updatedBy: 'op-1' });
  await assert.doesNotReject(() => governor.assertEnabled('cash_out', 'corr-3'));

  assert.equal(saved.length, 2);
  assert.equal(saved[0].state, 'paused');
  assert.equal(saved[1].state, 'enabled');
});

// ---------------------------------------------------------------------------
// rate-limit.ts — token bucket
// ---------------------------------------------------------------------------

test('rate-limit: tryConsume allows within capacity and refills over time', () => {
  const policy = { capacity: 3, refillPerSecond: 1 };
  let bucket = rateLimit.freshBucket(policy, 0);

  // Burst of 3 succeeds, the 4th is denied with a retry-after hint.
  for (let i = 0; i < 3; i += 1) {
    const decision = rateLimit.tryConsume(bucket, policy, 0);
    assert.equal(decision.allowed, true);
    bucket = decision.state;
  }
  const denied = rateLimit.tryConsume(bucket, policy, 0);
  assert.equal(denied.allowed, false);
  assert.equal(denied.retryAfterMs, 1000); // one token per second

  // After one second a single token has refilled.
  const afterRefill = rateLimit.tryConsume(bucket, policy, 1000);
  assert.equal(afterRefill.allowed, true);
});

test('rate-limit: refill never exceeds capacity and ignores backward clock skew', () => {
  const policy = { capacity: 5, refillPerSecond: 10 };
  const partial = { tokens: 1, updatedAtMs: 1000 };
  const refilled = rateLimit.refill(partial, policy, 10_000);
  assert.equal(refilled.tokens, 5); // clamped to capacity

  const skew = rateLimit.refill({ tokens: 2, updatedAtMs: 5000 }, policy, 1000);
  assert.equal(skew.tokens, 2); // no tokens removed for a backward clock
});

test('rate-limit: limiter enforces per-category policy and throws retryable when exceeded', async () => {
  let now = 0;
  const buckets = new Map();
  const repo = {
    read: (key) => Promise.resolve(buckets.get(key) ?? null),
    write: (key, next) => {
      buckets.set(key, next);
      return Promise.resolve();
    },
  };
  const store = rateLimit.createRepositoryRateLimitStore(repo);
  const limiter = rateLimit.createRateLimiter({
    store,
    nowMs: () => now,
    policies: { payment_attempt: { capacity: 2, refillPerSecond: 1 } },
  });

  const params = { category: 'payment_attempt', subject: 'user-1', correlationId: 'corr-r' };
  await assert.doesNotReject(() => limiter.enforce(params));
  await assert.doesNotReject(() => limiter.enforce(params));
  await assert.rejects(
    () => limiter.enforce(params),
    (err) => err.financialError.code === 'dependency_unavailable' && err.financialError.retryable === true,
  );

  // A different subject has an independent bucket.
  await assert.doesNotReject(() =>
    limiter.enforce({ category: 'payment_attempt', subject: 'user-2', correlationId: 'corr-r' }),
  );
});

test('rate-limit: a category without a policy is unlimited', async () => {
  const store = { consume: () => assert.fail('store should not be consulted for an unlimited category') };
  const limiter = rateLimit.createRateLimiter({ store, policies: {} });
  const decision = await limiter.check({
    category: 'invoice_creation',
    subject: 'm-1',
    correlationId: 'corr-u',
  });
  assert.equal(decision.allowed, true);
});

// ---------------------------------------------------------------------------
// stellar/sponsorship.ts — sponsor guardrails + audit + separation
// ---------------------------------------------------------------------------

const thresholds = {
  minReserveStroops: 1000,
  maxSpendPerWindowStroops: 5000,
  maxOperationsPerWindow: 3,
  windowSeconds: 3600,
};

test('sponsorship: allows an operation that stays above the reserve floor', () => {
  const snapshot = { availableStroops: 10_000, spentInWindowStroops: 0, operationsInWindow: 0 };
  const decision = sponsorship.evaluateSponsorship(snapshot, thresholds, { estimatedCostStroops: 500 });
  assert.equal(decision.allowed, true);
  assert.equal(decision.reason, 'ok');
  assert.equal(decision.projectedBalanceStroops, 9500);
});

test('sponsorship: refuses before insolvency when the reserve floor would be crossed', () => {
  // 1500 available, floor 1000: spending 600 would leave 900 (< floor) -> refuse.
  const snapshot = { availableStroops: 1500, spentInWindowStroops: 0, operationsInWindow: 0 };
  const decision = sponsorship.evaluateSponsorship(snapshot, thresholds, { estimatedCostStroops: 600 });
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, 'reserve_floor');
});

test('sponsorship: enforces window spend and rate caps', () => {
  const spendCapped = sponsorship.evaluateSponsorship(
    { availableStroops: 100_000, spentInWindowStroops: 4800, operationsInWindow: 0 },
    thresholds,
    { estimatedCostStroops: 300 },
  );
  assert.equal(spendCapped.reason, 'spend_cap');

  const rateCapped = sponsorship.evaluateSponsorship(
    { availableStroops: 100_000, spentInWindowStroops: 0, operationsInWindow: 3 },
    thresholds,
    { estimatedCostStroops: 100 },
  );
  assert.equal(rateCapped.reason, 'rate_cap');
});

test('sponsorship: separation forbids the sponsor doubling as an aid-holding account', () => {
  assert.throws(
    () =>
      sponsorship.assertSponsorSeparation(
        { sponsor: 'GSPONSOR', issuer: 'GISSUER', beneficiary: 'GSPONSOR' },
        'corr-s',
      ),
    (err) =>
      err.financialError.code === 'validation_failed' &&
      Boolean(err.financialError.fieldErrors?.sponsor),
  );
  assert.doesNotThrow(() =>
    sponsorship.assertSponsorSeparation(
      { sponsor: 'GSPONSOR', issuer: 'GISSUER', treasury: 'GTREAS', beneficiary: 'GBEN', merchant: 'GMER' },
      'corr-s',
    ),
  );
});

test('sponsorship: governor audits both allowed and refused decisions', async () => {
  const audits = [];
  const audit = { record: (entry) => (audits.push(entry), Promise.resolve()) };

  const allowedGovernor = sponsorship.createSponsorGovernor({
    thresholds,
    usage: { loadUsage: () => Promise.resolve({ availableStroops: 10_000, spentInWindowStroops: 0, operationsInWindow: 0 }) },
    audit,
    clock: () => new Date('2026-01-01T00:00:00Z'),
  });
  const allowed = await allowedGovernor.authorize({ estimatedCostStroops: 500, purpose: 'fee_bump', correlationId: 'c-a' });
  assert.equal(allowed.allowed, true);
  assert.equal(audits.at(-1).outcome, 'allowed');

  const refusedGovernor = sponsorship.createSponsorGovernor({
    thresholds,
    usage: { loadUsage: () => Promise.resolve({ availableStroops: 1200, spentInWindowStroops: 0, operationsInWindow: 0 }) },
    audit,
    clock: () => new Date('2026-01-01T00:00:00Z'),
  });
  await assert.rejects(
    () => refusedGovernor.authorize({ estimatedCostStroops: 500, purpose: 'fee_bump', correlationId: 'c-r' }),
    (err) => err.financialError.code === 'sponsor_unavailable' && err.financialError.retryable === true,
  );
  assert.equal(audits.at(-1).outcome, 'refused');
  assert.equal(audits.at(-1).reason, 'reserve_floor');
});

// ---------------------------------------------------------------------------
// work-queue.ts — concurrency limiter + durable queue
// ---------------------------------------------------------------------------

test('work-queue: concurrency limiter never exceeds the bound', async () => {
  const limiter = workQueue.createConcurrencyLimiter(2);
  let active = 0;
  let peak = 0;
  const task = () =>
    limiter.run(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
    });
  await Promise.all([task(), task(), task(), task(), task()]);
  assert.ok(peak <= 2, `peak concurrency ${peak} exceeded the bound of 2`);
});

test('work-queue: mapWithConcurrency isolates a single failure from the batch', async () => {
  const { succeeded, failed } = await workQueue.mapWithConcurrency([1, 2, 3, 4], 2, async (n) => {
    if (n === 3) throw new Error('boom on 3');
    return n * 10;
  });
  assert.deepEqual(
    succeeded.map((s) => s.value),
    [10, 20, 40],
  );
  assert.equal(failed.length, 1);
  assert.equal(failed[0].item, 3);
});

// A minimal in-memory durable store fixture with leasing.
const makeMemoryStore = () => {
  const items = new Map(); // id -> { id, payload, attempts, leased }
  let leaseSeq = 0;
  return {
    dead: [],
    enqueue({ id, payload }) {
      if (!items.has(id)) items.set(id, { id, payload, attempts: 0, leased: null });
      return Promise.resolve({ accepted: true, depth: items.size });
    },
    depth: () => Promise.resolve(items.size),
    claim(limit) {
      const claimed = [];
      for (const item of items.values()) {
        if (claimed.length >= limit) break;
        if (item.leased === null) {
          leaseSeq += 1;
          item.leased = `lease-${leaseSeq}`;
          claimed.push({ id: item.id, payload: item.payload, attempts: item.attempts, leaseToken: item.leased });
        }
      }
      return Promise.resolve(claimed);
    },
    complete(id, leaseToken) {
      const item = items.get(id);
      if (item && item.leased === leaseToken) items.delete(id);
      return Promise.resolve();
    },
    release({ id, leaseToken, requeue }) {
      const item = items.get(id);
      if (item && item.leased === leaseToken) {
        item.leased = null;
        item.attempts += 1;
        if (!requeue) {
          items.delete(id);
          this.dead.push(id);
        }
      }
      return Promise.resolve();
    },
    _size: () => items.size,
  };
};

test('work-queue: accept applies backpressure when the durable depth is at capacity', async () => {
  const store = makeMemoryStore();
  const queue = workQueue.createDurableWorkQueue({ store, maxDepth: 2, maxConcurrency: 2 });

  await queue.accept({ payload: { n: 1 }, correlationId: 'c1' });
  await queue.accept({ payload: { n: 2 }, correlationId: 'c2' });
  await assert.rejects(
    () => queue.accept({ payload: { n: 3 }, correlationId: 'c3' }),
    (err) => err.financialError.code === 'dependency_unavailable' && err.financialError.retryable === true,
  );
  assert.equal(store._size(), 2, 'no accepted item was dropped');
});

test('work-queue: drain completes successes and requeues failures without losing work', async () => {
  const store = makeMemoryStore();
  const queue = workQueue.createDurableWorkQueue({ store, maxDepth: 10, maxConcurrency: 3, maxAttempts: 2 });

  await queue.accept({ payload: { id: 'ok' }, correlationId: 'c' });
  await queue.accept({ payload: { id: 'flaky' }, correlationId: 'c' });

  // First drain: the flaky item fails and is requeued; the durable item survives.
  const first = await queue.drain(async (item) => {
    if (item.payload.id === 'flaky') throw new Error('transient');
  }, 10);
  assert.equal(first.completed, 1);
  assert.equal(first.requeued, 1);
  assert.equal(await queue.depth(), 1, 'the requeued item is still durably stored');

  // Second drain: the flaky item fails again, reaching maxAttempts -> dead-letter.
  const second = await queue.drain(async () => {
    throw new Error('still transient');
  }, 10);
  assert.equal(second.deadLettered, 1);
  assert.equal(await queue.depth(), 0);
  assert.deepEqual(store.dead.length, 1);
});

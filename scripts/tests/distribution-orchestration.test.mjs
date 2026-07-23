// Unit tests for the resumable bulk-distribution orchestration layer.
//
// Covers the pure, injectable logic of:
//   supabase/functions/_shared/stellar/distribution.ts (Task 10.2)
//     - per-recipient validation partition (enrollment, wallet, allocation,
//       budget, duplicate, network)
//     - bounded batching + batching math (incl. a >=2,000-recipient job)
//     - deterministic per-recipient idempotency keys
//     - resumable execution preserving confirmed recipients with per-item
//       failure isolation via work-queue.ts
//
// Validates: Requirements 4.5, 8.1, 8.2, 8.3, 8.9, 22.2, 22.4
//
// Loading convention (repo test harness, mirrors edge-operational-controls.test.mjs):
// TypeScript modules are transpiled in-memory and imported as data: URLs, with
// relative imports resolved recursively and @supabase/supabase-js stubbed (never
// invoked — every client is injected). A shared cache keeps a single module
// instance so the error class keeps one identity across the graph.

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

const dist = await importShared('stellar/distribution.ts');

// ---------------------------------------------------------------------------
// Fixtures.
// ---------------------------------------------------------------------------

const PROGRAM_ID = '20000000-0000-4000-8000-000000000001';
const ORG_ID = '10000000-0000-4000-8000-000000000001';
const POLICY_VERSION = 3;

let seq = 0;
const uuid = () => {
  seq += 1;
  return `30000000-0000-4000-8000-${String(seq).padStart(12, '0')}`;
};

const makeEnrollment = (beneficiaryIdentityId, overrides = {}) => ({
  id: uuid(),
  program_id: PROGRAM_ID,
  beneficiary_identity_id: beneficiaryIdentityId,
  approval_status: 'Approved',
  allocation_amount_stroops: 1000,
  voucher_balance: 0,
  category: 'Cash',
  ...overrides,
});

const makeWallet = (ownerId, overrides = {}) => ({
  id: uuid(),
  owner_type: 'beneficiary_identity',
  owner_id: ownerId,
  purpose: 'beneficiary',
  network: 'stellar_testnet',
  verification_status: 'verified',
  is_active: true,
  address: 'GA' + 'A'.repeat(54),
  ...overrides,
});

const makeCandidate = (beneficiaryIdentityId, amountStroops, overrides = {}) => ({
  beneficiaryIdentityId,
  enrollment:
    overrides.enrollment !== undefined ? overrides.enrollment : makeEnrollment(beneficiaryIdentityId),
  wallet: overrides.wallet !== undefined ? overrides.wallet : makeWallet(beneficiaryIdentityId),
  amountStroops,
});

const baseContext = (overrides = {}) => ({
  organizationId: ORG_ID,
  programId: PROGRAM_ID,
  policyVersion: POLICY_VERSION,
  network: 'stellar_testnet',
  availableBudgetStroops: 1_000_000,
  ...overrides,
});

// ---------------------------------------------------------------------------
// Deterministic idempotency key.
// ---------------------------------------------------------------------------

test('key: mirrors the database make_distribution_recipient_key format exactly', () => {
  const key = dist.makeDistributionRecipientKey(PROGRAM_ID, 'ben-1', 7);
  assert.equal(key, `distribution:${PROGRAM_ID}:beneficiary:ben-1:policy:7`);
});

test('key: is a pure function of program, beneficiary, and policy version', () => {
  const a = dist.makeDistributionRecipientKey(PROGRAM_ID, 'ben-1', 1);
  const b = dist.makeDistributionRecipientKey(PROGRAM_ID, 'ben-1', 1);
  const c = dist.makeDistributionRecipientKey(PROGRAM_ID, 'ben-1', 2);
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.throws(() => dist.makeDistributionRecipientKey(PROGRAM_ID, 'ben-1', -1), RangeError);
});

// ---------------------------------------------------------------------------
// Per-recipient validation partition.
// ---------------------------------------------------------------------------

test('validation: a clean set of recipients all validate and bind deterministic keys', () => {
  const candidates = [
    makeCandidate('ben-1', 500),
    makeCandidate('ben-2', 700),
    makeCandidate('ben-3', 300),
  ];
  const result = dist.validateRecipients(candidates, baseContext());

  assert.equal(result.valid.length, 3);
  assert.equal(result.rejected.length, 0);
  assert.equal(result.totalValidAmountStroops, 1500);
  assert.equal(
    result.valid[0].idempotencyKey,
    dist.makeDistributionRecipientKey(PROGRAM_ID, 'ben-1', POLICY_VERSION),
  );
  // Enrollment + wallet ids are surfaced for the recipient row insert.
  assert.ok(result.valid[0].enrollmentId);
  assert.ok(result.valid[0].destinationWalletId);
});

test('validation: partitions every failure class without rejecting the whole batch', () => {
  const candidates = [
    makeCandidate('ok', 100), // valid
    makeCandidate('no-enroll', 100, { enrollment: null }),
    makeCandidate('unapproved', 100, {
      enrollment: makeEnrollment('unapproved', { approval_status: 'Pending' }),
    }),
    makeCandidate('wrong-program', 100, {
      enrollment: makeEnrollment('wrong-program', { program_id: 'other-program' }),
    }),
    makeCandidate('no-wallet', 100, { wallet: null }),
    makeCandidate('unverified', 100, {
      wallet: makeWallet('unverified', { verification_status: 'pending' }),
    }),
    makeCandidate('inactive', 100, { wallet: makeWallet('inactive', { is_active: false }) }),
    makeCandidate('wrong-purpose', 100, {
      wallet: makeWallet('wrong-purpose', { purpose: 'merchant_settlement' }),
    }),
    makeCandidate('wrong-owner', 100, {
      wallet: makeWallet('someone-else'),
    }),
    makeCandidate('zero-amount', 0),
    makeCandidate('fractional', 1.5),
  ];

  const result = dist.validateRecipients(candidates, baseContext());

  assert.equal(result.valid.length, 1);
  assert.equal(result.valid[0].beneficiaryIdentityId, 'ok');

  const byBeneficiary = new Map(result.rejected.map((r) => [r.beneficiaryIdentityId, r.failureCode]));
  assert.equal(byBeneficiary.get('no-enroll'), 'enrollment_missing');
  assert.equal(byBeneficiary.get('unapproved'), 'enrollment_not_approved');
  assert.equal(byBeneficiary.get('wrong-program'), 'enrollment_scope_mismatch');
  assert.equal(byBeneficiary.get('no-wallet'), 'wallet_missing');
  assert.equal(byBeneficiary.get('unverified'), 'wallet_not_verified');
  assert.equal(byBeneficiary.get('inactive'), 'wallet_inactive');
  assert.equal(byBeneficiary.get('wrong-purpose'), 'wallet_wrong_purpose');
  assert.equal(byBeneficiary.get('wrong-owner'), 'wallet_not_beneficiary_owned');
  assert.equal(byBeneficiary.get('zero-amount'), 'amount_invalid');
  assert.equal(byBeneficiary.get('fractional'), 'amount_invalid');
  // Every rejection carries a user-safe reason.
  for (const r of result.rejected) {
    assert.ok(typeof r.failureReason === 'string' && r.failureReason.length > 0);
  }
});

test('validation: wrong-network wallet is rejected even when otherwise valid', () => {
  const candidates = [
    makeCandidate('mainnet', 100, {
      wallet: makeWallet('mainnet', { network: 'stellar_testnet' }),
    }),
  ];
  // Context expects a different network than the wallet carries.
  const result = dist.validateRecipients(candidates, baseContext({ network: 'some_other_network' }));
  assert.equal(result.valid.length, 0);
  assert.equal(result.rejected[0].failureCode, 'wallet_wrong_network');
});

test('validation: budget is consumed in order and a later smaller allocation can still fit', () => {
  const candidates = [
    makeCandidate('big', 800),
    makeCandidate('over', 500), // would exceed remaining 200
    makeCandidate('small', 150), // still fits in remaining 200
  ];
  const result = dist.validateRecipients(candidates, baseContext({ availableBudgetStroops: 1000 }));

  assert.deepEqual(
    result.valid.map((v) => v.beneficiaryIdentityId),
    ['big', 'small'],
  );
  assert.equal(result.rejected.length, 1);
  assert.equal(result.rejected[0].beneficiaryIdentityId, 'over');
  assert.equal(result.rejected[0].failureCode, 'budget_exceeded');
  assert.equal(result.totalValidAmountStroops, 950);
});

test('validation: duplicates are rejected within the set and against already-claimed keys', () => {
  const claimedKey = dist.makeDistributionRecipientKey(PROGRAM_ID, 'prior', POLICY_VERSION);
  const candidates = [
    makeCandidate('prior', 100), // already claimed in a prior job
    makeCandidate('dup', 100),
    makeCandidate('dup', 100), // repeated within this set
  ];
  const result = dist.validateRecipients(
    candidates,
    baseContext({ claimedRecipientKeys: new Set([claimedKey]) }),
  );

  assert.equal(result.valid.length, 1);
  assert.equal(result.valid[0].beneficiaryIdentityId, 'dup');
  const dupRejections = result.rejected.filter((r) => r.failureCode === 'duplicate_recipient');
  assert.equal(dupRejections.length, 2);
});

// ---------------------------------------------------------------------------
// Bounded batching + batching math.
// ---------------------------------------------------------------------------

test('batching: assertValidBatchSize rejects non-positive and over-limit sizes', () => {
  assert.equal(dist.assertValidBatchSize(1), 1);
  assert.equal(dist.assertValidBatchSize(100), 100);
  assert.throws(() => dist.assertValidBatchSize(0), RangeError);
  assert.throws(() => dist.assertValidBatchSize(101), RangeError);
  assert.throws(() => dist.assertValidBatchSize(2.5), RangeError);
});

test('batching: planBatches preserves order and never exceeds the batch size', () => {
  const items = Array.from({ length: 250 }, (_, i) => i);
  const batches = dist.planBatches(items, 100);
  assert.equal(batches.length, 3);
  assert.deepEqual(batches.map((b) => b.length), [100, 100, 50]);
  assert.ok(batches.every((b) => b.length <= 100));
  assert.deepEqual(batches.flat(), items); // no recipient dropped or duplicated
});

test('batching: computeBatchingPlan math is exact for an empty and a remainder set', () => {
  const empty = dist.computeBatchingPlan(0, 100);
  assert.deepEqual(
    { c: empty.batchCount, l: empty.lastBatchSize },
    { c: 0, l: 0 },
  );
  const remainder = dist.computeBatchingPlan(250, 100);
  assert.deepEqual(
    { c: remainder.batchCount, l: remainder.lastBatchSize },
    { c: 3, l: 50 },
  );
  const exact = dist.computeBatchingPlan(200, 100);
  assert.deepEqual({ c: exact.batchCount, l: exact.lastBatchSize }, { c: 2, l: 100 });
});

test('batching: a >=2,000-recipient job is bounded into full network-sized batches (Req 22.2)', () => {
  const plan = dist.computeBatchingPlan(dist.MIN_SUPPORTED_RECIPIENTS, 100);
  assert.equal(plan.recipientCount, 2000);
  assert.equal(plan.batchCount, 20);
  assert.equal(plan.lastBatchSize, 100);

  const items = Array.from({ length: 2000 }, (_, i) => i);
  const batches = dist.planBatches(items, 100);
  assert.equal(batches.length, 20);
  assert.ok(batches.every((b) => b.length <= dist.MAX_OPERATIONS_PER_STELLAR_TRANSACTION));
  assert.equal(batches.flat().length, 2000);
});

// ---------------------------------------------------------------------------
// Resumption: preserving confirmed recipients.
// ---------------------------------------------------------------------------

test('resume: only pending and failed recipients are eligible; confirmed/submitted/cancelled preserved', () => {
  const recipients = [
    { id: 'r1', status: 'confirmed' },
    { id: 'r2', status: 'failed' },
    { id: 'r3', status: 'pending' },
    { id: 'r4', status: 'submitted' },
    { id: 'r5', status: 'cancelled' },
  ];
  const resumable = dist.selectResumableRecipients(recipients);
  assert.deepEqual(
    resumable.map((r) => r.id),
    ['r2', 'r3'],
  );
  assert.equal(dist.isResumableRecipientStatus('confirmed'), false);
  assert.equal(dist.isResumableRecipientStatus('submitted'), false);
  assert.equal(dist.isResumableRecipientStatus('pending'), true);
  assert.equal(dist.isResumableRecipientStatus('failed'), true);
});

const makeWork = (id, amountStroops = 100) => ({
  recipientId: id,
  beneficiaryIdentityId: `ben-${id}`,
  destinationWalletId: `wallet-${id}`,
  amountStroops,
  idempotencyKey: dist.makeDistributionRecipientKey(PROGRAM_ID, `ben-${id}`, POLICY_VERSION),
});

test('execution: one failing recipient never blocks the rest of the batch (Req 8.9, 22.4)', async () => {
  const works = [makeWork('a'), makeWork('boom'), makeWork('c'), makeWork('throw')];
  const report = await dist.executeRecipientBatch(works, 2, async (work) => {
    if (work.recipientId === 'boom') {
      return { kind: 'failed', failureCode: 'submission_rejected', failureReason: 'network said no' };
    }
    if (work.recipientId === 'throw') {
      throw new Error('unexpected dependency outage');
    }
    return { kind: 'submitted', transactionHash: `hash-${work.recipientId}` };
  });

  assert.deepEqual(
    report.submitted.map((s) => s.recipientId).sort(),
    ['a', 'c'],
  );
  const failedIds = report.failed.map((f) => f.recipientId).sort();
  assert.deepEqual(failedIds, ['boom', 'throw']);
  // A thrown error is isolated and recorded (not swallowed, not propagated).
  const thrown = report.failed.find((f) => f.recipientId === 'throw');
  assert.equal(thrown.failureCode, 'processing_error');
});

test('execution: runDistributionExecution processes 2,000 recipients across bounded batches', async () => {
  const works = Array.from({ length: 2000 }, (_, i) => makeWork(String(i)));
  let processed = 0;
  const report = await dist.runDistributionExecution({
    works,
    batchSize: 100,
    maxConcurrency: 10,
    processor: async (work) => {
      processed += 1;
      // Fail exactly one recipient to prove isolation at scale.
      if (work.recipientId === '1234') {
        return { kind: 'failed', failureCode: 'insufficient_balance', failureReason: 'short' };
      }
      return { kind: 'submitted', transactionHash: `h${work.recipientId}` };
    },
  });

  assert.equal(processed, 2000);
  assert.equal(report.submitted.length, 1999);
  assert.equal(report.failed.length, 1);
  assert.equal(report.failed[0].recipientId, '1234');
});

test('execution: runDistributionExecution rejects an out-of-bounds batch size', async () => {
  await assert.rejects(
    () => dist.runDistributionExecution({ works: [], batchSize: 500, processor: async () => ({ kind: 'submitted', transactionHash: 'x' }) }),
    RangeError,
  );
});

// ---------------------------------------------------------------------------
// Job status roll-up.
// ---------------------------------------------------------------------------

test('rollup: summarizeRecipientStatuses tallies by status', () => {
  const counts = dist.summarizeRecipientStatuses([
    { status: 'confirmed' },
    { status: 'confirmed' },
    { status: 'failed' },
    { status: 'pending' },
  ]);
  assert.equal(counts.total, 4);
  assert.equal(counts.confirmed, 2);
  assert.equal(counts.failed, 1);
  assert.equal(counts.pending, 1);
});

test('rollup: a job is completed only when every recipient is confirmed (Req 8.7)', () => {
  const allConfirmed = dist.summarizeRecipientStatuses([{ status: 'confirmed' }, { status: 'confirmed' }]);
  assert.equal(dist.hasUnfinishedRecipients(allConfirmed), false);
  assert.equal(dist.resolveTerminalJobStatus(allConfirmed), 'completed');

  const withFailure = dist.summarizeRecipientStatuses([{ status: 'confirmed' }, { status: 'failed' }]);
  assert.equal(dist.hasUnfinishedRecipients(withFailure), true);
  assert.equal(dist.resolveTerminalJobStatus(withFailure), 'partial_failed');

  const stillInFlight = dist.summarizeRecipientStatuses([{ status: 'submitted' }, { status: 'failed' }]);
  // A submitted recipient is still owned by reconciliation -> not terminal yet.
  assert.equal(dist.resolveTerminalJobStatus(stillInFlight), 'reconciling');
});

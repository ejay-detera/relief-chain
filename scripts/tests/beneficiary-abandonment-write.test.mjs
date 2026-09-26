// Abandonment write-path guard tests.
//
// Covers the service-owned disposition keyed to the new migration:
//
//   supabase/functions/_shared/stellar/beneficiary-abandonment.ts
//     - planAbandonmentUpdate (cash-only, note required, version+1,
//       history preserved by construction, idempotent)
//
// Honesty guarantees:
//   - never fabricates run/issue rows (the plan reuses existing evidence;
//     only disposition metadata plus a monotonic version bump is returned);
//   - never rewrites distributed/redeemed (the update contains no financial
//     fields, so available=distributed-redeemed+refunded is untouched);
//   - operator-approved only (operatorUserId uuid required; beneficiary
//     self-service is rejected in the Edge Function via org-role check);
//   - idempotent (already-abandoned returns without a write).
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const sharedDir = fileURLToPath(new URL('../../supabase/functions/_shared/', import.meta.url));
const STELLAR_SDK_URL = pathToFileURL(require.resolve('@stellar/stellar-sdk')).href;
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
  const specifierRe = /\bfrom\s*(['"])([^'"]+)\1/g;
  const specifiers = new Set();
  let match;
  while ((match = specifierRe.exec(outputText)) !== null) specifiers.add(match[2]);
  const replacements = new Map();
  for (const specifier of specifiers) {
    if (specifier === '@supabase/supabase-js') {
      replacements.set(specifier, SUPABASE_STUB_URL);
    } else if (specifier === '@stellar/stellar-sdk') {
      replacements.set(specifier, STELLAR_SDK_URL);
    } else if (specifier.startsWith('.')) {
      replacements.set(specifier, await loadModule(path.resolve(path.dirname(absPath), specifier)));
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

const mod = await import(await loadModule(path.join(sharedDir, 'stellar/beneficiary-abandonment.ts')));

const row = (overrides = {}) => ({
  id: '11111111-1111-1111-1111-111111111111',
  organization_id: '22222222-2222-2222-2222-222222222222',
  program_id: '33333333-3333-3333-3333-333333333333',
  beneficiary_identity_id: '44444444-4444-4444-4444-444444444444',
  asset_code: 'RCPHP',
  aid_type: 'cash',
  allocated_stroops: 10_000_000_000,
  distributed_stroops: 10_000_000_000,
  redeemed_stroops: 1_800_000_000,
  refunded_stroops: 0,
  available_balance_stroops: 8_200_000_000,
  confirmed_transaction_count: 1,
  reconciliation_run_id: '55555555-5555-5555-5555-555555555555',
  as_of_ledger: 2100,
  reconciled_at: '2026-01-02T00:10:00.000Z',
  projection_version: 3,
  is_quarantined: false,
  quarantine_issue_id: null,
  is_abandoned: false,
  abandoned_at: null,
  abandoned_by: null,
  abandonment_note: null,
  abandonment_evidence_ref: null,
  ...overrides,
});

const input = (overrides = {}) => ({
  note: 'Disbursed to lost wallet GBDR; operator waiver strands 1,000 (testnet, no value).',
  evidenceRef: 'waiver-in-chat-2026-09-26',
  operatorUserId: '66666666-6666-6666-6666-666666666666',
  ...overrides,
});

test('abandonment-write: cash row plans metadata plus version bump only (history untouched)', () => {
  const outcome = mod.planAbandonmentUpdate(row(), input(), '2026-09-26T00:00:00.000Z');
  assert.equal(outcome.status, 'ready');
  assert.equal(outcome.update.is_abandoned, true);
  assert.equal(outcome.update.abandoned_by, '66666666-6666-6666-6666-666666666666');
  assert.equal(outcome.update.projection_version, 4);
  // No financial or evidence fields in the update: history and run evidence reused.
  assert.ok(!('distributed_stroops' in outcome.update));
  assert.ok(!('redeemed_stroops' in outcome.update));
  assert.ok(!('reconciliation_run_id' in outcome.update));
  assert.ok(!('reconciled_at' in outcome.update));
});

test('abandonment-write: already-abandoned is idempotent without a write', () => {
  const outcome = mod.planAbandonmentUpdate(row({ is_abandoned: true }), input());
  assert.equal(outcome.status, 'already_abandoned');
});

test('abandonment-write: voucher rows are rejected (voucher rail untouched)', () => {
  const outcome = mod.planAbandonmentUpdate(row({ aid_type: 'voucher' }), input());
  assert.equal(outcome.status, 'rejected');
});

test('abandonment-write: missing note is rejected (fail closed)', () => {
  const outcome = mod.planAbandonmentUpdate(row(), input({ note: '   ' }));
  assert.equal(outcome.status, 'rejected');
});

test('abandonment-write: invalid operator id is rejected (no self-service)', () => {
  const outcome = mod.planAbandonmentUpdate(row(), input({ operatorUserId: 'not-a-uuid' }));
  assert.equal(outcome.status, 'rejected');
});

test('abandonment-write: evidence ref is optional free text (never a fabricated run id)', () => {
  const outcome = mod.planAbandonmentUpdate(row(), input({ evidenceRef: null }), '2026-09-26T00:00:00.000Z');
  assert.equal(outcome.status, 'ready');
  assert.equal(outcome.update.abandonment_evidence_ref, null);
});

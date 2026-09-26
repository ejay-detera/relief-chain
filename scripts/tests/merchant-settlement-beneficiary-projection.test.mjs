// Merchant-settlement beneficiary projection tests (Part A).
//
// Covers the spend-side refresh of `beneficiary_balance_projection` after a
// merchant cash payment confirms:
//
//   supabase/functions/_shared/stellar/cash-reconciliation.ts
//     - buildBeneficiaryCashBalanceRow (refund interplay, defaults, clamp)
//     - selectSpendAttributionProgramId (exactly-one program rule)
//     - createBeneficiaryCashSpendRefresher (injected ports: snapshots,
//       scoped run evidence, projection writer)
//
// Guarantees under test:
//   - redeemed includes the just-confirmed spend; available is
//     distributed - redeemed + refunded, clamped at zero, never fabricated;
//   - exactly one projection row per confirmed principal per pass; a replay
//     with the same confirmed totals yields identical amounts (idempotent);
//   - null/ambiguous programs, voucher programs, asset mismatches, missing
//     enrollments, amounts-check violations, and missing run evidence all
//     skip fail-closed with a reason and never write;
//   - voucher-rail rows are never written.
//
// Loading mirrors edge-cash-reconciliation.test.mjs: TypeScript modules are
// transpiled in-memory and imported as data: URLs, @supabase/supabase-js is
// stubbed, and @stellar/stellar-sdk resolves to the real package.

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

const importShared = async (relativePath) =>
  import(await loadModule(path.join(sharedDir, relativePath)));

const cashRecon = await importShared('stellar/cash-reconciliation.ts');

// ---------------------------------------------------------------------------
// Fixtures.
// ---------------------------------------------------------------------------

const ISSUER = 'G' + 'A'.repeat(55);
const OTHER_ISSUER = 'G' + 'B'.repeat(55);

const snapshot = (overrides = {}) => ({
  organizationId: 'org-1',
  programId: 'prog-1',
  beneficiaryIdentityId: 'ben-1',
  programAidType: 'cash',
  programAssetCode: 'RCPHP',
  programAssetIssuer: ISSUER,
  hasEnrollment: true,
  allocatedStroops: 2000,
  distributedStroops: 2000,
  distributedCount: 1,
  refundedStroops: 0,
  existingProjectionVersion: 3,
  ...overrides,
});

const evidence = (overrides = {}) => ({
  runId: 'run-spend-1',
  completedAt: '2026-01-02T00:10:00.000Z',
  endLedgerSequence: 2100,
  status: 'completed',
  ...overrides,
});

const refresherDeps = (overrides = {}) => {
  const writes = [];
  return {
    writes,
    deps: {
      snapshots: {
        async load() {
          return snapshot(...(overrides.snapshotArgs ?? []));
        },
      },
      evidence: {
        async runScopedStream() {
          return evidence(...(overrides.evidenceArgs ?? []));
        },
      },
      projections: {
        async write(batch) {
          writes.push(batch);
        },
      },
      asset: { code: 'RCPHP', issuer: ISSUER },
      ...(overrides.deps ?? {}),
    },
  };
};

// ---------------------------------------------------------------------------
// Builder: refund interplay, defaults, clamp, cash-only.
// ---------------------------------------------------------------------------

test('spend-projection: refunded spend is added back to the available balance', () => {
  const row = cashRecon.buildBeneficiaryCashBalanceRow({
    organizationId: 'org-1',
    programId: 'prog-1',
    beneficiaryIdentityId: 'ben-1',
    assetCode: 'RCPHP',
    assetIssuer: ISSUER,
    allocatedStroops: 2000,
    distributedStroops: 2000,
    redeemedStroops: 150,
    refundedStroops: 50,
    confirmedTransactionCount: 1,
    reconciliationRunId: 'run-1',
    asOfLedger: 2100,
    reconciledAt: '2026-01-02T00:10:00.000Z',
    network: 'stellar_testnet',
    runStatus: 'completed',
    projectionVersion: 4,
  });
  // available = distributed - redeemed + refunded = 2000 - 150 + 50
  assert.equal(row.available_balance_stroops, 1900);
  assert.equal(row.redeemed_stroops, 150);
  assert.equal(row.refunded_stroops, 50);
});

test('spend-projection: omitted redeemed/refunded default to zero (distribution-only row)', () => {
  const row = cashRecon.buildBeneficiaryCashBalanceRow({
    organizationId: 'org-1',
    programId: 'prog-1',
    beneficiaryIdentityId: 'ben-1',
    assetCode: 'RCPHP',
    assetIssuer: ISSUER,
    allocatedStroops: 2000,
    distributedStroops: 2000,
    confirmedTransactionCount: 1,
    reconciliationRunId: 'run-1',
    asOfLedger: 2000,
    reconciledAt: '2026-01-01T00:10:00.000Z',
    network: 'stellar_testnet',
    runStatus: 'completed',
    projectionVersion: 1,
  });
  assert.equal(row.redeemed_stroops, 0);
  assert.equal(row.refunded_stroops, 0);
  assert.equal(row.available_balance_stroops, 2000);
});

test('spend-projection: overspend past refunds still clamps at zero', () => {
  const row = cashRecon.buildBeneficiaryCashBalanceRow({
    organizationId: 'org-1',
    programId: 'prog-1',
    beneficiaryIdentityId: 'ben-1',
    assetCode: 'RCPHP',
    assetIssuer: ISSUER,
    allocatedStroops: 2000,
    distributedStroops: 2000,
    redeemedStroops: 2500,
    refundedStroops: 100,
    confirmedTransactionCount: 2,
    reconciliationRunId: 'run-1',
    asOfLedger: 2100,
    reconciledAt: '2026-01-02T00:10:00.000Z',
    network: 'stellar_testnet',
    runStatus: 'completed',
    projectionVersion: 5,
  });
  assert.equal(row.available_balance_stroops, 0);
});

test('spend-projection: the spend refresher only ever builds cash rows', () => {
  const row = cashRecon.buildBeneficiaryCashBalanceRow({
    organizationId: 'org-1',
    programId: 'prog-1',
    beneficiaryIdentityId: 'ben-1',
    assetCode: 'RCPHP',
    assetIssuer: ISSUER,
    allocatedStroops: 2000,
    distributedStroops: 2000,
    redeemedStroops: 150,
    confirmedTransactionCount: 1,
    reconciliationRunId: 'run-1',
    asOfLedger: 2100,
    reconciledAt: '2026-01-02T00:10:00.000Z',
    network: 'stellar_testnet',
    runStatus: 'completed',
    projectionVersion: 4,
  });
  assert.equal(row.aid_type, 'cash');
  assert.notEqual(row.aid_type, 'voucher');
});

// ---------------------------------------------------------------------------
// Attribution: exactly one distributed-cash program owns a spend.
// ---------------------------------------------------------------------------

test('spend-attribution: no program means no attribution', () => {
  assert.equal(cashRecon.selectSpendAttributionProgramId([]), null);
});

test('spend-attribution: exactly one program owns the spend', () => {
  assert.equal(
    cashRecon.selectSpendAttributionProgramId([{ programId: 'prog-1' }]),
    'prog-1',
  );
});

test('spend-attribution: ambiguous programs fail closed with no attribution', () => {
  assert.equal(
    cashRecon.selectSpendAttributionProgramId([{ programId: 'prog-1' }, { programId: 'prog-2' }]),
    null,
  );
});

// ---------------------------------------------------------------------------
// Refresher: one honest row per confirmation.
// ---------------------------------------------------------------------------

test('spend-refresher: a just-confirmed spend decrements the projection exactly once', async () => {
  const { deps, writes } = refresherDeps();
  const refresher = cashRecon.createBeneficiaryCashSpendRefresher(deps);

  const result = await refresher.refresh({
    organizationId: 'org-1',
    correlationId: '11111111-1111-1111-1111-111111111111',
    principals: [{ beneficiaryIdentityId: 'ben-1', redeemedStroops: 150 }],
  });

  assert.equal(result.updated.length, 1);
  assert.equal(result.skipped.length, 0);
  assert.equal(result.updated[0].beneficiaryIdentityId, 'ben-1');
  // Chain truth from the proven bug report: 2000 disbursed, 150 spent.
  assert.equal(result.updated[0].availableBalanceStroops, 1850);

  // Exactly one writer call carrying the single cash row.
  assert.equal(writes.length, 1);
  assert.equal(writes[0].length, 1);
  const entry = writes[0][0];
  assert.equal(entry.table, 'beneficiary_balance_projection');
  assert.equal(
    entry.onConflict,
    'organization_id,program_id,beneficiary_identity_id,asset_code',
  );
  assert.equal(entry.rows.aid_type, 'cash');
  assert.equal(entry.rows.available_balance_stroops, 1850);
  assert.equal(entry.rows.distributed_stroops, 2000);
  assert.equal(entry.rows.redeemed_stroops, 150);
  assert.equal(entry.rows.refunded_stroops, 0);
  assert.equal(entry.rows.projection_version, 4);
  assert.equal(entry.rows.reconciliation_run_id, 'run-spend-1');
  assert.equal(entry.rows.as_of_ledger, 2100);
  assert.equal(entry.rows.reconciled_at, '2026-01-02T00:10:00.000Z');
});

test('spend-refresher: replaying the same confirmed totals is a no-op on amounts', async () => {
  const { deps, writes } = refresherDeps();
  const refresher = cashRecon.createBeneficiaryCashSpendRefresher(deps);
  const request = {
    organizationId: 'org-1',
    correlationId: '11111111-1111-1111-1111-111111111111',
    principals: [{ beneficiaryIdentityId: 'ben-1', redeemedStroops: 150 }],
  };

  await refresher.refresh(request);
  const first = writes[0][0].rows;
  await refresher.refresh(request);
  const second = writes[1][0].rows;

  for (const field of [
    'available_balance_stroops',
    'distributed_stroops',
    'redeemed_stroops',
    'refunded_stroops',
    'allocated_stroops',
  ]) {
    assert.equal(second[field], first[field], `replay changed ${field}`);
  }
});

test('spend-refresher: an empty principal list never touches the writer', async () => {
  const { deps, writes } = refresherDeps();
  const refresher = cashRecon.createBeneficiaryCashSpendRefresher(deps);

  const result = await refresher.refresh({
    organizationId: 'org-1',
    correlationId: '11111111-1111-1111-1111-111111111111',
    principals: [],
  });

  assert.equal(result.updated.length, 0);
  assert.equal(result.skipped.length, 0);
  assert.equal(writes.length, 0);
});

test('spend-refresher: an unresolvable program skips fail-closed without writing', async () => {
  const { deps, writes } = refresherDeps({
    deps: {
      snapshots: {
        async load() {
          return null;
        },
      },
      evidence: {
        async runScopedStream() {
          return evidence();
        },
      },
      projections: {
        async write(batch) {
          writes.push(batch);
        },
      },
      asset: { code: 'RCPHP', issuer: ISSUER },
    },
  });
  const refresher = cashRecon.createBeneficiaryCashSpendRefresher(deps);

  const result = await refresher.refresh({
    organizationId: 'org-1',
    correlationId: '11111111-1111-1111-1111-111111111111',
    principals: [{ beneficiaryIdentityId: 'ben-9', redeemedStroops: 50 }],
  });

  assert.equal(result.updated.length, 0);
  assert.equal(result.skipped.length, 1);
  assert.equal(result.skipped[0].reason, 'unresolvable_program');
  assert.equal(writes.length, 0);
});

test('spend-refresher: a voucher program is never written (voucher rail untouched)', async () => {
  const { deps, writes } = refresherDeps({ snapshotArgs: [{ programAidType: 'voucher' }] });
  const refresher = cashRecon.createBeneficiaryCashSpendRefresher(deps);

  const result = await refresher.refresh({
    organizationId: 'org-1',
    correlationId: '11111111-1111-1111-1111-111111111111',
    principals: [{ beneficiaryIdentityId: 'ben-1', redeemedStroops: 150 }],
  });

  assert.equal(result.updated.length, 0);
  assert.equal(result.skipped[0].reason, 'non_cash_program');
  assert.equal(writes.length, 0);
});

test('spend-refresher: an asset mismatch skips instead of writing policy-violating rows', async () => {
  const { deps, writes } = refresherDeps({ snapshotArgs: [{ programAssetIssuer: OTHER_ISSUER }] });
  const refresher = cashRecon.createBeneficiaryCashSpendRefresher(deps);

  const result = await refresher.refresh({
    organizationId: 'org-1',
    correlationId: '11111111-1111-1111-1111-111111111111',
    principals: [{ beneficiaryIdentityId: 'ben-1', redeemedStroops: 150 }],
  });

  assert.equal(result.updated.length, 0);
  assert.equal(result.skipped[0].reason, 'asset_mismatch');
  assert.equal(writes.length, 0);
});

test('spend-refresher: a missing enrollment skips (trigger requires it)', async () => {
  const { deps, writes } = refresherDeps({ snapshotArgs: [{ hasEnrollment: false }] });
  const refresher = cashRecon.createBeneficiaryCashSpendRefresher(deps);

  const result = await refresher.refresh({
    organizationId: 'org-1',
    correlationId: '11111111-1111-1111-1111-111111111111',
    principals: [{ beneficiaryIdentityId: 'ben-1', redeemedStroops: 150 }],
  });

  assert.equal(result.updated.length, 0);
  assert.equal(result.skipped[0].reason, 'missing_enrollment');
  assert.equal(writes.length, 0);
});

test('spend-refresher: spend beyond allocation plus refunds skips (amounts check)', async () => {
  const { deps, writes } = refresherDeps({
    snapshotArgs: [{ allocatedStroops: 100, refundedStroops: 0 }],
  });
  const refresher = cashRecon.createBeneficiaryCashSpendRefresher(deps);

  const result = await refresher.refresh({
    organizationId: 'org-1',
    correlationId: '11111111-1111-1111-1111-111111111111',
    principals: [{ beneficiaryIdentityId: 'ben-1', redeemedStroops: 150 }],
  });

  assert.equal(result.updated.length, 0);
  assert.equal(result.skipped[0].reason, 'amounts_check_violation');
  assert.equal(writes.length, 0);
});

test('spend-refresher: missing run evidence skips instead of fabricating provenance', async () => {
  const { deps, writes } = refresherDeps({
    deps: {
      snapshots: {
        async load() {
          return snapshot();
        },
      },
      evidence: {
        async runScopedStream() {
          return null;
        },
      },
      projections: {
        async write(batch) {
          writes.push(batch);
        },
      },
      asset: { code: 'RCPHP', issuer: ISSUER },
    },
  });
  const refresher = cashRecon.createBeneficiaryCashSpendRefresher(deps);

  const result = await refresher.refresh({
    organizationId: 'org-1',
    correlationId: '11111111-1111-1111-1111-111111111111',
    principals: [{ beneficiaryIdentityId: 'ben-1', redeemedStroops: 150 }],
  });

  assert.equal(result.updated.length, 0);
  assert.equal(result.skipped[0].reason, 'missing_run_evidence');
  assert.equal(writes.length, 0);
});

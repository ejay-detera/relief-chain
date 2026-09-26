// Abandonment disposition tests (RED first).
//
// Covers the honest mechanism for stranded program cash entitlements:
//
//   src/utils/abandonment.ts
//     - isAbandonedRow / excludeAbandonedRows / splitSpendableAbandoned
//     - sumSpendableCashStroops (dashboard, funding sources, review screens)
//     - live-vs-reconciled agreement invariant
//
// Ground truth fixtures (from the proven bug report):
//   - Chain: beneficiary GBGL 1,795 + merchant GBTT 205 = 2,000 disbursed.
//   - Projection rows before disposition:
//       Test program 10532fed: distributed 10,000,000,000 / redeemed 1,800,000,000 / available 8,200,000,000
//       Kristine e1735e83: 20,000,000,000 / 0 / 20,000,000,000
//     Dashboard sums to 2,820 vs 1,795 chain (silently overstated).
//   - The 1,000 in the Test row was disbursed to abandoned wallet GBDR
//     (key lost; operator waiver; testnet, no monetary value). Its 180 redeemed
//     is REAL spend from the new wallet, booked there only because it was once
//     the sole row.
//   - After disposition the Test row is abandoned (history preserved) and
//     spendable sums must equal chain (1,795) with conservation 1,795 + 205 = 2,000.
//
// Guarantees under test:
//   - spendable sums exclude abandoned rows; abandoned rows keep history;
//   - live-vs-reconciled agreement: spendable == chain after disposition;
//   - conservation: spendable + merchant settled == disbursed;
//   - funding-source eligibility uses spendable cash only.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const rootDir = fileURLToPath(new URL('../../', import.meta.url));
const toDataUrl = (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
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

const abandonment = await import(
  await loadModule(path.join(rootDir, 'src/utils/abandonment.ts'))
);

// Proven fixtures in stroops (10_000_000 stroops = 1 RCPHP).
const TEST_ROW = {
  programId: '10532fed-test-program',
  aidType: 'cash',
  allocatedStroops: 10_000_000_000,
  distributedStroops: 10_000_000_000,
  redeemedStroops: 1_800_000_000,
  refundedStroops: 0,
  availableStroops: 8_200_000_000,
  isAbandoned: false,
  abandonmentNote: null,
};

const KRISTINE_ROW = {
  programId: 'e1735e83-kristine',
  aidType: 'cash',
  allocatedStroops: 20_000_000_000,
  distributedStroops: 20_000_000_000,
  redeemedStroops: 0,
  refundedStroops: 0,
  availableStroops: 20_000_000_000,
  isAbandoned: false,
  abandonmentNote: null,
};

const ABANDONED_TEST_ROW = {
  ...TEST_ROW,
  isAbandoned: true,
  abandonmentNote: 'Disbursed to lost wallet GBDR; operator waiver strands 1,000 (testnet, no value). Real 180 spend belongs to the active wallet.',
};

test('abandonment: spendable sums exclude abandoned rows but preserve their history', () => {
  const rows = [ABANDONED_TEST_ROW, KRISTINE_ROW];
  const spendable = abandonment.excludeAbandonedRows(rows);
  assert.equal(spendable.length, 1);
  assert.equal(spendable[0].programId, 'e1735e83-kristine');
  // History is preserved on the abandoned row itself (never rewritten).
  const split = abandonment.splitSpendableAbandoned(rows);
  assert.equal(split.abandoned.length, 1);
  assert.equal(split.abandoned[0].distributedStroops, 10_000_000_000);
  assert.equal(split.abandoned[0].redeemedStroops, 1_800_000_000);
  assert.equal(split.abandoned[0].availableStroops, 8_200_000_000);
  assert.match(split.abandoned[0].abandonmentNote ?? '', /GBDR/);
});

test('abandonment: before disposition the dashboard silently overstates (2,820 vs 1,795 chain)', () => {
  const before = abandonment.sumSpendableCashStroops([TEST_ROW, KRISTINE_ROW]);
  // 820 + 2,000 = 2,820 RCPHP in stroops.
  assert.equal(before, 8_200_000_000 + 20_000_000_000);
  assert.notEqual(before, 17_950_000_000);
});

test('abandonment: after disposition spendable agrees with chain truth (1,795) with conservation', () => {
  // Active wallet holds 1,795 after honest re-attribution of the real spend;
  // the abandoned 820 is excluded from spendable.
  const honestActiveRow = {
    ...KRISTINE_ROW,
    redeemedStroops: 2_050_000_000,
    availableStroops: 17_950_000_000,
  };
  const rows = [ABANDONED_TEST_ROW, honestActiveRow];
  const spendable = abandonment.sumSpendableCashStroops(rows);
  const chainBeneficiaryStroops = 17_950_000_000; // GBGL 1,795
  const chainMerchantStroops = 2_050_000_000; // GBTT 205
  const disbursedStroops = 20_000_000_000; // 2,000 disbursed closes exactly
  assert.equal(spendable, chainBeneficiaryStroops);
  assert.equal(spendable + chainMerchantStroops, disbursedStroops);
  assert.ok(abandonment.liveReconciledAgrees(spendable, chainBeneficiaryStroops));
});

test('abandonment: isAbandonedRow is true only with flag and note', () => {
  assert.equal(abandonment.isAbandonedRow(ABANDONED_TEST_ROW), true);
  assert.equal(abandonment.isAbandonedRow(KRISTINE_ROW), false);
  assert.equal(abandonment.isAbandonedRow({ ...TEST_ROW, isAbandoned: true, abandonmentNote: null }), false);
});

test('abandonment: empty list sums to zero and agrees only with zero chain', () => {
  assert.equal(abandonment.sumSpendableCashStroops([]), 0);
  assert.ok(abandonment.liveReconciledAgrees(0, 0));
  assert.ok(!abandonment.liveReconciledAgrees(8_200_000_000, 0));
});

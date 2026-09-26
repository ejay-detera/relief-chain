// Deterministic multi-program spend attribution tests (RED first).
//
// Rule under test (documented in cash-reconciliation.ts):
//   oldest distributed-cash program first. Deterministic beats clever.
//   Candidates carry their earliest confirmed distribution time
//   (`firstDistributedAt`) plus a stable `programId` tie-break. Abandoned
//   programs are never attributed. When no orderable candidate exists the
//   refresher keeps the fail-closed skip.
//
// Covers:
//   supabase/functions/_shared/stellar/cash-reconciliation.ts
//     - selectOldestSpendAttributionProgramId (new; oldest-first, abandoned excluded)
//     - allocateSpendAcrossPrograms (new; sequential oldest-first split, conservation)
//     - selectSpendAttributionProgramId (legacy exactly-one; untouched)
//
// Conservation invariant: sum of row deltas == spent amount.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import fc from 'fast-check';

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

test('attribution: oldest distributed-cash program wins (deterministic)', () => {
  const candidates = [
    { programId: 'prog-new', firstDistributedAt: '2026-02-01T00:00:00.000Z', isAbandoned: false },
    { programId: 'prog-old', firstDistributedAt: '2026-01-01T00:00:00.000Z', isAbandoned: false },
  ];
  assert.equal(cashRecon.selectOldestSpendAttributionProgramId(candidates), 'prog-old');
});

test('attribution: tie on timestamp breaks by programId (stable)', () => {
  const candidates = [
    { programId: 'prog-b', firstDistributedAt: '2026-01-01T00:00:00.000Z', isAbandoned: false },
    { programId: 'prog-a', firstDistributedAt: '2026-01-01T00:00:00.000Z', isAbandoned: false },
  ];
  assert.equal(cashRecon.selectOldestSpendAttributionProgramId(candidates), 'prog-a');
});

test('attribution: abandoned programs are never selected', () => {
  const candidates = [
    { programId: 'prog-old-abandoned', firstDistributedAt: '2025-01-01T00:00:00.000Z', isAbandoned: true },
    { programId: 'prog-new-active', firstDistributedAt: '2026-01-01T00:00:00.000Z', isAbandoned: false },
  ];
  assert.equal(cashRecon.selectOldestSpendAttributionProgramId(candidates), 'prog-new-active');
});

test('attribution: no orderable candidate keeps fail-closed null', () => {
  assert.equal(cashRecon.selectOldestSpendAttributionProgramId([]), null);
  assert.equal(
    cashRecon.selectOldestSpendAttributionProgramId([
      { programId: 'prog-x', firstDistributedAt: '2026-01-01T00:00:00.000Z', isAbandoned: true },
    ]),
    null,
  );
  // Missing timestamps are truly ambiguous: keep the skip.
  assert.equal(
    cashRecon.selectOldestSpendAttributionProgramId([
      { programId: 'prog-a', firstDistributedAt: null, isAbandoned: false },
      { programId: 'prog-b', firstDistributedAt: null, isAbandoned: false },
    ]),
    null,
  );
});

test('attribution: single orderable program resolves (replaces exactly-one skip)', () => {
  assert.equal(
    cashRecon.selectOldestSpendAttributionProgramId([
      { programId: 'prog-only', firstDistributedAt: '2026-01-05T00:00:00.000Z', isAbandoned: false },
    ]),
    'prog-only',
  );
});

test('attribution: sequential oldest-first allocation conserves the spent amount', () => {
  const programs = [
    { programId: 'prog-old', availableStroops: 1000, firstDistributedAt: '2026-01-01T00:00:00.000Z', isAbandoned: false },
    { programId: 'prog-new', availableStroops: 2000, firstDistributedAt: '2026-02-01T00:00:00.000Z', isAbandoned: false },
  ];
  const allocations = cashRecon.allocateSpendAcrossPrograms(1200, programs);
  assert.deepEqual(
    allocations.map((a) => ({ programId: a.programId, amount: a.amountStroops })),
    [
      { programId: 'prog-old', amount: 1000 },
      { programId: 'prog-new', amount: 200 },
    ],
  );
  const total = allocations.reduce((sum, a) => sum + a.amountStroops, 0);
  assert.equal(total, 1200);
});

test('property: allocation conserves spend across orderable programs', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.array(
        fc.record({
          programId: fc.stringMatching(/^[a-z0-9-]{4,16}$/),
          availableStroops: fc.integer({ min: 1, max: 5_000 }),
          day: fc.integer({ min: 1, max: 28 }),
        }),
        { minLength: 1, maxLength: 4 },
      ),
      fc.integer({ min: 1, max: 8_000 }),
      async (programsRaw, spend) => {
        const seen = new Set();
        const programs = [];
        for (const [index, raw] of programsRaw.entries()) {
          const id = `${raw.programId}-${index}`;
          if (seen.has(id)) continue;
          seen.add(id);
          programs.push({
            programId: id,
            availableStroops: raw.availableStroops,
            firstDistributedAt: `2026-01-${String(raw.day).padStart(2, '0')}T00:00:00.000Z`,
            isAbandoned: false,
          });
        }
        const totalAvailable = programs.reduce((s, p) => s + p.availableStroops, 0);
        const clampedSpend = Math.min(spend, totalAvailable);
        const allocations = cashRecon.allocateSpendAcrossPrograms(clampedSpend, programs);
        const total = allocations.reduce((s, a) => s + a.amountStroops, 0);
        assert.equal(total, clampedSpend);
        // Oldest-first: allocation order matches sorted program order.
        const sortedIds = [...programs]
          .sort((a, b) =>
            a.firstDistributedAt < b.firstDistributedAt
              ? -1
              : a.firstDistributedAt > b.firstDistributedAt
                ? 1
                : a.programId < b.programId
                  ? -1
                  : 1,
          )
          .map((p) => p.programId);
        assert.deepEqual(
          allocations.map((a) => a.programId),
          sortedIds.slice(0, allocations.length),
        );
      },
    ),
    { numRuns: 25 },
  );
});

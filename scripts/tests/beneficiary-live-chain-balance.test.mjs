// Beneficiary live chain-balance service tests (Part B).
//
// Covers the read-only Horizon balance fetch used by pull-to-refresh:
//
//   src/services/stellar-account-balance-service.ts
//     - fetchLiveRCPHPBalance
//
// Guarantees under test:
//   - the RCPHP credit line for the configured issuer is returned as exact
//     integer stroops (no float math, no fabrication);
//   - any Horizon/network/parse failure returns a typed unavailable reason —
//     never a blank balance and never a fabricated zero;
//   - only the configured testnet Horizon origin and issuer are used.
//
// The service is dependency-light (config + pure parsing + injected fetch)
// so it loads under the same @/-mapping transpile harness as
// merchant-settlement-reconcile.test.mjs. No network, no Supabase, no secrets.

import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

process.env.EXPO_PUBLIC_STELLAR_HORIZON_URL = 'https://horizon-testnet.stellar.org';
process.env.EXPO_PUBLIC_STELLAR_RCPHP_ISSUER = 'G' + 'A'.repeat(55);
process.env.EXPO_PUBLIC_STELLAR_RCPHP_SAC_ID = 'C' + 'A'.repeat(55);

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
    } else if (specifier.startsWith('../../shared/')) {
      replacements.set(
        specifier,
        await loadModule(path.join(rootDir, specifier.slice('../../'.length)) + '.ts'),
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
  import(await loadModule(path.join(rootDir, 'src/services/stellar-account-balance-service.ts')));

// ---------------------------------------------------------------------------
// Fixtures.
// ---------------------------------------------------------------------------

const ISSUER = 'G' + 'A'.repeat(55);
const OTHER_ISSUER = 'G' + 'B'.repeat(55);
const ADDRESS = 'G' + 'C'.repeat(55);

const accountDoc = (balances) => ({
  id: ADDRESS,
  account_id: ADDRESS,
  balances,
});

const rcphpLine = (issuer, balance) => ({
  asset_type: 'credit_alcohol',
  asset_code: 'RCPHP',
  asset_issuer: issuer,
  balance,
});

const nativeLine = (balance) => ({ asset_type: 'native', balance });

const okFetch = (doc, seen) => async (url) => {
  seen.push(url);
  return {
    ok: true,
    status: 200,
    async json() {
      return doc;
    },
  };
};

// ---------------------------------------------------------------------------
// Live balance fetch.
// ---------------------------------------------------------------------------

test('returns exact stroops for the configured RCPHP line', async () => {
  const { fetchLiveRCPHPBalance } = await loadService();
  const seen = [];
  const result = await fetchLiveRCPHPBalance(ADDRESS, {
    fetchImpl: okFetch(accountDoc([nativeLine('10.0000000'), rcphpLine(ISSUER, '1850.0000000')]), seen),
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.balanceStroops, '18500000000');
  assert.equal(result.data.address, ADDRESS);
  assert.ok(Date.parse(result.data.fetchedAt) > 0);
  assert.equal(
    seen[0],
    `https://horizon-testnet.stellar.org/accounts/${ADDRESS}`,
  );
});

test('parses fractional stroops exactly with no float math', async () => {
  const { fetchLiveRCPHPBalance } = await loadService();
  const result = await fetchLiveRCPHPBalance(ADDRESS, {
    fetchImpl: okFetch(accountDoc([rcphpLine(ISSUER, '150.0000001')]), []),
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.balanceStroops, '1500000001');
});

test('ignores a wrong-issuer RCPHP line instead of reporting it', async () => {
  const { fetchLiveRCPHPBalance } = await loadService();
  const result = await fetchLiveRCPHPBalance(ADDRESS, {
    fetchImpl: okFetch(accountDoc([rcphpLine(OTHER_ISSUER, '999.0000000')]), []),
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'balance_line_missing');
});

test('a missing RCPHP line is unavailable, never a fabricated zero', async () => {
  const { fetchLiveRCPHPBalance } = await loadService();
  const result = await fetchLiveRCPHPBalance(ADDRESS, {
    fetchImpl: okFetch(accountDoc([nativeLine('5.0000000')]), []),
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'balance_line_missing');
  assert.equal(result.error.retryable, true);
});

test('an unfunded account is unavailable and retryable', async () => {
  const { fetchLiveRCPHPBalance } = await loadService();
  const result = await fetchLiveRCPHPBalance(ADDRESS, {
    fetchImpl: async () => ({
      ok: false,
      status: 404,
      async json() {
        return { status: 404, title: 'Resource Missing' };
      },
    }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'account_not_found');
  assert.equal(result.error.retryable, true);
});

test('a transport failure is unavailable and retryable', async () => {
  const { fetchLiveRCPHPBalance } = await loadService();
  const result = await fetchLiveRCPHPBalance(ADDRESS, {
    fetchImpl: async () => {
      throw new Error('network down');
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'horizon_unavailable');
  assert.equal(result.error.retryable, true);
});

test('a malformed balance string fails closed instead of coercing', async () => {
  const { fetchLiveRCPHPBalance } = await loadService();
  const result = await fetchLiveRCPHPBalance(ADDRESS, {
    fetchImpl: okFetch(accountDoc([rcphpLine(ISSUER, 'not-a-number')]), []),
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'invalid_balance');
});

test('an invalid address never touches the network', async () => {
  const { fetchLiveRCPHPBalance } = await loadService();
  let calls = 0;
  const result = await fetchLiveRCPHPBalance('not-an-address', {
    fetchImpl: async () => {
      calls += 1;
      return { ok: true, status: 200, async json() { return {}; } };
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'invalid_address');
  assert.equal(result.error.retryable, false);
  assert.equal(calls, 0);
});

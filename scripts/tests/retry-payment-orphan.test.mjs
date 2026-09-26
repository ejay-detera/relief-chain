// Orphan-accepted retry path (Fix B) + scan-debounce / polling-cap wiring (Fix A).
//
// Symptom 2 root cause: PREPARE writes an `accepted` attempt with no hash; if
// signing/submission never completes, the invoice-bound idempotency key is
// claimed, later authorizes replay (attemptId null), the client observes
// `accepted`→pending forever. `protocol.retry` exists but no Edge Function
// exposed it. Fix = expose via `retry-payment` + consume on the client with a
// polling cap.
//
// This file asserts:
//   1. protocol invariant: replay + latest `accepted` → retry builds attempt 2
//      under the SAME intent/key (engine behavior the fix relies on);
//   2. wiring: `supabase/functions/retry-payment/index.ts` exists, follows
//      existing function conventions (handleEdgeRequest, authenticateRequest
//      via scope, FinancialErrorException envelopes, correlation IDs, mirrors
//      submit-payment), calls `protocol.retry`, never signs server-side;
//   3. `submit-payment` checks affected-row counts on prepared→signed /
//      signed→submitted updates and throws dependency_unavailable on mismatch;
//   4. client: `retryPayment(intentId)` exists in payment-service; the payment
//      hook has a polling cap transitioning to `unavailable` with
//      "ask the merchant for a new invoice" guidance and surfaces error_detail;
//   5. scan UX: ScannerView requires consecutive-frame agreement (or minimum
//      plausible length) before onScan; pay-scan silently ignores partial
//      payloads and only sets scan errors for well-formed-but-invalid invoices;
//      invoice-scan-service decode strictness untouched.
//
// Loading convention mirrors edge-protocol.test.mjs.

import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
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

const sdk = await import('@stellar/stellar-sdk');
const sharedConfig = await importShared('../../../shared/stellar-config.ts');
const protocol = await importShared('stellar/protocol.ts');

const ISSUER = 'G' + 'A'.repeat(55);
const SAC = 'C' + 'A'.repeat(55);
const HORIZON = 'https://horizon-testnet.stellar.org';
const RPC = 'https://soroban-testnet.stellar.org';
const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';
const HEX64 = 'a'.repeat(64);
const HEX64_B = 'b'.repeat(64);

const testnetConfig = () =>
  sharedConfig.createStellarTestnetConfig({
    horizonUrl: HORIZON,
    rpcUrl: RPC,
    rcphpIssuer: ISSUER,
    rcphpSacId: SAC,
  });

const builtEnvelopeXdr = () => {
  const account = new sdk.Account(sdk.Keypair.random().publicKey(), '0');
  const tx = new sdk.TransactionBuilder(account, {
    fee: '100',
    networkPassphrase: TESTNET_PASSPHRASE,
  })
    .addOperation(sdk.Operation.bumpSequence({ bumpTo: '0' }))
    .setTimeout(0)
    .build();
  return tx.toXDR();
};

const intentRecord = (overrides = {}) => ({
  id: 'intent-orphan',
  correlation_id: 'corr-orphan',
  idempotency_key_id: 'idem-orphan',
  operation_type: 'cash_payment',
  organization_id: 'org-1',
  program_id: null,
  payload_hash: HEX64,
  amount_stroops: 1000,
  asset_code: 'RCPHP',
  asset_issuer: ISSUER,
  beneficiary_identity_id: 'ben-1',
  distribution_job_id: null,
  distribution_recipient_id: null,
  requested_by: null,
  request_metadata: {},
  created_at: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const attemptRecord = (overrides = {}) => ({
  id: 'attempt-orphan-1',
  financial_intent_id: 'intent-orphan',
  organization_id: 'org-1',
  program_id: null,
  distribution_job_id: null,
  beneficiary_identity_id: 'ben-1',
  correlation_id: 'corr-orphan',
  attempt_number: 1,
  status: 'accepted',
  network: 'stellar_testnet',
  intent_payload_hash: HEX64,
  prepared_payload_hash: HEX64_B,
  envelope_xdr: builtEnvelopeXdr(),
  authorization_payload: null,
  min_ledger: null,
  max_ledger: null,
  result_code: null,
  error_code: null,
  error_detail: null,
  submitted_at: null,
  observed_at: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const buildResult = (overrides = {}) => ({
  network: 'stellar_testnet',
  envelopeXdr: builtEnvelopeXdr(),
  preparedPayloadHash: HEX64_B,
  minLedger: null,
  maxLedger: 500,
  signingPackage: {
    kind: 'classic_envelope',
    unsignedEnvelopeXdr: 'UNSIGNED-ORPHAN',
    transactionHash: HEX64_B,
    networkPassphrase: TESTNET_PASSPHRASE,
  },
  ...overrides,
});

const stubStrategy = () => ({
  operationType: 'cash_payment',
  async build() {
    return buildResult();
  },
  async verifyAndAssemble() {
    return {
      transactionHash: HEX64_B,
      submit: async () => ({ transactionHash: HEX64_B, resultCode: 'txSUCCESS' }),
    };
  },
});

const makeIntentStore = (prior) => {
  const byKey = new Map([['idem-orphan', prior]]);
  return {
    async insertIntent() {
      throw new Error('replay must not insert a second intent');
    },
    async findByIdempotencyKeyId(id) {
      return byKey.get(id) ?? null;
    },
  };
};

const makeAttemptStore = (initial) => {
  const attempts = [...initial];
  return {
    attempts,
    async insertAttempt(row) {
      const record = attemptRecord({ ...row, id: `attempt-orphan-${attempts.length + 1}` });
      attempts.push(record);
      return record;
    },
    async listAttempts() {
      return [...attempts];
    },
    async markSubmitted() {},
  };
};

const makeReconciler = () => ({
  async reconcileAttempt() {
    throw new Error('accepted attempts must not reconcile before a fresh build');
  },
});

// ---------------------------------------------------------------------------
// 1. Protocol invariant: replay + latest `accepted` → retry builds attempt 2
//    under the SAME intent/key with a fresh signing package.
// ---------------------------------------------------------------------------

test('orphan-accepted: replay reuses the prior intent and retry builds attempt 2 under the same key', async () => {
  const prior = intentRecord();
  const proto = protocol.createTransactionProtocol({
    config: testnetConfig(),
    signers: { has: () => false },
    claim: async () => ({
      record: { id: 'idem-orphan', first_seen_at: 't', last_seen_at: 't2' },
      isReplay: true,
    }),
    intents: makeIntentStore(prior),
    attempts: makeAttemptStore([attemptRecord()]),
    reconciler: makeReconciler(),
    clock: () => new Date('2026-01-01T00:00:00.000Z'),
    newId: () => 'generated-retry-id',
  });

  const prepared = await proto.prepare({
    organizationId: 'org-1',
    programId: null,
    operationType: 'cash_payment',
    scope: 'cash_payment',
    idempotencyKey: 'cash_payment:invoice:deadbeef',
    payloadHash: HEX64,
    correlationId: 'corr-orphan',
    amountStroops: 1000,
  });
  assert.equal(prepared.isReplay, true);
  assert.equal(prepared.intent.id, 'intent-orphan');

  const outcome = await proto.retry(prepared.intent, stubStrategy());
  assert.equal(outcome.settled, false);
  assert.equal(outcome.built.attempt.attempt_number, 2);
  assert.equal(outcome.built.attempt.financial_intent_id, 'intent-orphan');
  assert.equal(outcome.built.attempt.status, 'accepted');
  assert.equal(outcome.built.signingPackage.kind, 'classic_envelope');
  assert.ok(outcome.built.signingPackage.unsignedEnvelopeXdr.length > 0);
});

// ---------------------------------------------------------------------------
// Helpers for wiring assertions.
// ---------------------------------------------------------------------------

const readRepo = (rel) => readFile(path.join(repoRoot, rel), 'utf8');
const existsRepo = async (rel) => {
  try {
    await stat(path.join(repoRoot, rel));
    return true;
  } catch {
    return false;
  }
};

// ---------------------------------------------------------------------------
// 2. retry-payment Edge Function wiring.
// ---------------------------------------------------------------------------

test('retry-payment function exists and follows existing function conventions', async () => {
  assert.equal(
    await existsRepo('supabase/functions/retry-payment/index.ts'),
    true,
    'supabase/functions/retry-payment/index.ts must exist',
  );
  const source = await readRepo('supabase/functions/retry-payment/index.ts');
  assert.match(source, /handleEdgeRequest/, 'must use handleEdgeRequest');
  assert.match(source, /serveEdge/, 'must register via serveEdge');
  assert.match(source, /FinancialErrorException/, 'must use FinancialErrorException envelopes');
  assert.match(source, /correlationId/, 'must carry correlation IDs');
  assert.match(source, /createEdgeServiceBinding/, 'must bind the service client like submit-payment');
  assert.match(source, /createEdgeTransactionProtocol/, 'must reuse the shared transaction protocol');
  assert.match(source, /createCashReconcilerBundle/, 'must wire the cash reconciler bundle');
  assert.match(source, /createMerchantPayment/, 'must reuse the merchant-payment orchestrator');
  assert.match(source, /protocol\.retry|["']retry["']|\.retry\(/, 'must call protocol.retry');
  assert.match(source, /listAttempts/, 'must read the latest attempt via listAttempts');
  assert.match(source, /signingPackage/, 'must return the fresh signing package');
  assert.doesNotMatch(
    source,
    /signTransaction|sign\(.*secret|secret\(\)/,
    'must never sign server-side; the device signs',
  );
});

// ---------------------------------------------------------------------------
// 3. submit-payment affected-row checks.
// ---------------------------------------------------------------------------

test('submit-payment fails loudly on stale intent transitions', async () => {
  const source = await readRepo('supabase/functions/submit-payment/index.ts');
  assert.match(source, /dependency_unavailable/, 'must throw dependency_unavailable on mismatch');
  // PostgREST updates with .eq filters succeed with zero rows when no row
  // matches — the function must verify an affected row instead of assuming.
  assert.match(
    source,
    /\.select\(/,
    'must read back affected rows on the prepared→signed / signed→submitted updates',
  );
});

// ---------------------------------------------------------------------------
// 4. Client retry + polling cap wiring.
// ---------------------------------------------------------------------------

test('payment-service exposes retryPayment for orphan-accepted intents', async () => {
  const source = await readRepo('src/services/payment-service.ts');
  assert.match(source, /retryPayment/, 'must export retryPayment(intentId)');
  assert.match(source, /retry-payment/, 'must invoke the retry-payment function');
});

test('use-payment-intent caps pending observation and retries orphan-accepted intents', async () => {
  const source = await readRepo('src/hooks/use-payment-intent.ts');
  assert.match(source, /retryPayment/, 'replay branch must call retryPayment');
  assert.match(source, /unavailable/, 'must transition to unavailable after the cap');
  assert.match(source, /ask the merchant for a new invoice/, 'must guide toward a new invoice');
  assert.match(source, /error_detail|errorDetail/, 'must surface error_detail when present');
});

test('payment types model the retry result', async () => {
  const source = await readRepo('src/types/payment.ts');
  assert.match(source, /RetriedPayment/, 'must define the RetriedPayment contract');
});

// ---------------------------------------------------------------------------
// 5. Scan UX wiring (Fix A).
// ---------------------------------------------------------------------------

test('ScannerView debounces partial frames before onScan', async () => {
  const source = await readRepo('src/components/beneficiary/PayScan/ScannerView.tsx');
  assert.match(
    source,
    /lastPayload|consecutive|MIN_|minLength|previous/i,
    'must require consecutive-frame agreement or a minimum plausible length',
  );
});

test('pay-scan silently ignores partial payloads and keeps fail-closed decode', async () => {
  const screen = await readRepo('src/app/(beneficiary)/pay-scan.tsx');
  assert.match(
    screen,
    /MIN_|minimum|silently|partial|length <|length </i,
    'must silently ignore sub-minimum/partial payloads',
  );
  assert.match(screen, /setScanError/, 'must still surface well-formed-but-invalid invoices');
  const service = await readRepo('src/services/invoice-scan-service.ts');
  assert.match(
    service,
    /decodeAndVerifyInvoiceQr/,
    'decode strictness must stay in the shared codec wrapper',
  );
});

test('merchant receive keeps the verified-signer creation gate', async () => {
  const source = await readRepo('src/app/(merchant)/receive.tsx');
  assert.match(source, /isVerifiedMerchantWallet/, 'must gate creation on verified readiness');
  assert.match(source, /Complete wallet recovery/, 'must keep the recovery guidance copy');
});

// Unit tests for cash-program activation prepare/submit (Task 10.1).
//
// Covers the strategy + orchestration in:
//   supabase/functions/_shared/stellar/cash-activation.ts
//
// The reusable protocol is mocked for the orchestration tests (its own
// invariants are covered by edge-protocol.test.mjs); the strategy tests use the
// REAL installed Stellar SDK so transaction building, signing, and signature
// verification run for real rather than against a mock.
//
// Asserts the activation rules from the design:
//   - VERIFY treasury balance first; an insufficient treasury throws
//     `insufficient_budget` and reserves NOTHING (no intent persisted).
//   - RESERVE the full approved budget as a single RCPHP payment from the
//     organization treasury to the dedicated cash-program treasury.
//   - KEEP the program inactive: submit only ever yields `submitted`.
//   - The organization-treasury signature must be present and bound to the exact
//     prepared transaction; the sponsor only wraps a fee-bump.
//
// Validates: Requirements 5.3, 5.5, 5.6, 5.7
//
// Loading convention mirrors edge-protocol.test.mjs.

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

const sdk = await import('@stellar/stellar-sdk');
const sharedConfig = await importShared('../../../shared/stellar-config.ts');
const signersModule = await importShared('stellar/signers.ts');
const activation = await importShared('stellar/cash-activation.ts');

// ---------------------------------------------------------------------------
// Fixtures.
// ---------------------------------------------------------------------------

const HORIZON = 'https://horizon-testnet.stellar.org';
const RPC = 'https://soroban-testnet.stellar.org';
const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';

// Real institutional keypairs so signing/verification are genuine.
const orgTreasury = sdk.Keypair.random();
const cashTreasury = sdk.Keypair.random();
const sponsor = sdk.Keypair.random();
const issuerKeypair = sdk.Keypair.random();
const ISSUER = issuerKeypair.publicKey();
const SAC = 'C' + 'A'.repeat(55);

const testnetConfig = () =>
  sharedConfig.createStellarTestnetConfig({
    horizonUrl: HORIZON,
    rpcUrl: RPC,
    rcphpIssuer: ISSUER,
    rcphpSacId: SAC,
  });

const secretResolver = (role) => {
  switch (role) {
    case 'organization_treasury':
      return orgTreasury.secret();
    case 'cash_program_treasury':
      return cashTreasury.secret();
    case 'sponsor':
      return sponsor.secret();
    default:
      return undefined;
  }
};

const signers = () => signersModule.createInstitutionalSignerRegistry(secretResolver);

const BUDGET_STROOPS = 5_000_000_000; // 500.0000000 RCPHP

const balanceLine = (stroops) => {
  const value = BigInt(stroops);
  const whole = value / 10_000_000n;
  const fraction = value % 10_000_000n;
  return {
    asset_type: 'credit_alphanum12',
    asset_code: 'RCPHP',
    asset_issuer: ISSUER,
    balance: `${whole}.${fraction.toString().padStart(7, '0')}`,
  };
};

// A fake Horizon that returns an Account (for sequence) carrying balances.
const fakeHorizon = ({ balances = [balanceLine(BUDGET_STROOPS)], submit } = {}) => {
  const submitted = [];
  return {
    submitted,
    async loadAccount(accountId) {
      const account = new sdk.Account(accountId, '20');
      account.balances = balances;
      return account;
    },
    async submitTransaction(tx) {
      submitted.push(tx);
      if (submit) return submit(tx);
      return { hash: tx.hash().toString('hex'), successful: true };
    },
  };
};

const guardStub = { assertTestnetConfig() {}, assertNetworkPassphrase() {} };

const intentRecord = (overrides = {}) => ({
  id: 'intent-1',
  correlation_id: 'corr-1',
  idempotency_key_id: 'idem-1',
  operation_type: 'program_activation',
  organization_id: 'org-1',
  program_id: 'prog-1',
  payload_hash: 'a'.repeat(64),
  amount_stroops: BUDGET_STROOPS,
  asset_code: 'RCPHP',
  asset_issuer: ISSUER,
  beneficiary_identity_id: null,
  distribution_job_id: null,
  distribution_recipient_id: null,
  requested_by: null,
  request_metadata: {},
  created_at: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const attemptRecord = (overrides = {}) => ({
  id: 'attempt-1',
  financial_intent_id: 'intent-1',
  organization_id: 'org-1',
  program_id: 'prog-1',
  distribution_job_id: null,
  beneficiary_identity_id: null,
  correlation_id: 'corr-1',
  attempt_number: 1,
  status: 'accepted',
  network: 'stellar_testnet',
  intent_payload_hash: 'a'.repeat(64),
  prepared_payload_hash: 'b'.repeat(64),
  envelope_xdr: null,
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

const strategyContext = (over = {}) => ({
  intent: over.intent ?? intentRecord(),
  config: testnetConfig(),
  guard: guardStub,
  signers: signers(),
  correlationId: 'corr-1',
});

// ---------------------------------------------------------------------------
// Pure helpers.
// ---------------------------------------------------------------------------

test('amountToStroops parses decimals exactly and fails closed on garbage', () => {
  assert.equal(activation.amountToStroops('500.0000000'), 5_000_000_000n);
  assert.equal(activation.amountToStroops('1'), 10_000_000n);
  assert.equal(activation.amountToStroops('0.0000001'), 1n);
  assert.equal(activation.amountToStroops('  10.5 '), 105_000_000n);
  assert.equal(activation.amountToStroops('not-a-number'), 0n);
  assert.equal(activation.amountToStroops(''), 0n);
});

test('stroopsToAmount is the inverse of amountToStroops', () => {
  for (const stroops of [1, 10_000_000, 5_000_000_000, 123_456_789]) {
    assert.equal(activation.amountToStroops(activation.stroopsToAmount(stroops)), BigInt(stroops));
  }
});

test('readRcphpBalanceStroops matches only the configured asset and defaults to zero', () => {
  const balances = [
    { asset_type: 'native', balance: '100.0000000' },
    { asset_type: 'credit_alphanum12', asset_code: 'RCPHP', asset_issuer: ISSUER, balance: '42.0000000' },
    { asset_type: 'credit_alphanum4', asset_code: 'OTHR', asset_issuer: ISSUER, balance: '999.0000000' },
  ];
  assert.equal(activation.readRcphpBalanceStroops(balances, 'RCPHP', ISSUER), 420_000_000n);
  assert.equal(activation.readRcphpBalanceStroops(balances, 'RCPHP', 'G' + 'Z'.repeat(55)), 0n);
  assert.equal(activation.readRcphpBalanceStroops([], 'RCPHP', ISSUER), 0n);
});

test('computeActivationPayloadHash is deterministic and 64 lowercase hex', async () => {
  const payload = {
    organizationId: 'org-1',
    programId: 'prog-1',
    sourceTreasury: orgTreasury.publicKey(),
    destinationTreasury: cashTreasury.publicKey(),
    assetCode: 'RCPHP',
    assetIssuer: ISSUER,
    budgetStroops: BUDGET_STROOPS,
    networkPassphrase: TESTNET_PASSPHRASE,
  };
  const a = await activation.computeActivationPayloadHash(payload);
  const b = await activation.computeActivationPayloadHash(payload);
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
  const different = await activation.computeActivationPayloadHash({ ...payload, budgetStroops: BUDGET_STROOPS + 1 });
  assert.notEqual(a, different);
});

// ---------------------------------------------------------------------------
// Strategy: build.
// ---------------------------------------------------------------------------

test('strategy build reserves the full budget from org treasury to the cash-program treasury', async () => {
  const strategy = activation.createCashActivationStrategy({ horizon: fakeHorizon() });
  const result = await strategy.build(strategyContext());

  assert.equal(result.network, 'stellar_testnet');
  assert.match(result.preparedPayloadHash, /^[0-9a-f]{64}$/);
  assert.equal(result.signingPackage.kind, 'classic_envelope');

  const tx = sdk.TransactionBuilder.fromXDR(result.envelopeXdr, TESTNET_PASSPHRASE);
  assert.equal(tx.operations.length, 1);
  const op = tx.operations[0];
  assert.equal(op.type, 'payment');
  assert.equal(op.destination, cashTreasury.publicKey());
  assert.equal(op.source, orgTreasury.publicKey());
  assert.equal(op.asset.getCode(), 'RCPHP');
  assert.equal(op.asset.getIssuer(), ISSUER);
  assert.equal(activation.amountToStroops(op.amount), BigInt(BUDGET_STROOPS));
  // The built transaction is unsigned; the institutional signature is added later.
  assert.equal(tx.signatures.length, 0);
});

test('strategy build throws insufficient_budget when the treasury is short', async () => {
  const strategy = activation.createCashActivationStrategy({
    horizon: fakeHorizon({ balances: [balanceLine(BUDGET_STROOPS - 1)] }),
  });
  await assert.rejects(
    () => strategy.build(strategyContext()),
    (err) => err.financialError.code === 'insufficient_budget',
  );
});

test('strategy build rejects an intent with no budget', async () => {
  const strategy = activation.createCashActivationStrategy({ horizon: fakeHorizon() });
  await assert.rejects(
    () => strategy.build(strategyContext({ intent: intentRecord({ amount_stroops: null }) })),
    (err) => err.financialError.code === 'validation_failed',
  );
});

// ---------------------------------------------------------------------------
// Strategy: verifyAndAssemble + submit.
// ---------------------------------------------------------------------------

const buildAndSign = async (horizon, signerKeypair = orgTreasury) => {
  const strategy = activation.createCashActivationStrategy({ horizon });
  const built = await strategy.build(strategyContext());
  const signedTx = sdk.TransactionBuilder.fromXDR(built.envelopeXdr, TESTNET_PASSPHRASE);
  signedTx.sign(signerKeypair);
  return { strategy, built, signedEnvelopeXdr: signedTx.toXDR() };
};

const verifyContext = (built, signedEnvelopeXdr) => ({
  ...strategyContext(),
  attempt: attemptRecord({ envelope_xdr: built.envelopeXdr }),
  parsedBuiltEnvelope: {
    transaction: sdk.TransactionBuilder.fromXDR(built.envelopeXdr, TESTNET_PASSPHRASE),
    isFeeBump: false,
    networkPassphrase: TESTNET_PASSPHRASE,
  },
  signed: { kind: 'classic_envelope', signedEnvelopeXdr },
});

test('strategy verifyAndAssemble wraps a validly-signed reservation in a sponsor fee-bump and submits', async () => {
  const horizon = fakeHorizon();
  const { strategy, built, signedEnvelopeXdr } = await buildAndSign(horizon);

  const assembled = await strategy.verifyAndAssemble(verifyContext(built, signedEnvelopeXdr));
  assert.match(assembled.transactionHash, /^[0-9a-f]{64}$/);

  const acceptance = await assembled.submit();
  assert.equal(horizon.submitted.length, 1);
  // The submitted transaction is a fee-bump paid by the isolated sponsor.
  // (Structural checks — `instanceof` is unreliable across module realms.)
  const submittedTx = horizon.submitted[0];
  assert.equal(submittedTx.feeSource, sponsor.publicKey());
  assert.ok(submittedTx.innerTransaction, 'fee-bump wraps the signed inner reservation');
  assert.equal(acceptance.resultCode, 'txSUCCESS');
});

test('strategy verifyAndAssemble rejects a reservation missing the org-treasury signature', async () => {
  const horizon = fakeHorizon();
  // Sign with the sponsor instead of the organization treasury.
  const { strategy, built, signedEnvelopeXdr } = await buildAndSign(horizon, sponsor);
  await assert.rejects(
    () => strategy.verifyAndAssemble(verifyContext(built, signedEnvelopeXdr)),
    (err) => err.financialError.code === 'authorization_failed',
  );
  assert.equal(horizon.submitted.length, 0);
});

test('strategy verifyAndAssemble rejects a signature over a different transaction', async () => {
  const horizon = fakeHorizon();
  const { strategy, built } = await buildAndSign(horizon);

  // Build and sign an unrelated transaction (different sequence), then submit it
  // as if it were the prepared reservation.
  const other = new sdk.TransactionBuilder(new sdk.Account(orgTreasury.publicKey(), '999'), {
    fee: sdk.BASE_FEE,
    networkPassphrase: TESTNET_PASSPHRASE,
  })
    .addOperation(
      sdk.Operation.payment({
        destination: cashTreasury.publicKey(),
        asset: new sdk.Asset('RCPHP', ISSUER),
        amount: activation.stroopsToAmount(BUDGET_STROOPS),
        source: orgTreasury.publicKey(),
      }),
    )
    .setTimeout(180)
    .build();
  other.sign(orgTreasury);

  await assert.rejects(
    () => strategy.verifyAndAssemble(verifyContext(built, other.toXDR())),
    (err) => err.financialError.code === 'validation_failed',
  );
  assert.equal(horizon.submitted.length, 0);
});

// ---------------------------------------------------------------------------
// Orchestration: prepare / submit.
// ---------------------------------------------------------------------------

const mockProtocol = (over = {}) => {
  const calls = { prepare: [], build: [], submit: [] };
  return {
    calls,
    async prepare(request) {
      calls.prepare.push(request);
      if (over.prepare) return over.prepare(request);
      return {
        intent: intentRecord({ amount_stroops: request.amountStroops, payload_hash: request.payloadHash }),
        idempotency: { record: { id: 'idem-1' }, isReplay: false },
        isReplay: false,
      };
    },
    async build(intent, strategy) {
      calls.build.push({ intent, strategy });
      return {
        attempt: attemptRecord({ envelope_xdr: 'BUILT' }),
        build: {},
        signingPackage: { kind: 'classic_envelope' },
      };
    },
    authorize: (built) => built.signingPackage,
    async submit(context, signed, strategy) {
      calls.submit.push({ context, signed, strategy });
      return { status: 'submitted', attemptId: context.attempt.id, transactionHash: 'txhash' };
    },
    async retry() {
      throw new Error('unused');
    },
  };
};

const orchestrator = (over = {}) =>
  activation.createCashProgramActivation({
    protocol: over.protocol ?? mockProtocol(),
    strategy: over.strategy ?? { operationType: 'program_activation' },
    horizon: over.horizon ?? fakeHorizon(),
    config: testnetConfig(),
    signers: signers(),
    funding: over.funding,
    signReservation: over.signReservation,
  });

const activationRequest = (overrides = {}) => ({
  organizationId: 'org-1',
  programId: 'prog-1',
  budgetStroops: BUDGET_STROOPS,
  idempotencyKey: 'program-activation:prog-1',
  requestedBy: 'user-1',
  correlationId: 'corr-1',
  ...overrides,
});

test('prepare reserves nothing when the treasury is short of the full budget', async () => {
  const protocol = mockProtocol();
  const orch = orchestrator({ protocol, horizon: fakeHorizon({ balances: [balanceLine(BUDGET_STROOPS - 1)] }) });
  await assert.rejects(
    () => orch.prepare(activationRequest()),
    (err) => err.financialError.code === 'insufficient_budget',
  );
  // No intent was persisted and nothing was built — nothing is reserved.
  assert.equal(protocol.calls.prepare.length, 0);
  assert.equal(protocol.calls.build.length, 0);
});

test('prepare persists an immutable program_activation intent and builds the reservation', async () => {
  const protocol = mockProtocol();
  const funding = { calls: [], async markReserving(p) { this.calls.push(p); } };
  const orch = orchestrator({ protocol, funding });

  const prepared = await orch.prepare(activationRequest());

  assert.equal(prepared.isReplay, false);
  assert.equal(protocol.calls.prepare.length, 1);
  const req = protocol.calls.prepare[0];
  assert.equal(req.operationType, 'program_activation');
  assert.equal(req.scope, 'program_activation');
  assert.equal(req.amountStroops, BUDGET_STROOPS);
  assert.equal(req.assetIssuer, ISSUER);
  assert.match(req.payloadHash, /^[0-9a-f]{64}$/);
  // Program is only advanced to the in-flight `reserving` state (still inactive).
  assert.equal(funding.calls.length, 1);
  assert.equal(protocol.calls.build.length, 1);
  assert.ok(prepared.attempt !== null);
});

test('prepare does not reserve a second time on an idempotent replay', async () => {
  const protocol = mockProtocol({
    prepare: () => ({ intent: intentRecord({ id: 'prior' }), idempotency: {}, isReplay: true }),
  });
  const funding = { calls: [], async markReserving(p) { this.calls.push(p); } };
  const orch = orchestrator({ protocol, funding });

  const prepared = await orch.prepare(activationRequest());
  assert.equal(prepared.isReplay, true);
  assert.equal(prepared.attempt, null);
  // A replay neither builds a new attempt nor re-marks the program.
  assert.equal(protocol.calls.build.length, 0);
  assert.equal(funding.calls.length, 0);
});

test('prepare rejects a non-positive budget before touching Horizon', async () => {
  const horizon = fakeHorizon();
  let loaded = 0;
  horizon.loadAccount = async () => { loaded += 1; return new sdk.Account(orgTreasury.publicKey(), '1'); };
  const orch = orchestrator({ horizon });
  await assert.rejects(
    () => orch.prepare(activationRequest({ budgetStroops: 0 })),
    (err) => err.financialError.code === 'validation_failed',
  );
  assert.equal(loaded, 0);
});

test('submit signs with the org treasury and marks submitted (never confirmed)', async () => {
  const protocol = mockProtocol();
  const orch = orchestrator({ protocol });

  // A real unsigned reservation the default institutional signer can sign.
  const strategy = activation.createCashActivationStrategy({ horizon: fakeHorizon() });
  const built = await strategy.build(strategyContext());
  const attempt = attemptRecord({ envelope_xdr: built.envelopeXdr });

  const result = await orch.submit({ intent: intentRecord(), attempt });

  assert.equal(result.status, 'submitted');
  assert.equal(protocol.calls.submit.length, 1);
  const submitCall = protocol.calls.submit[0];
  assert.equal(submitCall.signed.kind, 'classic_envelope');
  // The signed envelope carries the institutional signature the unsigned one lacked.
  const signedTx = sdk.TransactionBuilder.fromXDR(submitCall.signed.signedEnvelopeXdr, TESTNET_PASSPHRASE);
  assert.equal(signedTx.signatures.length, 1);
  assert.ok(activation.verifyTransactionSignedBy(signedTx, orgTreasury.publicKey()));
});

test('submit fails closed when the attempt has no prepared reservation', async () => {
  const orch = orchestrator();
  await assert.rejects(
    () => orch.submit({ intent: intentRecord(), attempt: attemptRecord({ envelope_xdr: null }) }),
    (err) => err.financialError.code === 'validation_failed',
  );
});

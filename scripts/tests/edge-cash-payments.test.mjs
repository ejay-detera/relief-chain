// Unit tests for cash disbursement + merchant payment prepare/submit (Task 10.3).
//
// Covers the two OperationProtocol strategies + orchestration in:
//   supabase/functions/_shared/stellar/cash-disbursement.ts
//   supabase/functions/_shared/stellar/merchant-payment.ts
//
// The reusable protocol is mocked for the orchestration tests (its own
// invariants are covered by edge-protocol.test.mjs); the strategy tests use the
// REAL installed Stellar SDK so transaction building, signing, and signature
// verification run for real rather than against a mock.
//
// Asserts the rules from the design and task:
//   - TRANSFER ONLY RCPHP (never native XLM) to the bound destination.
//   - Disbursement: cash-program treasury -> verified beneficiary wallet, signed
//     by the isolated treasury signer, sponsor fee-bump pays fees only.
//   - Merchant payment: beneficiary -> merchant settlement wallet, REQUIRES the
//     beneficiary signature; the sponsor fee-bump can never substitute for it.
//   - submit only ever yields `submitted` (confirmation reconciliation-owned).
//
// Validates: Requirements 6.1, 6.2, 6.3, 6.6, 8.4, 8.5, 11.6, 12.2, 14.1
//
// Loading convention mirrors edge-cash-activation.test.mjs.

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
const disbursement = await importShared('stellar/cash-disbursement.ts');
const payment = await importShared('stellar/merchant-payment.ts');

// ---------------------------------------------------------------------------
// Fixtures.
// ---------------------------------------------------------------------------

const HORIZON = 'https://horizon-testnet.stellar.org';
const RPC = 'https://soroban-testnet.stellar.org';
const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';

// Real keypairs so signing/verification are genuine.
const cashTreasury = sdk.Keypair.random();
const beneficiary = sdk.Keypair.random();
const merchant = sdk.Keypair.random();
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
    case 'cash_program_treasury':
      return cashTreasury.secret();
    case 'sponsor':
      return sponsor.secret();
    default:
      return undefined;
  }
};

const signers = () => signersModule.createInstitutionalSignerRegistry(secretResolver);

const AMOUNT_STROOPS = 250_000_000; // 25.0000000 RCPHP
const INVOICE_ID = 'c'.repeat(64);

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

const fakeHorizon = ({ balances = [balanceLine(AMOUNT_STROOPS)], submit } = {}) => {
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

const attemptRecord = (overrides = {}) => ({
  id: 'attempt-1',
  financial_intent_id: 'intent-1',
  organization_id: 'org-1',
  program_id: 'prog-1',
  distribution_job_id: 'job-1',
  beneficiary_identity_id: 'ben-1',
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

// ===========================================================================
// Cash disbursement.
// ===========================================================================

const disbIntent = (overrides = {}) => ({
  id: 'intent-1',
  correlation_id: 'corr-1',
  idempotency_key_id: 'idem-1',
  operation_type: 'cash_distribution',
  organization_id: 'org-1',
  program_id: 'prog-1',
  payload_hash: 'a'.repeat(64),
  amount_stroops: AMOUNT_STROOPS,
  asset_code: 'RCPHP',
  asset_issuer: ISSUER,
  beneficiary_identity_id: 'ben-1',
  distribution_job_id: 'job-1',
  distribution_recipient_id: 'rec-1',
  requested_by: null,
  request_metadata: { destination_address: beneficiary.publicKey() },
  created_at: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const disbContext = (over = {}) => ({
  intent: over.intent ?? disbIntent(),
  config: testnetConfig(),
  guard: { assertTestnetConfig() {}, assertNetworkPassphrase() {} },
  signers: signers(),
  correlationId: 'corr-1',
});

test('disbursement payload hash is deterministic and 64 lowercase hex', async () => {
  const payload = {
    organizationId: 'org-1',
    programId: 'prog-1',
    distributionJobId: 'job-1',
    distributionRecipientId: 'rec-1',
    beneficiaryIdentityId: 'ben-1',
    sourceTreasury: cashTreasury.publicKey(),
    destinationWallet: beneficiary.publicKey(),
    assetCode: 'RCPHP',
    assetIssuer: ISSUER,
    amountStroops: AMOUNT_STROOPS,
    networkPassphrase: TESTNET_PASSPHRASE,
  };
  const a = await disbursement.computeDisbursementPayloadHash(payload);
  const b = await disbursement.computeDisbursementPayloadHash(payload);
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
  const other = await disbursement.computeDisbursementPayloadHash({ ...payload, amountStroops: AMOUNT_STROOPS + 1 });
  assert.notEqual(a, other);
});

test('disbursement build pays RCPHP from the cash-program treasury to the beneficiary wallet', async () => {
  const strategy = disbursement.createCashDisbursementStrategy({ horizon: fakeHorizon() });
  const result = await strategy.build(disbContext());

  assert.equal(result.network, 'stellar_testnet');
  assert.equal(result.signingPackage.kind, 'classic_envelope');

  const tx = sdk.TransactionBuilder.fromXDR(result.envelopeXdr, TESTNET_PASSPHRASE);
  assert.equal(tx.operations.length, 1);
  const op = tx.operations[0];
  assert.equal(op.type, 'payment');
  assert.equal(op.destination, beneficiary.publicKey());
  assert.equal(op.source, cashTreasury.publicKey());
  assert.equal(op.asset.getCode(), 'RCPHP');
  assert.equal(op.asset.getIssuer(), ISSUER);
  assert.equal(op.asset.isNative(), false);
  assert.equal(tx.signatures.length, 0);
});

test('disbursement build throws insufficient_budget when the treasury is short', async () => {
  const strategy = disbursement.createCashDisbursementStrategy({
    horizon: fakeHorizon({ balances: [balanceLine(AMOUNT_STROOPS - 1)] }),
  });
  await assert.rejects(
    () => strategy.build(disbContext()),
    (err) => err.financialError.code === 'insufficient_budget',
  );
});

test('disbursement build throws validation_failed when the destination wallet is missing', async () => {
  const strategy = disbursement.createCashDisbursementStrategy({ horizon: fakeHorizon() });
  await assert.rejects(
    () => strategy.build(disbContext({ intent: disbIntent({ request_metadata: {} }) })),
    (err) => err.financialError.code === 'validation_failed',
  );
});

const disbBuildAndSign = async (horizon, signerKeypair = cashTreasury) => {
  const strategy = disbursement.createCashDisbursementStrategy({ horizon });
  const built = await strategy.build(disbContext());
  const signedTx = sdk.TransactionBuilder.fromXDR(built.envelopeXdr, TESTNET_PASSPHRASE);
  signedTx.sign(signerKeypair);
  return { strategy, built, signedEnvelopeXdr: signedTx.toXDR() };
};

const disbVerifyContext = (built, signedEnvelopeXdr) => ({
  ...disbContext(),
  attempt: attemptRecord({ envelope_xdr: built.envelopeXdr }),
  parsedBuiltEnvelope: {
    transaction: sdk.TransactionBuilder.fromXDR(built.envelopeXdr, TESTNET_PASSPHRASE),
    isFeeBump: false,
    networkPassphrase: TESTNET_PASSPHRASE,
  },
  signed: { kind: 'classic_envelope', signedEnvelopeXdr },
});

test('disbursement verifyAndAssemble wraps a treasury-signed payment in a sponsor fee-bump and submits', async () => {
  const horizon = fakeHorizon();
  const { strategy, built, signedEnvelopeXdr } = await disbBuildAndSign(horizon);

  const assembled = await strategy.verifyAndAssemble(disbVerifyContext(built, signedEnvelopeXdr));
  assert.match(assembled.transactionHash, /^[0-9a-f]{64}$/);

  const acceptance = await assembled.submit();
  assert.equal(horizon.submitted.length, 1);
  const submittedTx = horizon.submitted[0];
  assert.equal(submittedTx.feeSource, sponsor.publicKey());
  assert.ok(submittedTx.innerTransaction, 'fee-bump wraps the signed inner disbursement');
  assert.equal(acceptance.resultCode, 'txSUCCESS');
});

test('disbursement verifyAndAssemble rejects a payment missing the treasury signature', async () => {
  const horizon = fakeHorizon();
  // Sign with the sponsor instead of the cash-program treasury.
  const { strategy, built, signedEnvelopeXdr } = await disbBuildAndSign(horizon, sponsor);
  await assert.rejects(
    () => strategy.verifyAndAssemble(disbVerifyContext(built, signedEnvelopeXdr)),
    (err) => err.financialError.code === 'authorization_failed',
  );
  assert.equal(horizon.submitted.length, 0);
});

test('disbursement verifyAndAssemble rejects a signature over a different transaction', async () => {
  const horizon = fakeHorizon();
  const { strategy, built } = await disbBuildAndSign(horizon);
  const other = new sdk.TransactionBuilder(new sdk.Account(cashTreasury.publicKey(), '999'), {
    fee: sdk.BASE_FEE,
    networkPassphrase: TESTNET_PASSPHRASE,
  })
    .addOperation(
      sdk.Operation.payment({
        destination: beneficiary.publicKey(),
        asset: new sdk.Asset('RCPHP', ISSUER),
        amount: activation.stroopsToAmount(AMOUNT_STROOPS),
        source: cashTreasury.publicKey(),
      }),
    )
    .setTimeout(180)
    .build();
  other.sign(cashTreasury);
  await assert.rejects(
    () => strategy.verifyAndAssemble(disbVerifyContext(built, other.toXDR())),
    (err) => err.financialError.code === 'validation_failed',
  );
  assert.equal(horizon.submitted.length, 0);
});

// ---------------------------------------------------------------------------
// Disbursement orchestration: prepare / submit / processor.
// ---------------------------------------------------------------------------

const disbMockProtocol = (over = {}) => {
  const calls = { prepare: [], build: [], submit: [] };
  return {
    calls,
    async prepare(request) {
      calls.prepare.push(request);
      if (over.prepare) return over.prepare(request);
      return {
        intent: disbIntent({ amount_stroops: request.amountStroops, payload_hash: request.payloadHash }),
        idempotency: { record: { id: 'idem-1' }, isReplay: false },
        isReplay: false,
      };
    },
    async build(intent) {
      calls.build.push({ intent });
      return {
        attempt: attemptRecord({ envelope_xdr: 'BUILT' }),
        build: {},
        signingPackage: { kind: 'classic_envelope' },
      };
    },
    authorize: (built) => built.signingPackage,
    async submit(context, signed) {
      calls.submit.push({ context, signed });
      return { status: 'submitted', attemptId: context.attempt.id, transactionHash: 'txhash' };
    },
    async retry() {
      throw new Error('unused');
    },
  };
};

const disbOrchestrator = (over = {}) =>
  disbursement.createCashDisbursement({
    protocol: over.protocol ?? disbMockProtocol(),
    strategy: over.strategy ?? { operationType: 'cash_distribution' },
    config: testnetConfig(),
    signers: signers(),
    signDisbursement: over.signDisbursement ?? (() => 'SIGNED'),
  });

const disbRequest = (overrides = {}) => ({
  organizationId: 'org-1',
  programId: 'prog-1',
  distributionJobId: 'job-1',
  distributionRecipientId: 'rec-1',
  beneficiaryIdentityId: 'ben-1',
  destinationWallet: beneficiary.publicKey(),
  amountStroops: AMOUNT_STROOPS,
  idempotencyKey: `distribution:prog-1:beneficiary:ben-1:policy:3`,
  correlationId: 'corr-1',
  ...overrides,
});

test('disbursement prepare persists an intent binding correlation + destination and builds', async () => {
  const protocol = disbMockProtocol();
  const orch = disbOrchestrator({ protocol });
  const prepared = await orch.prepare(disbRequest());

  assert.equal(prepared.isReplay, false);
  assert.equal(protocol.calls.prepare.length, 1);
  const req = protocol.calls.prepare[0];
  assert.equal(req.operationType, 'cash_distribution');
  assert.equal(req.scope, 'cash_distribution');
  assert.equal(req.amountStroops, AMOUNT_STROOPS);
  assert.equal(req.distributionJobId, 'job-1');
  assert.equal(req.distributionRecipientId, 'rec-1');
  assert.equal(req.beneficiaryIdentityId, 'ben-1');
  assert.equal(req.requestMetadata.destination_address, beneficiary.publicKey());
  assert.match(req.payloadHash, /^[0-9a-f]{64}$/);
  assert.equal(protocol.calls.build.length, 1);
  assert.ok(prepared.attempt !== null);
});

test('disbursement prepare does not build a second time on an idempotent replay', async () => {
  const protocol = disbMockProtocol({
    prepare: () => ({ intent: disbIntent({ id: 'prior' }), idempotency: {}, isReplay: true }),
  });
  const orch = disbOrchestrator({ protocol });
  const prepared = await orch.prepare(disbRequest());
  assert.equal(prepared.isReplay, true);
  assert.equal(prepared.attempt, null);
  assert.equal(protocol.calls.build.length, 0);
});

test('disbursement prepare rejects an invalid destination wallet', async () => {
  const orch = disbOrchestrator();
  await assert.rejects(
    () => orch.prepare(disbRequest({ destinationWallet: 'not-an-address' })),
    (err) => err.financialError.code === 'validation_failed',
  );
});

test('disbursement submit signs with the treasury signer and marks submitted (never confirmed)', async () => {
  const protocol = disbMockProtocol();
  // Use the REAL institutional signer to prove the treasury signature is added.
  const orch = disbursement.createCashDisbursement({
    protocol,
    strategy: { operationType: 'cash_distribution' },
    config: testnetConfig(),
    signers: signers(),
  });

  const strategy = disbursement.createCashDisbursementStrategy({ horizon: fakeHorizon() });
  const built = await strategy.build(disbContext());
  const attempt = attemptRecord({ envelope_xdr: built.envelopeXdr });

  const result = await orch.submit({ intent: disbIntent(), attempt });
  assert.equal(result.status, 'submitted');
  assert.equal(protocol.calls.submit.length, 1);
  const submitCall = protocol.calls.submit[0];
  assert.equal(submitCall.signed.kind, 'classic_envelope');
  // The signed envelope carries the treasury signature the unsigned one lacked.
  const signedTx = sdk.TransactionBuilder.fromXDR(submitCall.signed.signedEnvelopeXdr, TESTNET_PASSPHRASE);
  assert.equal(signedTx.signatures.length, 1);
  assert.ok(activation.verifyTransactionSignedBy(signedTx, cashTreasury.publicKey()));
});

test('disbursement recipient processor resolves destination, submits, and reports submitted', async () => {
  const protocol = disbMockProtocol();
  const orch = disbOrchestrator({ protocol });
  const processor = orch.createRecipientProcessor({
    organizationId: 'org-1',
    programId: 'prog-1',
    distributionJobId: 'job-1',
    resolveDestinationAddress: async () => beneficiary.publicKey(),
    correlationId: 'corr-1',
  });

  const outcome = await processor({
    recipientId: 'rec-1',
    beneficiaryIdentityId: 'ben-1',
    destinationWalletId: 'wallet-1',
    amountStroops: AMOUNT_STROOPS,
    idempotencyKey: 'distribution:prog-1:beneficiary:ben-1:policy:3',
  });

  assert.equal(outcome.kind, 'submitted');
  assert.equal(outcome.transactionHash, 'txhash');
  assert.equal(protocol.calls.submit.length, 1);
});

test('disbursement recipient processor surfaces a replay as a reconcilable failure (no double-pay)', async () => {
  const protocol = disbMockProtocol({
    prepare: () => ({ intent: disbIntent({ id: 'prior' }), idempotency: {}, isReplay: true }),
  });
  const orch = disbOrchestrator({ protocol });
  const processor = orch.createRecipientProcessor({
    organizationId: 'org-1',
    programId: 'prog-1',
    distributionJobId: 'job-1',
    resolveDestinationAddress: async () => beneficiary.publicKey(),
  });

  const outcome = await processor({
    recipientId: 'rec-1',
    beneficiaryIdentityId: 'ben-1',
    destinationWalletId: 'wallet-1',
    amountStroops: AMOUNT_STROOPS,
    idempotencyKey: 'distribution:prog-1:beneficiary:ben-1:policy:3',
  });

  assert.equal(outcome.kind, 'failed');
  assert.equal(outcome.failureCode, 'submission_unknown');
  // No second attempt was built or submitted.
  assert.equal(protocol.calls.build.length, 0);
  assert.equal(protocol.calls.submit.length, 0);
});

// ===========================================================================
// Merchant payment.
// ===========================================================================

const payIntent = (overrides = {}) => ({
  id: 'intent-2',
  correlation_id: 'corr-2',
  idempotency_key_id: 'idem-2',
  operation_type: 'cash_payment',
  organization_id: 'org-1',
  program_id: null,
  payload_hash: 'a'.repeat(64),
  amount_stroops: AMOUNT_STROOPS,
  asset_code: 'RCPHP',
  asset_issuer: ISSUER,
  beneficiary_identity_id: 'ben-1',
  distribution_job_id: null,
  distribution_recipient_id: null,
  requested_by: null,
  request_metadata: {
    invoice_id: INVOICE_ID,
    source_address: beneficiary.publicKey(),
    destination_address: merchant.publicKey(),
  },
  created_at: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const payContext = (over = {}) => ({
  intent: over.intent ?? payIntent(),
  config: testnetConfig(),
  guard: { assertTestnetConfig() {}, assertNetworkPassphrase() {} },
  signers: signers(),
  correlationId: 'corr-2',
});

test('merchant payment key is deterministic and bound to the invoice id', () => {
  assert.equal(payment.makeMerchantPaymentKey(INVOICE_ID), `cash_payment:invoice:${INVOICE_ID}`);
});

test('merchant payment build pays RCPHP from the beneficiary to the merchant settlement wallet', async () => {
  const strategy = payment.createMerchantPaymentStrategy({ horizon: fakeHorizon() });
  const result = await strategy.build(payContext());

  const tx = sdk.TransactionBuilder.fromXDR(result.envelopeXdr, TESTNET_PASSPHRASE);
  assert.equal(tx.operations.length, 1);
  const op = tx.operations[0];
  assert.equal(op.type, 'payment');
  assert.equal(op.source, beneficiary.publicKey());
  assert.equal(op.destination, merchant.publicKey());
  assert.equal(op.asset.getCode(), 'RCPHP');
  assert.equal(op.asset.isNative(), false);
  assert.equal(op.amount, activation.stroopsToAmount(AMOUNT_STROOPS));
  // The build returns an unsigned package for the beneficiary to sign.
  assert.equal(tx.signatures.length, 0);
  assert.equal(result.signingPackage.kind, 'classic_envelope');
});

test('merchant payment build throws insufficient_balance when the beneficiary is short', async () => {
  const strategy = payment.createMerchantPaymentStrategy({
    horizon: fakeHorizon({ balances: [balanceLine(AMOUNT_STROOPS - 1)] }),
  });
  await assert.rejects(
    () => strategy.build(payContext()),
    (err) => err.financialError.code === 'insufficient_balance',
  );
});

const payBuildAndSign = async (horizon, signerKeypair = beneficiary) => {
  const strategy = payment.createMerchantPaymentStrategy({ horizon });
  const built = await strategy.build(payContext());
  const signedTx = sdk.TransactionBuilder.fromXDR(built.envelopeXdr, TESTNET_PASSPHRASE);
  signedTx.sign(signerKeypair);
  return { strategy, built, signedEnvelopeXdr: signedTx.toXDR() };
};

const payVerifyContext = (built, signedEnvelopeXdr) => ({
  ...payContext(),
  attempt: attemptRecord({ envelope_xdr: built.envelopeXdr, operation_type: 'cash_payment' }),
  parsedBuiltEnvelope: {
    transaction: sdk.TransactionBuilder.fromXDR(built.envelopeXdr, TESTNET_PASSPHRASE),
    isFeeBump: false,
    networkPassphrase: TESTNET_PASSPHRASE,
  },
  signed: { kind: 'classic_envelope', signedEnvelopeXdr },
});

test('merchant payment verifyAndAssemble wraps a beneficiary-signed payment in a sponsor fee-bump', async () => {
  const horizon = fakeHorizon();
  const { strategy, built, signedEnvelopeXdr } = await payBuildAndSign(horizon);

  const assembled = await strategy.verifyAndAssemble(payVerifyContext(built, signedEnvelopeXdr));
  const acceptance = await assembled.submit();

  assert.equal(horizon.submitted.length, 1);
  const submittedTx = horizon.submitted[0];
  assert.equal(submittedTx.feeSource, sponsor.publicKey());
  assert.ok(submittedTx.innerTransaction, 'fee-bump wraps the beneficiary-signed inner payment');
  assert.equal(acceptance.resultCode, 'txSUCCESS');
});

test('merchant payment verifyAndAssemble rejects a payment missing the beneficiary signature', async () => {
  const horizon = fakeHorizon();
  // The sponsor signs, but the beneficiary authorization is absent.
  const { strategy, built, signedEnvelopeXdr } = await payBuildAndSign(horizon, sponsor);
  await assert.rejects(
    () => strategy.verifyAndAssemble(payVerifyContext(built, signedEnvelopeXdr)),
    (err) => err.financialError.code === 'authorization_failed',
  );
  assert.equal(horizon.submitted.length, 0);
});

test('merchant payment verifyAndAssemble rejects a signature over a different transaction', async () => {
  const horizon = fakeHorizon();
  const { strategy, built } = await payBuildAndSign(horizon);
  const other = new sdk.TransactionBuilder(new sdk.Account(beneficiary.publicKey(), '777'), {
    fee: sdk.BASE_FEE,
    networkPassphrase: TESTNET_PASSPHRASE,
  })
    .addOperation(
      sdk.Operation.payment({
        destination: merchant.publicKey(),
        asset: new sdk.Asset('RCPHP', ISSUER),
        amount: activation.stroopsToAmount(AMOUNT_STROOPS),
        source: beneficiary.publicKey(),
      }),
    )
    .setTimeout(180)
    .build();
  other.sign(beneficiary);
  await assert.rejects(
    () => strategy.verifyAndAssemble(payVerifyContext(built, other.toXDR())),
    (err) => err.financialError.code === 'validation_failed',
  );
  assert.equal(horizon.submitted.length, 0);
});

// ---------------------------------------------------------------------------
// Merchant payment orchestration: prepare / submit.
// ---------------------------------------------------------------------------

const payMockProtocol = (over = {}) => {
  const calls = { prepare: [], build: [], submit: [] };
  return {
    calls,
    async prepare(request) {
      calls.prepare.push(request);
      if (over.prepare) return over.prepare(request);
      return {
        intent: payIntent({ amount_stroops: request.amountStroops, payload_hash: request.payloadHash }),
        idempotency: { record: { id: 'idem-2' }, isReplay: false },
        isReplay: false,
      };
    },
    async build(intent) {
      calls.build.push({ intent });
      return {
        attempt: attemptRecord({ envelope_xdr: 'BUILT', operation_type: 'cash_payment' }),
        build: {},
        signingPackage: { kind: 'classic_envelope', unsignedEnvelopeXdr: 'UNSIGNED' },
      };
    },
    authorize: (built) => built.signingPackage,
    async submit(context, signed) {
      calls.submit.push({ context, signed });
      return { status: 'submitted', attemptId: context.attempt.id, transactionHash: 'txhash' };
    },
    async retry() {
      throw new Error('unused');
    },
  };
};

const payOrchestrator = (over = {}) =>
  payment.createMerchantPayment({
    protocol: over.protocol ?? payMockProtocol(),
    strategy: over.strategy ?? { operationType: 'cash_payment' },
    config: testnetConfig(),
    signers: signers(),
  });

const payRequest = (overrides = {}) => ({
  organizationId: 'org-1',
  programId: null,
  invoiceId: INVOICE_ID,
  beneficiaryIdentityId: 'ben-1',
  beneficiaryWallet: beneficiary.publicKey(),
  merchantSettlementWallet: merchant.publicKey(),
  amountStroops: AMOUNT_STROOPS,
  correlationId: 'corr-2',
  ...overrides,
});

test('merchant payment prepare binds the invoice key + wallets and returns the beneficiary package', async () => {
  const protocol = payMockProtocol();
  const orch = payOrchestrator({ protocol });
  const prepared = await orch.prepare(payRequest());

  assert.equal(prepared.isReplay, false);
  const req = protocol.calls.prepare[0];
  assert.equal(req.operationType, 'cash_payment');
  assert.equal(req.scope, 'cash_payment');
  assert.equal(req.idempotencyKey, `cash_payment:invoice:${INVOICE_ID}`);
  assert.equal(req.requestMetadata.source_address, beneficiary.publicKey());
  assert.equal(req.requestMetadata.destination_address, merchant.publicKey());
  assert.equal(req.requestMetadata.invoice_id, INVOICE_ID);
  assert.equal(prepared.signingPackage.kind, 'classic_envelope');
});

test('merchant payment prepare rejects a malformed invoice id', async () => {
  const orch = payOrchestrator();
  await assert.rejects(
    () => orch.prepare(payRequest({ invoiceId: 'nope' })),
    (err) => err.financialError.code === 'validation_failed',
  );
});

test('merchant payment prepare does not build a second time on an idempotent replay', async () => {
  const protocol = payMockProtocol({
    prepare: () => ({ intent: payIntent({ id: 'prior' }), idempotency: {}, isReplay: true }),
  });
  const orch = payOrchestrator({ protocol });
  const prepared = await orch.prepare(payRequest());
  assert.equal(prepared.isReplay, true);
  assert.equal(prepared.attempt, null);
  assert.equal(protocol.calls.build.length, 0);
});

test('merchant payment submit passes the beneficiary-signed envelope through and marks submitted', async () => {
  const protocol = payMockProtocol();
  const orch = payOrchestrator({ protocol });
  const result = await orch.submit({
    intent: payIntent(),
    attempt: attemptRecord({ envelope_xdr: 'BUILT', operation_type: 'cash_payment' }),
    signed: { kind: 'classic_envelope', signedEnvelopeXdr: 'BENEFICIARY_SIGNED' },
  });
  assert.equal(result.status, 'submitted');
  assert.equal(protocol.calls.submit.length, 1);
  assert.equal(protocol.calls.submit[0].signed.signedEnvelopeXdr, 'BENEFICIARY_SIGNED');
});

test('merchant payment submit fails closed when the attempt has no prepared transaction', async () => {
  const orch = payOrchestrator();
  await assert.rejects(
    () => orch.submit({
      intent: payIntent(),
      attempt: attemptRecord({ envelope_xdr: null, operation_type: 'cash_payment' }),
      signed: { kind: 'classic_envelope', signedEnvelopeXdr: 'x' },
    }),
    (err) => err.financialError.code === 'validation_failed',
  );
});

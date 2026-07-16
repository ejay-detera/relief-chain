// Unit tests for voucher payment / redemption prepare/submit (Task 11.3).
//
// Covers the pure online-revalidation gates, the OperationProtocol strategy
// (Soroban auth-entry signing with a sponsor SOURCE), and the prepare/submit
// orchestration in:
//   supabase/functions/_shared/stellar/voucher-payment.ts
//
// The reusable protocol is mocked for the orchestration tests (its own
// invariants are covered by edge-protocol.test.mjs); the strategy tests use the
// REAL installed Stellar SDK so transaction sourcing/signing and authorization-
// entry parsing run for real rather than against a mock.
//
// Asserts the rules from the design and task:
//   - VALIDATE THE CANONICAL VOUCHER INVOICE online (signature + ten-minute expiry).
//   - REVALIDATE merchant / program / category / per-tx & daily limits / balance /
//     expiry / used-nonce before building or submitting.
//   - RETURN ONLY the exact beneficiary auth-entry signing package.
//   - VERIFY the returned auth entry (beneficiary, contract, redeem, nonce,
//     signature-expiration ledger) against the stored intent, then sign with the
//     sponsor SOURCE (sponsorship never substitutes contract authorization).
//   - submit only ever yields `submitted` (confirmation reconciliation-owned).
//
// Validates: Requirements 3.6, 10.6, 11.5, 14.1, 18.3, 18.8
//
// Loading convention mirrors edge-cash-payments.test.mjs.

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
const { Address, xdr } = sdk;
const sharedConfig = await importShared('../../../shared/stellar-config.ts');
const invoiceCodec = await importShared('../../../shared/invoice-codec.ts');
const signersModule = await importShared('stellar/signers.ts');
const networkGuardModule = await importShared('stellar/network-guard.ts');
const voucherPayment = await importShared('stellar/voucher-payment.ts');

// ---------------------------------------------------------------------------
// Fixtures.
// ---------------------------------------------------------------------------

const HORIZON = 'https://horizon-testnet.stellar.org';
const RPC = 'https://soroban-testnet.stellar.org';
const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';

const sponsor = sdk.Keypair.random();
const beneficiary = sdk.Keypair.random();
const merchant = sdk.Keypair.random();
const issuerKeypair = sdk.Keypair.random();
const ISSUER = issuerKeypair.publicKey();

// Valid contract strkeys (a bare 'C' + repeated base32 char does NOT decode to
// a real contract address; stellar-sdk's Address.fromString rejects it). These
// deterministic all-constant contract ids keep the fixtures stable while
// remaining parseable by the real XDR/auth-entry code paths.
const CONTRACT_ID = sdk.StrKey.encodeContract(Buffer.alloc(32, 0x0a));
const SAC = sdk.StrKey.encodeContract(Buffer.alloc(32, 0x0b));
const PROGRAM_REF = 'a'.repeat(64);
const ENTITLEMENT_ID = 'b'.repeat(64);
const MERCHANT_ID = 'c'.repeat(64);

const AMOUNT_STROOPS = 100_000_000; // 10.0000000 RCPHP
const SIG_EXP_LEDGER = 5000;
const AUTH_NONCE = '987654321';

const testnetConfig = () =>
  sharedConfig.createStellarTestnetConfig({
    horizonUrl: HORIZON,
    rpcUrl: RPC,
    rcphpIssuer: ISSUER,
    rcphpSacId: SAC,
  });

const secretResolver = (role) => {
  switch (role) {
    case 'sponsor':
      return sponsor.secret();
    default:
      return undefined;
  }
};

const signers = () => signersModule.createInstitutionalSignerRegistry(secretResolver);

const importGuard = () =>
  networkGuardModule.createNetworkGuard(testnetConfig(), { allowedContractIds: [CONTRACT_ID] });

// A frozen instant so invoice expiry is deterministic.
const ISSUED_AT_MS = Date.parse('2026-02-01T00:00:00.000Z');
const NOW_MS = ISSUED_AT_MS + 60_000; // one minute after issue: still fresh
const NOW_SECONDS = Math.floor(NOW_MS / 1000);

const signedInvoice = (overrides = {}) => {
  const issuedAt = new Date(ISSUED_AT_MS).toISOString();
  const unsigned = {
    version: 1,
    kind: 'voucher',
    asset: { code: 'RCPHP', issuer: ISSUER, sacAddress: SAC, network: 'testnet' },
    programId: PROGRAM_REF,
    contractId: CONTRACT_ID,
    merchantId: MERCHANT_ID,
    settlementWallet: merchant.publicKey(),
    invoiceSigner: merchant.publicKey(),
    amountStroops: String(AMOUNT_STROOPS),
    category: 'food',
    nonce: 'd'.repeat(64),
    issuedAt,
    expiresAt: invoiceCodec.deriveExpiresAt(issuedAt),
    ...overrides,
  };
  return invoiceCodec.signInvoice(unsigned, merchant.secret());
};

const programPolicy = (overrides = {}) => ({
  programRef: PROGRAM_REF,
  contractId: CONTRACT_ID,
  sacAddress: SAC,
  authorizedCategories: ['food', 'medicine'],
  perTransactionLimitStroops: 200_000_000,
  programExpiresAt: 4_000_000_000,
  ...overrides,
});

const merchantState = (overrides = {}) => ({
  merchantId: MERCHANT_ID,
  settlementWallet: merchant.publicKey(),
  category: 'food',
  validUntil: 4_000_000_000,
  authorized: true,
  ...overrides,
});

const entitlementState = (overrides = {}) => ({
  entitlementId: ENTITLEMENT_ID,
  balanceStroops: 500_000_000,
  dailyLimitStroops: 300_000_000,
  spentTodayStroops: 0,
  expiresAt: 3_900_000_000,
  ...overrides,
});

const CID = 'corr-voucher-pay-1';

const redeemableParams = (overrides = {}) => ({
  invoice: overrides.invoice ?? signedInvoice(),
  policy: overrides.policy ?? programPolicy(),
  merchant: overrides.merchant ?? merchantState(),
  entitlement: overrides.entitlement ?? entitlementState(),
  amountStroops: overrides.amountStroops ?? AMOUNT_STROOPS,
  nowSeconds: overrides.nowSeconds ?? NOW_SECONDS,
});

// ---------------------------------------------------------------------------
// Pure gate: online invoice verification.
// ---------------------------------------------------------------------------

test('assertInvoiceVerifiedAndFresh accepts a valid, unexpired voucher invoice', () => {
  assert.doesNotThrow(() =>
    voucherPayment.assertInvoiceVerifiedAndFresh(signedInvoice(), NOW_MS, CID),
  );
});

test('assertInvoiceVerifiedAndFresh rejects an expired invoice as invoice_expired', () => {
  const invoice = signedInvoice();
  const afterExpiry = Date.parse(invoice.expiresAt) + 1;
  assert.throws(
    () => voucherPayment.assertInvoiceVerifiedAndFresh(invoice, afterExpiry, CID),
    (err) => err.financialError.code === 'invoice_expired',
  );
});

test('assertInvoiceVerifiedAndFresh rejects a tampered signature', () => {
  const invoice = signedInvoice();
  const tampered = { ...invoice, amountStroops: String(AMOUNT_STROOPS + 1) };
  assert.throws(
    () => voucherPayment.assertInvoiceVerifiedAndFresh(tampered, NOW_MS, CID),
    (err) => err.financialError.code === 'validation_failed',
  );
});

// ---------------------------------------------------------------------------
// Pure gate: merchant / program / category / limits / balance / expiry.
// ---------------------------------------------------------------------------

test('assertVoucherInvoiceRedeemable accepts a fully valid redemption', () => {
  assert.doesNotThrow(() =>
    voucherPayment.assertVoucherInvoiceRedeemable(redeemableParams(), CID),
  );
});

test('assertVoucherInvoiceRedeemable rejects a wrong contract binding', () => {
  const policy = programPolicy({ contractId: 'C' + 'Z'.repeat(55) });
  assert.throws(
    () => voucherPayment.assertVoucherInvoiceRedeemable(redeemableParams({ policy }), CID),
    (err) => err.financialError.code === 'validation_failed',
  );
});

test('assertVoucherInvoiceRedeemable rejects a wrong program binding', () => {
  const policy = programPolicy({ programRef: 'f'.repeat(64) });
  assert.throws(
    () => voucherPayment.assertVoucherInvoiceRedeemable(redeemableParams({ policy }), CID),
    (err) => err.financialError.code === 'validation_failed',
  );
});

test('assertVoucherInvoiceRedeemable rejects a revoked merchant with authorization_failed', () => {
  const merchant = merchantState({ authorized: false });
  assert.throws(
    () => voucherPayment.assertVoucherInvoiceRedeemable(redeemableParams({ merchant }), CID),
    (err) => err.financialError.code === 'authorization_failed',
  );
});

test('assertVoucherInvoiceRedeemable rejects an expired merchant accreditation', () => {
  const merchant = merchantState({ validUntil: NOW_SECONDS - 1 });
  assert.throws(
    () => voucherPayment.assertVoucherInvoiceRedeemable(redeemableParams({ merchant }), CID),
    (err) => err.financialError.code === 'authorization_failed',
  );
});

test('assertVoucherInvoiceRedeemable rejects a category not authorized by the program', () => {
  const invoice = signedInvoice({ category: 'electronics' });
  const merchant = merchantState({ category: 'electronics' });
  const policy = programPolicy(); // electronics not in authorizedCategories
  assert.throws(
    () => voucherPayment.assertVoucherInvoiceRedeemable(redeemableParams({ invoice, merchant, policy }), CID),
    (err) => err.financialError.code === 'validation_failed',
  );
});

test('assertVoucherInvoiceRedeemable rejects a category mismatched with the merchant accreditation', () => {
  const invoice = signedInvoice({ category: 'medicine' });
  const merchant = merchantState({ category: 'food' });
  assert.throws(
    () => voucherPayment.assertVoucherInvoiceRedeemable(redeemableParams({ invoice, merchant }), CID),
    (err) => err.financialError.code === 'validation_failed',
  );
});

test('assertVoucherInvoiceRedeemable rejects an amount over the per-transaction limit', () => {
  const policy = programPolicy({ perTransactionLimitStroops: AMOUNT_STROOPS - 1 });
  assert.throws(
    () => voucherPayment.assertVoucherInvoiceRedeemable(redeemableParams({ policy }), CID),
    (err) => err.financialError.code === 'validation_failed',
  );
});

test('assertVoucherInvoiceRedeemable rejects an amount over the entitlement balance', () => {
  const entitlement = entitlementState({ balanceStroops: AMOUNT_STROOPS - 1 });
  assert.throws(
    () => voucherPayment.assertVoucherInvoiceRedeemable(redeemableParams({ entitlement }), CID),
    (err) => err.financialError.code === 'insufficient_balance',
  );
});

test('assertVoucherInvoiceRedeemable rejects an amount over the daily limit', () => {
  const entitlement = entitlementState({ dailyLimitStroops: AMOUNT_STROOPS, spentTodayStroops: 1 });
  assert.throws(
    () => voucherPayment.assertVoucherInvoiceRedeemable(redeemableParams({ entitlement }), CID),
    (err) => err.financialError.code === 'validation_failed',
  );
});

test('assertVoucherInvoiceRedeemable rejects a redemption after program expiry', () => {
  const policy = programPolicy({ programExpiresAt: NOW_SECONDS - 1 });
  assert.throws(
    () => voucherPayment.assertVoucherInvoiceRedeemable(redeemableParams({ policy }), CID),
    (err) => err.financialError.code === 'validation_failed',
  );
});

test('assertVoucherInvoiceRedeemable rejects a redemption after entitlement expiry', () => {
  const entitlement = entitlementState({ expiresAt: NOW_SECONDS - 1 });
  assert.throws(
    () => voucherPayment.assertVoucherInvoiceRedeemable(redeemableParams({ entitlement }), CID),
    (err) => err.financialError.code === 'validation_failed',
  );
});

test('assertVoucherInvoiceRedeemable rejects an amount that does not equal the invoiced amount', () => {
  assert.throws(
    () => voucherPayment.assertVoucherInvoiceRedeemable(redeemableParams({ amountStroops: AMOUNT_STROOPS + 1 }), CID),
    (err) => err.financialError.code === 'validation_failed',
  );
});

// ---------------------------------------------------------------------------
// Keys + payload hash.
// ---------------------------------------------------------------------------

test('voucher payment key is deterministic and bound to the invoice id', () => {
  const invoiceId = 'e'.repeat(64);
  assert.equal(
    voucherPayment.makeVoucherPaymentKey(invoiceId),
    `voucher_redemption:invoice:${invoiceId}`,
  );
});

test('voucher payment payload hash is deterministic, 64 hex, and amount-sensitive', async () => {
  const payload = {
    organizationId: 'org-1',
    programId: 'prog-1',
    contractId: CONTRACT_ID,
    invoiceId: 'e'.repeat(64),
    beneficiaryIdentityId: 'ben-1',
    beneficiaryWallet: beneficiary.publicKey(),
    merchantSettlementWallet: merchant.publicKey(),
    entitlementId: ENTITLEMENT_ID,
    amountStroops: AMOUNT_STROOPS,
    networkPassphrase: TESTNET_PASSPHRASE,
  };
  const a = await voucherPayment.computeVoucherPaymentPayloadHash(payload);
  const b = await voucherPayment.computeVoucherPaymentPayloadHash(payload);
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
  const other = await voucherPayment.computeVoucherPaymentPayloadHash({ ...payload, amountStroops: AMOUNT_STROOPS + 1 });
  assert.notEqual(a, other);
});

// ---------------------------------------------------------------------------
// Strategy: build + verifyAndAssemble (real SDK).
// ---------------------------------------------------------------------------

// Builds a REAL Soroban authorization entry (address credential + contract-fn
// invocation) so the parser/verifier runs for real.
const buildAuthEntryXdr = ({ authorizer, contractId, functionName, nonce, sigExp }) => {
  const invocation = new xdr.SorobanAuthorizedInvocation({
    function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
      new xdr.InvokeContractArgs({
        contractAddress: Address.fromString(contractId).toScAddress(),
        functionName,
        args: [],
      }),
    ),
    subInvocations: [],
  });
  const credentials = xdr.SorobanCredentials.sorobanCredentialsAddress(
    new xdr.SorobanAddressCredentials({
      address: Address.fromString(authorizer).toScAddress(),
      nonce: xdr.Int64.fromString(nonce),
      signatureExpirationLedger: sigExp,
      signature: xdr.ScVal.scvVoid(),
    }),
  );
  const entry = new xdr.SorobanAuthorizationEntry({ credentials, rootInvocation: invocation });
  return entry.toXDR('base64');
};

// A sponsor-sourced transaction standing in for the built redemption envelope.
const buildSponsorSourcedTx = () => {
  const account = new sdk.Account(sponsor.publicKey(), '42');
  return new sdk.TransactionBuilder(account, { fee: sdk.BASE_FEE, networkPassphrase: TESTNET_PASSPHRASE })
    .addOperation(sdk.Operation.manageData({ name: 'redeem', value: 'op', source: sponsor.publicKey() }))
    .setTimeout(180)
    .build();
};

const fakeRedemptionBuilder = () => ({
  built: [],
  assembled: [],
  async build(spec, context) {
    this.built.push({ spec, context });
    const tx = buildSponsorSourcedTx();
    return {
      envelopeXdr: tx.toXDR(),
      preparedPayloadHash: tx.hash().toString('hex'),
      minLedger: null,
      maxLedger: null,
      unsignedAuthEntryXdr: buildAuthEntryXdr({
        authorizer: spec.beneficiaryWallet,
        contractId: spec.contractId,
        functionName: 'redeem',
        nonce: AUTH_NONCE,
        sigExp: SIG_EXP_LEDGER,
      }),
      signatureExpirationLedger: SIG_EXP_LEDGER,
      authNonce: AUTH_NONCE,
    };
  },
  async assemble(input) {
    this.assembled.push(input);
    return sdk.TransactionBuilder.fromXDR(input.builtEnvelopeXdr, TESTNET_PASSPHRASE);
  },
});

const fakeSubmitter = () => ({
  submitted: [],
  async submit(tx) {
    this.submitted.push(tx);
    return { transactionHash: tx.hash().toString('hex'), resultCode: 'PENDING' };
  },
});

const spec = () => ({
  contractId: CONTRACT_ID,
  sacAddress: SAC,
  sponsorSource: sponsor.publicKey(),
  beneficiaryWallet: beneficiary.publicKey(),
  merchantSettlementWallet: merchant.publicKey(),
  entitlementId: ENTITLEMENT_ID,
  invoice: signedInvoice(),
  amountStroops: AMOUNT_STROOPS,
});

const strategyContext = (over = {}) => ({
  intent: over.intent ?? {},
  config: testnetConfig(),
  guard: { assertTestnetConfig() {}, assertNetworkPassphrase() {} },
  signers: signers(),
  correlationId: CID,
});

test('strategy build returns ONLY a Soroban auth-entry signing package for the beneficiary', async () => {
  const builder = fakeRedemptionBuilder();
  const strategy = voucherPayment.createVoucherRedemptionStrategy({
    spec: spec(),
    builder,
    submitter: fakeSubmitter(),
  });
  const result = await strategy.build(strategyContext());

  assert.equal(result.network, 'stellar_testnet');
  assert.equal(result.signingPackage.kind, 'soroban_auth_entry');
  assert.equal(result.signingPackage.contractId, CONTRACT_ID);
  assert.equal(result.signingPackage.functionName, 'redeem');
  assert.equal(result.signingPackage.authorizer, beneficiary.publicKey());
  assert.equal(result.signingPackage.signatureExpirationLedger, SIG_EXP_LEDGER);
  assert.equal(result.authorizationPayload.auth_nonce, AUTH_NONCE);
  assert.equal(builder.built.length, 1);
});

const attemptFor = (built, over = {}) => ({
  id: 'attempt-1',
  correlation_id: CID,
  status: 'accepted',
  envelope_xdr: built.envelopeXdr,
  authorization_payload: {
    signature_expiration_ledger: SIG_EXP_LEDGER,
    auth_nonce: AUTH_NONCE,
  },
  ...over,
});

const verifyContext = (built, signedAuthEntryXdr, over = {}) => ({
  ...strategyContext(),
  attempt: attemptFor(built, over.attempt),
  parsedBuiltEnvelope: {
    transaction: sdk.TransactionBuilder.fromXDR(built.envelopeXdr, TESTNET_PASSPHRASE),
    isFeeBump: false,
    networkPassphrase: TESTNET_PASSPHRASE,
  },
  signed: { kind: 'soroban_auth_entry', signedAuthEntryXdr },
});

test('strategy verifyAndAssemble inserts the beneficiary auth, signs with the sponsor SOURCE, and submits', async () => {
  const builder = fakeRedemptionBuilder();
  const submitter = fakeSubmitter();
  const strategy = voucherPayment.createVoucherRedemptionStrategy({ spec: spec(), builder, submitter });
  const built = await strategy.build(strategyContext());

  const signedAuthEntryXdr = buildAuthEntryXdr({
    authorizer: beneficiary.publicKey(),
    contractId: CONTRACT_ID,
    functionName: 'redeem',
    nonce: AUTH_NONCE,
    sigExp: SIG_EXP_LEDGER,
  });

  const assembled = await strategy.verifyAndAssemble(verifyContext(built, signedAuthEntryXdr));
  assert.match(assembled.transactionHash, /^[0-9a-f]{64}$/);

  const acceptance = await assembled.submit();
  assert.equal(builder.assembled.length, 1);
  assert.equal(submitter.submitted.length, 1);
  const submittedTx = submitter.submitted[0];
  assert.equal(submittedTx.source, sponsor.publicKey());
  // The sponsor signed as source; no fee-bump wraps a Soroban redemption.
  assert.equal(submittedTx.signatures.length, 1);
  assert.equal(acceptance.resultCode, 'PENDING');
});

test('strategy verifyAndAssemble rejects an auth entry signed by the wrong wallet', async () => {
  const builder = fakeRedemptionBuilder();
  const submitter = fakeSubmitter();
  const strategy = voucherPayment.createVoucherRedemptionStrategy({ spec: spec(), builder, submitter });
  const built = await strategy.build(strategyContext());

  const wrongAuth = buildAuthEntryXdr({
    authorizer: merchant.publicKey(), // not the beneficiary
    contractId: CONTRACT_ID,
    functionName: 'redeem',
    nonce: AUTH_NONCE,
    sigExp: SIG_EXP_LEDGER,
  });

  await assert.rejects(
    () => strategy.verifyAndAssemble(verifyContext(built, wrongAuth)),
    (err) => err.financialError.code === 'authorization_failed',
  );
  assert.equal(submitter.submitted.length, 0);
});

test('strategy verifyAndAssemble rejects an auth entry whose signature-expiration ledger was altered', async () => {
  const builder = fakeRedemptionBuilder();
  const submitter = fakeSubmitter();
  const strategy = voucherPayment.createVoucherRedemptionStrategy({ spec: spec(), builder, submitter });
  const built = await strategy.build(strategyContext());

  const alteredExpiry = buildAuthEntryXdr({
    authorizer: beneficiary.publicKey(),
    contractId: CONTRACT_ID,
    functionName: 'redeem',
    nonce: AUTH_NONCE,
    sigExp: SIG_EXP_LEDGER + 1000, // longer-lived than prepared
  });

  await assert.rejects(
    () => strategy.verifyAndAssemble(verifyContext(built, alteredExpiry)),
    (err) => err.financialError.code === 'validation_failed',
  );
  assert.equal(submitter.submitted.length, 0);
});

test('strategy verifyAndAssemble rejects an auth entry whose nonce does not match intent', async () => {
  const builder = fakeRedemptionBuilder();
  const submitter = fakeSubmitter();
  const strategy = voucherPayment.createVoucherRedemptionStrategy({ spec: spec(), builder, submitter });
  const built = await strategy.build(strategyContext());

  const wrongNonce = buildAuthEntryXdr({
    authorizer: beneficiary.publicKey(),
    contractId: CONTRACT_ID,
    functionName: 'redeem',
    nonce: '111222333',
    sigExp: SIG_EXP_LEDGER,
  });

  await assert.rejects(
    () => strategy.verifyAndAssemble(verifyContext(built, wrongNonce)),
    (err) => err.financialError.code === 'validation_failed',
  );
  assert.equal(submitter.submitted.length, 0);
});

test('strategy verifyAndAssemble rejects a classic-envelope submission (auth entry required)', async () => {
  const builder = fakeRedemptionBuilder();
  const submitter = fakeSubmitter();
  const strategy = voucherPayment.createVoucherRedemptionStrategy({ spec: spec(), builder, submitter });
  const built = await strategy.build(strategyContext());

  await assert.rejects(
    () =>
      strategy.verifyAndAssemble({
        ...verifyContext(built, ''),
        signed: { kind: 'classic_envelope', signedEnvelopeXdr: 'X' },
      }),
    (err) => err.financialError.code === 'validation_failed',
  );
  assert.equal(submitter.submitted.length, 0);
});

// ---------------------------------------------------------------------------
// Orchestration: prepare / submit (mocked protocol).
// ---------------------------------------------------------------------------

const intentRecord = (overrides = {}) => ({
  id: 'intent-1',
  correlation_id: CID,
  operation_type: 'voucher_redemption',
  organization_id: 'org-1',
  program_id: 'prog-1',
  payload_hash: 'a'.repeat(64),
  amount_stroops: AMOUNT_STROOPS,
  ...overrides,
});

const attemptRecord = (overrides = {}) => ({
  id: 'attempt-1',
  correlation_id: CID,
  status: 'accepted',
  envelope_xdr: null,
  ...overrides,
});

const mockProtocol = (over = {}) => {
  const calls = { prepare: [], build: [], submit: [] };
  return {
    calls,
    async prepare(request) {
      calls.prepare.push(request);
      if (over.prepare) return over.prepare(request);
      return {
        intent: intentRecord({ amount_stroops: request.amountStroops ?? null, payload_hash: request.payloadHash }),
        idempotency: { record: { id: 'idem-1' }, isReplay: false },
        isReplay: false,
      };
    },
    async build(intent, strategy) {
      calls.build.push({ intent, strategy });
      return {
        attempt: attemptRecord({ envelope_xdr: 'BUILT' }),
        build: {},
        signingPackage: { kind: 'soroban_auth_entry' },
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
  voucherPayment.createVoucherPayment({
    protocol: over.protocol ?? mockProtocol(),
    config: testnetConfig(),
    guard: over.guard ?? importGuard(),
    signers: signers(),
    builder: over.builder ?? fakeRedemptionBuilder(),
    submitter: over.submitter ?? fakeSubmitter(),
    now: over.now ?? (() => NOW_MS),
  });

const paymentRequest = (overrides = {}) => ({
  organizationId: 'org-1',
  programId: 'prog-1',
  invoice: signedInvoice(),
  beneficiaryIdentityId: 'ben-1',
  beneficiaryWallet: beneficiary.publicKey(),
  policy: programPolicy(),
  merchant: merchantState(),
  entitlement: entitlementState(),
  amountStroops: AMOUNT_STROOPS,
  correlationId: CID,
  ...overrides,
});

test('prepare validates the invoice, binds the invoice key, and returns the beneficiary auth package', async () => {
  const protocol = mockProtocol();
  const orch = orchestrator({ protocol });
  const prepared = await orch.prepare(paymentRequest());

  assert.equal(prepared.isReplay, false);
  assert.equal(protocol.calls.prepare.length, 1);
  const req = protocol.calls.prepare[0];
  assert.equal(req.operationType, 'voucher_redemption');
  assert.equal(req.scope, 'voucher_redemption');
  assert.equal(req.amountStroops, AMOUNT_STROOPS);
  assert.equal(req.beneficiaryIdentityId, 'ben-1');
  assert.match(req.idempotencyKey, /^voucher_redemption:invoice:[0-9a-f]{64}$/);
  assert.equal(req.requestMetadata.contract_id, CONTRACT_ID);
  assert.equal(req.requestMetadata.beneficiary_wallet, beneficiary.publicKey());
  assert.equal(req.requestMetadata.merchant_settlement_wallet, merchant.publicKey());
  assert.match(req.payloadHash, /^[0-9a-f]{64}$/);
  assert.equal(protocol.calls.build.length, 1);
  assert.equal(prepared.signingPackage.kind, 'soroban_auth_entry');
  assert.equal(prepared.spec.contractId, CONTRACT_ID);
  assert.equal(prepared.spec.sponsorSource, sponsor.publicKey());
});

test('prepare rejects a used invoice nonce as invoice_used before building', async () => {
  const protocol = mockProtocol();
  const orch = orchestrator({ protocol });
  await assert.rejects(
    () => orch.prepare(paymentRequest({ nonceAlreadyUsed: true })),
    (err) => err.financialError.code === 'invoice_used',
  );
  assert.equal(protocol.calls.prepare.length, 0);
  assert.equal(protocol.calls.build.length, 0);
});

test('prepare rejects an expired invoice before building', async () => {
  const protocol = mockProtocol();
  // now is well past the ten-minute window.
  const orch = orchestrator({ protocol, now: () => ISSUED_AT_MS + 11 * 60_000 });
  await assert.rejects(
    () => orch.prepare(paymentRequest()),
    (err) => err.financialError.code === 'invoice_expired',
  );
  assert.equal(protocol.calls.prepare.length, 0);
});

test('prepare rejects a redemption to a non-allowlisted contract', async () => {
  const protocol = mockProtocol();
  const orch = orchestrator({ protocol });
  const policy = programPolicy({ contractId: 'C' + 'Z'.repeat(55) });
  await assert.rejects(() => orch.prepare(paymentRequest({ policy })));
  assert.equal(protocol.calls.prepare.length, 0);
});

test('prepare does not build a second time on an idempotent replay', async () => {
  const protocol = mockProtocol({
    prepare: () => ({ intent: intentRecord({ id: 'prior' }), idempotency: {}, isReplay: true }),
  });
  const orch = orchestrator({ protocol });
  const prepared = await orch.prepare(paymentRequest());
  assert.equal(prepared.isReplay, true);
  assert.equal(prepared.attempt, null);
  assert.equal(prepared.spec, null);
  assert.equal(protocol.calls.build.length, 0);
});

test('submit passes the beneficiary-signed auth entry through and marks submitted (never confirmed)', async () => {
  const protocol = mockProtocol();
  const orch = orchestrator({ protocol });
  const result = await orch.submit({
    intent: intentRecord(),
    attempt: attemptRecord({ envelope_xdr: 'BUILT' }),
    spec: spec(),
    signed: { kind: 'soroban_auth_entry', signedAuthEntryXdr: 'BENEFICIARY_SIGNED' },
  });
  assert.equal(result.status, 'submitted');
  assert.equal(protocol.calls.submit.length, 1);
  assert.equal(protocol.calls.submit[0].signed.signedAuthEntryXdr, 'BENEFICIARY_SIGNED');
});

test('submit fails closed when the attempt has no prepared transaction', async () => {
  const orch = orchestrator();
  await assert.rejects(
    () =>
      orch.submit({
        intent: intentRecord(),
        attempt: attemptRecord({ envelope_xdr: null }),
        spec: spec(),
        signed: { kind: 'soroban_auth_entry', signedAuthEntryXdr: 'X' },
      }),
    (err) => err.financialError.code === 'validation_failed',
  );
});

// Unit tests for voucher-program deployment + lifecycle (Task 11.2).
//
// Covers the pure gates, the OperationProtocol strategy, and the prepare/submit
// orchestration in:
//   supabase/functions/_shared/stellar/voucher-program.ts
//
// The reusable protocol is mocked for the orchestration tests (its own
// invariants are covered by edge-protocol.test.mjs); the strategy tests use the
// REAL installed Stellar SDK and the REAL TTL plan builder so transaction
// building, signing, signature verification, and the activation TTL gate run for
// real rather than against a mock.
//
// Asserts the voucher-lifecycle rules from the design:
//   - DEPLOY verifies the approved immutable WASM hash and PII-free config
//     BEFORE anything is persisted; a bad hash / PII reserves NOTHING.
//   - FUND must escrow the FULL approved budget (a partial amount is rejected).
//   - ACTIVATE is gated on the TTL activation-safety check AND on reconciliation
//     confirming full backing; either failing keeps the program inactive.
//   - ALLOCATE stays within the frozen policy and remaining funded budget.
//   - SET_MERCHANT stays within the frozen policy and is PII-free.
//   - Each operation is authorized by exactly one isolated institutional signer,
//     the sponsor only wraps a fee-bump, and submit only ever yields `submitted`.
//
// Validates: Requirements 4.2, 4.5, 5.3, 5.4, 5.6, 5.8, 5.9, 7.1, 7.2, 9.5, 9.6, 9.7
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
const ttl = await importShared('stellar/ttl-maintenance.ts');
const voucher = await importShared('stellar/voucher-program.ts');

// ---------------------------------------------------------------------------
// Fixtures.
// ---------------------------------------------------------------------------

const HORIZON = 'https://horizon-testnet.stellar.org';
const RPC = 'https://soroban-testnet.stellar.org';
const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';

const deployer = sdk.Keypair.random();
const orgTreasury = sdk.Keypair.random();
const contractAdmin = sdk.Keypair.random();
const sponsor = sdk.Keypair.random();
const beneficiary = sdk.Keypair.random();
const merchant = sdk.Keypair.random();
const issuerKeypair = sdk.Keypair.random();
const ISSUER = issuerKeypair.publicKey();

const CONTRACT_ID = 'C' + 'A'.repeat(55);
const SAC = 'C' + 'B'.repeat(55);
const WASM_HASH = 'd'.repeat(64);
const SALT = 'e'.repeat(64);
const PROGRAM_REF = 'a'.repeat(64);
const ENTITLEMENT_ID = 'b'.repeat(64);
const MERCHANT_ID = 'c'.repeat(64);

const BUDGET_STROOPS = 5_000_000_000; // 500.0000000 RCPHP

const testnetConfig = () =>
  sharedConfig.createStellarTestnetConfig({
    horizonUrl: HORIZON,
    rpcUrl: RPC,
    rcphpIssuer: ISSUER,
    rcphpSacId: SAC,
  });

const secretResolver = (role) => {
  switch (role) {
    case 'contract_deployer':
      return deployer.secret();
    case 'organization_treasury':
      return orgTreasury.secret();
    case 'contract_admin':
      return contractAdmin.secret();
    case 'sponsor':
      return sponsor.secret();
    default:
      return undefined;
  }
};

const signers = () => signersModule.createInstitutionalSignerRegistry(secretResolver);

// The network guard is created inside the orchestrator; for direct strategy
// tests we build one carrying the approved WASM hash and allowed contracts.
let networkGuardModule;
const importGuard = async () => {
  networkGuardModule ??= await importShared('stellar/network-guard.ts');
  return networkGuardModule.createNetworkGuard(testnetConfig(), {
    expectedWasmHash: WASM_HASH,
    allowedContractIds: [CONTRACT_ID],
  });
};

const programConfig = (overrides = {}) => ({
  programRef: PROGRAM_REF,
  sacAddress: SAC,
  treasury: orgTreasury.publicKey(),
  admin: contractAdmin.publicKey(),
  assetCode: 'RCPHP',
  assetIssuer: ISSUER,
  fundedBudgetStroops: BUDGET_STROOPS,
  perTransactionLimitStroops: 100_000_000,
  dailyLimitStroops: 500_000_000,
  expiresAt: 2_000_000_000,
  refundWindowLedgers: 1000,
  contractVersion: 1,
  authorizedCategories: ['food', 'medicine'],
  networkPassphrase: TESTNET_PASSPHRASE,
  ...overrides,
});

const frozenPolicy = (overrides = {}) => ({
  programRef: PROGRAM_REF,
  fundedBudgetStroops: BUDGET_STROOPS,
  perTransactionLimitStroops: 100_000_000,
  dailyLimitStroops: 500_000_000,
  authorizedCategories: ['food', 'medicine'],
  expiresAt: 2_000_000_000,
  ...overrides,
});

const entitlement = (overrides = {}) => ({
  entitlementId: ENTITLEMENT_ID,
  beneficiaryWallet: beneficiary.publicKey(),
  amountStroops: 100_000_000,
  expiresAt: 1_900_000_000,
  ...overrides,
});

const merchantAuth = (overrides = {}) => ({
  merchantId: MERCHANT_ID,
  settlementWallet: merchant.publicKey(),
  category: 'food',
  validUntil: 1_900_000_000,
  authorized: true,
  ...overrides,
});

// A healthy / archived TTL plan built by the REAL planner.
const TTL_POLICY = { refundWindowLedgers: 1000, safetyBufferLedgers: 0, alertThresholdLedgers: 0 };
const healthyPlan = () =>
  ttl.planTtlMaintenance(
    [
      { key: 'inst', kind: 'instance', liveUntilLedger: 5000 },
      { key: 'wasm', kind: 'wasm', liveUntilLedger: 5000 },
    ],
    100,
    TTL_POLICY,
  );
const archivedPlan = () =>
  ttl.planTtlMaintenance(
    [
      { key: 'inst', kind: 'instance', liveUntilLedger: 5000 },
      { key: 'wasm', kind: 'wasm', liveUntilLedger: null, archived: true },
    ],
    100,
    TTL_POLICY,
  );

const CID = 'corr-voucher-1';

// ---------------------------------------------------------------------------
// Pure gates: config PII, allocation bounds, merchant policy, activation.
// ---------------------------------------------------------------------------

test('assertProgramConfigPiiFree accepts a well-formed PII-free config', () => {
  assert.doesNotThrow(() => voucher.assertProgramConfigPiiFree(programConfig(), CID));
});

test('assertProgramConfigPiiFree rejects a non-pseudonymous program identifier', () => {
  assert.throws(
    () => voucher.assertProgramConfigPiiFree(programConfig({ programRef: 'not-hex' }), CID),
    (err) => err.financialError.code === 'validation_failed',
  );
});

test('assertProgramConfigPiiFree rejects free-text (non-code) categories', () => {
  assert.throws(
    () =>
      voucher.assertProgramConfigPiiFree(
        programConfig({ authorizedCategories: ['Fresh Produce & Meat'] }),
        CID,
      ),
    (err) => err.financialError.code === 'validation_failed',
  );
});

test('assertAllocationWithinBudget admits an allocation up to the funded budget', () => {
  assert.doesNotThrow(() =>
    voucher.assertAllocationWithinBudget(
      { fundedBudgetStroops: BUDGET_STROOPS, alreadyAllocatedStroops: BUDGET_STROOPS - 10, requestedStroops: 10 },
      CID,
    ),
  );
});

test('assertAllocationWithinBudget rejects an allocation that overcommits the escrow', () => {
  assert.throws(
    () =>
      voucher.assertAllocationWithinBudget(
        { fundedBudgetStroops: BUDGET_STROOPS, alreadyAllocatedStroops: BUDGET_STROOPS, requestedStroops: 1 },
        CID,
      ),
    (err) => err.financialError.code === 'insufficient_budget',
  );
});

test('assertEntitlementAllocationValid rejects an entitlement outliving the program', () => {
  assert.throws(
    () =>
      voucher.assertEntitlementAllocationValid(
        entitlement({ expiresAt: 2_000_000_001 }),
        frozenPolicy(),
        0,
        CID,
      ),
    (err) => err.financialError.code === 'validation_failed',
  );
});

test('assertMerchantAuthorizationValid rejects an unauthorized category on add', () => {
  assert.throws(
    () => voucher.assertMerchantAuthorizationValid(merchantAuth({ category: 'electronics' }), frozenPolicy(), CID),
    (err) => err.financialError.code === 'validation_failed',
  );
});

test('assertMerchantAuthorizationValid allows revoking without an authorized category', () => {
  assert.doesNotThrow(() =>
    voucher.assertMerchantAuthorizationValid(
      merchantAuth({ category: 'electronics', authorized: false }),
      frozenPolicy(),
      CID,
    ),
  );
});

test('assertActivationReady passes with a healthy plan and full backing', () => {
  assert.doesNotThrow(() =>
    voucher.assertActivationReady(
      { ttlPlan: healthyPlan(), confirmedBackingStroops: BUDGET_STROOPS, fundedBudgetStroops: BUDGET_STROOPS },
      CID,
    ),
  );
});

test('assertActivationReady blocks activation when contract data is archived', () => {
  assert.throws(
    () =>
      voucher.assertActivationReady(
        { ttlPlan: archivedPlan(), confirmedBackingStroops: BUDGET_STROOPS, fundedBudgetStroops: BUDGET_STROOPS },
        CID,
      ),
    (err) => err.financialError.code === 'contract_archived',
  );
});

test('assertActivationReady blocks activation when backing is short of the budget', () => {
  assert.throws(
    () =>
      voucher.assertActivationReady(
        { ttlPlan: healthyPlan(), confirmedBackingStroops: BUDGET_STROOPS - 1, fundedBudgetStroops: BUDGET_STROOPS },
        CID,
      ),
    (err) => err.financialError.code === 'insufficient_budget',
  );
});

test('payload hashes are deterministic, 64-hex, and content-sensitive', async () => {
  const spec = { kind: 'fund', contractId: CONTRACT_ID, sacAddress: SAC, from: orgTreasury.publicKey(), amountStroops: BUDGET_STROOPS };
  const a = await voucher.computeFundPayloadHash(spec);
  const b = await voucher.computeFundPayloadHash(spec);
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
  const c = await voucher.computeFundPayloadHash({ ...spec, amountStroops: BUDGET_STROOPS + 1 });
  assert.notEqual(a, c);
});

// ---------------------------------------------------------------------------
// Strategy: build + verifyAndAssemble (real SDK).
// ---------------------------------------------------------------------------

// A fake builder producing a REAL unsigned classic transaction so the
// verify/sign/fee-bump path runs for real. The transaction carries a single
// no-op manageData operation sourced by the given account.
const buildUnsignedTx = (sourceKeypair) => {
  const account = new sdk.Account(sourceKeypair.publicKey(), '10');
  const tx = new sdk.TransactionBuilder(account, { fee: sdk.BASE_FEE, networkPassphrase: TESTNET_PASSPHRASE })
    .addOperation(sdk.Operation.manageData({ name: 'voucher', value: 'op', source: sourceKeypair.publicKey() }))
    .setTimeout(180)
    .build();
  return tx;
};

const fakeBuilder = (sourceKeypair) => ({
  built: [],
  async build(spec, context) {
    this.built.push({ spec, context });
    const tx = buildUnsignedTx(sourceKeypair);
    return {
      envelopeXdr: tx.toXDR(),
      preparedPayloadHash: tx.hash().toString('hex'),
      minLedger: null,
      maxLedger: null,
      contractId: spec.kind === 'deploy' ? CONTRACT_ID : spec.contractId,
    };
  },
});

const fakeSubmitter = () => ({
  submitted: [],
  async submit(tx) {
    this.submitted.push(tx);
    return { transactionHash: tx.hash().toString('hex'), resultCode: 'PENDING' };
  },
});

const strategyContext = async (over = {}) => ({
  intent: over.intent ?? {},
  config: testnetConfig(),
  guard: await importGuard(),
  signers: signers(),
  correlationId: CID,
});

test('strategy build verifies the approved WASM hash for a deploy and returns a signing package', async () => {
  const builder = fakeBuilder(deployer);
  const strategy = voucher.createVoucherOperationStrategy({
    kind: 'deploy',
    spec: { kind: 'deploy', wasmHash: WASM_HASH, config: programConfig(), deployer: deployer.publicKey(), salt: SALT },
    builder,
    submitter: fakeSubmitter(),
  });
  const result = await strategy.build(await strategyContext());
  assert.equal(result.network, 'stellar_testnet');
  assert.equal(result.signingPackage.kind, 'classic_envelope');
  assert.equal(builder.built.length, 1);
});

test('strategy build rejects a deploy whose WASM hash is not the approved hash', async () => {
  const strategy = voucher.createVoucherOperationStrategy({
    kind: 'deploy',
    spec: { kind: 'deploy', wasmHash: 'f'.repeat(64), config: programConfig(), deployer: deployer.publicKey(), salt: SALT },
    builder: fakeBuilder(deployer),
    submitter: fakeSubmitter(),
  });
  const context = await strategyContext();
  await assert.rejects(() => strategy.build(context));
});

test('strategy verifyAndAssemble wraps an admin-signed activate in a sponsor fee-bump and submits', async () => {
  const submitter = fakeSubmitter();
  const strategy = voucher.createVoucherOperationStrategy({
    kind: 'activate',
    spec: { kind: 'activate', contractId: CONTRACT_ID, programRef: PROGRAM_REF },
    builder: fakeBuilder(contractAdmin),
    submitter,
  });
  const built = await strategy.build(await strategyContext());

  // The program administrator signs the exact built transaction.
  const signedTx = sdk.TransactionBuilder.fromXDR(built.envelopeXdr, TESTNET_PASSPHRASE);
  signedTx.sign(contractAdmin);

  const assembled = await strategy.verifyAndAssemble({
    ...(await strategyContext()),
    attempt: { envelope_xdr: built.envelopeXdr, correlation_id: CID },
    parsedBuiltEnvelope: {
      transaction: sdk.TransactionBuilder.fromXDR(built.envelopeXdr, TESTNET_PASSPHRASE),
      isFeeBump: false,
      networkPassphrase: TESTNET_PASSPHRASE,
    },
    signed: { kind: 'classic_envelope', signedEnvelopeXdr: signedTx.toXDR() },
  });

  const acceptance = await assembled.submit();
  assert.equal(submitter.submitted.length, 1);
  assert.equal(submitter.submitted[0].feeSource, sponsor.publicKey());
  assert.ok(submitter.submitted[0].innerTransaction, 'fee-bump wraps the signed inner invocation');
  assert.equal(acceptance.resultCode, 'PENDING');
});

test('strategy verifyAndAssemble rejects an operation missing the contract-authority signature', async () => {
  const submitter = fakeSubmitter();
  const strategy = voucher.createVoucherOperationStrategy({
    kind: 'activate',
    spec: { kind: 'activate', contractId: CONTRACT_ID, programRef: PROGRAM_REF },
    builder: fakeBuilder(contractAdmin),
    submitter,
  });
  const built = await strategy.build(await strategyContext());
  // Sign with the sponsor instead of the program administrator.
  const signedTx = sdk.TransactionBuilder.fromXDR(built.envelopeXdr, TESTNET_PASSPHRASE);
  signedTx.sign(sponsor);

  const context = await strategyContext();
  await assert.rejects(
    () =>
      strategy.verifyAndAssemble({
        ...context,
        attempt: { envelope_xdr: built.envelopeXdr, correlation_id: CID },
        parsedBuiltEnvelope: {
          transaction: sdk.TransactionBuilder.fromXDR(built.envelopeXdr, TESTNET_PASSPHRASE),
          isFeeBump: false,
          networkPassphrase: TESTNET_PASSPHRASE,
        },
        signed: { kind: 'classic_envelope', signedEnvelopeXdr: signedTx.toXDR() },
      }),
    (err) => err.financialError.code === 'authorization_failed',
  );
  assert.equal(submitter.submitted.length, 0);
});

// ---------------------------------------------------------------------------
// Orchestration: prepare / submit (mocked protocol).
// ---------------------------------------------------------------------------

const intentRecord = (overrides = {}) => ({
  id: 'intent-1',
  correlation_id: CID,
  operation_type: 'program_activation',
  organization_id: 'org-1',
  program_id: 'prog-1',
  payload_hash: 'a'.repeat(64),
  amount_stroops: null,
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
        intent: intentRecord({ operation_type: request.operationType, amount_stroops: request.amountStroops ?? null, payload_hash: request.payloadHash }),
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

const orchestrator = async (over = {}) =>
  voucher.createVoucherProgram({
    protocol: over.protocol ?? mockProtocol(),
    config: testnetConfig(),
    guard: await importGuard(),
    signers: signers(),
    builder: over.builder ?? fakeBuilder(contractAdmin),
    submitter: over.submitter ?? fakeSubmitter(),
    programState: over.programState,
  });

const baseRequest = (overrides = {}) => ({
  organizationId: 'org-1',
  programId: 'prog-1',
  requestedBy: 'user-1',
  correlationId: CID,
  ...overrides,
});

test('prepareDeploy reserves nothing when the WASM hash is not approved', async () => {
  const protocol = mockProtocol();
  const orch = await orchestrator({ protocol, builder: fakeBuilder(deployer) });
  await assert.rejects(() =>
    orch.prepareDeploy(
      baseRequest({
        idempotencyKey: 'voucher-deploy:prog-1',
        wasmHash: 'f'.repeat(64),
        config: programConfig(),
        deployer: deployer.publicKey(),
        salt: SALT,
      }),
    ),
  );
  assert.equal(protocol.calls.prepare.length, 0);
  assert.equal(protocol.calls.build.length, 0);
});

test('prepareDeploy persists a program_activation intent under the voucher_deploy scope and builds', async () => {
  const protocol = mockProtocol();
  const programState = { calls: [], async markInFlight(p) { this.calls.push(p); } };
  const orch = await orchestrator({ protocol, builder: fakeBuilder(deployer), programState });

  const prepared = await orch.prepareDeploy(
    baseRequest({
      idempotencyKey: 'voucher-deploy:prog-1',
      wasmHash: WASM_HASH,
      config: programConfig(),
      deployer: deployer.publicKey(),
      salt: SALT,
    }),
  );

  assert.equal(prepared.isReplay, false);
  assert.equal(protocol.calls.prepare.length, 1);
  assert.equal(protocol.calls.prepare[0].operationType, 'program_activation');
  assert.equal(protocol.calls.prepare[0].scope, 'voucher_deploy');
  assert.equal(protocol.calls.build.length, 1);
  assert.equal(programState.calls.length, 1);
  assert.equal(prepared.spec.kind, 'deploy');
});

test('prepareFund rejects a partial (non-full-budget) escrow before persisting', async () => {
  const protocol = mockProtocol();
  const orch = await orchestrator({ protocol });
  await assert.rejects(
    () =>
      orch.prepareFund(
        baseRequest({
          idempotencyKey: 'voucher-fund:prog-1',
          contractId: CONTRACT_ID,
          sacAddress: SAC,
          from: orgTreasury.publicKey(),
          amountStroops: BUDGET_STROOPS - 1,
          fundedBudgetStroops: BUDGET_STROOPS,
        }),
      ),
    (err) => err.financialError.code === 'validation_failed',
  );
  assert.equal(protocol.calls.prepare.length, 0);
});

test('prepareFund escrows the full approved budget and records the amount on the intent', async () => {
  const protocol = mockProtocol();
  const orch = await orchestrator({ protocol });
  const prepared = await orch.prepareFund(
    baseRequest({
      idempotencyKey: 'voucher-fund:prog-1',
      contractId: CONTRACT_ID,
      sacAddress: SAC,
      from: orgTreasury.publicKey(),
      amountStroops: BUDGET_STROOPS,
      fundedBudgetStroops: BUDGET_STROOPS,
    }),
  );
  assert.equal(prepared.isReplay, false);
  assert.equal(protocol.calls.prepare[0].scope, 'voucher_fund');
  assert.equal(protocol.calls.prepare[0].amountStroops, BUDGET_STROOPS);
});

test('prepareActivate blocks and persists nothing when contract data is archived', async () => {
  const protocol = mockProtocol();
  const orch = await orchestrator({ protocol });
  await assert.rejects(
    () =>
      orch.prepareActivate(
        baseRequest({
          idempotencyKey: 'voucher-activate:prog-1',
          contractId: CONTRACT_ID,
          programRef: PROGRAM_REF,
          ttlPlan: archivedPlan(),
          confirmedBackingStroops: BUDGET_STROOPS,
          fundedBudgetStroops: BUDGET_STROOPS,
        }),
      ),
    (err) => err.financialError.code === 'contract_archived',
  );
  assert.equal(protocol.calls.prepare.length, 0);
});

test('prepareActivate blocks and persists nothing when backing is short', async () => {
  const protocol = mockProtocol();
  const orch = await orchestrator({ protocol });
  await assert.rejects(
    () =>
      orch.prepareActivate(
        baseRequest({
          idempotencyKey: 'voucher-activate:prog-1',
          contractId: CONTRACT_ID,
          programRef: PROGRAM_REF,
          ttlPlan: healthyPlan(),
          confirmedBackingStroops: BUDGET_STROOPS - 1,
          fundedBudgetStroops: BUDGET_STROOPS,
        }),
      ),
    (err) => err.financialError.code === 'insufficient_budget',
  );
  assert.equal(protocol.calls.prepare.length, 0);
});

test('prepareActivate proceeds when the TTL gate and full backing are satisfied', async () => {
  const protocol = mockProtocol();
  const orch = await orchestrator({ protocol });
  const prepared = await orch.prepareActivate(
    baseRequest({
      idempotencyKey: 'voucher-activate:prog-1',
      contractId: CONTRACT_ID,
      programRef: PROGRAM_REF,
      ttlPlan: healthyPlan(),
      confirmedBackingStroops: BUDGET_STROOPS,
      fundedBudgetStroops: BUDGET_STROOPS,
    }),
  );
  assert.equal(prepared.isReplay, false);
  assert.equal(protocol.calls.prepare[0].scope, 'voucher_activate');
  assert.equal(protocol.calls.build.length, 1);
});

test('prepareAllocate rejects an over-budget entitlement before persisting', async () => {
  const protocol = mockProtocol();
  const orch = await orchestrator({ protocol });
  await assert.rejects(
    () =>
      orch.prepareAllocate(
        baseRequest({
          idempotencyKey: 'voucher-allocate:ent-1',
          contractId: CONTRACT_ID,
          entitlement: entitlement({ amountStroops: 10 }),
          policy: frozenPolicy(),
          alreadyAllocatedStroops: BUDGET_STROOPS,
        }),
      ),
    (err) => err.financialError.code === 'insufficient_budget',
  );
  assert.equal(protocol.calls.prepare.length, 0);
});

test('prepareAllocate persists a voucher_allocation intent within the frozen policy', async () => {
  const protocol = mockProtocol();
  const orch = await orchestrator({ protocol });
  const prepared = await orch.prepareAllocate(
    baseRequest({
      idempotencyKey: 'voucher-allocate:ent-1',
      contractId: CONTRACT_ID,
      entitlement: entitlement(),
      policy: frozenPolicy(),
      alreadyAllocatedStroops: 0,
    }),
  );
  assert.equal(prepared.isReplay, false);
  assert.equal(protocol.calls.prepare[0].operationType, 'voucher_allocation');
  assert.equal(protocol.calls.prepare[0].scope, 'voucher_allocation');
  assert.equal(protocol.calls.prepare[0].amountStroops, 100_000_000);
});

test('prepareSetMerchant rejects an unauthorized category before persisting', async () => {
  const protocol = mockProtocol();
  const orch = await orchestrator({ protocol });
  await assert.rejects(
    () =>
      orch.prepareSetMerchant(
        baseRequest({
          idempotencyKey: 'voucher-merchant:m-1',
          contractId: CONTRACT_ID,
          merchant: merchantAuth({ category: 'electronics' }),
          policy: frozenPolicy(),
        }),
      ),
    (err) => err.financialError.code === 'validation_failed',
  );
  assert.equal(protocol.calls.prepare.length, 0);
});

test('prepareSetMerchant synchronizes a valid merchant within policy', async () => {
  const protocol = mockProtocol();
  const orch = await orchestrator({ protocol });
  const prepared = await orch.prepareSetMerchant(
    baseRequest({
      idempotencyKey: 'voucher-merchant:m-1',
      contractId: CONTRACT_ID,
      merchant: merchantAuth(),
      policy: frozenPolicy(),
    }),
  );
  assert.equal(prepared.isReplay, false);
  assert.equal(protocol.calls.prepare[0].scope, 'voucher_merchant_sync');
  assert.equal(prepared.spec.kind, 'set_merchant');
});

test('a replayed idempotency key neither builds a new attempt nor re-marks the program', async () => {
  const protocol = mockProtocol({ prepare: () => ({ intent: intentRecord({ id: 'prior' }), idempotency: {}, isReplay: true }) });
  const programState = { calls: [], async markInFlight(p) { this.calls.push(p); } };
  const orch = await orchestrator({ protocol, builder: fakeBuilder(deployer), programState });
  const prepared = await orch.prepareDeploy(
    baseRequest({ idempotencyKey: 'voucher-deploy:prog-1', wasmHash: WASM_HASH, config: programConfig(), deployer: deployer.publicKey(), salt: SALT }),
  );
  assert.equal(prepared.isReplay, true);
  assert.equal(prepared.attempt, null);
  assert.equal(prepared.spec, null);
  assert.equal(protocol.calls.build.length, 0);
  assert.equal(programState.calls.length, 0);
});

test('submit signs with the operation authorizer and marks submitted (never confirmed)', async () => {
  const protocol = mockProtocol();
  const orch = await orchestrator({ protocol, builder: fakeBuilder(contractAdmin) });

  // A real unsigned activate transaction the contract-admin signer can sign.
  const unsigned = buildUnsignedTx(contractAdmin);
  const result = await orch.submit({
    kind: 'activate',
    intent: intentRecord(),
    attempt: attemptRecord({ envelope_xdr: unsigned.toXDR() }),
    spec: { kind: 'activate', contractId: CONTRACT_ID, programRef: PROGRAM_REF },
  });

  assert.equal(result.status, 'submitted');
  assert.equal(protocol.calls.submit.length, 1);
  const signed = protocol.calls.submit[0].signed;
  assert.equal(signed.kind, 'classic_envelope');
  const signedTx = sdk.TransactionBuilder.fromXDR(signed.signedEnvelopeXdr, TESTNET_PASSPHRASE);
  assert.ok(voucher.verifyTransactionSignedBy(signedTx, contractAdmin.publicKey()));
});

test('submit fails closed when the attempt has no prepared transaction', async () => {
  const orch = await orchestrator();
  await assert.rejects(
    () =>
      orch.submit({
        kind: 'activate',
        intent: intentRecord(),
        attempt: attemptRecord({ envelope_xdr: null }),
        spec: { kind: 'activate', contractId: CONTRACT_ID, programRef: PROGRAM_REF },
      }),
    (err) => err.financialError.code === 'validation_failed',
  );
});

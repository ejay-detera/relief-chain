// Integrative cash-rail safety-invariant tests (Task 10.5).
//
// Add cash activation, distribution, and payment tests covering: insufficient
// treasury, rollback, invalid wallet/enrollment, partial failure,
// duplicate/unknown submission, fee sponsorship, finality, merchant payment,
// and 2,000-recipient resumption.
//
// The Task 10 focused suites (edge-cash-activation, edge-cash-payments,
// edge-cash-reconciliation, distribution-orchestration) already prove each cash
// module's behaviour in isolation. This suite deliberately does NOT re-prove
// those unit behaviours. Instead it composes the SAME real cash modules around
// one small shared "settlement ledger" model and, for every safety-critical
// failure path in the cash rail, asserts the two guarantees Requirement 23.8
// demands:
//
//   - value conservation — the modelled on-chain balances are byte-for-byte
//     unchanged on the failing path (no value created, moved, or destroyed); and
//   - no duplicate settlement — no settlement/submission is recorded for the
//     logical operation (a refused submission never reaches the network; an
//     idempotent replay never builds or submits a second transfer; confirmed
//     cash is never reclaimed; a rejected recipient never consumes budget).
//
// Positive controls prove the ledger DOES record exactly one settlement on a
// genuine success and never a second one on a safe retry, so the conservation
// assertions are meaningful rather than trivially true.
//
// Validates: Requirements 8.9, 22.2, 23.4, 23.5, 23.8
//
// Loading convention mirrors edge-cash-activation.test.mjs / edge-safety-invariants.test.mjs:
// TypeScript modules are transpiled in-memory and imported as data: URLs,
// @supabase/supabase-js is stubbed (every client is injected), and
// @stellar/stellar-sdk resolves to the real installed package so built
// envelopes and signatures are genuine testnet bytes.

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
const dist = await importShared('stellar/distribution.ts');
const cashRecon = await importShared('stellar/cash-reconciliation.ts');

// ---------------------------------------------------------------------------
// Fixtures + real keypairs (signing/verification are genuine).
// ---------------------------------------------------------------------------

const HORIZON = 'https://horizon-testnet.stellar.org';
const RPC = 'https://soroban-testnet.stellar.org';
const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';

const orgTreasury = sdk.Keypair.random();
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
const guardStub = { assertTestnetConfig() {}, assertNetworkPassphrase() {} };

const BUDGET_STROOPS = 5_000_000_000; // 500.0000000 RCPHP
const PAY_STROOPS = 250_000_000; // 25.0000000 RCPHP
const INVOICE_ID = 'c'.repeat(64);

// ---------------------------------------------------------------------------
// Settlement ledger model.
//
// A minimal, deterministic model of the on-chain RCPHP balances plus a log of
// logical settlements. `settle` refuses a second settlement of the same logical
// operation key, so a duplicate submission of the SAME transfer is caught as a
// modelling error — exactly the invariant Requirement 23.8 protects.
// ---------------------------------------------------------------------------

const makeLedger = (initial) => {
  const balances = new Map(Object.entries(initial));
  const settlements = [];
  return {
    balances,
    settlements,
    snapshot() {
      return JSON.stringify([...balances.entries()].sort());
    },
    balanceOf(account) {
      return balances.get(account) ?? 0;
    },
    settle(from, to, amountStroops) {
      const opKey = `${from}->${to}:${amountStroops}`;
      if (settlements.some((s) => s.opKey === opKey)) {
        throw new Error(`duplicate settlement for ${opKey}`);
      }
      balances.set(from, (balances.get(from) ?? 0) - amountStroops);
      balances.set(to, (balances.get(to) ?? 0) + amountStroops);
      settlements.push({ opKey, from, to, amountStroops });
      return opKey;
    },
  };
};

const balanceLineFor = (stroops) => {
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

// A Horizon backed by the settlement ledger: reads reflect current balances,
// and a submitted (fee-bumped) payment applies exactly one logical settlement.
const ledgerHorizon = (ledger) => {
  const submitted = [];
  return {
    submitted,
    async loadAccount(accountId) {
      const account = new sdk.Account(accountId, '20');
      account.balances = [balanceLineFor(ledger.balanceOf(accountId))];
      return account;
    },
    async submitTransaction(tx) {
      submitted.push(tx);
      const inner = tx.innerTransaction ?? tx;
      const op = inner.operations[0];
      const from = op.source ?? inner.source;
      const amountStroops = activation.amountToStroops(op.amount);
      ledger.settle(from, op.destination, Number(amountStroops));
      return { hash: inner.hash().toString('hex'), successful: true };
    },
  };
};

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

const parsedEnvelope = (envelopeXdr) => ({
  transaction: sdk.TransactionBuilder.fromXDR(envelopeXdr, TESTNET_PASSPHRASE),
  isFeeBump: false,
  networkPassphrase: TESTNET_PASSPHRASE,
});

// ===========================================================================
// 1. Cash activation: insufficient treasury + rollback (inactive on failure).
// ===========================================================================

const activationContext = (ledger) => ({
  intent: intentRecord(),
  config: testnetConfig(),
  guard: guardStub,
  signers: signers(),
  correlationId: 'corr-1',
});

test('activation: an insufficient treasury reserves nothing and conserves balances (Req 23.8)', async () => {
  const ledger = makeLedger({ [orgTreasury.publicKey()]: BUDGET_STROOPS - 1, [cashTreasury.publicKey()]: 0 });
  const before = ledger.snapshot();
  const strategy = activation.createCashActivationStrategy({ horizon: ledgerHorizon(ledger) });

  await assert.rejects(
    () => strategy.build(activationContext(ledger)),
    (err) => err.financialError.code === 'insufficient_budget',
  );

  // Value conservation + no settlement: the reservation never happened.
  assert.equal(ledger.snapshot(), before);
  assert.equal(ledger.settlements.length, 0);
});

test('activation: a reservation signed by the wrong authority is refused and never settles (rollback)', async () => {
  const ledger = makeLedger({ [orgTreasury.publicKey()]: BUDGET_STROOPS, [cashTreasury.publicKey()]: 0 });
  const horizon = ledgerHorizon(ledger);
  const strategy = activation.createCashActivationStrategy({ horizon });
  const built = await strategy.build(activationContext(ledger));

  // Sign with the sponsor (fee payer) instead of the organization treasury.
  const badlySigned = sdk.TransactionBuilder.fromXDR(built.envelopeXdr, TESTNET_PASSPHRASE);
  badlySigned.sign(sponsor);

  const before = ledger.snapshot();
  await assert.rejects(
    () =>
      strategy.verifyAndAssemble({
        ...activationContext(ledger),
        attempt: attemptRecord({ envelope_xdr: built.envelopeXdr }),
        parsedBuiltEnvelope: parsedEnvelope(built.envelopeXdr),
        signed: { kind: 'classic_envelope', signedEnvelopeXdr: badlySigned.toXDR() },
      }),
    (err) => err.financialError.code === 'authorization_failed',
  );

  // The program stays inactive: nothing was submitted, balances unchanged.
  assert.equal(horizon.submitted.length, 0);
  assert.equal(ledger.snapshot(), before);
  assert.equal(ledger.settlements.length, 0);
});

test('activation: a valid reservation settles exactly once, fee paid by the isolated sponsor (Req 23.5)', async () => {
  const ledger = makeLedger({ [orgTreasury.publicKey()]: BUDGET_STROOPS, [cashTreasury.publicKey()]: 0 });
  const horizon = ledgerHorizon(ledger);
  const strategy = activation.createCashActivationStrategy({ horizon });
  const built = await strategy.build(activationContext(ledger));

  const signed = sdk.TransactionBuilder.fromXDR(built.envelopeXdr, TESTNET_PASSPHRASE);
  signed.sign(orgTreasury);

  const assembled = await strategy.verifyAndAssemble({
    ...activationContext(ledger),
    attempt: attemptRecord({ envelope_xdr: built.envelopeXdr }),
    parsedBuiltEnvelope: parsedEnvelope(built.envelopeXdr),
    signed: { kind: 'classic_envelope', signedEnvelopeXdr: signed.toXDR() },
  });
  await assembled.submit();

  // Fee sponsorship separation: the on-chain fee payer is the sponsor, never
  // the authorizing treasury.
  assert.equal(horizon.submitted[0].feeSource, sponsor.publicKey());
  // Exactly one settlement; the full budget moved treasury -> program treasury.
  assert.equal(ledger.settlements.length, 1);
  assert.equal(ledger.balanceOf(orgTreasury.publicKey()), 0);
  assert.equal(ledger.balanceOf(cashTreasury.publicKey()), BUDGET_STROOPS);
});

// ===========================================================================
// 2. Distribution validation: invalid wallet/enrollment never consumes budget.
// ===========================================================================

const PROGRAM_ID = '20000000-0000-4000-8000-000000000001';
const ORG_ID = '10000000-0000-4000-8000-000000000001';
const POLICY_VERSION = 3;

let seq = 0;
const uuid = () => {
  seq += 1;
  return `30000000-0000-4000-8000-${String(seq).padStart(12, '0')}`;
};

const makeEnrollment = (beneficiaryIdentityId, overrides = {}) => ({
  id: uuid(),
  program_id: PROGRAM_ID,
  beneficiary_identity_id: beneficiaryIdentityId,
  approval_status: 'Approved',
  allocation_amount_stroops: 1000,
  voucher_balance: 0,
  category: 'Cash',
  ...overrides,
});

const makeWallet = (ownerId, overrides = {}) => ({
  id: uuid(),
  owner_type: 'beneficiary_identity',
  owner_id: ownerId,
  purpose: 'beneficiary',
  network: 'stellar_testnet',
  verification_status: 'verified',
  is_active: true,
  address: 'GA' + 'A'.repeat(54),
  ...overrides,
});

const makeCandidate = (beneficiaryIdentityId, amountStroops, overrides = {}) => ({
  beneficiaryIdentityId,
  enrollment:
    overrides.enrollment !== undefined ? overrides.enrollment : makeEnrollment(beneficiaryIdentityId),
  wallet: overrides.wallet !== undefined ? overrides.wallet : makeWallet(beneficiaryIdentityId),
  amountStroops,
});

const distContext = (overrides = {}) => ({
  organizationId: ORG_ID,
  programId: PROGRAM_ID,
  policyVersion: POLICY_VERSION,
  network: 'stellar_testnet',
  availableBudgetStroops: 1_000_000,
  ...overrides,
});

test('distribution: invalid wallet/enrollment recipients are rejected and consume no budget (Req 8.9)', () => {
  const candidates = [
    makeCandidate('ok', 400),
    makeCandidate('no-enroll', 400, { enrollment: null }),
    makeCandidate('unverified', 400, {
      wallet: makeWallet('unverified', { verification_status: 'pending' }),
    }),
    makeCandidate('wrong-owner', 400, { wallet: makeWallet('someone-else') }),
  ];
  const result = dist.validateRecipients(candidates, distContext());

  // Only the clean recipient is valid; the invalid ones are partitioned out.
  assert.deepEqual(result.valid.map((v) => v.beneficiaryIdentityId), ['ok']);
  // Budget conservation: only the valid recipient's amount is committed.
  assert.equal(result.totalValidAmountStroops, 400);
  const codes = new Map(result.rejected.map((r) => [r.beneficiaryIdentityId, r.failureCode]));
  assert.equal(codes.get('no-enroll'), 'enrollment_missing');
  assert.equal(codes.get('unverified'), 'wallet_not_verified');
  assert.equal(codes.get('wrong-owner'), 'wallet_not_beneficiary_owned');
});

test('distribution: a duplicate recipient claims no second key (no duplicate settlement, Req 23.8)', () => {
  const claimedKey = dist.makeDistributionRecipientKey(PROGRAM_ID, 'prior', POLICY_VERSION);
  const candidates = [
    makeCandidate('prior', 100), // already claimed by a prior job
    makeCandidate('dup', 100),
    makeCandidate('dup', 100), // repeated within this set
  ];
  const result = dist.validateRecipients(
    candidates,
    distContext({ claimedRecipientKeys: new Set([claimedKey]) }),
  );

  // The prior claim and the in-set repeat are both refused; one net transfer.
  assert.equal(result.valid.length, 1);
  assert.equal(result.valid[0].beneficiaryIdentityId, 'dup');
  assert.equal(result.rejected.filter((r) => r.failureCode === 'duplicate_recipient').length, 2);
});

// ===========================================================================
// 3. Distribution execution: partial failure + 2,000-recipient resumption.
// ===========================================================================

const makeWork = (id, amountStroops = 100) => ({
  recipientId: id,
  beneficiaryIdentityId: `ben-${id}`,
  destinationWalletId: `wallet-${id}`,
  amountStroops,
  idempotencyKey: dist.makeDistributionRecipientKey(PROGRAM_ID, `ben-${id}`, POLICY_VERSION),
});

test('distribution: one failing recipient never blocks or double-settles the rest (Req 8.9, 22.4)', async () => {
  const ledger = makeLedger({});
  const works = [makeWork('a'), makeWork('boom'), makeWork('c')];

  const report = await dist.executeRecipientBatch(works, 2, async (work) => {
    if (work.recipientId === 'boom') {
      return { kind: 'failed', failureCode: 'submission_rejected', failureReason: 'network said no' };
    }
    // A submitted recipient records exactly one modelled settlement.
    ledger.settle(cashTreasury.publicKey(), `wallet-${work.recipientId}`, work.amountStroops);
    return { kind: 'submitted', transactionHash: `hash-${work.recipientId}` };
  });

  assert.deepEqual(report.submitted.map((s) => s.recipientId).sort(), ['a', 'c']);
  assert.deepEqual(report.failed.map((f) => f.recipientId), ['boom']);
  // The failed recipient created no settlement; the confirmed ones are intact.
  assert.equal(ledger.settlements.length, 2);
  assert.equal(ledger.balanceOf('wallet-boom'), 0);
});

test('distribution: resumption selects only pending/failed and preserves confirmed (Req 22.2)', () => {
  const recipients = [
    { id: 'r1', status: 'confirmed' },
    { id: 'r2', status: 'failed' },
    { id: 'r3', status: 'pending' },
    { id: 'r4', status: 'submitted' },
    { id: 'r5', status: 'cancelled' },
  ];
  const resumable = dist.selectResumableRecipients(recipients);
  // Confirmed/submitted/cancelled are never re-attempted -> no double-pay.
  assert.deepEqual(resumable.map((r) => r.id), ['r2', 'r3']);
});

test('distribution: a >=2,000-recipient job resumes across bounded batches with per-item isolation (Req 22.2)', async () => {
  const works = Array.from({ length: dist.MIN_SUPPORTED_RECIPIENTS }, (_, i) => makeWork(String(i)));
  const settledRecipients = new Set();
  let processed = 0;

  const report = await dist.runDistributionExecution({
    works,
    batchSize: 100,
    maxConcurrency: 10,
    processor: async (work) => {
      processed += 1;
      if (work.recipientId === '1234') {
        return { kind: 'failed', failureCode: 'insufficient_balance', failureReason: 'short' };
      }
      // Idempotent guard: a recipient is settled at most once.
      assert.equal(settledRecipients.has(work.recipientId), false);
      settledRecipients.add(work.recipientId);
      return { kind: 'submitted', transactionHash: `h${work.recipientId}` };
    },
  });

  assert.equal(processed, 2000);
  assert.equal(report.submitted.length, 1999);
  assert.equal(report.failed.length, 1);
  assert.equal(report.failed[0].recipientId, '1234');
  // Every recipient was processed exactly once; the one failure is isolated.
  assert.equal(settledRecipients.size, 1999);
});

// ===========================================================================
// 4. Disbursement: duplicate / unknown submission never transfers twice.
// ===========================================================================

const disbIntent = (overrides = {}) => ({
  id: 'intent-1',
  correlation_id: 'corr-1',
  idempotency_key_id: 'idem-1',
  operation_type: 'cash_distribution',
  organization_id: 'org-1',
  program_id: 'prog-1',
  payload_hash: 'a'.repeat(64),
  amount_stroops: PAY_STROOPS,
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
      return { attempt: attemptRecord({ envelope_xdr: 'BUILT' }), build: {}, signingPackage: { kind: 'classic_envelope' } };
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

const disbProcessor = (protocol) => {
  const orch = disbursement.createCashDisbursement({
    protocol,
    strategy: { operationType: 'cash_distribution' },
    config: testnetConfig(),
    signers: signers(),
    signDisbursement: () => 'SIGNED',
  });
  return orch.createRecipientProcessor({
    organizationId: 'org-1',
    programId: 'prog-1',
    distributionJobId: 'job-1',
    resolveDestinationAddress: async () => beneficiary.publicKey(),
    correlationId: 'corr-1',
  });
};

const disbWork = {
  recipientId: 'rec-1',
  beneficiaryIdentityId: 'ben-1',
  destinationWalletId: 'wallet-1',
  amountStroops: PAY_STROOPS,
  idempotencyKey: 'distribution:prog-1:beneficiary:ben-1:policy:3',
};

test('disbursement: an idempotent replay reconciles before retrying and never transfers twice (Req 23.8)', async () => {
  const protocol = disbMockProtocol({
    prepare: () => ({ intent: disbIntent({ id: 'prior' }), idempotency: {}, isReplay: true }),
  });
  const outcome = await disbProcessor(protocol)(disbWork);

  // The replay is surfaced as a reconcilable failure, NOT a fresh transfer.
  assert.equal(outcome.kind, 'failed');
  assert.equal(outcome.failureCode, 'submission_unknown');
  // No second build and no second submit -> no duplicate settlement.
  assert.equal(protocol.calls.build.length, 0);
  assert.equal(protocol.calls.submit.length, 0);
});

test('disbursement: a first submission builds and submits exactly one transfer (positive control)', async () => {
  const protocol = disbMockProtocol();
  const outcome = await disbProcessor(protocol)(disbWork);
  assert.equal(outcome.kind, 'submitted');
  assert.equal(protocol.calls.build.length, 1);
  assert.equal(protocol.calls.submit.length, 1);
});

// ===========================================================================
// 5. Merchant payment: happy path + rejection (sponsor cannot authorize).
// ===========================================================================

const payIntent = (overrides = {}) => ({
  id: 'intent-2',
  correlation_id: 'corr-2',
  idempotency_key_id: 'idem-2',
  operation_type: 'cash_payment',
  organization_id: 'org-1',
  program_id: null,
  payload_hash: 'a'.repeat(64),
  amount_stroops: PAY_STROOPS,
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

const payContext = (ledger) => ({
  intent: payIntent(),
  config: testnetConfig(),
  guard: guardStub,
  signers: signers(),
  correlationId: 'corr-2',
});

const buildPayment = async (ledger) => {
  const strategy = payment.createMerchantPaymentStrategy({ horizon: ledgerHorizon(ledger) });
  const built = await strategy.build(payContext(ledger));
  return { strategy, built };
};

test('merchant payment: a beneficiary-authorized invoice settles once to the merchant (happy path)', async () => {
  const ledger = makeLedger({ [beneficiary.publicKey()]: PAY_STROOPS, [merchant.publicKey()]: 0 });
  const horizon = ledgerHorizon(ledger);
  const strategy = payment.createMerchantPaymentStrategy({ horizon });
  const built = await strategy.build(payContext(ledger));

  const signed = sdk.TransactionBuilder.fromXDR(built.envelopeXdr, TESTNET_PASSPHRASE);
  signed.sign(beneficiary);

  const assembled = await strategy.verifyAndAssemble({
    ...payContext(ledger),
    attempt: attemptRecord({ envelope_xdr: built.envelopeXdr, operation_type: 'cash_payment' }),
    parsedBuiltEnvelope: parsedEnvelope(built.envelopeXdr),
    signed: { kind: 'classic_envelope', signedEnvelopeXdr: signed.toXDR() },
  });
  await assembled.submit();

  // Fee paid by sponsor; exactly one settlement beneficiary -> merchant.
  assert.equal(horizon.submitted[0].feeSource, sponsor.publicKey());
  assert.equal(ledger.settlements.length, 1);
  assert.equal(ledger.balanceOf(beneficiary.publicKey()), 0);
  assert.equal(ledger.balanceOf(merchant.publicKey()), PAY_STROOPS);
});

test('merchant payment: a payment missing the beneficiary signature is refused and never settles (Req 23.8)', async () => {
  const ledger = makeLedger({ [beneficiary.publicKey()]: PAY_STROOPS, [merchant.publicKey()]: 0 });
  const horizon = ledgerHorizon(ledger);
  const strategy = payment.createMerchantPaymentStrategy({ horizon });
  const built = await strategy.build(payContext(ledger));

  // Only the sponsor (fee payer) signs; the sponsor can never substitute for
  // the beneficiary's authorization.
  const signed = sdk.TransactionBuilder.fromXDR(built.envelopeXdr, TESTNET_PASSPHRASE);
  signed.sign(sponsor);

  const before = ledger.snapshot();
  await assert.rejects(
    () =>
      strategy.verifyAndAssemble({
        ...payContext(ledger),
        attempt: attemptRecord({ envelope_xdr: built.envelopeXdr, operation_type: 'cash_payment' }),
        parsedBuiltEnvelope: parsedEnvelope(built.envelopeXdr),
        signed: { kind: 'classic_envelope', signedEnvelopeXdr: signed.toXDR() },
      }),
    (err) => err.financialError.code === 'authorization_failed',
  );

  assert.equal(horizon.submitted.length, 0);
  assert.equal(ledger.snapshot(), before);
  assert.equal(ledger.settlements.length, 0);
});

test('merchant payment: an insufficient beneficiary balance is refused and conserves value', async () => {
  const ledger = makeLedger({ [beneficiary.publicKey()]: PAY_STROOPS - 1, [merchant.publicKey()]: 0 });
  const before = ledger.snapshot();
  const strategy = payment.createMerchantPaymentStrategy({ horizon: ledgerHorizon(ledger) });
  await assert.rejects(
    () => strategy.build(payContext(ledger)),
    (err) => err.financialError.code === 'insufficient_balance',
  );
  assert.equal(ledger.snapshot(), before);
  assert.equal(ledger.settlements.length, 0);
});

// ===========================================================================
// 6. Finality + MVP boundary: confirmed cash is never reclaimed, no P2P.
// ===========================================================================

test('finality: confirmed cash is final and reclaiming it fails closed (Req 23.8)', () => {
  assert.equal(cashRecon.CONFIRMED_CASH_IS_FINAL, true);
  assert.equal(cashRecon.cashReclaimableStroopsOnClosure(), 0);
  assert.throws(
    () => cashRecon.assertConfirmedCashNotReclaimed('confirmed_unrestricted_cash', 'corr'),
    (err) => err.financialError.code === 'validation_failed',
  );
  assert.throws(
    () => cashRecon.assertConfirmedCashNotReclaimed('confirmed_merchant_settlement', 'corr'),
    (err) => err.financialError.code === 'validation_failed',
  );
});

test('MVP boundary: general P2P transfers stay disabled and only audited cash paths transfer (Req 23.4)', () => {
  assert.equal(cashRecon.GENERAL_P2P_TRANSFERS_ENABLED, false);
  assert.equal(cashRecon.isPermittedCashTransfer('cash_distribution'), true);
  assert.equal(cashRecon.isPermittedCashTransfer('cash_payment'), true);
  assert.equal(cashRecon.isPermittedCashTransfer('voucher_redemption'), false);
  assert.throws(
    () => cashRecon.assertNoGeneralP2PTransfer('voucher_redemption', 'corr'),
    (err) => err.financialError.code === 'validation_failed',
  );
});

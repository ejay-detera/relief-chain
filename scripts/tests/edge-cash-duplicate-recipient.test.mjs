// Unit tests for the duplicate-recipient friendly failure (server-side UX fix).
//
// When a second distribution targets the same beneficiary, the per-recipient
// deterministic key (`distribution:<program>:beneficiary:<identity>:policy:<v>`)
// is claimed with a different payload hash, so `prepare` throws the raw
// technical conflict:
//   FinancialErrorException('validation_failed',
//     'This request reuses an idempotency key with different details. ...')
//
// That message previously flowed untouched into the recipient's `failureReason`
// and rendered verbatim in the app. These tests prove the disbursement
// recipient processor converts it into a user-friendly `duplicate_recipient`
// failure that names the already-paid amount, the prior distribution run, and
// the date — while failing open to the original error whenever the prior
// transfer cannot be resolved.
//
// Loading convention mirrors edge-cash-payments.test.mjs (transpile + inject,
// no jest/vitest).

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
const disbursement = await importShared('stellar/cash-disbursement.ts');
const idempotency = await importShared('stellar/idempotency.ts');
const errorsModule = await importShared('errors.ts');

// ---------------------------------------------------------------------------
// Fixtures.
// ---------------------------------------------------------------------------

const HORIZON = 'https://horizon-testnet.stellar.org';
const RPC = 'https://soroban-testnet.stellar.org';

const cashTreasury = sdk.Keypair.random();
const beneficiary = sdk.Keypair.random();
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

const AMOUNT_STROOPS = 250_000_000; // 25 RCPHP
const CONFLICT_MESSAGE =
  'This request reuses an idempotency key with different details. Start a new request.';
const PRIOR_JOB_ID = '123e4567-e89b-12d3-a456-426614174000';
const PRIOR_CREATED_AT = '2026-09-10T04:00:00.000Z';

const conflictError = () =>
  errorsModule.FinancialErrorException.of('validation_failed', CONFLICT_MESSAGE, {
    correlationId: 'corr-conflict',
    fieldErrors: { idempotencyKey: ['already used for a different operation'] },
  });

// Minimal Supabase query-chain mock: from().select().eq().eq().maybeSingle().
const makeServiceClient = ({ keyRow, intentRow, keyError = null, intentError = null } = {}) => {
  const calls = [];
  return {
    calls,
    from(table) {
      const filters = [];
      const builder = {
        select(columns) {
          calls.push({ table, columns });
          return builder;
        },
        eq(column, value) {
          filters.push([column, value]);
          calls.push({ table, eq: [column, value] });
          return builder;
        },
        async maybeSingle() {
          if (table === 'idempotency_keys') {
            if (keyError) return { data: null, error: keyError };
            return { data: keyRow ?? null, error: null };
          }
          if (table === 'financial_intents') {
            if (intentError) return { data: null, error: intentError };
            return { data: intentRow ?? null, error: null };
          }
          return { data: null, error: null };
        },
      };
      return builder;
    },
  };
};

const disbMockProtocol = (over = {}) => {
  const calls = { prepare: [], build: [], submit: [] };
  return {
    calls,
    async prepare(request) {
      calls.prepare.push(request);
      if (over.prepare) return over.prepare(request);
      return {
        intent: { id: 'intent-1' },
        idempotency: { record: { id: 'idem-1' }, isReplay: false },
        isReplay: false,
      };
    },
    async build(intent) {
      calls.build.push({ intent });
      return {
        attempt: { id: 'attempt-1', envelope_xdr: 'BUILT' },
        build: {},
        signingPackage: { kind: 'classic_envelope' },
      };
    },
    authorize: (built) => built.signingPackage,
    async submit(context, signed) {
      calls.submit.push({ context, signed });
      return { status: 'submitted', attemptId: 'attempt-1', transactionHash: 'txhash' };
    },
    async retry() {
      throw new Error('unused');
    },
  };
};

const orchestratorWith = ({ protocol, serviceClient } = {}) =>
  disbursement.createCashDisbursement({
    protocol: protocol ?? disbMockProtocol(),
    strategy: { operationType: 'cash_distribution' },
    config: testnetConfig(),
    signers: signers(),
    signDisbursement: () => 'SIGNED',
    ...(serviceClient ? { serviceClient } : {}),
  });

const processorWith = ({ protocol, serviceClient, contextOver = {} } = {}) => {
  const orch = orchestratorWith({ protocol, serviceClient });
  return orch.createRecipientProcessor({
    organizationId: 'org-1',
    programId: 'prog-1',
    distributionJobId: 'job-new',
    resolveDestinationAddress: async () => beneficiary.publicKey(),
    correlationId: 'corr-1',
    ...(serviceClient ? { serviceClient } : {}),
    ...contextOver,
  });
};

const work = (overrides = {}) => ({
  recipientId: 'rec-1',
  beneficiaryIdentityId: 'ben-1',
  destinationWalletId: 'wallet-1',
  amountStroops: AMOUNT_STROOPS,
  idempotencyKey: 'distribution:prog-1:beneficiary:ben-1:policy:3',
  ...overrides,
});

// ---------------------------------------------------------------------------
// Tests.
// ---------------------------------------------------------------------------

test('conflict + resolvable prior job returns a friendly duplicate_recipient failure', async () => {
  const serviceClient = makeServiceClient({
    keyRow: { id: 'idem-prior' },
    intentRow: {
      distribution_job_id: PRIOR_JOB_ID,
      amount_stroops: AMOUNT_STROOPS,
      created_at: PRIOR_CREATED_AT,
    },
  });
  const protocol = disbMockProtocol({
    prepare: () => {
      throw conflictError();
    },
  });
  const processor = processorWith({ protocol, serviceClient });

  const outcome = await processor(work());

  assert.equal(outcome.kind, 'failed');
  assert.equal(outcome.failureCode, 'duplicate_recipient');
  assert.match(outcome.failureReason, /Already paid/i);
  assert.match(outcome.failureReason, /25 RCPHP/);
  assert.match(outcome.failureReason, /STL-123E4567/);
  assert.match(outcome.failureReason, /2026-09-10/);
  assert.ok(outcome.failureReason.length <= 1000);
  // The raw idempotency jargon must not leak through.
  assert.doesNotMatch(outcome.failureReason, /idempotency key/i);
});

test('conflict + unresolvable prior falls back to the original message', async () => {
  const serviceClient = makeServiceClient({ keyRow: null, intentRow: null });
  const protocol = disbMockProtocol({
    prepare: () => {
      throw conflictError();
    },
  });
  const processor = processorWith({ protocol, serviceClient });

  const outcome = await processor(work());

  assert.equal(outcome.kind, 'failed');
  assert.equal(outcome.failureReason, CONFLICT_MESSAGE);
});

test('non-conflict validation error passes through unchanged', async () => {
  const otherMessage = 'The disbursement amount must be a positive integer number of stroops.';
  const protocol = disbMockProtocol({
    prepare: () => {
      throw errorsModule.FinancialErrorException.of('validation_failed', otherMessage, {
        correlationId: 'corr-1',
      });
    },
  });
  const serviceClient = makeServiceClient({
    keyRow: { id: 'idem-prior' },
    intentRow: {
      distribution_job_id: PRIOR_JOB_ID,
      amount_stroops: AMOUNT_STROOPS,
      created_at: PRIOR_CREATED_AT,
    },
  });
  const processor = processorWith({ protocol, serviceClient });

  await assert.rejects(() => processor(work()), (err) => {
    assert.equal(err.financialError.code, 'validation_failed');
    assert.equal(err.financialError.message, otherMessage);
    return true;
  });
});

test('success path is untouched and still reports submitted', async () => {
  const protocol = disbMockProtocol();
  const processor = processorWith({ protocol });

  const outcome = await processor(work());

  assert.equal(outcome.kind, 'submitted');
  assert.equal(outcome.transactionHash, 'txhash');
  assert.equal(protocol.calls.submit.length, 1);
});

test('conflict matcher only matches payload-conflict validation errors', async () => {
  assert.equal(typeof idempotency.isIdempotencyPayloadConflictError, 'function');
  assert.equal(idempotency.isIdempotencyPayloadConflictError(conflictError()), true);
  assert.equal(
    idempotency.isIdempotencyPayloadConflictError(
      errorsModule.FinancialErrorException.of('validation_failed', 'The disbursement amount must be positive.', {
        correlationId: 'corr-1',
      }),
    ),
    false,
  );
  assert.equal(
    idempotency.isIdempotencyPayloadConflictError(
      errorsModule.FinancialErrorException.of('insufficient_budget', CONFLICT_MESSAGE, {
        correlationId: 'corr-1',
      }),
    ),
    false,
  );
  assert.equal(idempotency.isIdempotencyPayloadConflictError(new Error('boom')), false);
  assert.equal(idempotency.isIdempotencyPayloadConflictError(null), false);
});

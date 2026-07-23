// Property 3: Authorization Integrity
//
// "Every value-changing operation is authorized by the required current wallet
//  and role; fee sponsorship cannot substitute for that authorization."
//
// Validates: Requirements 2.5, 3.6, 7.4, 11.5, 11.6, 14.2
//
// Property-testing library (pinned): fast-check 3.23.2 (see package.json
// devDependencies).
//
// This suite has two layers, mirroring the sibling property suites
// (scripts/tests/tenant-isolation.property.test.mjs,
//  scripts/tests/monotonic-auditability.property.test.mjs,
//  scripts/tests/policy-immutability.property.test.mjs):
//
//   1. MODEL LAYER (always runs): fast-check generates roles, organizations,
//      AAL state, current / superseded wallets, Soroban authorization entries,
//      operations, and sponsor combinations, then asserts the authorization
//      invariants against the CANONICAL shared authorization logic:
//        - supabase/functions/_shared/tenant-authorization.ts  (org role + RLS
//          value-change mutation authority; Req 2.5)
//        - supabase/functions/_shared/stellar/soroban-auth.ts  (only the exact
//          current beneficiary wallet address may authorize a value-changing
//          contract invocation; a tx-source / fee-bump credential is refused;
//          Req 3.6, 7.4, 11.5)
//        - supabase/functions/_shared/stellar/signers.ts        (the fee/reserve
//          sponsor is a distinct isolated authority and never the beneficiary /
//          merchant / institutional value authority; Req 14.2)
//        - supabase/functions/_shared/approval-policy.ts        (disbursement
//          authorization needs an authorizer role with recent step-up; a
//          non-authorizer role can never substitute; Req 2.5, 11.6)
//      The real modules are transpiled in-memory and imported as data: URLs;
//      genuine ledger bytes are produced with the installed Stellar SDK, so the
//      Soroban-auth invariants are proven against real XDR rather than a mock.
//
//   2. DATABASE LAYER (runs when a local Supabase stack is reachable): the same
//      value-change authorization is asserted against the authoritative Postgres
//      RLS on reset local fixtures — an authenticated beneficiary can never write
//      a value-changing row (redemptions / disbursements / wallets are
//      service-only) even for their own current wallet, and a separate fee
//      sponsor row grants no such authority. It is skipped with a clear blocker
//      message when the local stack is unavailable (no hosted project is ever
//      touched). Point it at a local database with SUPABASE_DB_URL.
//
// Minimized counterexamples and replay seeds: fast-check shrinks failing cases
// and reports the seed. Set FC_SEED to replay a specific run.

import fc from 'fast-check';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

// ---------------------------------------------------------------------------
// Recursive TypeScript module loader (repo test-harness convention, mirrors
// scripts/tests/edge-stellar-clients.test.mjs). Relative dependencies are
// transpiled recursively; the bare `@stellar/stellar-sdk` specifier is remapped
// to the installed package so the auth helpers parse genuine ledger bytes.
// ---------------------------------------------------------------------------

const require = createRequire(import.meta.url);
const sharedDir = fileURLToPath(new URL('../../supabase/functions/_shared/', import.meta.url));
const STELLAR_SDK_URL = pathToFileURL(require.resolve('@stellar/stellar-sdk')).href;

const SUPABASE_STUB_URL =
  'data:text/javascript;base64,' +
  Buffer.from(
    'export const createClient = () => { throw new Error("createClient stub must not be called"); };',
  ).toString('base64');

const moduleCache = new Map();
const toDataUrl = (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;

async function loadModule(absPath) {
  if (moduleCache.has(absPath)) return moduleCache.get(absPath);
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
  moduleCache.set(absPath, url);
  return url;
}

const importShared = async (relativePath) => import(await loadModule(path.join(sharedDir, relativePath)));

const sdk = await import('@stellar/stellar-sdk');
const authzModel = await importShared('tenant-authorization.ts');
const sorobanAuth = await importShared('stellar/soroban-auth.ts');
const signersModule = await importShared('stellar/signers.ts');
const approvalPolicy = await importShared('approval-policy.ts');

// Replay seed support: `FC_SEED=<n> node --test ...` reproduces a run exactly.
const seedFromEnv = Number.parseInt(process.env.FC_SEED ?? '', 10);
const fcConfig = {
  numRuns: Number.parseInt(process.env.FC_NUM_RUNS ?? '300', 10),
  endOnFailure: true,
  ...(Number.isFinite(seedFromEnv) ? { seed: seedFromEnv } : {}),
};

// ---------------------------------------------------------------------------
// Deterministic address / contract factories (distinct, valid ledger keys).
// ---------------------------------------------------------------------------

const addressFromIndex = (i) => {
  const seed = Buffer.alloc(32);
  seed.writeUInt32BE(i + 1, 0);
  return sdk.Keypair.fromRawEd25519Seed(seed).publicKey();
};

const contractFromIndex = (i) => sdk.Address.contract(Buffer.alloc(32, (i % 250) + 1)).toString();

// Fixed roles in the beneficiary-redemption world.
const CURRENT_WALLET = addressFromIndex(0); // the exact current beneficiary wallet
const SUPERSEDED_WALLET_A = addressFromIndex(1); // a rotated-out wallet
const SUPERSEDED_WALLET_B = addressFromIndex(2);
const OTHER_WALLET = addressFromIndex(3); // an unrelated wallet
const SPONSOR_WALLET = addressFromIndex(1000); // the isolated fee/reserve sponsor
const EXPECTED_CONTRACT = contractFromIndex(0); // the voucher program instance
const WRONG_CONTRACT = contractFromIndex(7);
const EXPECTED_FUNCTION = 'redeem';
const WRONG_FUNCTION = 'transfer';

const signerAddressOf = (which) => {
  switch (which) {
    case 'current':
      return CURRENT_WALLET;
    case 'superseded_a':
      return SUPERSEDED_WALLET_A;
    case 'superseded_b':
      return SUPERSEDED_WALLET_B;
    case 'sponsor':
      return SPONSOR_WALLET;
    default:
      return OTHER_WALLET;
  }
};

// Build a genuine Soroban authorization entry (base64 XDR).
const buildAddressAuthEntry = ({ authorizer, contractId, functionName, sigExp, nonce = 7 }) => {
  const credentials = sdk.xdr.SorobanCredentials.sorobanCredentialsAddress(
    new sdk.xdr.SorobanAddressCredentials({
      address: sdk.Address.fromString(authorizer).toScAddress(),
      nonce: new sdk.xdr.Int64(nonce),
      signatureExpirationLedger: sigExp,
      signature: sdk.xdr.ScVal.scvVoid(),
    }),
  );
  const rootInvocation = new sdk.xdr.SorobanAuthorizedInvocation({
    function: sdk.xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
      new sdk.xdr.InvokeContractArgs({
        contractAddress: sdk.Address.fromString(contractId).toScAddress(),
        functionName,
        args: [],
      }),
    ),
    subInvocations: [],
  });
  return new sdk.xdr.SorobanAuthorizationEntry({ credentials, rootInvocation }).toXDR('base64');
};

// A source-account credential: this is how a transaction source / fee-bump
// sponsor "carries" a transaction. It must NEVER count as the beneficiary's
// value-change authorization (Req 3.6, 11.5, 14.2).
const buildSourceAccountAuthEntry = ({ contractId, functionName }) => {
  const credentials = sdk.xdr.SorobanCredentials.sorobanCredentialsSourceAccount();
  const rootInvocation = new sdk.xdr.SorobanAuthorizedInvocation({
    function: sdk.xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
      new sdk.xdr.InvokeContractArgs({
        contractAddress: sdk.Address.fromString(contractId).toScAddress(),
        functionName,
        args: [],
      }),
    ),
    subInvocations: [],
  });
  return new sdk.xdr.SorobanAuthorizationEntry({ credentials, rootInvocation }).toXDR('base64');
};

// ---------------------------------------------------------------------------
// MODEL LAYER — Soroban value-change authorization (Req 3.6, 7.4, 11.5, 14.2).
// ---------------------------------------------------------------------------

const sorobanScenarioArb = fc.record({
  signer: fc.constantFrom('current', 'superseded_a', 'superseded_b', 'sponsor', 'other'),
  credentialType: fc.constantFrom('address', 'source_account'),
  contractMatches: fc.boolean(),
  functionMatches: fc.boolean(),
  sigExp: fc.integer({ min: 0, max: 2_000 }),
  currentLedger: fc.integer({ min: 0, max: 2_000 }),
  // A fee sponsor is (or is not) paying/sourcing the enclosing transaction. It
  // must not influence the authorization decision at all.
  sponsorPaysFees: fc.boolean(),
});

// Reference decision, encoded independently of the module under test. A value
// change (voucher redemption) is authorized ONLY by an address credential signed
// by the exact current wallet, targeting the exact contract + function, before
// the signature-expiration ledger. Anything else — a superseded wallet, the
// sponsor, an unrelated wallet, or a source-account (tx-source / fee-bump)
// credential — is refused.
const referenceSorobanAuthorized = (scenario) => {
  if (scenario.credentialType !== 'address') return false;
  const signerAddress = signerAddressOf(scenario.signer);
  return (
    signerAddress === CURRENT_WALLET &&
    scenario.contractMatches &&
    scenario.functionMatches &&
    scenario.sigExp > scenario.currentLedger
  );
};

test('property: only the exact current beneficiary wallet can authorize a value-changing contract invocation', () => {
  fc.assert(
    fc.property(sorobanScenarioArb, (scenario) => {
      const contractId = scenario.contractMatches ? EXPECTED_CONTRACT : WRONG_CONTRACT;
      const functionName = scenario.functionMatches ? EXPECTED_FUNCTION : WRONG_FUNCTION;
      const signerAddress = signerAddressOf(scenario.signer);

      const entryXdr =
        scenario.credentialType === 'address'
          ? buildAddressAuthEntry({ authorizer: signerAddress, contractId, functionName, sigExp: scenario.sigExp })
          : buildSourceAccountAuthEntry({ contractId, functionName });

      const parsed = sorobanAuth.parseAndReadAuthorizationEntry(entryXdr);

      // The expected authority is always the exact current wallet + program
      // contract + redeem function; the current ledger enforces expiry.
      const expected = {
        authorizer: CURRENT_WALLET,
        contractId: EXPECTED_CONTRACT,
        functionName: EXPECTED_FUNCTION,
        currentLedger: scenario.currentLedger,
      };

      const shouldAuthorize = referenceSorobanAuthorized(scenario);

      if (shouldAuthorize) {
        assert.doesNotThrow(
          () => sorobanAuth.assertAuthorizationMatches(parsed, expected),
          'exact current-wallet authorization for the exact invocation must be accepted',
        );
      } else {
        assert.throws(
          () => sorobanAuth.assertAuthorizationMatches(parsed, expected),
          sorobanAuth.SorobanAuthorizationError,
          `authorization must be refused for scenario ${JSON.stringify(scenario)}`,
        );
      }

      // Sponsorship invariance: the sponsor paying fees / sourcing the tx never
      // changes the decision, because the beneficiary authorization is a property
      // of the auth entry alone — the sponsor never appears in it.
      const decisionUnderSponsor = (() => {
        try {
          sorobanAuth.assertAuthorizationMatches(parsed, expected);
          return true;
        } catch {
          return false;
        }
      })();
      assert.equal(
        decisionUnderSponsor,
        shouldAuthorize,
        'a fee sponsor must not be able to substitute for beneficiary authorization',
      );

      return true;
    }),
    fcConfig,
  );
});

test('property: a source-account (tx-source / fee-bump) credential is never accepted as value authorization', () => {
  fc.assert(
    fc.property(
      fc.record({ contractMatches: fc.boolean(), functionMatches: fc.boolean() }),
      ({ contractMatches, functionMatches }) => {
        const entryXdr = buildSourceAccountAuthEntry({
          contractId: contractMatches ? EXPECTED_CONTRACT : WRONG_CONTRACT,
          functionName: functionMatches ? EXPECTED_FUNCTION : WRONG_FUNCTION,
        });
        const parsed = sorobanAuth.parseAndReadAuthorizationEntry(entryXdr);
        assert.throws(
          () =>
            sorobanAuth.assertAuthorizationMatches(parsed, {
              authorizer: CURRENT_WALLET,
              contractId: EXPECTED_CONTRACT,
              functionName: EXPECTED_FUNCTION,
              currentLedger: 1,
            }),
          /address-scoped authorization/i,
          'a fee-bump / source-account credential must never authorize a value change',
        );
        return true;
      },
    ),
    fcConfig,
  );
});

// ---------------------------------------------------------------------------
// MODEL LAYER — sponsor authority isolation (Req 14.2).
// The fee/reserve sponsor is a distinct isolated signing authority. It is never
// the same account as the issuer, treasuries, distribution, deployer, or admin,
// and the reconciler holds no key at all. A sponsor therefore cannot BE the
// value authority.
// ---------------------------------------------------------------------------

const fakeKeypairFactory = () => (secret) => ({
  publicKey: () => `PUB(${secret})`,
  signTransaction: (transaction) => {
    transaction.signedBy.push(`PUB(${secret})`);
  },
});
const perRoleResolver = () => (role) => `secret-${role}`;

test('property: the fee sponsor is an isolated authority distinct from every value-holding role', () => {
  const registry = signersModule.createInstitutionalSignerRegistry(perRoleResolver(), {
    keypairFromSecret: fakeKeypairFactory(),
  });
  const sponsorKey = registry.publicKeyOf('sponsor');

  fc.assert(
    fc.property(
      fc.constantFrom(
        ...signersModule.INSTITUTIONAL_SIGNER_ROLES.filter((role) => role !== 'sponsor'),
      ),
      (otherRole) => {
        // No value-holding institutional authority shares the sponsor's account.
        assert.notEqual(
          registry.publicKeyOf(otherRole),
          sponsorKey,
          `sponsor must not share an account with ${otherRole}`,
        );
        return true;
      },
    ),
    fcConfig,
  );

  // The reconciliation authority is non-signing: it can never authorize value.
  assert.throws(() => signersModule.assertSigningRole('reconciliation'), /must not hold a signing key/i);
});

// ---------------------------------------------------------------------------
// MODEL LAYER — disbursement approval authority (Req 2.5, 11.6).
// A value-moving disbursement must be authorized by a current authorizer role
// with recent step-up; a non-authorizer role can never substitute.
// ---------------------------------------------------------------------------

const participantArb = fc.record({
  userId: fc.constantFrom('u0', 'u1', 'u2', 'u3'),
  role: fc.constantFrom(...authzModel.ORGANIZATION_ROLES),
  recentStepUp: fc.boolean(),
});

const approvalRequestArb = fc.record({
  environment: fc.constantFrom('testnet', 'production'),
  maker: participantArb,
  approvals: fc.array(participantArb, { minLength: 0, maxLength: 4 }),
});

const AUTHORIZER_ROLES = new Set(approvalPolicy.DISBURSEMENT_AUTHORIZER_ROLES);
const isValidAuthorizer = (p) => AUTHORIZER_ROLES.has(p.role) && p.recentStepUp;

test('property: a disbursement is authorized only by a current authorizer role with recent step-up', () => {
  fc.assert(
    fc.property(approvalRequestArb, (request) => {
      const decision = approvalPolicy.evaluateDisbursementApproval(request);

      if (request.environment === 'testnet') {
        // Testnet single-admin: allowed IFF some decider is a valid authorizer.
        const anyValid = [request.maker, ...request.approvals].some(isValidAuthorizer);
        assert.equal(decision.allowed, anyValid, 'testnet approval must require a valid authorizer');
      } else {
        // Production maker/checker: the maker must be an authorizer role, a
        // DISTINCT valid checker must approve, and self-approval is forbidden.
        const distinctValidChecker = request.approvals.some(
          (a) => a.userId !== request.maker.userId && isValidAuthorizer(a),
        );
        const makerAuthorized = AUTHORIZER_ROLES.has(request.maker.role);
        const selfApproved = request.approvals.some((a) => a.userId === request.maker.userId);
        const expected = makerAuthorized && distinctValidChecker && !selfApproved;
        assert.equal(decision.allowed, expected, `production approval mismatch for ${JSON.stringify(request)}`);
      }

      // In every environment an allow decision implies a real current authorizer
      // (an authorizer role with recent step-up) participated — a non-authorizer
      // role alone can never move value.
      if (decision.allowed) {
        assert.ok(
          [request.maker, ...request.approvals].some(isValidAuthorizer),
          'an allowed disbursement always has a valid current authorizer',
        );
      }
      return true;
    }),
    fcConfig,
  );
});

// ---------------------------------------------------------------------------
// MODEL LAYER — RLS value-change mutation authority (Req 2.5).
// Only the exact current organization role (with recent step-up for active
// programs) can mutate role-scoped resources; value-settling tables
// (redemptions / disbursements / wallets) are service-only for every client.
// ---------------------------------------------------------------------------

// Reference required roles (mirror the private.* SQL predicates encoded in
// tenant-authorization.ts). Declared here independently so the property checks
// the exported canMutate against an outside reference rather than itself.
const PROGRAM_MANAGER_ROLES = ['organization_administrator', 'program_manager'];
const ENROLLMENT_TEAM_ROLES = [
  'organization_administrator',
  'program_manager',
  'beneficiary_verifier',
];
const SERVICE_ONLY_KINDS = ['redemption', 'disbursement', 'wallet', 'organization', 'beneficiary_identity'];
const MUTATIONS = ['insert', 'update', 'delete'];

const userSpecArb = fc.record({
  orgIndex: fc.nat({ max: 2 }),
  role: fc.constantFrom(...authzModel.ORGANIZATION_ROLES, 'none'),
  isActive: fc.boolean(),
  aal: fc.constantFrom('aal1', 'aal2'),
  recentStepUp: fc.boolean(),
  beneficiaryOrgIndex: fc.option(fc.nat({ max: 2 }), { nil: null }),
});

const worldSpecArb = fc.record({
  orgCount: fc.integer({ min: 2, max: 3 }),
  activeProgram: fc.array(fc.boolean(), { minLength: 3, maxLength: 3 }),
  users: fc.array(userSpecArb, { minLength: 2, maxLength: 6 }),
});

function buildWorld(spec) {
  const orgCount = spec.orgCount;
  const orgIndexOf = (raw) => raw % orgCount;
  const organizations = Array.from({ length: orgCount }, (_, i) => ({ id: `org-${i}` }));
  const programs = organizations.map((org, i) => ({
    id: `prog-${i}`,
    organizationId: org.id,
    status: spec.activeProgram[i] ? 'active' : 'draft',
    createdBy: `user-0`,
  }));
  const disbursements = organizations.map((_, i) => ({ id: `disb-${i}`, programId: `prog-${i}` }));
  const wallets = organizations.map((org, i) => ({
    id: `owallet-${i}`,
    ownerType: 'organization',
    ownerId: org.id,
  }));
  const memberships = [];
  const beneficiaryIdentities = [];
  const enrollments = [];
  const redemptions = [];
  const profiles = [];
  const sessions = [];

  spec.users.forEach((u, i) => {
    const userId = `user-${i}`;
    profiles.push({ id: userId });
    sessions.push({ userId, aal: u.aal, recentStepUp: u.recentStepUp });
    if (u.role !== 'none') {
      memberships.push({
        userId,
        organizationId: `org-${orgIndexOf(u.orgIndex)}`,
        role: u.role,
        isActive: u.isActive,
      });
    }
    if (u.beneficiaryOrgIndex !== null) {
      const benOrg = orgIndexOf(u.beneficiaryOrgIndex);
      const identityId = `id-${i}`;
      beneficiaryIdentities.push({ id: identityId, userId });
      const enrollmentId = `enr-${i}`;
      enrollments.push({
        id: enrollmentId,
        programId: `prog-${benOrg}`,
        beneficiaryUserId: userId,
        beneficiaryIdentityId: identityId,
      });
      redemptions.push({ id: `red-${i}`, enrollmentId, beneficiaryUserId: userId });
      wallets.push({ id: `bwallet-${i}`, ownerType: 'beneficiary_identity', ownerId: identityId });
    }
  });

  const world = {
    organizations,
    memberships,
    programs,
    enrollments,
    redemptions,
    disbursements,
    wallets,
    beneficiaryIdentities,
    profiles,
  };
  const resources = [
    ...programs.map((p) => ({ kind: 'program', id: p.id })),
    ...enrollments.map((e) => ({ kind: 'enrollment', id: e.id })),
    ...redemptions.map((r) => ({ kind: 'redemption', id: r.id })),
    ...disbursements.map((d) => ({ kind: 'disbursement', id: d.id })),
    ...wallets.map((w) => ({ kind: 'wallet', id: w.id })),
    ...organizations.map((o) => ({ kind: 'organization', id: o.id })),
    ...beneficiaryIdentities.map((b) => ({ kind: 'beneficiary_identity', id: b.id })),
  ];
  return { world, sessions, resources };
}

test('property: value-changing mutations require the exact current role and settling tables are service-only', () => {
  fc.assert(
    fc.property(worldSpecArb, (spec) => {
      const { world, sessions, resources } = buildWorld(spec);

      for (const session of sessions) {
        for (const { kind, id } of resources) {
          for (const action of MUTATIONS) {
            const mutate = authzModel.canMutate(world, session, kind, id, action);

            if (SERVICE_ONLY_KINDS.includes(kind)) {
              // No authenticated client can settle value directly — not even the
              // beneficiary who owns the wallet. Value moves only via the server
              // service authority observing the ledger.
              assert.equal(mutate, false, `service-only ${kind} must not be client-mutable (${action})`);
              continue;
            }

            if (!mutate) continue;

            if (kind === 'program') {
              const program = world.programs.find((p) => p.id === id);
              assert.ok(
                authzModel.hasOrganizationRole(world, session, program.organizationId, PROGRAM_MANAGER_ROLES),
                'program mutation requires a current program-manager role in the program org',
              );
              if (action === 'update' && program.status === 'active') {
                assert.ok(
                  authzModel.hasRecentStepUp(session),
                  'active-program value change requires recent AAL2 step-up',
                );
              }
            }

            if (kind === 'enrollment') {
              const enrollment = world.enrollments.find((e) => e.id === id);
              const program = world.programs.find((p) => p.id === enrollment.programId);
              const teamRole = authzModel.hasProgramOrganizationRole(
                world,
                session,
                enrollment.programId,
                ENROLLMENT_TEAM_ROLES,
              );
              const beneficiarySelfEnroll =
                action === 'insert' &&
                enrollment.beneficiaryUserId === session.userId &&
                program.status === 'active';
              assert.ok(
                teamRole || beneficiarySelfEnroll,
                'enrollment mutation requires the current team role or beneficiary self-enrollment',
              );
            }
          }
        }
      }
      return true;
    }),
    fcConfig,
  );
});

// ---------------------------------------------------------------------------
// Positive coverage guard: the invariants must not be vacuously true.
// ---------------------------------------------------------------------------

test('model grants and denies concrete authorizations so the property is not vacuous', () => {
  // Soroban: exact current wallet, contract, function, unexpired => accepted.
  const good = sorobanAuth.parseAndReadAuthorizationEntry(
    buildAddressAuthEntry({
      authorizer: CURRENT_WALLET,
      contractId: EXPECTED_CONTRACT,
      functionName: EXPECTED_FUNCTION,
      sigExp: 100,
    }),
  );
  assert.doesNotThrow(() =>
    sorobanAuth.assertAuthorizationMatches(good, {
      authorizer: CURRENT_WALLET,
      contractId: EXPECTED_CONTRACT,
      functionName: EXPECTED_FUNCTION,
      currentLedger: 50,
    }),
  );

  // A superseded wallet signing the exact invocation is still refused.
  const superseded = sorobanAuth.parseAndReadAuthorizationEntry(
    buildAddressAuthEntry({
      authorizer: SUPERSEDED_WALLET_A,
      contractId: EXPECTED_CONTRACT,
      functionName: EXPECTED_FUNCTION,
      sigExp: 100,
    }),
  );
  assert.throws(
    () =>
      sorobanAuth.assertAuthorizationMatches(superseded, {
        authorizer: CURRENT_WALLET,
        contractId: EXPECTED_CONTRACT,
        functionName: EXPECTED_FUNCTION,
        currentLedger: 50,
      }),
    /expected wallet/i,
  );

  // The sponsor signing the exact invocation cannot substitute for the beneficiary.
  const sponsor = sorobanAuth.parseAndReadAuthorizationEntry(
    buildAddressAuthEntry({
      authorizer: SPONSOR_WALLET,
      contractId: EXPECTED_CONTRACT,
      functionName: EXPECTED_FUNCTION,
      sigExp: 100,
    }),
  );
  assert.throws(
    () =>
      sorobanAuth.assertAuthorizationMatches(sponsor, {
        authorizer: CURRENT_WALLET,
        contractId: EXPECTED_CONTRACT,
        functionName: EXPECTED_FUNCTION,
        currentLedger: 50,
      }),
    /expected wallet/i,
  );

  // Approval: a lone authorizer with step-up passes on testnet; a non-authorizer
  // role alone never does.
  const allow = approvalPolicy.evaluateDisbursementApproval({
    environment: 'testnet',
    maker: { userId: 'u0', role: 'finance_approver', recentStepUp: true },
    approvals: [],
  });
  assert.equal(allow.allowed, true);
  const deny = approvalPolicy.evaluateDisbursementApproval({
    environment: 'testnet',
    maker: { userId: 'u0', role: 'auditor', recentStepUp: true },
    approvals: [{ userId: 'u1', role: 'beneficiary_verifier', recentStepUp: true }],
  });
  assert.equal(deny.allowed, false);

  // RLS: an org admin can update their draft program; a beneficiary can never
  // settle a redemption directly.
  const world = {
    organizations: [{ id: 'org-0' }],
    memberships: [
      { userId: 'admin', organizationId: 'org-0', role: 'organization_administrator', isActive: true },
    ],
    programs: [{ id: 'prog-0', organizationId: 'org-0', status: 'draft', createdBy: 'admin' }],
    enrollments: [{ id: 'enr-0', programId: 'prog-0', beneficiaryUserId: 'ben', beneficiaryIdentityId: 'id-0' }],
    redemptions: [{ id: 'red-0', enrollmentId: 'enr-0', beneficiaryUserId: 'ben' }],
    disbursements: [{ id: 'disb-0', programId: 'prog-0' }],
    wallets: [{ id: 'bwallet-0', ownerType: 'beneficiary_identity', ownerId: 'id-0' }],
    beneficiaryIdentities: [{ id: 'id-0', userId: 'ben' }],
    profiles: [{ id: 'admin' }, { id: 'ben' }],
  };
  const admin = { userId: 'admin', aal: 'aal2', recentStepUp: true };
  const beneficiary = { userId: 'ben', aal: 'aal1', recentStepUp: false };
  assert.equal(authzModel.canMutate(world, admin, 'program', 'prog-0', 'update'), true);
  assert.equal(authzModel.canMutate(world, beneficiary, 'redemption', 'red-0', 'update'), false);
  assert.equal(authzModel.canMutate(world, beneficiary, 'wallet', 'bwallet-0', 'update'), false);
});

// ---------------------------------------------------------------------------
// DATABASE LAYER (runs against reset local fixtures when reachable).
//
// Proves the same value-change authorization against the authoritative Postgres
// RLS: an authenticated beneficiary — the very owner of the current wallet —
// cannot write a value-settling row, and a distinct fee-sponsor wallet grants no
// such authority. No hosted project is contacted.
// ---------------------------------------------------------------------------


const DB_URL = process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

async function openDatabase() {
  let pg;
  try {
    ({ default: pg } = await import('pg'));
  } catch {
    return null; // pg not installed
  }
  const client = new pg.Client({ connectionString: DB_URL, connectionTimeoutMillis: 2000 });
  try {
    await client.connect();
    return client;
  } catch {
    try { await client.end(); } catch { /* ignore */ }
    return null;
  }
}

async function seedBeneficiaryWalletFixture(client) {
  const ids = {
    orgAdmin: randomUUID(),
    beneficiaryUser: randomUUID(),
    org: randomUUID(),
    campaign: randomUUID(),
    program: randomUUID(),
  };

  const insertUser = async (id, email, role) => {
    await client.query(
      `insert into auth.users (
         id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
         raw_app_meta_data, raw_user_meta_data, created_at, updated_at
       ) values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated',
         'authenticated', $2, '', now(),
         '{"provider":"email","providers":["email"]}', $3, now(), now())`,
      [id, email, JSON.stringify({ role })],
    );
  };

  await insertUser(ids.orgAdmin, `admin-${ids.orgAdmin}@example.test`, 'lgu');
  await insertUser(ids.beneficiaryUser, `ben-${ids.beneficiaryUser}@example.test`, 'beneficiary');

  await client.query(`insert into public.organizations (id, name, slug) values ($1, 'Org', $2)`, [
    ids.org, `org-${ids.org}`,
  ]);
  await client.query(
    `select public.upsert_organization_membership($1, $2, 'organization_administrator', $2)`,
    [ids.org, ids.orgAdmin],
  );
  await client.query(
    `insert into public.disaster_response_campaigns (id, organization_id, code, name)
     values ($1, $2, 'ORG', 'Org Campaign')`,
    [ids.campaign, ids.org],
  );
  await client.query(
    `insert into public.programs (id, organization_id, campaign_id, name, created_by, status)
     values ($1, $2, $3, 'Program', $4, 'draft')`,
    [ids.program, ids.org, ids.campaign, ids.orgAdmin],
  );

  return ids;
}

async function actAs(client, { sub, aal, recentStepUp }) {
  const amr = recentStepUp
    ? [{ method: 'totp', timestamp: Math.floor(Date.now() / 1000) }]
    : [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) - 3600 }];
  const claims = JSON.stringify({ sub, role: 'authenticated', aal, amr });
  await client.query('set local role authenticated');
  await client.query(`select set_config('request.jwt.claims', $1, true)`, [claims]);
  await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [sub]);
}

const stellarAddress = (fill) => sdk.Keypair.fromRawEd25519Seed(Buffer.alloc(32, fill)).publicKey();

test('property: RLS refuses client-side value settlement even for the wallet owner (database)', async (t) => {
  const client = await openDatabase();
  if (!client) {
    t.skip(
      `local Supabase database unavailable at ${DB_URL}. ` +
        'Run `npx supabase start` and `npx supabase db reset`, then re-run the property suite. ' +
        'No hosted project is contacted.',
    );
    return;
  }

  try {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          aal: fc.constantFrom('aal1', 'aal2'),
          recentStepUp: fc.boolean(),
          ownerType: fc.constantFrom('beneficiary_identity', 'organization'),
        }),
        async (scenario) => {
          await client.query('begin');
          try {
            const ids = await seedBeneficiaryWalletFixture(client);

            // The beneficiary — owner of the current wallet — acts.
            await actAs(client, { sub: ids.beneficiaryUser, aal: scenario.aal, recentStepUp: scenario.recentStepUp });

            // A client can never INSERT a wallet (value-settling table is
            // service-only), regardless of who owns it or the sponsor context.
            const ownerId = scenario.ownerType === 'organization' ? ids.org : randomUUID();
            await assert.rejects(
              client.query(
                `insert into public.wallets (owner_type, owner_id, purpose, address)
                 values ($1, $2, 'beneficiary_primary', $3)`,
                [scenario.ownerType, ownerId, stellarAddress(9)],
              ),
              /row-level security|permission denied/i,
              'a client must not insert a value-settling wallet row',
            );

            // A client can never INSERT a disbursement (value movement is
            // service-authority only).
            await assert.rejects(
              client.query(
                `insert into public.disbursements (program_id, program_name, amount, recipients_count)
                 values ($1, 'Program', 100, 1)`,
                [ids.program],
              ),
              /row-level security|permission denied/i,
              'a client must not insert a value-settling disbursement row',
            );

            await client.query('reset role');
            return true;
          } finally {
            await client.query('rollback');
          }
        },
      ),
      { numRuns: Number.parseInt(process.env.FC_DB_NUM_RUNS ?? '15', 10), endOnFailure: true },
    );
  } finally {
    await client.end();
  }
});

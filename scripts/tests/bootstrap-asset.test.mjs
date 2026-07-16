import assert from 'node:assert/strict';
import test from 'node:test';

import {
    assertSponsorSeparation,
    buildAssetReport,
    createPilotAssetAdapter,
    DEFAULT_ISSUANCE_STROOPS,
    defaultDeriveContractId,
    formatAssetReport,
    parseStroops,
    planAssetBootstrap,
    planIssuance,
    planIssuerFlags,
    planSponsorReserves,
    planTrustlineAuthorization,
    planTrustlines,
    RCPHP_ASSET_CODE,
    resolveStellarAssetContractId,
    runAssetBootstrap,
    stroopsToClassicAmount,
    TRUSTLINE_RESERVE_STROOPS,
    verifyAssetIdentity,
    verifyStellarAssetContractId,
} from '../bootstrap-asset.mjs';
import { BootstrapConfigurationError, ROLE_DEFINITIONS } from '../bootstrap-topology.mjs';

// Deterministic offline fakes -------------------------------------------------

const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';

const publicKeyFor = (role) =>
  `G${role.toUpperCase().replace(/[^A-Z2-7]/g, 'A').padEnd(55, 'A').slice(0, 55)}`;

// A complete, distinct topology as Task 7.1 would emit (public keys only).
function fullTopologyAccounts() {
  return ROLE_DEFINITIONS.map((definition, index) => ({
    role: definition.role,
    label: definition.label,
    publicKey: `G${String.fromCharCode(65 + index).repeat(55)}`,
    mayHoldAid: definition.mayHoldAid,
    source: 'discovered',
  }));
}

function fullSecretEnvironment(overrides = {}) {
  const environment = { STELLAR_NETWORK: 'testnet', ...overrides };
  for (const definition of ROLE_DEFINITIONS) {
    const letter = String.fromCharCode(65 + ROLE_DEFINITIONS.indexOf(definition));
    environment[definition.envVar] = `S${letter.repeat(55)}`;
  }
  return environment;
}

// A shape-preserving fake public-key deriver (S... -> G...).
const fakeDerive = async (secret) => `G${secret.slice(1)}`;

const FAKE_SAC = `C${'A'.repeat(55)}`;
const fakeDeriveContractId = async () => FAKE_SAC;

// Regulated-partner adapter (Req 1.6) ----------------------------------------

test('pilot asset adapter resolves only the non-monetary RCPHP testnet asset', () => {
  const issuer = publicKeyFor('issuer');
  const adapter = createPilotAssetAdapter({ issuer });
  const asset = adapter.resolveIssuedAsset();
  assert.equal(asset.code, RCPHP_ASSET_CODE);
  assert.equal(asset.issuer, issuer);
  assert.equal(asset.network, 'testnet');
  assert.equal(asset.hasMonetaryValue, false);
});

test('pilot asset adapter fails closed on any live-PHP asset request', () => {
  const adapter = createPilotAssetAdapter({ issuer: publicKeyFor('issuer') });
  assert.throws(() => adapter.resolveLiveAsset(), (error) => {
    assert.ok(error instanceof BootstrapConfigurationError);
    assert.match(error.message, /regulated-partner adapter/);
    return true;
  });
});

test('pilot asset adapter rejects a malformed issuer', () => {
  const adapter = createPilotAssetAdapter({ issuer: 'not-a-key' });
  assert.throws(() => adapter.resolveIssuedAsset(), BootstrapConfigurationError);
});

// Identity verification -------------------------------------------------------

test('verifyAssetIdentity accepts RCPHP on testnet and rejects other codes/networks', () => {
  const issuer = publicKeyFor('issuer');
  assert.doesNotThrow(() => verifyAssetIdentity({ code: 'RCPHP', issuer, networkPassphrase: TESTNET_PASSPHRASE }));
  assert.throws(() => verifyAssetIdentity({ code: 'PHP', issuer }), BootstrapConfigurationError);
  assert.throws(() => verifyAssetIdentity({ code: 'RCPHP', issuer: 'bad' }), BootstrapConfigurationError);
  assert.throws(
    () => verifyAssetIdentity({ code: 'RCPHP', issuer, networkPassphrase: 'Public Global Stellar Network ; September 2015' }),
    BootstrapConfigurationError,
  );
});

// SAC resolution and verification (Req 7.2) ----------------------------------

test('resolveStellarAssetContractId returns a C-address using the injected deriver', async () => {
  const sac = await resolveStellarAssetContractId({
    code: 'RCPHP',
    issuer: publicKeyFor('issuer'),
    networkPassphrase: TESTNET_PASSPHRASE,
    deriveContractId: fakeDeriveContractId,
  });
  assert.equal(sac, FAKE_SAC);
});

test('resolveStellarAssetContractId rejects a malformed derived address', async () => {
  await assert.rejects(
    () =>
      resolveStellarAssetContractId({
        code: 'RCPHP',
        issuer: publicKeyFor('issuer'),
        networkPassphrase: TESTNET_PASSPHRASE,
        deriveContractId: async () => 'not-a-contract',
      }),
    BootstrapConfigurationError,
  );
});

test('verifyStellarAssetContractId accepts a matching SAC and rejects a mismatch', async () => {
  const args = {
    code: 'RCPHP',
    issuer: publicKeyFor('issuer'),
    networkPassphrase: TESTNET_PASSPHRASE,
    deriveContractId: fakeDeriveContractId,
  };
  assert.equal(await verifyStellarAssetContractId({ ...args, expected: FAKE_SAC }), FAKE_SAC);
  await assert.rejects(
    () => verifyStellarAssetContractId({ ...args, expected: `C${'B'.repeat(55)}` }),
    (error) => {
      assert.ok(error instanceof BootstrapConfigurationError);
      assert.match(error.message, /does not match the canonical address/);
      return true;
    },
  );
});

test('defaultDeriveContractId derives a canonical SAC via the real SDK (offline crypto)', async () => {
  const issuer = 'GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ';
  const sac = await defaultDeriveContractId('RCPHP', issuer, TESTNET_PASSPHRASE);
  assert.match(sac, /^C[A-Z2-7]{55}$/);
  // Deterministic: same inputs derive the same address.
  assert.equal(await defaultDeriveContractId('RCPHP', issuer, TESTNET_PASSPHRASE), sac);
});

// Stroop/amount helpers -------------------------------------------------------

test('parseStroops validates positive integer stroops and rejects junk', () => {
  assert.equal(parseStroops('10000000'), 10_000_000n);
  assert.throws(() => parseStroops('0'), BootstrapConfigurationError);
  assert.throws(() => parseStroops('-5'), BootstrapConfigurationError);
  assert.throws(() => parseStroops('1.5'), BootstrapConfigurationError);
  assert.throws(() => parseStroops('9223372036854775808'), BootstrapConfigurationError);
});

test('stroopsToClassicAmount formats 7-decimal amounts and trims zeros', () => {
  assert.equal(stroopsToClassicAmount(10_000_000n), '1');
  assert.equal(stroopsToClassicAmount(DEFAULT_ISSUANCE_STROOPS), '100000');
  assert.equal(stroopsToClassicAmount(15_000_000n), '1.5');
  assert.equal(stroopsToClassicAmount(1n), '0.0000001');
});

// Issuance planning (Req 1.2, 1.5, 6.1) --------------------------------------

test('planIssuance plans an RCPHP payment from issuer to distribution', () => {
  const issuer = publicKeyFor('issuer');
  const distribution = publicKeyFor('distribution');
  const plan = planIssuance({ issuer, distribution, amountStroops: 20_000_000n });
  assert.equal(plan.type, 'issue_rcphp');
  assert.equal(plan.from, issuer);
  assert.equal(plan.to, distribution);
  assert.equal(plan.asset.code, 'RCPHP');
  assert.equal(plan.asset.issuer, issuer);
  assert.equal(plan.amount, '2');
  assert.equal(plan.requiresAuthorizedTrustline, distribution);
});

test('planIssuance rejects issuer/distribution collision (separation of duties)', () => {
  const key = publicKeyFor('issuer');
  assert.throws(() => planIssuance({ issuer: key, distribution: key }), BootstrapConfigurationError);
});

// Trustline planning ----------------------------------------------------------

test('planTrustlines includes only aid-holding non-issuer accounts', () => {
  const accounts = fullTopologyAccounts();
  const issuer = accounts.find((a) => a.role === 'issuer').publicKey;
  const trustlines = planTrustlines({ accounts, issuer });
  const roles = trustlines.map((t) => t.role).sort();
  assert.deepEqual(roles, ['beneficiary', 'cash_program_treasury', 'distribution', 'merchant', 'organization_treasury'].sort());
  // Issuer, sponsor, and contract deployer never receive an RCPHP trustline.
  assert.equal(trustlines.some((t) => ['issuer', 'sponsor', 'contract_deployer'].includes(t.role)), false);
});

test('planIssuerFlags sets AUTH_REQUIRED and never enables clawback', () => {
  const flags = planIssuerFlags();
  assert.deepEqual(flags.setFlags, ['AUTH_REQUIRED']);
  assert.equal(flags.clawbackEnabled, false);
});

test('planTrustlineAuthorization authorizes each holder under AUTH_REQUIRED', () => {
  const accounts = fullTopologyAccounts();
  const issuer = accounts.find((a) => a.role === 'issuer').publicKey;
  const trustlines = planTrustlines({ accounts, issuer });
  const authorized = planTrustlineAuthorization({ issuer, trustlines, authRequired: true });
  assert.equal(authorized.length, trustlines.length);
  assert.equal(authorized.every((entry) => entry.authorize === true && entry.issuer === issuer), true);
  // With AUTH_REQUIRED disabled, no authorization ops are planned.
  assert.equal(planTrustlineAuthorization({ issuer, trustlines, authRequired: false }).length, 0);
});

// Sponsor reserve planning (Req 14.1, 14.2, 14.4, 14.7) ----------------------

test('assertSponsorSeparation rejects a sponsor that shares another role account', () => {
  const accounts = fullTopologyAccounts();
  const sponsor = accounts.find((a) => a.role === 'sponsor').publicKey;
  assert.doesNotThrow(() => assertSponsorSeparation({ sponsor, accounts }));
  const collision = accounts.map((a) => (a.role === 'beneficiary' ? { ...a, publicKey: sponsor } : a));
  assert.throws(() => assertSponsorSeparation({ sponsor, accounts: collision }), BootstrapConfigurationError);
});

test('planSponsorReserves sponsors one trustline reserve per holder', () => {
  const accounts = fullTopologyAccounts();
  const issuer = accounts.find((a) => a.role === 'issuer').publicKey;
  const sponsor = accounts.find((a) => a.role === 'sponsor').publicKey;
  const trustlines = planTrustlines({ accounts, issuer });
  const plan = planSponsorReserves({ sponsor, trustlines, accounts });
  assert.equal(plan.sponsored.length, trustlines.length);
  assert.equal(plan.sponsor, sponsor);
  const expected = (TRUSTLINE_RESERVE_STROOPS * BigInt(trustlines.length)).toString();
  assert.equal(plan.totalReserveStroops, expected);
});

// Full plan and report --------------------------------------------------------

test('planAssetBootstrap composes a complete, separated asset plan', () => {
  const accounts = fullTopologyAccounts();
  const plan = planAssetBootstrap({ accounts, sac: FAKE_SAC, amountStroops: DEFAULT_ISSUANCE_STROOPS });
  assert.equal(plan.asset.code, 'RCPHP');
  assert.equal(plan.sac, FAKE_SAC);
  assert.equal(plan.issuance.to, accounts.find((a) => a.role === 'distribution').publicKey);
  assert.equal(plan.trustlines.length, 5);
  assert.equal(plan.authorization.length, 5);
});

test('buildAssetReport and formatAssetReport emit public identifiers with no secrets', () => {
  const accounts = fullTopologyAccounts();
  const plan = planAssetBootstrap({ accounts, sac: FAKE_SAC });
  const report = buildAssetReport(plan, { executed: false });
  assert.equal(report.asset.hasMonetaryValue, false);
  assert.equal(report.asset.stellarAssetContractId, FAKE_SAC);
  const text = formatAssetReport(report);
  assert.match(text, /RCPHP/);
  assert.match(text, /no real monetary value/);
  assert.doesNotMatch(text, /\bS[A-Z2-7]{55}\b/);
});

// Orchestration ---------------------------------------------------------------

test('runAssetBootstrap dry run resolves the SAC and plans everything offline', async () => {
  const environment = fullSecretEnvironment();
  const { report } = await runAssetBootstrap({
    environment,
    execute: false,
    derivePublicKey: fakeDerive,
    deriveContractId: fakeDeriveContractId,
    provisionOnChain: () => {
      throw new Error('network must not be called in a dry run');
    },
  });
  assert.equal(report.executed, false);
  assert.equal(report.asset.stellarAssetContractId, FAKE_SAC);
  assert.equal(report.trustlines.length, 5);
  assert.equal(report.steps.length, 0);
});

test('runAssetBootstrap blocks when the topology is incomplete (run 7.1 first)', async () => {
  const environment = { STELLAR_NETWORK: 'testnet', STELLAR_ISSUER_SECRET: `S${'A'.repeat(55)}` };
  await assert.rejects(
    () => runAssetBootstrap({ environment, derivePublicKey: fakeDerive, deriveContractId: fakeDeriveContractId }),
    (error) => {
      assert.ok(error instanceof BootstrapConfigurationError);
      assert.match(error.message, /topology is incomplete/);
      return true;
    },
  );
});

test('runAssetBootstrap fails closed when a configured SAC does not match the canonical address', async () => {
  const environment = fullSecretEnvironment({ STELLAR_RCPHP_SAC_ID: `C${'Z'.repeat(55)}` });
  await assert.rejects(
    () =>
      runAssetBootstrap({
        environment,
        derivePublicKey: fakeDerive,
        deriveContractId: fakeDeriveContractId,
      }),
    (error) => {
      assert.match(error.message, /does not match the canonical address/);
      return true;
    },
  );
});

test('runAssetBootstrap execute delegates to the injected provisioner and reports steps', async () => {
  const environment = fullSecretEnvironment();
  const provisionOnChain = async ({ plan }) => [
    { step: 'set_issuer_flags', status: 'ok' },
    { step: `issue_${plan.asset.code}`, status: 'ok' },
  ];
  const { report } = await runAssetBootstrap({
    environment,
    execute: true,
    derivePublicKey: fakeDerive,
    deriveContractId: fakeDeriveContractId,
    provisionOnChain,
  });
  assert.equal(report.executed, true);
  assert.equal(report.steps.length, 2);
  assert.equal(report.steps.every((step) => step.status === 'ok'), true);
});

test('runAssetBootstrap default provisioner reports an explicit live-execution blocker', async () => {
  const environment = fullSecretEnvironment();
  await assert.rejects(
    () =>
      runAssetBootstrap({
        environment,
        execute: true,
        derivePublicKey: fakeDerive,
        deriveContractId: fakeDeriveContractId,
      }),
    (error) => {
      assert.ok(error instanceof BootstrapConfigurationError);
      assert.match(error.message, /Live RCPHP provisioning requires/);
      return true;
    },
  );
});

test('runAssetBootstrap fails closed on a non-testnet environment', async () => {
  await assert.rejects(
    () => runAssetBootstrap({ environment: { STELLAR_NETWORK: 'public' }, derivePublicKey: fakeDerive }),
    BootstrapConfigurationError,
  );
});

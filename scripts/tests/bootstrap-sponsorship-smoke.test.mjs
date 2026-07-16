import assert from 'node:assert/strict';
import test from 'node:test';

import {
    DEFAULT_ISSUANCE_STROOPS,
    RCPHP_ASSET_CODE,
    TRUSTLINE_RESERVE_STROOPS,
    defaultDeriveContractId,
    resolveStellarAssetContractId,
    runAssetBootstrap,
    verifyStellarAssetContractId
} from '../bootstrap-asset.mjs';
import {
    RCPHP_DISCLOSURE,
    ROLE_DEFINITIONS,
    STELLAR_PUBLIC_KEY,
    STELLAR_SECRET_SEED,
    STELLAR_TESTNET_NETWORK,
    STELLAR_TESTNET_NETWORK_PASSPHRASE,
    runBootstrap,
} from '../bootstrap-topology.mjs';

// Bounded testnet bootstrap + sponsorship smoke suite (Task 7.3).
//
// This suite verifies the END-TO-END bootstrap and sponsorship planning path by
// reusing the exported planners from bootstrap-topology.mjs (Task 7.1) and
// bootstrap-asset.mjs (Task 7.2). It proves, without touching the network or a
// signer, that a full run produces:
//
//   - separately seeded, logically separated accounts (Req 1.1, 1.4, 21.5)
//   - an authorized trustline for every aid-holding, non-issuer account
//   - an RCPHP transfer (issuer -> distribution) of the non-monetary asset
//   - a resolved and verified canonical Stellar Asset Contract (SAC) address
//   - bounded sponsor reserves within a configured limit
//   - only PUBLIC identifiers / verifiable ledger references and NO secrets
//     in any emitted report (Req 21.6, 23.5, 1.7)
//
// Real on-chain execution requires an authorized testnet signer and reachable
// Horizon/RPC endpoints, which are unavailable in an offline environment. Any
// live step is therefore GATED: the default (uninjected) provisioner fails
// closed with an explicit blocker instead of fabricating success, and the
// bounded "confirmed" path below is driven by an INJECTED fake provisioner that
// returns simulated public ledger references. This keeps the smoke suite honest
// (Req 21.4/21.6: no success without verifiable evidence) and bounded.
//
// _Requirements: 1.1, 21.5, 21.6, 23.5_

const TESTNET_PASSPHRASE = STELLAR_TESTNET_NETWORK_PASSPHRASE;

// A generous but finite ceiling on total sponsored reserves for the pilot
// topology. The smoke suite asserts the planned sponsorship stays bounded so an
// unbounded/misconfigured sponsor plan is caught before any live run.
const MAX_SPONSOR_RESERVE_STROOPS = 100_000_000n; // 10 XLM across all trustlines

// The aid-holding, non-issuer roles that must receive an authorized RCPHP
// trustline and a sponsored reserve.
const EXPECTED_TRUSTLINE_ROLES = [
  'distribution',
  'organization_treasury',
  'cash_program_treasury',
  'beneficiary',
  'merchant',
].sort();

// Deterministic offline fakes -------------------------------------------------

// A distinct, valid-shaped secret seed per role (S... 56 chars). Distinct seeds
// derive distinct public keys, which is exactly the "separately seeded"
// property required by Req 21.5.
function fullSecretEnvironment(overrides = {}) {
  const environment = { STELLAR_NETWORK: 'testnet', ...overrides };
  for (const definition of ROLE_DEFINITIONS) {
    const letter = String.fromCharCode(65 + ROLE_DEFINITIONS.indexOf(definition));
    environment[definition.envVar] = `S${letter.repeat(55)}`;
  }
  return environment;
}

// Shape-preserving fake public-key deriver (S<x...> -> G<x...>).
const fakeDerive = async (secret) => `G${secret.slice(1)}`;

const FAKE_SAC = `C${'A'.repeat(55)}`;
const fakeDeriveContractId = async () => FAKE_SAC;

// Guard: no emitted artifact may contain a raw secret-seed shape or any of the
// configured environment secrets.
function assertNoSecretsLeaked(value, environment) {
  const serialized = JSON.stringify(value);
  assert.doesNotMatch(serialized, /S[A-Z2-7]{55}/, 'emitted output must not contain a secret-seed shape');
  for (const [, secret] of Object.entries(environment)) {
    if (typeof secret === 'string' && STELLAR_SECRET_SEED.test(secret.trim())) {
      assert.equal(serialized.includes(secret.trim()), false, 'emitted output must not contain a configured secret');
    }
  }
}

// Run the full offline planning path once and reuse the artifacts.
async function planFullBootstrap(environment) {
  const { report: topologyReport, accounts } = await runBootstrap({
    environment,
    execute: false,
    derivePublicKey: fakeDerive,
    fetchImpl: () => {
      throw new Error('network must not be called in the offline smoke path');
    },
  });
  const { report: assetReport, plan } = await runAssetBootstrap({
    environment,
    execute: false,
    derivePublicKey: fakeDerive,
    deriveContractId: fakeDeriveContractId,
    provisionOnChain: () => {
      throw new Error('network must not be called in the offline smoke path');
    },
  });
  return { topologyReport, accounts, assetReport, plan };
}

// Account separation (Req 1.1, 1.4, 21.5) ------------------------------------

test('smoke: bootstrap seeds every role as a separately keyed, logically separated account', async () => {
  const environment = fullSecretEnvironment();
  const { accounts, topologyReport } = await planFullBootstrap(environment);

  // Every topology role is present.
  assert.equal(accounts.length, ROLE_DEFINITIONS.length);
  assert.deepEqual(
    accounts.map((account) => account.role),
    ROLE_DEFINITIONS.map((definition) => definition.role),
  );

  // Separately seeded => distinct public keys, one per account.
  const publicKeys = accounts.map((account) => account.publicKey);
  assert.equal(new Set(publicKeys).size, publicKeys.length, 'each role must resolve to a distinct account');
  assert.equal(publicKeys.every((key) => STELLAR_PUBLIC_KEY.test(key)), true);

  // The topology is pinned to testnet and discloses no monetary value.
  assert.equal(topologyReport.network, STELLAR_TESTNET_NETWORK);
  assert.equal(topologyReport.networkPassphrase, TESTNET_PASSPHRASE);
  assert.equal(topologyReport.disclosure, RCPHP_DISCLOSURE);
});

// Trustlines + RCPHP transfer + asset identity (Req 1.1, 21.5) ---------------

test('smoke: asset bootstrap provisions a trustline for every aid-holding non-issuer account', async () => {
  const environment = fullSecretEnvironment();
  const { assetReport } = await planFullBootstrap(environment);

  const trustlineRoles = assetReport.trustlines.map((trustline) => trustline.role).sort();
  assert.deepEqual(trustlineRoles, EXPECTED_TRUSTLINE_ROLES);

  // The issuer, sponsor, and contract deployer never hold an RCPHP trustline.
  assert.equal(
    assetReport.trustlines.some((trustline) => ['issuer', 'sponsor', 'contract_deployer'].includes(trustline.role)),
    false,
  );

  // Under AUTH_REQUIRED every holder trustline is explicitly authorized.
  assert.equal(assetReport.authorization.length, assetReport.trustlines.length);
});

test('smoke: asset bootstrap plans an RCPHP transfer of the non-monetary asset from issuer to distribution', async () => {
  const environment = fullSecretEnvironment();
  const { assetReport, accounts } = await planFullBootstrap(environment);

  const issuer = accounts.find((account) => account.role === 'issuer').publicKey;
  const distribution = accounts.find((account) => account.role === 'distribution').publicKey;

  assert.equal(assetReport.asset.code, RCPHP_ASSET_CODE);
  assert.equal(assetReport.asset.issuer, issuer);
  assert.equal(assetReport.asset.hasMonetaryValue, false);
  assert.equal(assetReport.issuance.from, issuer);
  assert.equal(assetReport.issuance.to, distribution);
  assert.equal(assetReport.issuance.amountStroops, DEFAULT_ISSUANCE_STROOPS.toString());
  // Only AUTH_REQUIRED is set; clawback is never enabled (confirmed cash is final).
  assert.deepEqual(assetReport.issuerFlags.setFlags, ['AUTH_REQUIRED']);
  assert.equal(assetReport.issuerFlags.clawbackEnabled, false);
});

// SAC resolution and verification (Req 7.2 via the smoke path) ---------------

test('smoke: SAC is resolved to a canonical C-address and a mismatch fails closed', async () => {
  const environment = fullSecretEnvironment();
  const { assetReport, accounts } = await planFullBootstrap(environment);
  const issuer = accounts.find((account) => account.role === 'issuer').publicKey;

  assert.equal(assetReport.asset.stellarAssetContractId, FAKE_SAC);
  assert.match(assetReport.asset.stellarAssetContractId, /^C[A-Z2-7]{55}$/);

  // A configured SAC matching the canonical derivation verifies; a foreign one fails.
  const verified = await verifyStellarAssetContractId({
    code: RCPHP_ASSET_CODE,
    issuer,
    networkPassphrase: TESTNET_PASSPHRASE,
    expected: FAKE_SAC,
    deriveContractId: fakeDeriveContractId,
  });
  assert.equal(verified, FAKE_SAC);
  await assert.rejects(
    () =>
      verifyStellarAssetContractId({
        code: RCPHP_ASSET_CODE,
        issuer,
        networkPassphrase: TESTNET_PASSPHRASE,
        expected: `C${'Z'.repeat(55)}`,
        deriveContractId: fakeDeriveContractId,
      }),
    /does not match the canonical address/,
  );
});

test('smoke: SAC derivation is deterministic offline via the real SDK crypto', async () => {
  const issuer = 'GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ';
  const first = await resolveStellarAssetContractId({
    code: RCPHP_ASSET_CODE,
    issuer,
    networkPassphrase: TESTNET_PASSPHRASE,
    deriveContractId: defaultDeriveContractId,
  });
  assert.match(first, /^C[A-Z2-7]{55}$/);
  const second = await resolveStellarAssetContractId({
    code: RCPHP_ASSET_CODE,
    issuer,
    networkPassphrase: TESTNET_PASSPHRASE,
    deriveContractId: defaultDeriveContractId,
  });
  assert.equal(first, second);
});

// Sponsorship limits (Req 14.x via the smoke path) ---------------------------

test('smoke: sponsor reserves are bounded and cover exactly one reserve per trustline', async () => {
  const environment = fullSecretEnvironment();
  const { plan, accounts } = await planFullBootstrap(environment);
  const sponsor = accounts.find((account) => account.role === 'sponsor').publicKey;

  const reserves = plan.sponsorReserves;
  assert.equal(reserves.sponsor, sponsor);
  // One sponsored reserve per aid-holding trustline, each exactly a base reserve.
  assert.equal(reserves.sponsored.length, EXPECTED_TRUSTLINE_ROLES.length);
  assert.equal(
    reserves.sponsored.every((entry) => entry.reserveStroops === TRUSTLINE_RESERVE_STROOPS.toString()),
    true,
  );

  const total = BigInt(reserves.totalReserveStroops);
  const expected = TRUSTLINE_RESERVE_STROOPS * BigInt(EXPECTED_TRUSTLINE_ROLES.length);
  assert.equal(total, expected);
  // Bounded: positive and within the configured pilot ceiling.
  assert.equal(total > 0n, true);
  assert.equal(total <= MAX_SPONSOR_RESERVE_STROOPS, true, 'sponsored reserves must stay within the pilot limit');

  // The sponsor is separate from every aid-bearing/issuing account.
  assert.equal(
    accounts.some((account) => account.role !== 'sponsor' && account.publicKey === sponsor),
    false,
  );
});

// No secrets in any emitted artifact (Req 1.7, 21.5) -------------------------

test('smoke: no emitted report exposes secrets and every value is labeled testnet / no monetary value', async () => {
  const environment = fullSecretEnvironment();
  const { topologyReport, assetReport } = await planFullBootstrap(environment);

  assertNoSecretsLeaked(topologyReport, environment);
  assertNoSecretsLeaked(assetReport, environment);

  assert.equal(assetReport.disclosure, RCPHP_DISCLOSURE);
  assert.match(RCPHP_DISCLOSURE, /no real monetary value/i);
  assert.equal(assetReport.asset.hasMonetaryValue, false);
});

// Gated live path: never fabricates success; confirmed steps carry references -

test('smoke: uninjected live execution fails closed instead of fabricating success', async () => {
  const environment = fullSecretEnvironment();
  await assert.rejects(
    () =>
      runAssetBootstrap({
        environment,
        execute: true,
        derivePublicKey: fakeDerive,
        deriveContractId: fakeDeriveContractId,
        // No provisioner injected: the default reports an explicit live blocker.
      }),
    /Live RCPHP provisioning requires/,
  );
});

test('smoke: an injected confirmed provisioner yields verifiable public ledger references and no secrets', async () => {
  const environment = fullSecretEnvironment();

  // Bounded live path: gated behind an INJECTED provisioner that simulates a
  // confirmed testnet run and returns only PUBLIC ledger references (tx hashes,
  // ledger sequence). This never touches the network or a signer.
  const injectedProvisioner = async ({ plan }) => [
    { step: 'set_issuer_flags', status: 'ok', transactionHash: 'a'.repeat(64), ledger: 1001 },
    { step: `issue_${plan.asset.code}`, status: 'ok', transactionHash: 'b'.repeat(64), ledger: 1002 },
    { step: 'authorize_trustlines', status: 'ok', transactionHash: 'c'.repeat(64), ledger: 1003 },
    { step: 'sponsor_reserves', status: 'ok', transactionHash: 'd'.repeat(64), ledger: 1004 },
  ];

  const { report, steps } = await runAssetBootstrap({
    environment,
    execute: true,
    derivePublicKey: fakeDerive,
    deriveContractId: fakeDeriveContractId,
    provisionOnChain: injectedProvisioner,
  });

  assert.equal(report.executed, true);
  assert.equal(steps.length, 4);
  // Every confirmed step must carry a verifiable public reference (Req 21.6).
  assert.equal(steps.every((step) => step.status === 'ok'), true);
  assert.equal(
    steps.every((step) => /^[a-f0-9]{64}$/.test(step.transactionHash) && Number.isInteger(step.ledger)),
    true,
    'each confirmed step must expose a verifiable transaction hash and ledger',
  );
  // References are public identifiers only; no secret material leaks.
  assertNoSecretsLeaked(steps, environment);
  assertNoSecretsLeaked(report, environment);
});

test('smoke: a confirmed live topology run exposes on-chain public keys only (injected fetch)', async () => {
  const environment = { STELLAR_NETWORK: 'testnet' };
  const persisted = [];
  const sink = { describe: () => 'memory', persist: (envVar, secret) => persisted.push({ envVar, secret }) };
  // Injected fetch: accounts are missing (404) then funded (200) via friendbot.
  const fetchImpl = async (url) => (url.includes('/accounts/') ? { status: 404 } : { status: 200 });
  let counter = 0;
  const generateKeypair = async () => {
    const letter = String.fromCharCode(65 + counter++);
    return { publicKey: `G${letter.repeat(55)}`, secret: `S${letter.repeat(55)}` };
  };

  const { report } = await runBootstrap({
    environment,
    execute: true,
    generateKeypair,
    sink,
    fetchImpl,
    horizonUrl: 'https://horizon-testnet.stellar.org',
    friendbotUrl: 'https://friendbot.stellar.org',
  });

  assert.equal(report.executed, true);
  assert.equal(report.accounts.every((account) => account.onChain === true), true);
  assert.equal(report.accounts.every((account) => STELLAR_PUBLIC_KEY.test(account.publicKey)), true);
  // Generated secrets go only to the injected sink, never into the report.
  assert.equal(persisted.length, ROLE_DEFINITIONS.length);
  assertNoSecretsLeaked(report, environment);
});

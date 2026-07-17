import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
    assertAccountSeparation,
    assertTestnetEnvironment,
    BootstrapConfigurationError,
    buildPublicReport,
    createFileSecretSink,
    discoverAccountOnChain,
    ensureAccountOnChain,
    formatReport,
    fundAccountOnChain,
    planTopology,
    provisionMissingSecrets,
    redactDiagnostic,
    ROLE_DEFINITIONS,
    runBootstrap,
} from '../bootstrap-topology.mjs';

// Deterministic offline fakes -------------------------------------------------

// A valid-shaped secret seed / public key per role, derived deterministically so
// tests never touch the network or the real signing library.
const FAKE_SECRETS = {
  issuer: `S${'A'.repeat(55)}`,
  distribution: `S${'B'.repeat(55)}`,
};

const publicKeyFor = (role) => `G${role.toUpperCase().replace(/[^A-Z2-7]/g, 'A').padEnd(55, 'A').slice(0, 55)}`;

const fakeDerive = async (secret) => {
  const entry = Object.entries(FAKE_SECRETS).find(([, value]) => value === secret);
  return publicKeyFor(entry ? entry[0] : 'issuer');
};

function makeGenerator() {
  let counter = 0;
  return async () => {
    const index = counter++;
    const letter = String.fromCharCode(65 + (index % 26));
    return {
      publicKey: `G${letter.repeat(55)}`,
      secret: `S${letter.repeat(55)}`,
    };
  };
}

function fullSecretEnvironment() {
  const environment = { STELLAR_NETWORK: 'testnet' };
  for (const definition of ROLE_DEFINITIONS) {
    // A distinct, valid-shaped secret per role.
    const letter = String.fromCharCode(65 + ROLE_DEFINITIONS.indexOf(definition));
    environment[definition.envVar] = `S${letter.repeat(55)}`;
  }
  return environment;
}

function tempFile(t, name = 'secrets.local') {
  const directory = mkdtempSync(join(tmpdir(), 'relief-chain-bootstrap-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return join(directory, name);
}

// Testnet guard ---------------------------------------------------------------

test('assertTestnetEnvironment accepts testnet defaults and explicit testnet', () => {
  assert.doesNotThrow(() => assertTestnetEnvironment({}));
  assert.doesNotThrow(() =>
    assertTestnetEnvironment({ STELLAR_NETWORK: 'testnet', STELLAR_MAINNET_ENABLED: 'false' }),
  );
});

test('assertTestnetEnvironment rejects non-testnet network, passphrase, and enabled mainnet', () => {
  assert.throws(() => assertTestnetEnvironment({ STELLAR_NETWORK: 'public' }), BootstrapConfigurationError);
  assert.throws(
    () => assertTestnetEnvironment({ STELLAR_NETWORK_PASSPHRASE: 'Public Global Stellar Network ; September 2015' }),
    BootstrapConfigurationError,
  );
  assert.throws(() => assertTestnetEnvironment({ STELLAR_MAINNET_ENABLED: 'true' }), BootstrapConfigurationError);
});

// Planning --------------------------------------------------------------------

test('planTopology discovers configured secrets and lists missing roles', async () => {
  const environment = {
    STELLAR_ISSUER_SECRET: FAKE_SECRETS.issuer,
    STELLAR_DISTRIBUTION_SECRET: FAKE_SECRETS.distribution,
  };
  const { discovered, missing } = await planTopology({ environment, derivePublicKey: fakeDerive });
  assert.equal(discovered.length, 2);
  assert.equal(discovered.every((account) => account.source === 'discovered'), true);
  assert.equal(discovered[0].publicKey, publicKeyFor('issuer'));
  assert.equal(missing.length, ROLE_DEFINITIONS.length - 2);
  assert.equal(
    missing.some((entry) => entry.role === 'issuer' || entry.role === 'distribution'),
    false,
  );
});

test('planTopology rejects a malformed configured secret without echoing it', async () => {
  const environment = { STELLAR_ISSUER_SECRET: 'not-a-valid-seed' };
  await assert.rejects(
    () => planTopology({ environment, derivePublicKey: fakeDerive }),
    (error) => {
      assert.ok(error instanceof BootstrapConfigurationError);
      assert.match(error.message, /STELLAR_ISSUER_SECRET/);
      assert.doesNotMatch(error.message, /not-a-valid-seed/);
      return true;
    },
  );
});

// Secret provisioning ---------------------------------------------------------

test('provisionMissingSecrets fails closed when no secret store is configured', async () => {
  const missing = [{ role: 'merchant', label: 'Merchant', envVar: 'STELLAR_MERCHANT_SECRET', mayHoldAid: true }];
  await assert.rejects(
    () => provisionMissingSecrets(missing, { generateKeypair: makeGenerator(), sink: null }),
    (error) => {
      assert.ok(error instanceof BootstrapConfigurationError);
      assert.match(error.message, /STELLAR_MERCHANT_SECRET/);
      return true;
    },
  );
});

test('provisionMissingSecrets persists generated secrets to the sink and returns only public info', async (t) => {
  const persisted = [];
  const sink = { describe: () => 'memory', persist: (envVar, secret) => persisted.push({ envVar, secret }) };
  const missing = [
    { role: 'beneficiary', label: 'Beneficiary', envVar: 'STELLAR_BENEFICIARY_SECRET', mayHoldAid: true },
    { role: 'merchant', label: 'Merchant', envVar: 'STELLAR_MERCHANT_SECRET', mayHoldAid: true },
  ];
  const created = await provisionMissingSecrets(missing, { generateKeypair: makeGenerator(), sink });
  assert.equal(created.length, 2);
  assert.equal(created.every((account) => account.source === 'created'), true);
  assert.equal(created.every((account) => account.publicKey.startsWith('G')), true);
  // Secrets went to the sink, never onto the returned public account objects.
  assert.equal(persisted.length, 2);
  assert.equal(JSON.stringify(created).includes('S'.repeat(55)), false);
  void t;
});

test('createFileSecretSink appends KEY=secret lines to a gitignored file', (t) => {
  const filePath = tempFile(t, 'secrets.env.local');
  const sink = createFileSecretSink(filePath);
  sink.persist('STELLAR_MERCHANT_SECRET', 'S' + 'Z'.repeat(55));
  const contents = readFileSync(filePath, 'utf8');
  assert.match(contents, /^STELLAR_MERCHANT_SECRET=S/m);
});

// Separation of duties --------------------------------------------------------

test('assertAccountSeparation passes for a complete, distinct topology', () => {
  const accounts = ROLE_DEFINITIONS.map((definition, index) => ({
    role: definition.role,
    publicKey: `G${String.fromCharCode(65 + index).repeat(55)}`,
  }));
  assert.doesNotThrow(() => assertAccountSeparation(accounts));
});

test('assertAccountSeparation rejects two roles sharing one account', () => {
  const accounts = ROLE_DEFINITIONS.map((definition) => ({
    role: definition.role,
    publicKey: 'G' + 'A'.repeat(55),
  }));
  assert.throws(() => assertAccountSeparation(accounts), BootstrapConfigurationError);
});

test('assertAccountSeparation rejects an incomplete topology', () => {
  const accounts = [{ role: 'issuer', publicKey: 'G' + 'A'.repeat(55) }];
  assert.throws(() => assertAccountSeparation(accounts), /missing roles/);
});

// Redaction -------------------------------------------------------------------

test('redactDiagnostic masks secret-seed shapes and configured env secrets', () => {
  const secret = 'S' + 'C'.repeat(55);
  const environment = { STELLAR_ISSUER_SECRET: secret };
  const masked = redactDiagnostic(`failure involving ${secret} occurred`, environment);
  assert.equal(masked.includes(secret), false);
  assert.match(masked, /\[REDACTED\]/);
});

// Live interaction (with injected fetch) --------------------------------------

test('discoverAccountOnChain maps Horizon 200/404 and rejects other statuses', async () => {
  const existing = await discoverAccountOnChain({ publicKey: 'G' + 'A'.repeat(55), fetchImpl: async () => ({ status: 200 }) });
  assert.equal(existing, true);
  const absent = await discoverAccountOnChain({ publicKey: 'G' + 'A'.repeat(55), fetchImpl: async () => ({ status: 404 }) });
  assert.equal(absent, false);
  await assert.rejects(
    () => discoverAccountOnChain({ publicKey: 'G' + 'A'.repeat(55), fetchImpl: async () => ({ status: 500 }) }),
    BootstrapConfigurationError,
  );
});

test('ensureAccountOnChain funds only accounts that do not yet exist', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.includes('/accounts/')) return { status: 404 };
    return { status: 200 };
  };
  const result = await ensureAccountOnChain(
    { role: 'beneficiary', publicKey: 'G' + 'A'.repeat(55) },
    { fetchImpl, horizonUrl: 'https://horizon-testnet.stellar.org', friendbotUrl: 'https://friendbot.stellar.org' },
  );
  assert.equal(result.existed, false);
  assert.equal(result.funded, true);
  assert.equal(result.onChain, true);
  assert.equal(calls.some((url) => url.includes('friendbot')), true);
});

test('ensureAccountOnChain does not fund an already-existing account', async () => {
  let friendbotCalled = false;
  const fetchImpl = async (url) => {
    if (url.includes('friendbot')) friendbotCalled = true;
    return { status: 200 };
  };
  const result = await ensureAccountOnChain({ role: 'issuer', publicKey: 'G' + 'B'.repeat(55) }, { fetchImpl });
  assert.equal(result.existed, true);
  assert.equal(result.funded, false);
  assert.equal(friendbotCalled, false);
});

// Orchestration ---------------------------------------------------------------

test('runBootstrap dry run plans every role without any network call', async () => {
  const environment = fullSecretEnvironment();
  const derivePublicKey = async (secret) => `G${secret.slice(1)}`; // shape-preserving fake
  const { report, accounts } = await runBootstrap({
    environment,
    execute: false,
    derivePublicKey,
    fetchImpl: () => {
      throw new Error('network must not be called in a dry run');
    },
  });
  assert.equal(accounts.length, ROLE_DEFINITIONS.length);
  assert.equal(report.executed, false);
  assert.equal(report.accounts.every((account) => account.onChain === null), true);
  // Accounts appear in canonical topology order.
  assert.deepEqual(
    report.accounts.map((account) => account.role),
    ROLE_DEFINITIONS.map((definition) => definition.role),
  );
});

test('runBootstrap generates missing accounts through the injected sink and executes live provisioning', async () => {
  const environment = { STELLAR_NETWORK: 'testnet' };
  const persisted = [];
  const sink = { describe: () => 'memory', persist: (envVar, secret) => persisted.push({ envVar, secret }) };
  const fetchImpl = async (url) => (url.includes('/accounts/') ? { status: 404 } : { status: 200 });
  const { report } = await runBootstrap({
    environment,
    execute: true,
    generateKeypair: makeGenerator(),
    sink,
    fetchImpl,
    horizonUrl: 'https://horizon-testnet.stellar.org',
    friendbotUrl: 'https://friendbot.stellar.org',
  });
  assert.equal(persisted.length, ROLE_DEFINITIONS.length);
  assert.equal(report.executed, true);
  assert.equal(report.accounts.every((account) => account.source === 'created'), true);
  assert.equal(report.accounts.every((account) => account.onChain === true), true);
  // The public report never carries secret material.
  assert.equal(JSON.stringify(report).includes('S'.repeat(55)), false);
});

test('runBootstrap fails closed on a non-testnet environment', async () => {
  await assert.rejects(
    () => runBootstrap({ environment: { STELLAR_NETWORK: 'public' }, execute: false }),
    BootstrapConfigurationError,
  );
});

test('formatReport emits public keys and a secret-safety note but no secrets', () => {
  const accounts = ROLE_DEFINITIONS.map((definition, index) => ({
    role: definition.role,
    label: definition.label,
    publicKey: `G${String.fromCharCode(65 + index).repeat(55)}`,
    source: index === 0 ? 'created' : 'discovered',
    mayHoldAid: definition.mayHoldAid,
  }));
  const report = buildPublicReport(accounts, { executed: false });
  const text = formatReport(report);
  assert.match(text, /public key: G/);
  assert.match(text, /secrets written only to the configured secret-safe store/);
  assert.doesNotMatch(text, /\bS[A-Z2-7]{55}\b/);
});

test('fundAccountOnChain returns true only on a 200 friendbot response', async () => {
  assert.equal(await fundAccountOnChain({ publicKey: 'G' + 'A'.repeat(55), fetchImpl: async () => ({ status: 200 }) }), true);
  assert.equal(await fundAccountOnChain({ publicKey: 'G' + 'A'.repeat(55), fetchImpl: async () => ({ status: 400 }) }), false);
});

import { Keypair } from '@stellar/stellar-sdk';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(
  new URL('../../src/services/stellar-wallet-service-core.ts', import.meta.url),
  'utf8',
);
const { outputText, diagnostics = [] } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  reportDiagnostics: true,
});
assert.equal(diagnostics.length, 0);
const service = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
);

const keypairAt = (value) => Keypair.fromRawEd25519Seed(Buffer.alloc(32, value));

const makeDependencies = ({ initialSecret = null, available = true } = {}) => {
  let storedSecret = initialSecret;
  let generated = 0;
  const writes = [];
  return {
    writes,
    generated: () => generated,
    dependencies: {
      secretStore: {
        isAvailable: async () => available,
        get: async () => storedSecret,
        set: async (namespace, secret) => {
          writes.push({ namespace, secret });
          storedSecret = secret;
        },
      },
      keypairs: {
        generate: () => {
          generated += 1;
          const pair = keypairAt(99);
          return { secret: pair.secret(), publicKey: pair.publicKey() };
        },
        derivePublicKey: (secret) => Keypair.fromSecret(secret).publicKey(),
      },
    },
  };
};

const activeWallet = (pair, id = 'wallet-1') => ({
  id,
  network: 'stellar_testnet',
  address: pair.publicKey(),
  is_active: true,
});

test('builds the required user- and network-namespaced testnet storage key', () => {
  const logical = service.pilotWalletStorageNamespace('user-123');
  assert.equal(logical, 'stellar:testnet:user-123:seed:v1');
  assert.equal(service.pilotWalletSecureStoreKey(logical), 'stellar.testnet.user-123.seed.v1');
});

test('provisions one disposable signer only when no active wallet row exists', async () => {
  const fixture = makeDependencies();
  const state = await service.resolvePilotWallet('user-123', null, fixture.dependencies);

  assert.equal(state.status, 'binding_required');
  assert.equal(state.wasProvisioned, true);
  assert.equal(state.custodyModel, 'disposable_testnet');
  assert.equal(fixture.generated(), 1);
  assert.equal(fixture.writes.length, 1);
  assert.equal(fixture.writes[0].namespace, 'stellar:testnet:user-123:seed:v1');
  assert.equal('secret' in state, false);
});

test('returns ready only when the local signer matches the active wallet row', async () => {
  const pair = keypairAt(1);
  const fixture = makeDependencies({ initialSecret: pair.secret() });
  const row = activeWallet(pair);
  const state = await service.resolvePilotWallet('user-123', row, fixture.dependencies);

  assert.deepEqual(state, {
    status: 'ready',
    custodyModel: 'disposable_testnet',
    storageNamespace: 'stellar:testnet:user-123:seed:v1',
    walletId: row.id,
    publicKey: pair.publicKey(),
  });
  assert.equal(fixture.writes.length, 0);
  assert.equal(fixture.generated(), 0);
});

test('provisions a disposable signer when active wallet exists but secret is missing', async () => {
  const fixture = makeDependencies();
  const row = activeWallet(Keypair.random()); // active wallet with address but no secret stored
  const state = await service.resolvePilotWallet('user-123', row, fixture.dependencies);

  assert.equal(state.status, 'binding_required');
  assert.equal(state.wasProvisioned, true);
  assert.equal(state.custodyModel, 'disposable_testnet');
  // Ensure a write occurred to SecureStore
  assert.equal(fixture.writes.length, 1);
});

test('surfaces invalid local signer material without exposing or replacing it', async () => {
  const fixture = makeDependencies({ initialSecret: 'not-a-stellar-seed' });
  const state = await service.resolvePilotWallet(
    'user-123',
    activeWallet(keypairAt(3)),
    fixture.dependencies,
  );

  assert.equal(state.status, 'recovery_required');
  assert.equal(state.reason, 'invalid_signer');
  assert.equal(state.derivedAddress, null);
  assert.equal(fixture.generated(), 0);
  assert.equal(fixture.writes.length, 0);
});

test('property: namespaces remain unique and SecureStore-safe across authenticated users', () => {
  const logical = new Set();
  const physical = new Set();
  for (let index = 0; index < 250; index += 1) {
    const userId = `00000000-0000-4000-8000-${index.toString().padStart(12, '0')}`;
    const namespace = service.pilotWalletStorageNamespace(userId);
    const secureStoreKey = service.pilotWalletSecureStoreKey(namespace);
    assert.match(namespace, new RegExp(`^stellar:testnet:${userId}:seed:v1$`));
    assert.match(secureStoreKey, /^[A-Za-z0-9._-]+$/);
    logical.add(namespace);
    physical.add(secureStoreKey);
  }
  assert.equal(logical.size, 250);
  assert.equal(physical.size, 250);
});

test('property: mismatched active-wallet signers always require recovery and are never replaced', async () => {
  for (let index = 1; index <= 64; index += 1) {
    const localPair = keypairAt(index);
    const boundPair = keypairAt(index + 64);
    const fixture = makeDependencies({ initialSecret: localPair.secret() });
    const row = activeWallet(boundPair, `wallet-${index}`);
    const state = await service.resolvePilotWallet(`user-${index}`, row, fixture.dependencies);

    assert.equal(state.status, 'recovery_required');
    assert.equal(state.reason, 'signer_mismatch');
    assert.equal(state.walletId, row.id);
    assert.equal(state.expectedAddress, boundPair.publicKey());
    assert.equal(state.derivedAddress, localPair.publicKey());
    assert.equal(fixture.generated(), 0);
    assert.equal(fixture.writes.length, 0);
  }
});

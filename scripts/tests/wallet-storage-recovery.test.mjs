import { Keypair } from '@stellar/stellar-sdk';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

// Task 4.6: wallet storage + recovery tests. This file covers the secure-store
// failure/unavailable/invalid-binding paths and the log/storage-safety guarantee
// that raw signer secrets never surface in wallet state. Namespace isolation,
// signer mismatch, proof tampering, rotation prerequisites, and confirmed
// authority change are covered by the sibling stellar-wallet-service,
// wallet-custody, and wallet-rotation suites.
// Requirements: 3.2, 3.3, 3.4, 3.5, 16.1, 16.2, 16.7, 23.6, 23.8

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

const STELLAR_SECRET = /S[A-Z2-7]{55}/;
const keypairAt = (value) => Keypair.fromRawEd25519Seed(Buffer.alloc(32, value));

const makeDependencies = ({
  initialSecret = null,
  isAvailable = async () => true,
  get = null,
  set = null,
} = {}) => {
  let storedSecret = initialSecret;
  let generated = 0;
  const writes = [];
  return {
    writes,
    generated: () => generated,
    dependencies: {
      secretStore: {
        isAvailable,
        get: get ?? (async () => storedSecret),
        set:
          set ??
          (async (namespace, secret) => {
            writes.push({ namespace, secret });
            storedSecret = secret;
          }),
      },
      keypairs: {
        generate: () => {
          generated += 1;
          const pair = keypairAt(200);
          return { secret: pair.secret(), publicKey: pair.publicKey() };
        },
        derivePublicKey: (secret) => Keypair.fromSecret(secret).publicKey(),
      },
    },
  };
};

const activeWallet = (pair, overrides = {}) => ({
  id: 'wallet-1',
  network: 'stellar_testnet',
  address: pair.publicKey(),
  is_active: true,
  ...overrides,
});

const assertNoSecretLeak = (state, forbiddenSecret) => {
  const serialized = JSON.stringify(state);
  assert.equal('secret' in state, false);
  assert.doesNotMatch(serialized, STELLAR_SECRET);
  if (forbiddenSecret) assert.equal(serialized.includes(forbiddenSecret), false);
};

test('reports secure_storage_unavailable when the OS secure store is not usable', async () => {
  const fixture = makeDependencies({ isAvailable: async () => false });
  const state = await service.resolvePilotWallet('user-123', null, fixture.dependencies);

  assert.equal(state.status, 'unavailable');
  assert.equal(state.reason, 'secure_storage_unavailable');
  assert.equal(state.storageNamespace, 'stellar:testnet:user-123:seed:v1');
  assert.equal(fixture.generated(), 0);
  assert.equal(fixture.writes.length, 0);
});

test('reports secure_storage_error when reading the stored signer fails', async () => {
  const fixture = makeDependencies({
    get: async () => {
      throw new Error('keychain read failed');
    },
  });
  const state = await service.resolvePilotWallet(
    'user-123',
    activeWallet(keypairAt(1)),
    fixture.dependencies,
  );

  assert.equal(state.status, 'unavailable');
  assert.equal(state.reason, 'secure_storage_error');
  assert.equal(fixture.generated(), 0);
});

test('reports secure_storage_error when persisting a provisioned signer fails and never leaks it', async () => {
  const fixture = makeDependencies({
    set: async () => {
      throw new Error('keychain write failed');
    },
  });
  const state = await service.resolvePilotWallet('user-123', null, fixture.dependencies);

  assert.equal(state.status, 'unavailable');
  assert.equal(state.reason, 'secure_storage_error');
  // A signer was generated for the write attempt, but the failure must not expose it.
  assert.equal(fixture.generated(), 1);
  assertNoSecretLeak(state);
});

test('rejects an invalid active-wallet binding before touching secure storage', async () => {
  const cases = [
    activeWallet(keypairAt(2), { network: 'stellar_public' }),
    activeWallet(keypairAt(2), { is_active: false }),
    activeWallet(keypairAt(2), { address: 'not-a-stellar-address' }),
  ];
  for (const row of cases) {
    let touched = false;
    const fixture = makeDependencies({
      isAvailable: async () => {
        touched = true;
        return true;
      },
    });
    const state = await service.resolvePilotWallet('user-123', row, fixture.dependencies);

    assert.equal(state.status, 'unavailable');
    assert.equal(state.reason, 'invalid_wallet_binding');
    assert.equal(touched, false);
    assert.equal(fixture.generated(), 0);
    assert.equal(fixture.writes.length, 0);
  }
});

test('persists provisioned signers only under the namespaced key and never returns them', async () => {
  const fixture = makeDependencies();
  const state = await service.resolvePilotWallet('user-123', null, fixture.dependencies);

  assert.equal(state.status, 'binding_required');
  assert.equal(state.wasProvisioned, true);
  // Secret material is written to the namespaced store, not surfaced in state.
  assert.equal(fixture.writes.length, 1);
  assert.equal(fixture.writes[0].namespace, 'stellar:testnet:user-123:seed:v1');
  assert.match(fixture.writes[0].secret, /^S[A-Z2-7]{55}$/);
  assertNoSecretLeak(state, fixture.writes[0].secret);
});

test('never embeds raw signer secrets in any recovery, ready, or binding state', async () => {
  const localPair = keypairAt(5);
  const boundPair = keypairAt(6);
  const scenarios = [
    // missing_signer recovery: active row but no stored secret.
    { initialSecret: null, row: activeWallet(boundPair) },
    // invalid_signer recovery: stored secret is unusable.
    { initialSecret: 'not-a-stellar-seed', row: activeWallet(boundPair) },
    // signer_mismatch recovery: stored signer differs from the bound address.
    { initialSecret: localPair.secret(), row: activeWallet(boundPair) },
    // ready: stored signer matches the bound address.
    { initialSecret: boundPair.secret(), row: activeWallet(boundPair) },
    // binding_required (unprovisioned): stored signer with no active row.
    { initialSecret: localPair.secret(), row: null },
  ];

  for (const { initialSecret, row } of scenarios) {
    const fixture = makeDependencies({ initialSecret });
    const state = await service.resolvePilotWallet('user-123', row, fixture.dependencies);
    assertNoSecretLeak(state, STELLAR_SECRET.test(initialSecret ?? '') ? initialSecret : null);
  }
});

import { Keypair } from '@stellar/stellar-sdk';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const transpile = (source) => {
  const { outputText, diagnostics = [] } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    reportDiagnostics: true,
  });
  assert.equal(diagnostics.length, 0);
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
};

const coreSource = await readFile(
  new URL('../../src/services/wallet-custody-core.ts', import.meta.url),
  'utf8',
);
const custody = await transpile(coreSource);
globalThis.__walletCustodyCore = custody;
const productionSource = (await readFile(
  new URL('../../src/services/production-wallet-custody.ts', import.meta.url),
  'utf8',
))
  .replace(/import type \{[\s\S]*?\} from '@\/types\/wallet-custody';\s*/, '')
  .replace(
    "import { assertProductionCustodyBoundary } from './wallet-custody-core';",
    'const { assertProductionCustodyBoundary } = globalThis.__walletCustodyCore;',
  );
const productionCustody = await transpile(productionSource);
delete globalThis.__walletCustodyCore;

const identityId = '10000000-0000-4000-8000-000000000001';
const walletId = '20000000-0000-4000-8000-000000000001';
const now = new Date('2026-07-16T12:00:00.000Z');
const pair = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 7));

const challenge = custody.createWalletProofChallenge({
  purpose: 'new_binding',
  walletId,
  beneficiaryIdentityId: identityId,
  walletAddress: pair.publicKey(),
  nonce: 'ab'.repeat(32),
  issuedAt: now,
  expiresAt: new Date(now.getTime() + 5 * 60_000),
});

const cryptoAdapter = {
  sha256Hex: async (value) => createHash('sha256').update(value).digest('hex'),
  verifyEd25519: async (address, message, signatureBase64) =>
    Keypair.fromPublicKey(address).verify(
      Buffer.from(message, 'utf8'),
      Buffer.from(signatureBase64, 'base64'),
    ),
};

test('challenge-sign verifies the exact new binding and returns digest evidence only', async () => {
  const canonical = custody.canonicalWalletProofChallenge(challenge);
  const response = {
    challenge,
    signatureBase64: Buffer.from(pair.sign(Buffer.from(canonical, 'utf8'))).toString('base64'),
  };
  const proof = await custody.verifyWalletProof(response, {
    purpose: 'new_binding', walletId, beneficiaryIdentityId: identityId,
    walletAddress: pair.publicKey(),
    challengeDigest: await cryptoAdapter.sha256Hex(canonical),
  }, now, cryptoAdapter);

  assert.equal(proof.walletAddress, pair.publicKey());
  assert.match(proof.challengeDigest, /^[0-9a-f]{64}$/);
  assert.match(proof.signatureDigest, /^[0-9a-f]{64}$/);
  assert.equal('signatureBase64' in proof, false);
  assert.equal('nonce' in proof, false);
});

test('wallet proof rejects tampered context, invalid signatures, and expired challenges', async () => {
  const canonical = custody.canonicalWalletProofChallenge(challenge);
  const response = {
    challenge,
    signatureBase64: Buffer.from(pair.sign(Buffer.from(canonical, 'utf8'))).toString('base64'),
  };
  await assert.rejects(
    custody.verifyWalletProof(response, {
      purpose: 'rotation', walletId, beneficiaryIdentityId: identityId,
      walletAddress: pair.publicKey(),
    }, now, cryptoAdapter),
    /does not match/,
  );
  await assert.rejects(
    custody.verifyWalletProof({ ...response, signatureBase64: 'A'.repeat(86) + '==' }, {
      purpose: 'new_binding', walletId, beneficiaryIdentityId: identityId,
      walletAddress: pair.publicKey(),
    }, now, cryptoAdapter),
    /signature is invalid/,
  );
  await assert.rejects(
    custody.verifyWalletProof(response, {
      purpose: 'new_binding', walletId, beneficiaryIdentityId: identityId,
      walletAddress: pair.publicKey(),
    }, new Date(now.getTime() + 5 * 60_000 + 1), cryptoAdapter),
    /expired/,
  );
});

test('rotation requires stable identity, fresh re-verification, and recent AAL2', () => {
  const current = {
    id: walletId, beneficiaryIdentityId: identityId, address: pair.publicKey(),
    network: 'stellar_testnet', verificationStatus: 'verified', isActive: true,
  };
  const replacement = {
    ...current,
    id: '20000000-0000-4000-8000-000000000002',
    address: Keypair.fromRawEd25519Seed(Buffer.alloc(32, 8)).publicKey(),
    isActive: false,
  };
  const eligible = custody.assessWalletRotationPrerequisites(
    identityId, current, replacement,
    {
      aal: 'aal2', steppedUpAt: now.toISOString(), identityReverifiedAt: now.toISOString(),
      identityReverificationExpiresAt: new Date(now.getTime() + 60_000).toISOString(),
    },
    now,
  );
  assert.deepEqual(eligible, { eligible: true, beneficiaryIdentityId: identityId });

  const denied = custody.assessWalletRotationPrerequisites(
    identityId, current, { ...replacement, verificationStatus: 'challenge_issued' },
    { aal: 'aal1', steppedUpAt: null, identityReverifiedAt: null, identityReverificationExpiresAt: null },
    now,
  );
  assert.deepEqual(denied, {
    eligible: false,
    reasons: [
      'replacement_wallet_not_verified',
      'identity_reverification_required',
      'recent_step_up_required',
    ],
  });

  const staleIdentity = custody.assessWalletRotationPrerequisites(
    identityId, current, replacement,
    {
      aal: 'aal2', steppedUpAt: now.toISOString(),
      identityReverifiedAt: new Date(now.getTime() - 25 * 60 * 60_000).toISOString(),
      identityReverificationExpiresAt: new Date(now.getTime() + 60_000).toISOString(),
    },
    now,
  );
  assert.deepEqual(staleIdentity, {
    eligible: false,
    reasons: ['identity_reverification_expired'],
  });
});

test('production custody boundary rejects forbidden fields and raw Stellar secrets recursively', () => {
  assert.doesNotThrow(() => custody.assertProductionCustodyBoundary({
    custodyModel: 'partner_managed',
    publicAddress: pair.publicKey(),
    providerWalletReference: 'opaque-wallet-reference',
  }));
  for (const forbidden of [
    { recovery: { seedPhrase: 'forbidden' } },
    { encryptedPrivateKey: 'forbidden' },
    { nested: { credential: pair.secret() } },
  ]) {
    assert.throws(
      () => custody.assertProductionCustodyBoundary(forbidden),
      /forbidden private-key material/,
    );
  }
});

test('external-wallet adapter enforces public-only results and self-custody recovery disclosure', async () => {
  const adapter = productionCustody.useProductionWalletAdapter({
    custodyModel: 'external_self_custody',
    connect: async () => ({
      provider: 'supported-wallet',
      providerWalletReference: 'wallet-ref',
      publicAddress: pair.publicKey(),
      network: 'stellar_public',
      custodyModel: 'external_self_custody',
    }),
    authorize: async (request) => ({
      publicAddress: request.publicAddress,
      signatureBase64: 'A'.repeat(86) + '==',
      providerAuthorizationReference: 'authorization-ref',
      authorizedAt: now.toISOString(),
    }),
    recoveryDisclosure: () => ({
      recoverableByReliefChain: false,
      message: 'Relief Chain cannot recover unrestricted cash in a lost external wallet.',
    }),
  });

  const descriptor = await adapter.connect({ userReference: 'user-ref' });
  assert.equal(descriptor.publicAddress, pair.publicKey());
  assert.equal(adapter.recoveryDisclosure().recoverableByReliefChain, false);
  const authorization = await adapter.authorize({
    providerWalletReference: descriptor.providerWalletReference,
    publicAddress: descriptor.publicAddress,
    canonicalPayload: '{"wallet":"binding"}',
    purpose: 'wallet_binding',
    expiresAt: new Date(now.getTime() + 60_000).toISOString(),
  });
  assert.equal(authorization.publicAddress, descriptor.publicAddress);
});

test('production adapter wrapper blocks providers that expose private-key material', async () => {
  const unsafeExternal = productionCustody.useProductionWalletAdapter({
    custodyModel: 'external_self_custody',
    connect: async () => ({
      provider: 'unsafe-wallet', providerWalletReference: 'unsafe-ref',
      publicAddress: pair.publicKey(), network: 'stellar_public',
      custodyModel: 'external_self_custody', secretKey: pair.secret(),
    }),
    authorize: async () => { throw new Error('unused'); },
    recoveryDisclosure: () => ({ recoverableByReliefChain: false, message: 'Not recoverable.' }),
  });
  await assert.rejects(
    unsafeExternal.connect({ userReference: 'user-ref' }),
    /forbidden private-key material/,
  );

  const unsafePartner = productionCustody.useProductionWalletAdapter({
    custodyModel: 'partner_managed',
    provisionOrConnect: async () => { throw new Error('unused'); },
    authorize: async () => { throw new Error('unused'); },
    beginRecovery: async () => ({
      providerRecoveryReference: 'recovery-ref', status: 'requested', nextAction: null,
      seedPhrase: 'never expose this',
    }),
    getRecoveryStatus: async () => { throw new Error('unused'); },
  });
  await assert.rejects(
    unsafePartner.beginRecovery({
      userReference: 'user-ref', providerWalletReference: 'wallet-ref',
      identityReverificationReference: 'identity-ref', reason: 'lost_device',
    }),
    /forbidden private-key material/,
  );
});

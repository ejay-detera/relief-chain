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

const custody = await transpile(
  await readFile(new URL('../../src/services/wallet-custody-core.ts', import.meta.url), 'utf8'),
);
globalThis.__walletCustodyCore = custody;
const rotationSource = (await readFile(
  new URL('../../src/services/wallet-rotation-core.ts', import.meta.url),
  'utf8',
)).replace(
  /import \{[\s\S]*?\} from '\.\/wallet-custody-core';/,
  'const { assessWalletRotationPrerequisites, verifyWalletProof } = globalThis.__walletCustodyCore;',
);
const rotation = await transpile(rotationSource);
delete globalThis.__walletCustodyCore;

const now = new Date('2026-07-16T12:00:00.000Z');
const identityId = '10000000-0000-4000-8000-000000000001';
const organizationId = '10000000-0000-4000-8000-0000000000aa';
const correlationId = '10000000-0000-4000-8000-0000000000bb';
const rotationIntentId = '10000000-0000-4000-8000-0000000000cc';
const currentWalletId = '20000000-0000-4000-8000-000000000001';
const replacementWalletId = '20000000-0000-4000-8000-000000000002';

const currentPair = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 3));
const replacementPair = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 9));

const cryptoAdapter = {
  sha256Hex: async (value) => createHash('sha256').update(value).digest('hex'),
  verifyEd25519: async (address, message, signatureBase64) =>
    Keypair.fromPublicKey(address).verify(
      Buffer.from(message, 'utf8'),
      Buffer.from(signatureBase64, 'base64'),
    ),
};

const walletSnapshot = (overrides) => ({
  id: currentWalletId,
  beneficiaryIdentityId: identityId,
  address: currentPair.publicKey(),
  network: 'stellar_testnet',
  verificationStatus: 'verified',
  isActive: true,
  ...overrides,
});

const currentWallet = walletSnapshot({});
const replacementWallet = walletSnapshot({
  id: replacementWalletId,
  address: replacementPair.publicKey(),
  isActive: false,
});

const security = {
  aal: 'aal2',
  steppedUpAt: now.toISOString(),
  identityReverifiedAt: now.toISOString(),
  identityReverificationExpiresAt: new Date(now.getTime() + 60_000).toISOString(),
};

const contractA = 'C' + 'A'.repeat(55);
const contractB = 'C' + 'B'.repeat(55);
const migrationA = {
  voucherContractId: contractA,
  entitlementId: 'aa'.repeat(32),
  currentWalletAddress: currentPair.publicKey(),
  replacementWalletAddress: replacementPair.publicKey(),
};
const migrationB = {
  voucherContractId: contractB,
  entitlementId: 'bb'.repeat(32),
  currentWalletAddress: currentPair.publicKey(),
  replacementWalletAddress: replacementPair.publicKey(),
};

const buildVerifiedRotationProof = async () => {
  const challenge = custody.createWalletProofChallenge({
    purpose: 'rotation',
    walletId: replacementWalletId,
    beneficiaryIdentityId: identityId,
    walletAddress: replacementPair.publicKey(),
    nonce: 'cd'.repeat(32),
    issuedAt: now,
    expiresAt: new Date(now.getTime() + 5 * 60_000),
  });
  const canonical = custody.canonicalWalletProofChallenge(challenge);
  const response = {
    challenge,
    signatureBase64: Buffer.from(
      replacementPair.sign(Buffer.from(canonical, 'utf8')),
    ).toString('base64'),
  };
  return rotation.verifyReplacementWalletProof(
    response,
    {
      walletId: replacementWalletId,
      beneficiaryIdentityId: identityId,
      walletAddress: replacementPair.publicKey(),
    },
    now,
    cryptoAdapter,
  );
};

const baseIntentInput = () => ({
  walletRotationIntentId: rotationIntentId,
  organizationId,
  beneficiaryIdentityId: identityId,
  correlationId,
  currentWallet,
  replacementWallet,
  entitlementMigrations: [migrationB, migrationA],
});

test('replacement wallet proof rejects a new-binding challenge', async () => {
  const challenge = custody.createWalletProofChallenge({
    purpose: 'new_binding',
    walletId: replacementWalletId,
    beneficiaryIdentityId: identityId,
    walletAddress: replacementPair.publicKey(),
    nonce: 'ef'.repeat(32),
    issuedAt: now,
    expiresAt: new Date(now.getTime() + 5 * 60_000),
  });
  const canonical = custody.canonicalWalletProofChallenge(challenge);
  const response = {
    challenge,
    signatureBase64: Buffer.from(
      replacementPair.sign(Buffer.from(canonical, 'utf8')),
    ).toString('base64'),
  };
  await assert.rejects(
    rotation.verifyReplacementWalletProof(
      response,
      { walletId: replacementWalletId, beneficiaryIdentityId: identityId, walletAddress: replacementPair.publicKey() },
      now,
      cryptoAdapter,
    ),
    /rotation challenge purpose/,
  );
});

test('prepare binds proof, orders migrations deterministically, and links the attempt', async () => {
  const proof = await buildVerifiedRotationProof();
  const prepared = await rotation.prepareWalletRotation(
    baseIntentInput(), proof, security, now, cryptoAdapter, 0,
  );

  assert.match(prepared.intentPayloadHash, /^[0-9a-f]{64}$/);
  assert.equal(prepared.attemptNumber, 1);
  assert.equal(prepared.signingPackage.operationType, 'wallet_rotation');
  assert.equal(prepared.signingPackage.replacementWalletProofDigest, proof.challengeDigest);
  // Deterministic ordering: contract A sorts before contract B regardless of input order.
  assert.deepEqual(
    prepared.signingPackage.entitlementMigrations.map((m) => m.voucherContractId),
    [contractA, contractB],
  );

  // Input order must not change the payload hash.
  const reordered = await rotation.prepareWalletRotation(
    { ...baseIntentInput(), entitlementMigrations: [migrationA, migrationB] },
    proof, security, now, cryptoAdapter, 2,
  );
  assert.equal(reordered.intentPayloadHash, prepared.intentPayloadHash);
  assert.equal(reordered.attemptNumber, 3);
});

test('prepare rejects unmet prerequisites and mismatched proof', async () => {
  const proof = await buildVerifiedRotationProof();
  await assert.rejects(
    rotation.prepareWalletRotation(
      baseIntentInput(), proof,
      { aal: 'aal1', steppedUpAt: null, identityReverifiedAt: null, identityReverificationExpiresAt: null },
      now, cryptoAdapter, 0,
    ),
    /prerequisites are not satisfied/,
  );

  const wrongIdentityProof = { ...proof, beneficiaryIdentityId: organizationId };
  await assert.rejects(
    rotation.prepareWalletRotation(baseIntentInput(), wrongIdentityProof, security, now, cryptoAdapter, 0),
    /does not match the rotation intent/,
  );
});

test('canonical intent rejects duplicate and address-mismatched migrations', () => {
  assert.throws(
    () => rotation.canonicalWalletRotationIntent({
      ...baseIntentInput(), entitlementMigrations: [migrationA, migrationA],
    }),
    /duplicate contract\/entitlement/,
  );
  assert.throws(
    () => rotation.canonicalWalletRotationIntent({
      ...baseIntentInput(),
      entitlementMigrations: [{ ...migrationA, replacementWalletAddress: currentPair.publicKey() }],
    }),
    /wallet addresses must match/,
  );
});

test('submission verification is exact and never confirms', async () => {
  const proof = await buildVerifiedRotationProof();
  const prepared = await rotation.prepareWalletRotation(
    baseIntentInput(), proof, security, now, cryptoAdapter, 0,
  );
  const validSubmission = {
    intentPayloadHash: prepared.intentPayloadHash,
    replacementWalletProofDigest: prepared.signingPackage.replacementWalletProofDigest,
    entitlementMigrations: prepared.signingPackage.entitlementMigrations,
    envelopeXdr: 'AAAA-signed-envelope',
    authorizationEntries: ['auth-entry-0'],
  };
  const decision = await rotation.verifyRotationAuthorizationSubmission(prepared, validSubmission);
  assert.deepEqual(decision, {
    status: 'submitted',
    intentPayloadHash: prepared.intentPayloadHash,
    attemptNumber: 1,
  });
  assert.notEqual(decision.status, 'confirmed');

  await assert.rejects(
    rotation.verifyRotationAuthorizationSubmission(prepared, {
      ...validSubmission, intentPayloadHash: 'f'.repeat(64),
    }),
    /intent payload hash mismatch/,
  );
  await assert.rejects(
    rotation.verifyRotationAuthorizationSubmission(prepared, {
      ...validSubmission,
      entitlementMigrations: [prepared.signingPackage.entitlementMigrations[0]],
    }),
    /entitlement migrations do not match/,
  );
  await assert.rejects(
    rotation.verifyRotationAuthorizationSubmission(prepared, {
      ...validSubmission, envelopeXdr: null, authorizationEntries: [],
    }),
    /no signed material/,
  );
});

test('confirmation requires observed ledger evidence and couples atomic effects', async () => {
  const proof = await buildVerifiedRotationProof();
  const prepared = await rotation.prepareWalletRotation(
    baseIntentInput(), proof, security, now, cryptoAdapter, 0,
  );
  const observation = {
    network: 'stellar_testnet',
    transactionHash: 'ab'.repeat(32),
    confirmedLedger: 1024,
    intentPayloadHash: prepared.intentPayloadHash,
  };
  const plan = rotation.planConfirmedRotationEffects(
    prepared.intent, prepared.intentPayloadHash, observation,
  );
  assert.equal(plan.status, 'confirmed');
  assert.equal(plan.atomic, true);
  assert.equal(plan.revokeWalletId, currentWalletId);
  assert.equal(plan.activateWalletId, replacementWalletId);
  assert.equal(plan.entitlementMigrations.length, 2);

  // A submission response alone (no observed hash/ledger) cannot confirm.
  assert.throws(
    () => rotation.planConfirmedRotationEffects(prepared.intent, prepared.intentPayloadHash, {
      ...observation, transactionHash: 'not-a-hash',
    }),
    /observed transaction hash/,
  );
  assert.throws(
    () => rotation.planConfirmedRotationEffects(prepared.intent, prepared.intentPayloadHash, {
      ...observation, network: 'stellar_public',
    }),
    /configured testnet/,
  );
  assert.throws(
    () => rotation.planConfirmedRotationEffects(prepared.intent, prepared.intentPayloadHash, {
      ...observation, intentPayloadHash: 'c'.repeat(64),
    }),
    /does not match the rotation intent/,
  );
});

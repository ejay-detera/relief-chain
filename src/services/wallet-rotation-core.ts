import type {
    CanonicalWalletRotationIntent,
    PreparedWalletRotation,
    VerifiedWalletProof,
    WalletProofResponse,
    WalletRotationAuthorizationSubmission,
    WalletRotationConfirmationObservation,
    WalletRotationConfirmationPlan,
    WalletRotationEntitlementMigration,
    WalletRotationIntentInput,
    WalletRotationSecurityContext,
    WalletRotationSigningPackage,
    WalletRotationSubmissionDecision,
} from '@/types/wallet-custody';

import {
    assessWalletRotationPrerequisites,
    verifyWalletProof,
    type WalletProofCrypto,
} from './wallet-custody-core';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STELLAR_ADDRESS = /^G[A-Z2-7]{55}$/;
const STELLAR_CONTRACT_ID = /^C[A-Z2-7]{55}$/;
const HEX_32_BYTES = /^[0-9a-f]{64}$/;
const TRANSACTION_HASH = /^[0-9a-f]{64}$/;

/** Rotation-scoped crypto: only the hash primitive is needed to bind the intent. */
export type WalletRotationCrypto = Readonly<{
  sha256Hex: (value: string) => Promise<string>;
}>;

const assertUuid = (value: string, label: string): void => {
  if (!UUID.test(value)) {
    throw new TypeError(`Wallet rotation ${label} is not a valid identifier.`);
  }
};

const orderMigration = (
  migration: WalletRotationEntitlementMigration,
): WalletRotationEntitlementMigration => ({
  voucherContractId: migration.voucherContractId,
  entitlementId: migration.entitlementId,
  currentWalletAddress: migration.currentWalletAddress,
  replacementWalletAddress: migration.replacementWalletAddress,
});

const normalizeEntitlementMigrations = (
  migrations: readonly WalletRotationEntitlementMigration[],
  currentWalletAddress: string,
  replacementWalletAddress: string,
): readonly WalletRotationEntitlementMigration[] => {
  const seen = new Set<string>();
  const normalized = migrations.map((migration) => {
    if (!STELLAR_CONTRACT_ID.test(migration.voucherContractId)) {
      throw new TypeError('Entitlement migration voucher contract ID is invalid.');
    }
    if (!HEX_32_BYTES.test(migration.entitlementId)) {
      throw new TypeError('Entitlement migration entitlement ID must be a 32-byte hex value.');
    }
    if (
      migration.currentWalletAddress !== currentWalletAddress
      || migration.replacementWalletAddress !== replacementWalletAddress
    ) {
      throw new TypeError('Entitlement migration wallet addresses must match the rotation wallets.');
    }
    const key = `${migration.voucherContractId}:${migration.entitlementId}`;
    if (seen.has(key)) {
      throw new TypeError('Entitlement migrations contain a duplicate contract/entitlement pair.');
    }
    seen.add(key);
    return orderMigration(migration);
  });
  // Deterministic ordering so the payload hash is independent of input order.
  return normalized.sort((left, right) => {
    if (left.voucherContractId !== right.voucherContractId) {
      return left.voucherContractId < right.voucherContractId ? -1 : 1;
    }
    return left.entitlementId < right.entitlementId ? -1
      : left.entitlementId > right.entitlementId ? 1 : 0;
  });
};

/** Builds the deterministic canonical rotation intent, rejecting any inconsistent binding. */
export const canonicalWalletRotationIntent = (
  input: WalletRotationIntentInput,
): CanonicalWalletRotationIntent => {
  assertUuid(input.walletRotationIntentId, 'intent ID');
  assertUuid(input.organizationId, 'organization ID');
  assertUuid(input.beneficiaryIdentityId, 'beneficiary identity ID');
  assertUuid(input.correlationId, 'correlation ID');

  const { currentWallet, replacementWallet } = input;
  for (const wallet of [currentWallet, replacementWallet]) {
    assertUuid(wallet.id, 'wallet ID');
    if (!STELLAR_ADDRESS.test(wallet.address)) {
      throw new TypeError('Wallet rotation wallet address is invalid.');
    }
    if (wallet.network !== 'stellar_testnet') {
      throw new TypeError('Wallet rotation is testnet only.');
    }
    if (wallet.beneficiaryIdentityId !== input.beneficiaryIdentityId) {
      throw new TypeError('Wallet rotation wallets must belong to the same beneficiary identity.');
    }
  }
  if (
    currentWallet.id === replacementWallet.id
    || currentWallet.address === replacementWallet.address
  ) {
    throw new TypeError('Wallet rotation requires distinct current and replacement wallets.');
  }

  return {
    version: 1,
    domain: 'relief-chain.wallet-rotation',
    network: 'stellar_testnet',
    walletRotationIntentId: input.walletRotationIntentId,
    organizationId: input.organizationId,
    beneficiaryIdentityId: input.beneficiaryIdentityId,
    correlationId: input.correlationId,
    currentWalletId: currentWallet.id,
    currentWalletAddress: currentWallet.address,
    replacementWalletId: replacementWallet.id,
    replacementWalletAddress: replacementWallet.address,
    entitlementMigrations: normalizeEntitlementMigrations(
      input.entitlementMigrations,
      currentWallet.address,
      replacementWallet.address,
    ),
  };
};

/** Stable byte encoding used for the payload hash; field order is fixed. */
export const canonicalWalletRotationIntentBytes = (
  intent: CanonicalWalletRotationIntent,
): string => JSON.stringify({
  version: intent.version,
  domain: intent.domain,
  network: intent.network,
  walletRotationIntentId: intent.walletRotationIntentId,
  organizationId: intent.organizationId,
  beneficiaryIdentityId: intent.beneficiaryIdentityId,
  correlationId: intent.correlationId,
  currentWalletId: intent.currentWalletId,
  currentWalletAddress: intent.currentWalletAddress,
  replacementWalletId: intent.replacementWalletId,
  replacementWalletAddress: intent.replacementWalletAddress,
  entitlementMigrations: intent.entitlementMigrations.map(orderMigration),
});

export const hashWalletRotationIntent = async (
  intent: CanonicalWalletRotationIntent,
  crypto: WalletRotationCrypto,
): Promise<string> => {
  const digest = await crypto.sha256Hex(canonicalWalletRotationIntentBytes(intent));
  if (!HEX_32_BYTES.test(digest)) {
    throw new TypeError('Wallet rotation intent digest encoding is invalid.');
  }
  return digest;
};

/**
 * Verifies proof of possession of the replacement wallet. The challenge purpose
 * must be `rotation`; a new-binding proof can never authorize a rotation.
 */
export const verifyReplacementWalletProof = async (
  response: WalletProofResponse,
  expected: Readonly<{
    walletId: string;
    beneficiaryIdentityId: string;
    walletAddress: string;
    challengeDigest?: string;
  }>,
  now: Date,
  crypto: WalletProofCrypto,
): Promise<VerifiedWalletProof> => {
  if (response.challenge.purpose !== 'rotation') {
    throw new TypeError('Replacement wallet proof must use the rotation challenge purpose.');
  }
  return verifyWalletProof(response, { ...expected, purpose: 'rotation' }, now, crypto);
};

/**
 * Prepares an immutable rotation intent and its exact signing package after
 * confirming current-wallet, identity re-verification, and recent step-up
 * prerequisites and binding the verified replacement-wallet proof.
 */
export const prepareWalletRotation = async (
  input: WalletRotationIntentInput,
  proof: VerifiedWalletProof,
  security: WalletRotationSecurityContext,
  now: Date,
  crypto: WalletRotationCrypto,
  previousAttemptCount = 0,
): Promise<PreparedWalletRotation> => {
  if (!Number.isInteger(previousAttemptCount) || previousAttemptCount < 0) {
    throw new TypeError('Previous attempt count must be a non-negative integer.');
  }
  const eligibility = assessWalletRotationPrerequisites(
    input.beneficiaryIdentityId,
    input.currentWallet,
    input.replacementWallet,
    security,
    now,
  );
  if (!eligibility.eligible) {
    throw new TypeError(
      `Wallet rotation prerequisites are not satisfied: ${eligibility.reasons.join(', ')}.`,
    );
  }
  if (
    proof.purpose !== 'rotation'
    || proof.walletId !== input.replacementWallet.id
    || proof.walletAddress !== input.replacementWallet.address
    || proof.beneficiaryIdentityId !== input.beneficiaryIdentityId
  ) {
    throw new TypeError('Verified replacement-wallet proof does not match the rotation intent.');
  }

  const intent = canonicalWalletRotationIntent(input);
  const intentPayloadHash = await hashWalletRotationIntent(intent, crypto);
  const signingPackage: WalletRotationSigningPackage = {
    operationType: 'wallet_rotation',
    network: 'stellar_testnet',
    intentPayloadHash,
    replacementWalletProofDigest: proof.challengeDigest,
    entitlementMigrations: intent.entitlementMigrations,
  };
  return {
    intent,
    intentPayloadHash,
    signingPackage,
    attemptNumber: previousAttemptCount + 1,
  };
};

const migrationsMatch = (
  left: readonly WalletRotationEntitlementMigration[],
  right: readonly WalletRotationEntitlementMigration[],
): boolean =>
  JSON.stringify(left.map(orderMigration)) === JSON.stringify(right.map(orderMigration));

/** Optional adapter that parses and checks signed transaction material (Task 6.2/6.3). */
export type WalletRotationAuthorizationVerifier = (
  submission: WalletRotationAuthorizationSubmission,
  prepared: PreparedWalletRotation,
) => Promise<void> | void;

/**
 * Re-verifies a returned authorization against the stored intent before submission.
 * Returns only `submitted`: confirmation is exclusively a reconciliation outcome.
 */
export const verifyRotationAuthorizationSubmission = async (
  prepared: PreparedWalletRotation,
  submission: WalletRotationAuthorizationSubmission,
  verifyAuthorization?: WalletRotationAuthorizationVerifier,
): Promise<WalletRotationSubmissionDecision> => {
  if (submission.intentPayloadHash !== prepared.intentPayloadHash) {
    throw new TypeError('Submitted authorization intent payload hash mismatch.');
  }
  if (submission.replacementWalletProofDigest
    !== prepared.signingPackage.replacementWalletProofDigest) {
    throw new TypeError('Submitted authorization replacement-wallet proof mismatch.');
  }
  if (!migrationsMatch(submission.entitlementMigrations, prepared.signingPackage.entitlementMigrations)) {
    throw new TypeError('Submitted authorization entitlement migrations do not match the signing package.');
  }
  const hasEnvelope = typeof submission.envelopeXdr === 'string' && submission.envelopeXdr.length > 0;
  const hasAuthEntries = submission.authorizationEntries.length > 0;
  if (!hasEnvelope && !hasAuthEntries) {
    throw new TypeError('Submitted authorization carries no signed material.');
  }
  if (submission.authorizationEntries.some((entry) => typeof entry !== 'string' || entry.length === 0)) {
    throw new TypeError('Submitted authorization contains an empty authorization entry.');
  }
  if (verifyAuthorization) {
    await verifyAuthorization(submission, prepared);
  }
  return {
    status: 'submitted',
    intentPayloadHash: prepared.intentPayloadHash,
    attemptNumber: prepared.attemptNumber,
  };
};

/**
 * Produces the single atomic effect set for a confirmed rotation. Requires real
 * observed ledger evidence on the configured network; a submission response alone
 * can never satisfy confirmation (Requirement 18.8). The returned plan couples old
 * wallet revocation with replacement activation and entitlement migration so they
 * are applied together by `transition_wallet_rotation_intent('confirmed')`.
 */
export const planConfirmedRotationEffects = (
  intent: CanonicalWalletRotationIntent,
  intentPayloadHash: string,
  observation: WalletRotationConfirmationObservation,
): WalletRotationConfirmationPlan => {
  if (!HEX_32_BYTES.test(intentPayloadHash)) {
    throw new TypeError('Wallet rotation intent payload hash is invalid.');
  }
  if (observation.network !== 'stellar_testnet') {
    throw new TypeError('Wallet rotation confirmation must observe the configured testnet.');
  }
  if (!TRANSACTION_HASH.test(observation.transactionHash)) {
    throw new TypeError('Wallet rotation confirmation requires an observed transaction hash.');
  }
  if (!Number.isInteger(observation.confirmedLedger) || observation.confirmedLedger <= 0) {
    throw new TypeError('Wallet rotation confirmation requires a positive observed ledger.');
  }
  if (observation.intentPayloadHash !== intentPayloadHash) {
    throw new TypeError('Observed evidence does not match the rotation intent.');
  }
  return {
    status: 'confirmed',
    beneficiaryIdentityId: intent.beneficiaryIdentityId,
    revokeWalletId: intent.currentWalletId,
    activateWalletId: intent.replacementWalletId,
    entitlementMigrations: intent.entitlementMigrations,
    transactionHash: observation.transactionHash,
    confirmedLedger: observation.confirmedLedger,
    atomic: true,
  };
};

import type {
    VerifiedWalletProof,
    WalletBindingSnapshot,
    WalletProofChallengeV1,
    WalletProofPurpose,
    WalletProofResponse,
    WalletRotationEligibility,
    WalletRotationIneligibilityReason,
    WalletRotationSecurityContext,
} from '@/types/wallet-custody';

const STELLAR_ADDRESS = /^G[A-Z2-7]{55}$/;
const STELLAR_SECRET = /^S[A-Z2-7]{55}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX_32_BYTES = /^[0-9a-f]{64}$/;
const ED25519_SIGNATURE_BASE64 = /^[A-Za-z0-9+/]{86}==$/;
const MAX_CHALLENGE_AGE_MS = 5 * 60_000;
const MAX_IDENTITY_REVERIFICATION_AGE_MS = 24 * 60 * 60_000;
export const WALLET_ROTATION_STEP_UP_MAX_AGE_MS = 10 * 60_000;

export type WalletProofCrypto = Readonly<{
  sha256Hex: (value: string) => Promise<string>;
  verifyEd25519: (address: string, message: string, signatureBase64: string) => Promise<boolean>;
}>;

export type CreateWalletProofChallengeInput = Readonly<{
  purpose: WalletProofPurpose;
  walletId: string;
  beneficiaryIdentityId: string;
  walletAddress: string;
  nonce: string;
  issuedAt: Date;
  expiresAt: Date;
}>;

export const createWalletProofChallenge = (
  input: CreateWalletProofChallengeInput,
): WalletProofChallengeV1 => {
  const challenge: WalletProofChallengeV1 = {
    version: 1,
    domain: 'relief-chain.wallet-proof',
    network: 'stellar_testnet',
    purpose: input.purpose,
    walletId: input.walletId,
    beneficiaryIdentityId: input.beneficiaryIdentityId,
    walletAddress: input.walletAddress,
    nonce: input.nonce,
    issuedAt: input.issuedAt.toISOString(),
    expiresAt: input.expiresAt.toISOString(),
  };
  validateWalletProofChallenge(challenge, input.issuedAt);
  return challenge;
};

const assertChallengeShape = (challenge: WalletProofChallengeV1): void => {
  if (challenge.version !== 1 || challenge.domain !== 'relief-chain.wallet-proof') {
    throw new TypeError('Unsupported wallet proof challenge.');
  }
  if (challenge.network !== 'stellar_testnet') {
    throw new TypeError('Wallet proof challenge must use Stellar testnet.');
  }
  if (challenge.purpose !== 'new_binding' && challenge.purpose !== 'rotation') {
    throw new TypeError('Unsupported wallet proof purpose.');
  }
  if (!UUID.test(challenge.walletId) || !UUID.test(challenge.beneficiaryIdentityId)) {
    throw new TypeError('Wallet proof challenge has an invalid stable identifier.');
  }
  if (!STELLAR_ADDRESS.test(challenge.walletAddress) || !HEX_32_BYTES.test(challenge.nonce)) {
    throw new TypeError('Wallet proof challenge has invalid public-key or nonce data.');
  }
};

export const canonicalWalletProofChallenge = (
  challenge: WalletProofChallengeV1,
): string => {
  assertChallengeShape(challenge);
  return JSON.stringify({
    version: challenge.version,
    domain: challenge.domain,
    network: challenge.network,
    purpose: challenge.purpose,
    walletId: challenge.walletId,
    beneficiaryIdentityId: challenge.beneficiaryIdentityId,
    walletAddress: challenge.walletAddress,
    nonce: challenge.nonce,
    issuedAt: challenge.issuedAt,
    expiresAt: challenge.expiresAt,
  });
};

export type ExpectedWalletProof = Readonly<{
  purpose: WalletProofPurpose;
  walletId: string;
  beneficiaryIdentityId: string;
  walletAddress: string;
  challengeDigest?: string;
}>;

export const validateWalletProofChallenge = (
  challenge: WalletProofChallengeV1,
  now: Date,
  expected?: ExpectedWalletProof,
): void => {
  assertChallengeShape(challenge);
  const issuedAt = Date.parse(challenge.issuedAt);
  const expiresAt = Date.parse(challenge.expiresAt);
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)) {
    throw new TypeError('Wallet proof challenge timestamps are invalid.');
  }
  if (expiresAt <= issuedAt || expiresAt - issuedAt > MAX_CHALLENGE_AGE_MS) {
    throw new TypeError('Wallet proof challenge window is invalid.');
  }
  if (now.getTime() > expiresAt || now.getTime() < issuedAt - 60_000) {
    throw new TypeError('Wallet proof challenge is expired or not yet valid.');
  }
  if (expected && (
    challenge.purpose !== expected.purpose
    || challenge.walletId !== expected.walletId
    || challenge.beneficiaryIdentityId !== expected.beneficiaryIdentityId
    || challenge.walletAddress !== expected.walletAddress
  )) {
    throw new TypeError('Wallet proof challenge does not match the pending binding.');
  }
};

export const verifyWalletProof = async (
  response: WalletProofResponse,
  expected: ExpectedWalletProof,
  now: Date,
  crypto: WalletProofCrypto,
): Promise<VerifiedWalletProof> => {
  validateWalletProofChallenge(response.challenge, now, expected);
  if (!ED25519_SIGNATURE_BASE64.test(response.signatureBase64)) {
    throw new TypeError('Wallet proof signature encoding is invalid.');
  }
  const canonicalChallenge = canonicalWalletProofChallenge(response.challenge);
  const challengeDigest = await crypto.sha256Hex(canonicalChallenge);
  if (!HEX_32_BYTES.test(challengeDigest)) {
    throw new TypeError('Wallet proof digest encoding is invalid.');
  }
  if (expected.challengeDigest && challengeDigest !== expected.challengeDigest) {
    throw new TypeError('Wallet proof challenge digest does not match.');
  }
  if (!await crypto.verifyEd25519(
    response.challenge.walletAddress,
    canonicalChallenge,
    response.signatureBase64,
  )) {
    throw new TypeError('Wallet proof signature is invalid.');
  }
  const signatureDigest = await crypto.sha256Hex(response.signatureBase64);
  if (!HEX_32_BYTES.test(signatureDigest)) {
    throw new TypeError('Wallet proof signature digest encoding is invalid.');
  }
  return {
    walletId: response.challenge.walletId,
    beneficiaryIdentityId: response.challenge.beneficiaryIdentityId,
    walletAddress: response.challenge.walletAddress,
    purpose: response.challenge.purpose,
    challengeDigest,
    signatureDigest,
    verifiedAt: now.toISOString(),
  };
};

const isRecent = (value: string | null, now: Date, maxAgeMs: number): boolean => {
  if (!value) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp)
    && timestamp <= now.getTime() + 60_000
    && timestamp >= now.getTime() - maxAgeMs;
};

const hasFreshIdentityReverification = (
  security: WalletRotationSecurityContext,
  now: Date,
): boolean => {
  if (!isRecent(
    security.identityReverifiedAt,
    now,
    MAX_IDENTITY_REVERIFICATION_AGE_MS,
  )) return false;
  const verifiedAt = Date.parse(security.identityReverifiedAt ?? '');
  const expiresAt = Date.parse(security.identityReverificationExpiresAt ?? '');
  return Number.isFinite(expiresAt)
    && expiresAt > now.getTime()
    && expiresAt <= verifiedAt + MAX_IDENTITY_REVERIFICATION_AGE_MS;
};

export const assessWalletRotationPrerequisites = (
  beneficiaryIdentityId: string,
  currentWallet: WalletBindingSnapshot,
  replacementWallet: WalletBindingSnapshot,
  security: WalletRotationSecurityContext,
  now: Date,
): WalletRotationEligibility => {
  const reasons: WalletRotationIneligibilityReason[] = [];
  if (
    currentWallet.id === replacementWallet.id
    || currentWallet.address === replacementWallet.address
  ) reasons.push('same_wallet');
  if (
    currentWallet.beneficiaryIdentityId !== beneficiaryIdentityId
    || replacementWallet.beneficiaryIdentityId !== beneficiaryIdentityId
  ) reasons.push('identity_mismatch');
  if (!currentWallet.isActive || currentWallet.verificationStatus !== 'verified') {
    reasons.push('current_wallet_not_active');
  }
  if (replacementWallet.verificationStatus !== 'verified') {
    reasons.push('replacement_wallet_not_verified');
  }
  if (replacementWallet.isActive) reasons.push('replacement_wallet_already_active');
  if (!security.identityReverifiedAt) {
    reasons.push('identity_reverification_required');
  } else if (!hasFreshIdentityReverification(security, now)) {
    reasons.push('identity_reverification_expired');
  }
  if (
    security.aal !== 'aal2'
    || !isRecent(security.steppedUpAt, now, WALLET_ROTATION_STEP_UP_MAX_AGE_MS)
  ) reasons.push('recent_step_up_required');
  return reasons.length === 0
    ? { eligible: true, beneficiaryIdentityId }
    : { eligible: false, reasons };
};

const FORBIDDEN_CUSTODY_KEY_FRAGMENTS = [
  'privatekey',
  'secret',
  'seed',
  'mnemonic',
  'recoveryphrase',
] as const;

/** Rejects accidental private-key fields or Stellar secret seeds at adapter boundaries. */
export const assertProductionCustodyBoundary = (value: unknown): void => {
  const visited = new WeakSet<object>();
  const inspect = (candidate: unknown): void => {
    if (typeof candidate === 'string') {
      if (STELLAR_SECRET.test(candidate)) {
        throw new TypeError('Production custody result contains forbidden private-key material.');
      }
      return;
    }
    if (candidate === null || typeof candidate !== 'object') return;
    if (visited.has(candidate)) return;
    visited.add(candidate);
    for (const [key, nested] of Object.entries(candidate)) {
      const normalized = key.replace(/[^a-z]/gi, '').toLowerCase();
      if (FORBIDDEN_CUSTODY_KEY_FRAGMENTS.some((fragment) => normalized.includes(fragment))) {
        throw new TypeError('Production custody result contains forbidden private-key material.');
      }
      inspect(nested);
    }
  };
  inspect(value);
};

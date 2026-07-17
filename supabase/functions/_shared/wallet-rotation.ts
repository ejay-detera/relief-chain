import { Keypair } from '@stellar/stellar-sdk';
import {
    canonicalWalletRotationIntent,
    canonicalWalletRotationIntentBytes,
    hashWalletRotationIntent,
    planConfirmedRotationEffects,
    prepareWalletRotation,
    verifyReplacementWalletProof,
    verifyRotationAuthorizationSubmission,
    type WalletRotationAuthorizationVerifier,
} from '../../../src/services/wallet-rotation-core.ts';
import type {
    CanonicalWalletRotationIntent,
    PreparedWalletRotation,
    VerifiedWalletProof,
    WalletProofResponse,
    WalletRotationAuthorizationSubmission,
    WalletRotationConfirmationObservation,
    WalletRotationConfirmationPlan,
    WalletRotationIntentInput,
    WalletRotationSecurityContext,
    WalletRotationSubmissionDecision,
} from '../../../src/types/wallet-custody.ts';

const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
};

const decodeBase64 = (value: string): Uint8Array => {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) {
    throw new TypeError('Wallet proof signature is not valid base64.');
  }
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

const rotationCrypto = { sha256Hex } as const;

const proofCrypto = {
  sha256Hex,
  verifyEd25519: async (address: string, message: string, signatureBase64: string) => {
    try {
      return Keypair.fromPublicKey(address).verify(
        new TextEncoder().encode(message),
        decodeBase64(signatureBase64),
      );
    } catch {
      return false;
    }
  },
} as const;

/** Verifies proof of possession of the replacement wallet for a rotation. */
export const verifyReplacementWalletRotationProof = (
  response: WalletProofResponse,
  expected: Readonly<{
    walletId: string;
    beneficiaryIdentityId: string;
    walletAddress: string;
    challengeDigest?: string;
  }>,
  now = new Date(),
): Promise<VerifiedWalletProof> =>
  verifyReplacementWalletProof(response, expected, now, proofCrypto);

/** Prepares the immutable rotation intent and exact signing package. */
export const prepareWalletRotationIntent = (
  input: WalletRotationIntentInput,
  proof: VerifiedWalletProof,
  security: WalletRotationSecurityContext,
  now = new Date(),
  previousAttemptCount = 0,
): Promise<PreparedWalletRotation> =>
  prepareWalletRotation(input, proof, security, now, rotationCrypto, previousAttemptCount);

/** Re-verifies the returned authorization; only ever marks the attempt `submitted`. */
export const verifySubmittedWalletRotation = (
  prepared: PreparedWalletRotation,
  submission: WalletRotationAuthorizationSubmission,
  verifyAuthorization?: WalletRotationAuthorizationVerifier,
): Promise<WalletRotationSubmissionDecision> =>
  verifyRotationAuthorizationSubmission(prepared, submission, verifyAuthorization);

/** Computes the atomic confirmed-rotation effect plan from observed ledger evidence. */
export const planConfirmedWalletRotation = (
  intent: CanonicalWalletRotationIntent,
  intentPayloadHash: string,
  observation: WalletRotationConfirmationObservation,
): WalletRotationConfirmationPlan =>
  planConfirmedRotationEffects(intent, intentPayloadHash, observation);

export {
    canonicalWalletRotationIntent,
    canonicalWalletRotationIntentBytes,
    hashWalletRotationIntent
};


import { Keypair } from '@stellar/stellar-sdk';

import {
    createWalletProofChallenge,
    verifyWalletProof,
    type CreateWalletProofChallengeInput
} from '../../../src/services/wallet-custody-core.ts';
import type {
    VerifiedWalletProof,
    WalletProofChallengeV1,
    WalletProofResponse
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

export const generateWalletProofNonce = (): string => {
  const nonce = new Uint8Array(32);
  crypto.getRandomValues(nonce);
  return bytesToHex(nonce);
};

export const issueWalletProofChallenge = (
  input: Omit<CreateWalletProofChallengeInput, 'nonce'>,
): WalletProofChallengeV1 => createWalletProofChallenge({
  ...input,
  nonce: generateWalletProofNonce(),
});

export const verifySubmittedWalletProof = (
  response: WalletProofResponse,
  expected: Readonly<{
    purpose: WalletProofChallengeV1['purpose'];
    walletId: string;
    beneficiaryIdentityId: string;
    walletAddress: string;
    challengeDigest: string;
  }>,
  now = new Date(),
): Promise<VerifiedWalletProof> => verifyWalletProof(response, expected, now, {
  sha256Hex,
  verifyEd25519: async (address, message, signatureBase64) => {
    try {
      return Keypair.fromPublicKey(address).verify(
        new TextEncoder().encode(message),
        decodeBase64(signatureBase64),
      );
    } catch {
      return false;
    }
  },
});

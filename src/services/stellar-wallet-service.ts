import type { ClientSignedSubmission, ClientSigningPackage } from '@/types/payment';
import type { ActivePilotWalletRow, PilotWalletState } from '@/types/wallet';
import type {
    WalletProofChallengeV1,
    WalletProofResponse,
} from '@/types/wallet-custody';
import { authorizeEntry, Keypair, TransactionBuilder, xdr } from '@stellar/stellar-sdk';
import { Buffer } from 'buffer';
import * as SecureStore from 'expo-secure-store';
import 'react-native-get-random-values';

import type { InvoiceV1 } from '@/types/invoice';
import { signInvoice, type UnsignedInvoiceV1 } from '../../shared/invoice-codec';
import {
    pilotWalletSecureStoreKey,
    pilotWalletStorageNamespace,
    resolvePilotWallet,
    type PilotWalletDependencies,
} from './stellar-wallet-service-core';
import {
    canonicalWalletProofChallenge,
    validateWalletProofChallenge,
} from './wallet-custody-core';

const secureStoreOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

const dependencies: PilotWalletDependencies = {
  secretStore: {
    isAvailable: () => SecureStore.isAvailableAsync(),
    get: (storageNamespace) => SecureStore.getItemAsync(
      pilotWalletSecureStoreKey(storageNamespace),
      secureStoreOptions,
    ),
    set: (storageNamespace, secret) => SecureStore.setItemAsync(
      pilotWalletSecureStoreKey(storageNamespace),
      secret,
      secureStoreOptions,
    ),
  },
  keypairs: {
    generate: () => {
      const keypair = Keypair.random();
      return { secret: keypair.secret(), publicKey: keypair.publicKey() };
    },
    derivePublicKey: (secret) => Keypair.fromSecret(secret).publicKey(),
  },
};

/**
 * Loads the current user's disposable testnet signer or provisions one only when
 * no active wallet binding exists. Returned states never contain secret material.
 */
export const loadOrProvisionPilotWallet = (
  userId: string,
  activeWallet: ActivePilotWalletRow | null,
): Promise<PilotWalletState> => resolvePilotWallet(userId, activeWallet, dependencies);

export {
    pilotWalletSecureStoreKey,
    pilotWalletStorageNamespace
} from './stellar-wallet-service-core';


/** Signs a short-lived server challenge with the namespaced disposable testnet key. */
export const signPilotWalletProofChallenge = async (
  userId: string,
  challenge: WalletProofChallengeV1,
  now = new Date(),
): Promise<WalletProofResponse> => {
  validateWalletProofChallenge(challenge, now);
  const storageNamespace = pilotWalletStorageNamespace(userId);
  if (!await SecureStore.isAvailableAsync()) {
    throw new Error('Secure wallet storage is unavailable.');
  }
  const secret = await SecureStore.getItemAsync(
    pilotWalletSecureStoreKey(storageNamespace),
    secureStoreOptions,
  );
  if (!secret) throw new Error('The disposable testnet signer is unavailable.');

  const keypair = Keypair.fromSecret(secret);
  if (keypair.publicKey() !== challenge.walletAddress) {
    throw new Error('The local signer does not match the wallet proof challenge.');
  }
  const signature = keypair.sign(
    Buffer.from(canonicalWalletProofChallenge(challenge), 'utf8'),
  );
  return {
    challenge,
    signatureBase64: Buffer.from(signature).toString('base64'),
  };
};

/**
 * Signs a canonical `reliefchain:invoice:v1` payload with the merchant's
 * namespaced disposable testnet key. The secret never leaves this module: it is
 * read from OS secure storage, checked against the invoice's declared signer,
 * and handed to the shared codec which produces the Ed25519 signature. Throws
 * when secure storage is unavailable, the signer is missing, or the local key
 * does not match `invoiceSigner` (never silently substitutes a different key).
 */
export const signMerchantInvoice = async (
  userId: string,
  unsigned: UnsignedInvoiceV1,
): Promise<InvoiceV1> => {
  const storageNamespace = pilotWalletStorageNamespace(userId);
  if (!await SecureStore.isAvailableAsync()) {
    throw new Error('Secure wallet storage is unavailable.');
  }
  const secret = await SecureStore.getItemAsync(
    pilotWalletSecureStoreKey(storageNamespace),
    secureStoreOptions,
  );
  if (!secret) throw new Error('The disposable testnet signer is unavailable.');

  const keypair = Keypair.fromSecret(secret);
  if (keypair.publicKey() !== unsigned.invoiceSigner) {
    throw new Error('The local signer does not match the invoice signer.');
  }
  return signInvoice(unsigned, secret);
};

/**
 * Loads the current user's disposable testnet keypair from OS secure storage.
 * The secret never leaves this module. Throws when secure storage is
 * unavailable or the signer is missing; the caller then surfaces an explicit
 * recovery state rather than provisioning a silent replacement.
 */
const loadNamespacedKeypair = async (userId: string): Promise<Keypair> => {
  const storageNamespace = pilotWalletStorageNamespace(userId);
  if (!await SecureStore.isAvailableAsync()) {
    throw new Error('Secure wallet storage is unavailable.');
  }
  const secret = await SecureStore.getItemAsync(
    pilotWalletSecureStoreKey(storageNamespace),
    secureStoreOptions,
  );
  if (!secret) throw new Error('The disposable testnet signer is unavailable.');
  return Keypair.fromSecret(secret);
};

/**
 * Signs ONLY the EXACT prepared cash transaction the server returned. The local
 * signer must equal `expectedSigner` (the beneficiary wallet) or signing is
 * refused — the key is never silently substituted. The signature is produced
 * over the exact prepared envelope bound to the given network; nothing about the
 * transaction is altered. A fee-bump is never signed here — the server adds the
 * sponsor fee-bump after verifying this beneficiary signature (Requirements 3.6,
 * 11.6, 14.1).
 */
export const signPreparedCashTransaction = async (
  userId: string,
  expectedSigner: string,
  pkg: Extract<ClientSigningPackage, { kind: 'classic_envelope' }>,
): Promise<ClientSignedSubmission> => {
  const keypair = await loadNamespacedKeypair(userId);
  if (keypair.publicKey() !== expectedSigner) {
    throw new Error('The local signer does not match the prepared payment wallet.');
  }
  const transaction = TransactionBuilder.fromXDR(pkg.unsignedEnvelopeXdr, pkg.networkPassphrase);
  transaction.sign(keypair);
  return { kind: 'classic_envelope', signedEnvelopeXdr: transaction.toXDR() };
};

/**
 * Signs ONLY the EXACT prepared Soroban authorization entry the server returned,
 * authorizing the beneficiary's contract invocation for a voucher redemption.
 * The local signer must equal `expectedSigner` (the beneficiary wallet) or
 * signing is refused. The signature is bound to the exact invocation tree, the
 * server-fixed signature-expiration ledger, and the network; a source-account or
 * sponsor fee payment can never substitute for it (Requirements 3.6, 11.5,
 * 14.1).
 */
export const signPreparedSorobanAuthEntry = async (
  userId: string,
  expectedSigner: string,
  pkg: Extract<ClientSigningPackage, { kind: 'soroban_auth_entry' }>,
): Promise<ClientSignedSubmission> => {
  const keypair = await loadNamespacedKeypair(userId);
  if (keypair.publicKey() !== expectedSigner) {
    throw new Error('The local signer does not match the prepared payment wallet.');
  }
  const entry = xdr.SorobanAuthorizationEntry.fromXDR(pkg.unsignedAuthEntryXdr, 'base64');
  const signed = await authorizeEntry(
    entry,
    keypair,
    pkg.signatureExpirationLedger,
    pkg.networkPassphrase,
  );
  return { kind: 'soroban_auth_entry', signedAuthEntryXdr: signed.toXDR('base64') };
};

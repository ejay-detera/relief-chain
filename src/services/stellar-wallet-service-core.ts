import type { ActivePilotWalletRow, PilotWalletState } from '@/types/wallet';

export type PilotWalletSecretStore = Readonly<{
  isAvailable: () => Promise<boolean>;
  get: (storageNamespace: string) => Promise<string | null>;
  set: (storageNamespace: string, secret: string) => Promise<void>;
}>;

export type PilotWalletKeypairProvider = Readonly<{
  generate: () => Readonly<{ secret: string; publicKey: string }>;
  derivePublicKey: (secret: string) => string;
}>;

export type PilotWalletDependencies = Readonly<{
  secretStore: PilotWalletSecretStore;
  keypairs: PilotWalletKeypairProvider;
}>;

const USER_ID = /^[A-Za-z0-9._-]+$/;
const STELLAR_ADDRESS = /^G[A-Z2-7]{55}$/;

export const pilotWalletStorageNamespace = (userId: string): string => {
  if (!USER_ID.test(userId)) {
    throw new TypeError('Authenticated user ID contains unsupported namespace characters.');
  }
  return `stellar:testnet:${userId}:seed:v1`;
};

/** Expo SecureStore keys cannot contain colons, so encode only at the storage boundary. */
export const pilotWalletSecureStoreKey = (storageNamespace: string): string =>
  storageNamespace.replaceAll(':', '.');

const recovery = (
  storageNamespace: string,
  reason: 'missing_signer' | 'invalid_signer' | 'signer_mismatch',
  activeWallet: ActivePilotWalletRow | null,
  derivedAddress: string | null,
): PilotWalletState => ({
  status: 'recovery_required',
  custodyModel: 'disposable_testnet',
  storageNamespace,
  reason,
  walletId: activeWallet?.id ?? null,
  expectedAddress: activeWallet?.address ?? null,
  derivedAddress,
  canStartRotation: activeWallet !== null,
});

const unavailable = (
  storageNamespace: string,
  reason: 'secure_storage_unavailable' | 'secure_storage_error' | 'invalid_wallet_binding',
): PilotWalletState => ({
  status: 'unavailable',
  custodyModel: 'disposable_testnet',
  storageNamespace,
  reason,
});

export const resolvePilotWallet = async (
  userId: string,
  activeWallet: ActivePilotWalletRow | null,
  dependencies: PilotWalletDependencies,
): Promise<PilotWalletState> => {
  const storageNamespace = pilotWalletStorageNamespace(userId);
  if (activeWallet && (
    activeWallet.network !== 'stellar_testnet'
    || activeWallet.is_active !== true
    || !STELLAR_ADDRESS.test(activeWallet.address)
  )) {
    return unavailable(storageNamespace, 'invalid_wallet_binding');
  }

  try {
    if (!await dependencies.secretStore.isAvailable()) {
      return unavailable(storageNamespace, 'secure_storage_unavailable');
    }

    const storedSecret = await dependencies.secretStore.get(storageNamespace);
    if (!storedSecret) {
      if (activeWallet) return recovery(storageNamespace, 'missing_signer', activeWallet, null);

      const generated = dependencies.keypairs.generate();
      await dependencies.secretStore.set(storageNamespace, generated.secret);
      return {
        status: 'binding_required',
        custodyModel: 'disposable_testnet',
        storageNamespace,
        publicKey: generated.publicKey,
        wasProvisioned: true,
      };
    }

    let derivedAddress: string;
    try {
      derivedAddress = dependencies.keypairs.derivePublicKey(storedSecret);
    } catch {
      return recovery(storageNamespace, 'invalid_signer', activeWallet, null);
    }

    if (!activeWallet) {
      return {
        status: 'binding_required',
        custodyModel: 'disposable_testnet',
        storageNamespace,
        publicKey: derivedAddress,
        wasProvisioned: false,
      };
    }
    if (derivedAddress !== activeWallet.address) {
      return recovery(storageNamespace, 'signer_mismatch', activeWallet, derivedAddress);
    }
    return {
      status: 'ready',
      custodyModel: 'disposable_testnet',
      storageNamespace,
      walletId: activeWallet.id,
      publicKey: derivedAddress,
    };
  } catch {
    return unavailable(storageNamespace, 'secure_storage_error');
  }
};

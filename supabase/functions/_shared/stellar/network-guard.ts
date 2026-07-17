// Fail-closed testnet network guard.
//
// Task 6.1 delivered the trusted configuration boundary (stellar/config.ts,
// wrapping shared/stellar-config.ts). That boundary already fixes the network,
// passphrase, allowlisted Horizon/RPC origins, issuer, and SAC and hard-fails on
// any non-testnet value. This module REUSES that boundary and layers on the
// request-time defense the design requires: a mobile or any other caller MUST
// NOT be able to override the network, Horizon/RPC endpoints, asset identity,
// voucher WASM hash, or contract identities.
//
// Every check here fails closed — an unparseable, mismatched, or unexpected
// value throws rather than falling back to a default. The trusted server
// configuration is the only source of truth; a request may at most echo a value
// that already matches the server, and any deviation is rejected.
//
// This module is pure and Deno-global free (configuration is injected), so it
// stays inside the project-wide type check and is unit-testable in isolation.
//
// Validates: Requirements 1.3, 1.4, 1.7, 24.1

import {
    ALLOWED_HORIZON_ORIGINS,
    ALLOWED_RPC_ORIGINS,
    assertAllowedHorizonOrigin,
    assertAllowedRpcOrigin,
    RCPHP_ASSET_CODE,
    STELLAR_TESTNET_NETWORK,
    STELLAR_TESTNET_NETWORK_PASSPHRASE,
    StellarConfigurationError,
    type StellarTestnetConfig,
} from '../../../../shared/stellar-config.ts';

export { StellarConfigurationError } from '../../../../shared/stellar-config.ts';

// A 32-byte hash rendered as 64 lowercase hex characters. Voucher WASM hashes
// and reason hashes use this shape.
const HEX_32_BYTES = /^[0-9a-f]{64}$/;
const STELLAR_CONTRACT_ID = /^C[A-Z2-7]{55}$/;

/**
 * Optional trusted identities that live outside the network/asset configuration
 * but must still be protected from client override: the approved voucher WASM
 * hash and the set of contract instances the server will interact with.
 */
export interface NetworkGuardOptions {
  /** Approved immutable voucher WASM hash (64 lowercase hex chars). */
  readonly expectedWasmHash?: string;
  /** Contract instances the server is willing to talk to (e.g. SAC, vouchers). */
  readonly allowedContractIds?: readonly string[];
}

/**
 * A client-supplied payload that MIGHT try to steer infrastructure or asset
 * selection. Every field is untrusted; presence of a value that differs from the
 * trusted configuration is a hard failure. All fields are optional because a
 * legitimate request generally omits them entirely.
 */
export interface InfrastructureOverrideRequest {
  readonly network?: unknown;
  readonly networkPassphrase?: unknown;
  readonly horizonUrl?: unknown;
  readonly rpcUrl?: unknown;
  readonly assetCode?: unknown;
  readonly assetIssuer?: unknown;
  readonly issuer?: unknown;
  readonly sacId?: unknown;
  readonly stellarAssetContractId?: unknown;
  readonly wasmHash?: unknown;
  readonly contractWasmHash?: unknown;
  readonly mainnetEnabled?: unknown;
}

const reject = (message: string): never => {
  throw new StellarConfigurationError(message);
};

// Normalizes an allowlisted HTTPS origin for comparison. Reuses the shared
// allowlist parser so behavior is identical to configuration loading.
const originOf = (value: string): string => {
  try {
    return new URL(value).origin;
  } catch {
    return reject('Endpoint override is not a valid URL.');
  }
};

export interface NetworkGuard {
  readonly config: StellarTestnetConfig;

  /** Re-asserts the injected configuration is testnet (defense in depth). */
  assertTestnetConfig(): void;

  /** Throws unless the passphrase is exactly the testnet passphrase. */
  assertNetworkPassphrase(value: string): void;

  /** Throws unless the value resolves to the allowlisted Horizon origin. */
  assertHorizonOrigin(value: string): string;

  /** Throws unless the value resolves to the allowlisted RPC origin. */
  assertRpcOrigin(value: string): string;

  /** Throws unless the asset matches the configured RCPHP identity. */
  assertAsset(input: { code?: unknown; issuer?: unknown; sacId?: unknown }): void;

  /** Throws unless the WASM hash matches the approved hash (when configured). */
  assertWasmHash(value: string): void;

  /** Throws unless the contract id is one the server is configured to use. */
  assertContractAllowed(contractId: string): void;

  /**
   * Rejects any client attempt to override network, endpoints, asset identity,
   * or WASM hash. A field that exactly matches the trusted value is tolerated;
   * anything else fails closed.
   */
  rejectInfrastructureOverride(request: InfrastructureOverrideRequest): void;
}

/**
 * Builds a fail-closed guard bound to the already-validated testnet
 * {@link StellarTestnetConfig}. The guard never mutates configuration; it only
 * asserts that untrusted input agrees with it.
 */
export const createNetworkGuard = (
  config: StellarTestnetConfig,
  options: NetworkGuardOptions = {},
): NetworkGuard => {
  const expectedWasmHash = options.expectedWasmHash?.trim().toLowerCase();
  if (expectedWasmHash !== undefined && !HEX_32_BYTES.test(expectedWasmHash)) {
    // Misconfiguration, not a user error.
    throw new StellarConfigurationError('Expected WASM hash must be 64 lowercase hex characters.');
  }

  const allowedContracts = new Set<string>();
  for (const id of options.allowedContractIds ?? []) {
    if (!STELLAR_CONTRACT_ID.test(id)) {
      throw new StellarConfigurationError('Allowed contract id must be a valid Stellar contract id.');
    }
    allowedContracts.add(id);
  }
  if (config.asset.stellarAssetContractId !== null) {
    allowedContracts.add(config.asset.stellarAssetContractId);
  }

  const assertTestnetConfig = (): void => {
    if (config.network !== STELLAR_TESTNET_NETWORK) {
      reject('Pilot builds only support Stellar testnet.');
    }
    if (config.networkPassphrase !== STELLAR_TESTNET_NETWORK_PASSPHRASE) {
      reject('The configured network passphrase is not Stellar testnet.');
    }
    if (config.mainnetEnabled !== false) {
      reject('Mainnet is hard-disabled for the pilot.');
    }
    // The origins were allowlisted at load; re-assert so a mutated config fails.
    assertAllowedHorizonOrigin(config.horizonUrl);
    assertAllowedRpcOrigin(config.rpcUrl);
  };

  const assertNetworkPassphrase = (value: string): void => {
    if (value !== STELLAR_TESTNET_NETWORK_PASSPHRASE) {
      reject('The requested network passphrase is not the configured testnet passphrase.');
    }
  };

  const assertHorizonOrigin = (value: string): string => {
    const origin = originOf(value);
    if (origin !== config.horizonUrl || !ALLOWED_HORIZON_ORIGINS.some((o) => o === origin)) {
      reject('Horizon endpoint override is not the allowlisted testnet origin.');
    }
    return origin;
  };

  const assertRpcOrigin = (value: string): string => {
    const origin = originOf(value);
    if (origin !== config.rpcUrl || !ALLOWED_RPC_ORIGINS.some((o) => o === origin)) {
      reject('RPC endpoint override is not the allowlisted testnet origin.');
    }
    return origin;
  };

  const assertAsset = (input: { code?: unknown; issuer?: unknown; sacId?: unknown }): void => {
    if (input.code !== undefined && input.code !== RCPHP_ASSET_CODE) {
      reject('The requested asset code is not the configured pilot asset.');
    }
    if (input.issuer !== undefined && input.issuer !== config.asset.issuer) {
      reject('The requested asset issuer does not match the configured issuer.');
    }
    if (input.sacId !== undefined && input.sacId !== config.asset.stellarAssetContractId) {
      reject('The requested asset contract does not match the configured SAC.');
    }
  };

  const assertWasmHash = (value: string): void => {
    if (expectedWasmHash === undefined) {
      reject('No approved voucher WASM hash is configured.');
    }
    if (value.trim().toLowerCase() !== expectedWasmHash) {
      reject('The requested contract WASM hash is not the approved hash.');
    }
  };

  const assertContractAllowed = (contractId: string): void => {
    if (!allowedContracts.has(contractId)) {
      reject('The requested contract is not an allowlisted contract for this server.');
    }
  };

  const rejectInfrastructureOverride = (request: InfrastructureOverrideRequest): void => {
    if (request.mainnetEnabled !== undefined) {
      const normalized = String(request.mainnetEnabled).toLowerCase();
      if (normalized !== 'false') {
        reject('Mainnet cannot be enabled by request.');
      }
    }
    if (request.network !== undefined && request.network !== STELLAR_TESTNET_NETWORK) {
      reject('The network cannot be overridden by request.');
    }
    if (request.networkPassphrase !== undefined) {
      assertNetworkPassphrase(String(request.networkPassphrase));
    }
    if (request.horizonUrl !== undefined) {
      assertHorizonOrigin(String(request.horizonUrl));
    }
    if (request.rpcUrl !== undefined) {
      assertRpcOrigin(String(request.rpcUrl));
    }
    assertAsset({
      code: request.assetCode,
      issuer: request.assetIssuer ?? request.issuer,
      sacId: request.sacId ?? request.stellarAssetContractId,
    });
    const requestedWasm = request.wasmHash ?? request.contractWasmHash;
    if (requestedWasm !== undefined) {
      assertWasmHash(String(requestedWasm));
    }
  };

  return Object.freeze({
    config,
    assertTestnetConfig,
    assertNetworkPassphrase,
    assertHorizonOrigin,
    assertRpcOrigin,
    assertAsset,
    assertWasmHash,
    assertContractAllowed,
    rejectInfrastructureOverride,
  });
};

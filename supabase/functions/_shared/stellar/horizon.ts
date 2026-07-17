// Guarded Horizon client.
//
// The classic cash rail talks to Horizon to read account/sequence state and to
// submit fee-bump-wrapped payments. This module constructs a Horizon server
// bound ONLY to the allowlisted testnet origin from the trusted configuration
// and re-asserts that origin through the network guard before any network I/O.
// A caller cannot point this client at an arbitrary or mainnet host.
//
// Runtime configuration is injected; this module never reads Deno globals.
//
// Validates: Requirements 1.3, 18.7, 24.1

import { Horizon } from '@stellar/stellar-sdk';

import type { StellarTestnetConfig } from '../../../../shared/stellar-config.ts';
import { createNetworkGuard, type NetworkGuard } from './network-guard.ts';

export interface GuardedHorizonClient {
  readonly server: Horizon.Server;
  readonly horizonUrl: string;
  /** Loads an account, failing closed if it does not exist. */
  loadAccount(accountId: string): Promise<Horizon.AccountResponse>;
  /**
   * Submits a fully-signed (classic or fee-bump) transaction. The caller is
   * responsible for building and signing; this only performs guarded transport.
   */
  submitTransaction(
    transaction: Parameters<Horizon.Server['submitTransaction']>[0],
  ): ReturnType<Horizon.Server['submitTransaction']>;
}

/**
 * Creates a Horizon client pinned to the configured, allowlisted testnet origin.
 * The origin is re-validated through the guard so a mutated configuration fails
 * closed rather than reaching an unexpected host.
 */
export const createGuardedHorizonClient = (
  config: StellarTestnetConfig,
  guard: NetworkGuard = createNetworkGuard(config),
): GuardedHorizonClient => {
  guard.assertTestnetConfig();
  const horizonUrl = guard.assertHorizonOrigin(config.horizonUrl);

  // allowHttp stays false: only HTTPS testnet origins are permitted.
  const server = new Horizon.Server(horizonUrl, { allowHttp: false });

  return Object.freeze({
    server,
    horizonUrl,
    loadAccount: (accountId: string) => server.loadAccount(accountId),
    submitTransaction: (transaction: Parameters<Horizon.Server['submitTransaction']>[0]) =>
      server.submitTransaction(transaction),
  });
};

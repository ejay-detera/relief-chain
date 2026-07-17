// Guarded Soroban RPC client.
//
// The voucher rail uses the Soroban RPC endpoint to simulate contract
// invocations, read ledger/network state, and submit contract transactions.
// This module constructs an RPC server bound ONLY to the allowlisted testnet
// origin from the trusted configuration and re-asserts that origin (and the
// live network passphrase reported by the server) through the network guard.
// A caller cannot point this client at an arbitrary or mainnet host.
//
// Runtime configuration is injected; this module never reads Deno globals.
//
// Validates: Requirements 1.3, 18.7, 24.1

import { rpc } from '@stellar/stellar-sdk';

import type { StellarTestnetConfig } from '../../../../shared/stellar-config.ts';
import { createNetworkGuard, type NetworkGuard } from './network-guard.ts';

export interface GuardedRpcClient {
  readonly server: rpc.Server;
  readonly rpcUrl: string;
  /**
   * Reads the network passphrase the endpoint reports and asserts it is the
   * configured testnet passphrase, failing closed on any mismatch. Callers
   * should verify the network before trusting simulation or submission results.
   */
  assertNetwork(): Promise<void>;
}

/**
 * Creates a Soroban RPC client pinned to the configured, allowlisted testnet
 * origin. The origin is re-validated through the guard so a mutated
 * configuration fails closed rather than reaching an unexpected host.
 */
export const createGuardedRpcClient = (
  config: StellarTestnetConfig,
  guard: NetworkGuard = createNetworkGuard(config),
): GuardedRpcClient => {
  guard.assertTestnetConfig();
  const rpcUrl = guard.assertRpcOrigin(config.rpcUrl);

  // allowHttp stays false: only HTTPS testnet origins are permitted.
  const server = new rpc.Server(rpcUrl, { allowHttp: false });

  const assertNetwork = async (): Promise<void> => {
    const { passphrase } = await server.getNetwork();
    guard.assertNetworkPassphrase(passphrase);
  };

  return Object.freeze({ server, rpcUrl, assertNetwork });
};

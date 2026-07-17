import {
    createStellarTestnetConfig,
    requireRCPHPIdentifiers,
    type StellarTestnetConfig,
} from '../../../../shared/stellar-config.ts';

export type EdgeEnvironmentReader = (name: string) => string | undefined;

export const loadEdgeStellarConfig = (
  readEnvironment: EdgeEnvironmentReader,
): StellarTestnetConfig =>
  createStellarTestnetConfig({
    network: readEnvironment('STELLAR_NETWORK'),
    networkPassphrase: readEnvironment('STELLAR_NETWORK_PASSPHRASE'),
    horizonUrl: readEnvironment('STELLAR_HORIZON_URL'),
    rpcUrl: readEnvironment('STELLAR_RPC_URL'),
    rcphpIssuer: readEnvironment('STELLAR_RCPHP_ISSUER'),
    rcphpSacId: readEnvironment('STELLAR_RCPHP_SAC_ID'),
    mainnetEnabled: readEnvironment('STELLAR_MAINNET_ENABLED'),
  });

export { requireRCPHPIdentifiers };

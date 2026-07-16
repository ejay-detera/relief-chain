import {
    createStellarTestnetConfig,
    requireRCPHPIdentifiers,
} from '../../shared/stellar-config';

export const stellarConfig = createStellarTestnetConfig({
  network: process.env.EXPO_PUBLIC_STELLAR_NETWORK,
  networkPassphrase: process.env.EXPO_PUBLIC_STELLAR_NETWORK_PASSPHRASE,
  horizonUrl: process.env.EXPO_PUBLIC_STELLAR_HORIZON_URL,
  rpcUrl: process.env.EXPO_PUBLIC_STELLAR_RPC_URL,
  rcphpIssuer: process.env.EXPO_PUBLIC_STELLAR_RCPHP_ISSUER,
  rcphpSacId: process.env.EXPO_PUBLIC_STELLAR_RCPHP_SAC_ID,
  mainnetEnabled: process.env.EXPO_PUBLIC_STELLAR_MAINNET_ENABLED,
});

export type {
    RCPHPPublicIdentifiers,
    StellarTestnetConfig
} from '../../shared/stellar-config';
export { requireRCPHPIdentifiers };


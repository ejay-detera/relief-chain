export const STELLAR_TESTNET_NETWORK = 'testnet' as const;
export const STELLAR_TESTNET_NETWORK_PASSPHRASE =
  'Test SDF Network ; September 2015' as const;
export const RCPHP_ASSET_CODE = 'RCPHP' as const;
export const RCPHP_DISCLOSURE = 'Testnet only — no real monetary value.' as const;

export const ALLOWED_HORIZON_ORIGINS = [
  'https://horizon-testnet.stellar.org',
] as const;
export const ALLOWED_RPC_ORIGINS = [
  'https://soroban-testnet.stellar.org',
] as const;

export type StellarTestnetNetwork = typeof STELLAR_TESTNET_NETWORK;
export type RCPHPAssetCode = typeof RCPHP_ASSET_CODE;
export type StellarAccountId = string & { readonly __brand: 'StellarAccountId' };
export type StellarContractId = string & { readonly __brand: 'StellarContractId' };

export interface StellarConfigEnvironment {
  readonly network?: string;
  readonly networkPassphrase?: string;
  readonly horizonUrl?: string;
  readonly rpcUrl?: string;
  readonly rcphpIssuer?: string;
  readonly rcphpSacId?: string;
  readonly mainnetEnabled?: string;
}

export interface StellarTestnetConfig {
  readonly network: StellarTestnetNetwork;
  readonly networkPassphrase: typeof STELLAR_TESTNET_NETWORK_PASSPHRASE;
  readonly horizonUrl: (typeof ALLOWED_HORIZON_ORIGINS)[number];
  readonly rpcUrl: (typeof ALLOWED_RPC_ORIGINS)[number];
  readonly mainnetEnabled: false;
  readonly asset: Readonly<{
    code: RCPHPAssetCode;
    issuer: StellarAccountId | null;
    stellarAssetContractId: StellarContractId | null;
    hasMonetaryValue: false;
    disclosure: typeof RCPHP_DISCLOSURE;
  }>;
}

export class StellarConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StellarConfigurationError';
  }
}


export interface RCPHPPublicIdentifiers {
  readonly code: RCPHPAssetCode;
  readonly issuer: StellarAccountId;
  readonly stellarAssetContractId: StellarContractId;
}

const STELLAR_ACCOUNT_ID_PATTERN = /^G[A-Z2-7]{55}$/;
const STELLAR_CONTRACT_ID_PATTERN = /^C[A-Z2-7]{55}$/;

const optionalValue = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

const assertPilotNetwork = (environment: StellarConfigEnvironment): void => {
  const network = optionalValue(environment.network) ?? STELLAR_TESTNET_NETWORK;
  if (network !== STELLAR_TESTNET_NETWORK) {
    throw new StellarConfigurationError('Pilot builds only support Stellar testnet.');
  }

  const passphrase =
    optionalValue(environment.networkPassphrase) ?? STELLAR_TESTNET_NETWORK_PASSPHRASE;
  if (passphrase !== STELLAR_TESTNET_NETWORK_PASSPHRASE) {
    throw new StellarConfigurationError('The configured network passphrase is not Stellar testnet.');
  }

  const mainnetSetting = optionalValue(environment.mainnetEnabled)?.toLowerCase();
  if (mainnetSetting !== undefined && mainnetSetting !== 'false') {
    throw new StellarConfigurationError('Mainnet is hard-disabled for the pilot.');
  }
};

const parseAllowedOrigin = <TAllowedOrigins extends readonly string[]>(
  value: string | undefined,
  fallback: TAllowedOrigins[number],
  allowedOrigins: TAllowedOrigins,
  serviceName: string,
): TAllowedOrigins[number] => {
  const candidate = optionalValue(value) ?? fallback;
  let url: URL;

  try {
    url = new URL(candidate);
  } catch {
    throw new StellarConfigurationError(`${serviceName} must be a valid HTTPS origin.`);
  }

  const hasOnlyOriginPath = url.pathname === '/' && !url.search && !url.hash;
  if (
    url.protocol !== 'https:' ||
    url.username !== '' ||
    url.password !== '' ||
    !hasOnlyOriginPath ||
    !allowedOrigins.some((origin) => origin === url.origin)
  ) {
    throw new StellarConfigurationError(`${serviceName} is not an allowlisted testnet HTTPS origin.`);
  }

  return url.origin as TAllowedOrigins[number];
};


export const assertAllowedHorizonOrigin = (
  value: string | undefined,
): (typeof ALLOWED_HORIZON_ORIGINS)[number] =>
  parseAllowedOrigin(
    value,
    ALLOWED_HORIZON_ORIGINS[0],
    ALLOWED_HORIZON_ORIGINS,
    'Horizon URL',
  );

export const assertAllowedRpcOrigin = (
  value: string | undefined,
): (typeof ALLOWED_RPC_ORIGINS)[number] =>
  parseAllowedOrigin(value, ALLOWED_RPC_ORIGINS[0], ALLOWED_RPC_ORIGINS, 'RPC URL');

const parseIssuer = (value: string | undefined): StellarAccountId | null => {
  const issuer = optionalValue(value);
  if (issuer === undefined) {
    return null;
  }
  if (!STELLAR_ACCOUNT_ID_PATTERN.test(issuer)) {
    throw new StellarConfigurationError('RCPHP issuer must be a valid Stellar public account ID.');
  }
  return issuer as StellarAccountId;
};

const parseSacId = (value: string | undefined): StellarContractId | null => {
  const sacId = optionalValue(value);
  if (sacId === undefined) {
    return null;
  }
  if (!STELLAR_CONTRACT_ID_PATTERN.test(sacId)) {
    throw new StellarConfigurationError('RCPHP SAC ID must be a valid Stellar contract ID.');
  }
  return sacId as StellarContractId;
};

export const createStellarTestnetConfig = (
  environment: StellarConfigEnvironment = {},
): StellarTestnetConfig => {
  assertPilotNetwork(environment);

  const asset = Object.freeze({
    code: RCPHP_ASSET_CODE,
    issuer: parseIssuer(environment.rcphpIssuer),
    stellarAssetContractId: parseSacId(environment.rcphpSacId),
    hasMonetaryValue: false as const,
    disclosure: RCPHP_DISCLOSURE,
  });

  return Object.freeze({
    network: STELLAR_TESTNET_NETWORK,
    networkPassphrase: STELLAR_TESTNET_NETWORK_PASSPHRASE,
    horizonUrl: assertAllowedHorizonOrigin(environment.horizonUrl),
    rpcUrl: assertAllowedRpcOrigin(environment.rpcUrl),
    mainnetEnabled: false as const,
    asset,
  });
};

export const requireRCPHPIdentifiers = (
  config: StellarTestnetConfig,
): RCPHPPublicIdentifiers => {
  if (config.asset.issuer === null || config.asset.stellarAssetContractId === null) {
    throw new StellarConfigurationError(
      'RCPHP public identifiers are not configured. Complete the testnet bootstrap first.',
    );
  }

  return Object.freeze({
    code: config.asset.code,
    issuer: config.asset.issuer,
    stellarAssetContractId: config.asset.stellarAssetContractId,
  });
};
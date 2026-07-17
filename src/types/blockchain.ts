declare const stroopAmountBrand: unique symbol;

/** Canonical, non-negative integer stroop count. Safe for JSON and database numeric/text columns. */
export type StroopAmount = string & { readonly [stroopAmountBrand]: 'StroopAmount' };
export type StellarNetwork = 'testnet';
export type PilotAssetCode = 'RCPHP';
export type FinancialOperationStatus =
  | 'pending'
  | 'submitted'
  | 'confirmed'
  | 'failed'
  | 'cancelled';

const CANONICAL_STROOPS = /^(0|[1-9]\d*)$/;
const MAX_I128_STROOPS = (1n << 127n) - 1n;

export const isStroopAmount = (value: unknown): value is StroopAmount =>
  typeof value === 'string'
  && CANONICAL_STROOPS.test(value)
  && BigInt(value) <= MAX_I128_STROOPS;

export const parseStroopAmount = (value: unknown): StroopAmount => {
  const normalized = typeof value === 'bigint'
    ? value.toString()
    : typeof value === 'number' && Number.isSafeInteger(value)
      ? String(value)
      : value;
  if (!isStroopAmount(normalized)) {
    throw new TypeError('Amount must be a canonical non-negative integer stroop value.');
  }
  return normalized;
};

export type AssetDescriptor = Readonly<{
  code: PilotAssetCode;
  issuer: string;
  sacAddress: string;
  network: StellarNetwork;
}>;

export type LedgerEvidence = Readonly<{
  network: StellarNetwork;
  transactionHash: string;
  ledgerSequence: number;
  confirmedAt: string;
  envelopeXdr?: string;
  contractEventId?: string;
  correlationId: string;
}>;

export type TransactionDiagnosticContext = Readonly<{
  correlationId: string;
  transactionHash?: string;
  envelopeXdr?: string;
  ledgerSequence?: number;
  contractEventId?: string;
  errorCode?: string;
}>;

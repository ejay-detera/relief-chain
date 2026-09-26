import { requireRCPHPIdentifiers, stellarConfig } from '@/config/stellar';
import { parseStroopAmount, type StroopAmount } from '@/types/blockchain';
import type { LiveChainBalance } from '@/types/projection';

export type LiveBalanceUnavailableCode =
  | 'invalid_address'
  | 'configuration_unavailable'
  | 'account_not_found'
  | 'balance_line_missing'
  | 'invalid_balance'
  | 'horizon_unavailable';

export type LiveBalanceUnavailable = Readonly<{
  code: LiveBalanceUnavailableCode;
  message: string;
  retryable: boolean;
}>;

export type LiveChainBalanceResult =
  | { ok: true; data: LiveChainBalance }
  | { ok: false; error: LiveBalanceUnavailable };

export type HorizonFetchResponse = Readonly<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

export type HorizonFetch = (url: string) => Promise<HorizonFetchResponse>;

export type LiveBalanceOptions = Readonly<{
  fetchImpl?: HorizonFetch;
  horizonUrl?: string;
  assetCode?: string;
  assetIssuer?: string;
  now?: () => Date;
}>;

const STELLAR_ADDRESS_PATTERN = /^G[A-Z2-7]{55}$/;
const DECIMAL_STROOPS_PATTERN = /^(\d+)(?:\.(\d{1,7}))?$/;
const STROOPS_PER_UNIT = 10_000_000n;

const defaultFetch: HorizonFetch = (url) =>
  fetch(url).then((response) => ({
    ok: response.ok,
    status: response.status,
    json: (): Promise<unknown> => response.json(),
  }));

const unavailable = (
  code: LiveBalanceUnavailableCode,
  message: string,
  retryable: boolean,
): LiveChainBalanceResult => ({ ok: false, error: { code, message, retryable } });

/**
 * Exact decimal-string to integer stroops using BigInt only — no floating
 * point. Returns null when the value is malformed or out of range so the
 * caller fails closed instead of coercing.
 */
const decimalToStroops = (value: string): StroopAmount | null => {
  const match = DECIMAL_STROOPS_PATTERN.exec(value.trim());
  if (!match) return null;
  try {
    return parseStroopAmount(
      BigInt(match[1]) * STROOPS_PER_UNIT + BigInt((match[2] ?? '').padEnd(7, '0')),
    );
  } catch {
    return null;
  }
};

const balancesOf = (doc: unknown): readonly unknown[] => {
  if (typeof doc !== 'object' || doc === null) return [];
  const balances: unknown = (doc as Record<string, unknown>).balances;
  return Array.isArray(balances) ? balances : [];
};

const isRCPHPLine = (line: unknown, assetCode: string, assetIssuer: string): boolean => {
  if (typeof line !== 'object' || line === null) return false;
  const record = line as Record<string, unknown>;
  return record.asset_code === assetCode && record.asset_issuer === assetIssuer;
};

const balanceOf = (line: unknown): string | null => {
  if (typeof line !== 'object' || line === null) return null;
  const balance: unknown = (line as Record<string, unknown>).balance;
  return typeof balance === 'string' ? balance : null;
};

/**
 * Reads one wallet's live RCPHP balance from the configured testnet Horizon.
 * Read-only: a single account GET, no secrets, no signing, no writes.
 * Network and issuer come from the shared Stellar testnet config (which
 * throws on anything but testnet); only explicit test overrides may replace
 * them. Every failure mode returns a typed unavailable reason — never a
 * blank balance and never a fabricated zero.
 */
export const fetchLiveRCPHPBalance = async (
  address: string,
  options: LiveBalanceOptions = {},
): Promise<LiveChainBalanceResult> => {
  if (!STELLAR_ADDRESS_PATTERN.test(address)) {
    return unavailable('invalid_address', 'Not a valid Stellar account address.', false);
  }

  let horizonUrl: string;
  let assetCode: string;
  let assetIssuer: string;
  try {
    horizonUrl = options.horizonUrl ?? stellarConfig.horizonUrl;
    assetCode = options.assetCode ?? stellarConfig.asset.code;
    assetIssuer = options.assetIssuer ?? requireRCPHPIdentifiers(stellarConfig).issuer;
  } catch (err: unknown) {
    return unavailable(
      'configuration_unavailable',
      err instanceof Error ? err.message : 'Stellar testnet configuration is unavailable.',
      false,
    );
  }

  const fetchImpl = options.fetchImpl ?? defaultFetch;
  let response: HorizonFetchResponse;
  try {
    response = await fetchImpl(`${horizonUrl}/accounts/${address}`);
  } catch {
    return unavailable('horizon_unavailable', 'Unable to reach Horizon for the live balance.', true);
  }

  if (!response.ok) {
    if (response.status === 404) {
      return unavailable(
        'account_not_found',
        'The Stellar account was not found. It may not be funded yet.',
        true,
      );
    }
    return unavailable(
      'horizon_unavailable',
      `Horizon returned status ${response.status} for the live balance.`,
      true,
    );
  }

  let doc: unknown;
  try {
    doc = await response.json();
  } catch {
    return unavailable('horizon_unavailable', 'Horizon returned an unreadable response.', true);
  }

  const line = balancesOf(doc).find((candidate) => isRCPHPLine(candidate, assetCode, assetIssuer));
  if (!line) {
    // No RCPHP trustline or no balance line: report unavailable rather than
    // inventing a zero — absence of a line is not proof of a zero balance.
    return unavailable(
      'balance_line_missing',
      'No RCPHP balance line was found for this wallet.',
      true,
    );
  }

  const raw = balanceOf(line);
  const stroops = raw === null ? null : decimalToStroops(raw);
  if (stroops === null) {
    return unavailable('invalid_balance', 'Horizon returned an unreadable RCPHP balance.', true);
  }

  return {
    ok: true,
    data: {
      balanceStroops: stroops,
      fetchedAt: (options.now?.() ?? new Date()).toISOString(),
      address,
    },
  };
};

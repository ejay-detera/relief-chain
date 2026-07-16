import { supabase } from '@/lib/supabase';
import type { FinancialError, FinancialResult } from '@/types/errors';

/**
 * Client boundary for beneficiary wallet provisioning.
 *
 * A phone wallet must sign its OWN changeTrust to gain an authorized RCPHP
 * trustline. This service asks the server to build the exact sponsored trustline
 * transaction, and (after the wallet signs it locally) relays it for the sponsor
 * co-signature, issuer authorization, and verified wallet-row binding. The
 * mobile app never holds an institutional secret and the server never returns
 * one (Requirements 3.3, 3.6, 14.1, 16.2).
 */

const PREPARE_FUNCTION = 'prepare-wallet-provision';
const SUBMIT_FUNCTION = 'submit-wallet-provision';

/** Server-prepared provisioning transaction (or a signal it is already done). */
export type PreparedProvision = Readonly<{
  alreadyProvisioned: boolean;
  walletAddress: string;
  /** Present only when provisioning is required. */
  unsignedTxXdr?: string;
  networkPassphrase?: string;
  expectedSigner?: string;
}>;

export type SubmittedProvision = Readonly<{ provisioned: boolean; walletAddress: string }>;

const unknownError = (message: string): FinancialError => ({
  code: 'dependency_unavailable',
  message,
  retryable: true,
  correlationId: 'client-unresolved',
});

const toFinancialError = (value: unknown, fallback: string): FinancialError => {
  if (value && typeof value === 'object') {
    const candidate = value as Partial<FinancialError> & { error?: Partial<FinancialError> };
    const source = candidate.error ?? candidate;
    if (typeof source.code === 'string' && typeof source.message === 'string') {
      return {
        code: source.code as FinancialError['code'],
        message: source.message,
        retryable: source.retryable ?? false,
        correlationId: source.correlationId ?? 'client-unresolved',
        fieldErrors: source.fieldErrors,
      };
    }
  }
  return unknownError(fallback);
};

/** Asks the server to build the sponsored RCPHP trustline for the wallet. */
export const prepareWalletProvision = async (
  walletAddress: string,
): Promise<FinancialResult<PreparedProvision>> => {
  try {
    const { data, error } = await supabase.functions.invoke<{
      provision?: PreparedProvision;
      error?: FinancialError;
    }>(PREPARE_FUNCTION, { body: { walletAddress } });

    if (error) {
      return { ok: false, error: toFinancialError(error.context ?? error, error.message) };
    }
    if (!data?.provision) {
      return { ok: false, error: toFinancialError(data?.error, 'Wallet provisioning could not be prepared.') };
    }
    return { ok: true, data: data.provision };
  } catch (err) {
    return {
      ok: false,
      error: unknownError(err instanceof Error ? err.message : 'Wallet provisioning is unavailable.'),
    };
  }
};

/** Relays the wallet-signed trustline for sponsor co-signature and authorization. */
export const submitWalletProvision = async (
  walletAddress: string,
  signedTxXdr: string,
): Promise<FinancialResult<SubmittedProvision>> => {
  try {
    const { data, error } = await supabase.functions.invoke<{
      provision?: SubmittedProvision;
      error?: FinancialError;
    }>(SUBMIT_FUNCTION, { body: { walletAddress, signedTxXdr } });

    if (error) {
      return { ok: false, error: toFinancialError(error.context ?? error, error.message) };
    }
    if (!data?.provision) {
      return { ok: false, error: toFinancialError(data?.error, 'Wallet provisioning could not be submitted.') };
    }
    return { ok: true, data: data.provision };
  } catch (err) {
    return {
      ok: false,
      error: unknownError(err instanceof Error ? err.message : 'Wallet provisioning is unavailable.'),
    };
  }
};

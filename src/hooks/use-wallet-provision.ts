import { useCallback, useState } from 'react';

import { signPreparedProvisionTransaction } from '@/services/stellar-wallet-service';
import { prepareWalletProvision, submitWalletProvision } from '@/services/wallet-provision-service';
import type { FinancialError } from '@/types/errors';

/**
 * Orchestrates beneficiary wallet provisioning from the app:
 *   1. ask the server to build the sponsored RCPHP trustline,
 *   2. sign the changeTrust locally with the wallet key, and
 *   3. relay it for the sponsor co-signature + issuer authorization.
 *
 * Confirmation is on-chain and server-owned; this hook only reports the honest
 * lifecycle and never fabricates success.
 */
export type WalletProvisionState =
  | { readonly status: 'idle' }
  | { readonly status: 'working' }
  | { readonly status: 'provisioned' }
  | { readonly status: 'error'; readonly error: FinancialError };

const clientError = (
  code: FinancialError['code'],
  message: string,
  retryable: boolean,
): FinancialError => ({ code, message, retryable, correlationId: 'client-unresolved' });

export const useWalletProvision = (userId: string, walletAddress: string) => {
  const [state, setState] = useState<WalletProvisionState>({ status: 'idle' });

  const provision = useCallback(async (): Promise<void> => {
    setState({ status: 'working' });

    const prepared = await prepareWalletProvision(walletAddress);
    if (!prepared.ok) {
      setState({ status: 'error', error: prepared.error });
      return;
    }
    if (prepared.data.alreadyProvisioned) {
      setState({ status: 'provisioned' });
      return;
    }

    const { unsignedTxXdr, networkPassphrase, expectedSigner } = prepared.data;
    if (!unsignedTxXdr || !networkPassphrase || !expectedSigner) {
      setState({ status: 'error', error: clientError('dependency_unavailable', 'Incomplete provisioning package.', true) });
      return;
    }

    let signedTxXdr: string;
    try {
      signedTxXdr = await signPreparedProvisionTransaction(userId, expectedSigner, unsignedTxXdr, networkPassphrase);
    } catch (err) {
      setState({
        status: 'error',
        error: clientError('signing_failed', err instanceof Error ? err.message : 'Signing failed.', false),
      });
      return;
    }

    const submitted = await submitWalletProvision(walletAddress, signedTxXdr);
    if (!submitted.ok) {
      setState({ status: 'error', error: submitted.error });
      return;
    }
    setState({ status: 'provisioned' });
  }, [userId, walletAddress]);

  return { state, provision } as const;
};

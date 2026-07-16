import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { loadOrProvisionPilotWallet } from '@/services/stellar-wallet-service';
import type { ActivePilotWalletRow, PilotWalletState } from '@/types/wallet';

export type PilotWalletHook = Readonly<{
  state: PilotWalletState | null;
  isLoading: boolean;
  /** Set only when the active-binding lookup fails; the local signer state is then withheld. */
  error: string | null;
  refresh: () => Promise<void>;
}>;

/** The public key is exposed only when the local signer exists and is not in a recovery state. */
export const pilotWalletPublicKey = (state: PilotWalletState | null): string | null =>
  state && (state.status === 'ready' || state.status === 'binding_required')
    ? state.publicKey
    : null;

const toActiveWalletRow = (row: {
  id: string;
  network: string;
  address: string;
  is_active: boolean;
} | null): ActivePilotWalletRow | null => {
  if (!row || row.network !== 'stellar_testnet' || row.is_active !== true) return null;
  return {
    id: row.id,
    network: 'stellar_testnet',
    address: row.address,
    is_active: true,
  };
};

/**
 * Loads the current user's disposable testnet signer through the namespaced wallet
 * core. It resolves the active verified wallet binding under RLS, then defers to the
 * core for provisioning, mismatch, and recovery decisions. It never mutates the
 * profile, never reads Horizon, and never fabricates balances or transactions.
 */
export function usePilotWallet(): PilotWalletHook {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [state, setState] = useState<PilotWalletState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    if (!userId) {
      setState(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const { data, error: queryError } = await supabase
        .from('wallets')
        .select('id, network, address, is_active')
        .eq('purpose', 'beneficiary')
        .eq('network', 'stellar_testnet')
        .eq('is_active', true)
        .eq('verification_status', 'verified')
        .limit(1);

      if (queryError) throw queryError;
      if (request !== requestRef.current) return;

      const activeWallet = toActiveWalletRow(data?.[0] ?? null);
      const resolved = await loadOrProvisionPilotWallet(userId, activeWallet);
      if (request !== requestRef.current) return;

      setState(resolved);
    } catch (err: unknown) {
      if (request !== requestRef.current) return;
      // Withhold signer state rather than guessing the binding when the lookup fails.
      setState(null);
      setError(
        err instanceof Error ? err.message : 'Unable to load the wallet binding.',
      );
    } finally {
      if (request === requestRef.current) setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { state, isLoading, error, refresh: load };
}

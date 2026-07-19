import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { loadOrProvisionPilotWallet } from '@/services/stellar-wallet-service';
import type { ActivePilotWalletRow, PilotWalletState } from '@/types/wallet';

export type MerchantWalletHook = Readonly<{
  state: PilotWalletState | null;
  merchantEntityId: string | null;
  isLoading: boolean;
  /** Set only when the active-binding lookup fails; the local signer state is then withheld. */
  error: string | null;
  refresh: () => Promise<void>;
}>;

export const merchantWalletPublicKey = (state: PilotWalletState | null): string | null => {
  if (!state) return null;
  if (state.status === 'ready' || state.status === 'binding_required') return state.publicKey;
  if (state.status === 'recovery_required' && state.expectedAddress) return state.expectedAddress;
  return null;
};

/** True only when the signer matches a verified active merchant wallet binding. */
export const isVerifiedMerchantWallet = (state: PilotWalletState | null): boolean =>
  state?.status === 'ready';

const toActiveWalletRow = (row: {
  id: string;
  network: string;
  address: string;
  is_active: boolean;
} | null): ActivePilotWalletRow | null => {
  if (!row || row.network !== 'stellar_testnet' || row.is_active !== true) return null;
  return { id: row.id, network: 'stellar_testnet', address: row.address, is_active: true };
};

/**
 * Loads the current merchant's disposable testnet signer through the namespaced
 * wallet core. It resolves the active verified merchant wallet binding under RLS,
 * then defers to the core for provisioning, mismatch, and recovery decisions. It
 * never mutates the profile, never reads Horizon, and never fabricates balances.
 */
export function useMerchantWallet(): MerchantWalletHook {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [state, setState] = useState<PilotWalletState | null>(null);
  const [merchantEntityId, setMerchantEntityId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    if (!userId) {
      setState(null);
      setMerchantEntityId(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      // First get the merchant entity for this user
      const { data: merchantData, error: merchantError } = await supabase
        .from('merchant_entities')
        .select('id')
        .eq('profile_id', userId)
        .single();

      if (merchantError) throw new Error('No merchant entity found for this user');
      if (request !== requestRef.current) return;

      const merchantId = merchantData.id;
      setMerchantEntityId(merchantId);

      // Now get the wallet for this merchant entity
      const { data, error: queryError } = await supabase
        .from('wallets')
        .select('id, network, address, is_active')
        .eq('owner_type', 'merchant_entity')
        .eq('owner_id', merchantId)
        .eq('purpose', 'merchant_settlement')
        .eq('network', 'stellar_testnet')
        .eq('is_active', true)
        .eq('verification_status', 'verified')
        .limit(1);

      if (queryError) throw queryError;
      if (request !== requestRef.current) return;

      const row = data?.[0] ?? null;
      
      const activeWallet = toActiveWalletRow(row);
      const resolved = await loadOrProvisionPilotWallet(userId, activeWallet);
      if (request !== requestRef.current) return;

      setState(resolved);
    } catch (err: unknown) {
      if (request !== requestRef.current) return;
      setState(null);
      setMerchantEntityId(null);
      setError(err instanceof Error ? err.message : 'Unable to load the merchant wallet binding.');
    } finally {
      if (request === requestRef.current) setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    void load();
  }, [load]);

  return { state, merchantEntityId, isLoading, error, refresh: load };
}

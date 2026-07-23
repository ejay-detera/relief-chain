import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import Constants from 'expo-constants';
import { useCallback, useEffect, useState } from 'react';

const DEMO_MODE = Constants.expoConfig?.extra?.EXPO_PUBLIC_DEMO_MODE === 'true';

export interface TreasuryBalances {
  availableStroops: bigint;
  reservedStroops: bigint;
  totalStroops: bigint;
}

const HORIZON_URL = process.env.EXPO_PUBLIC_STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org';
const RCPHP_ISSUER = process.env.EXPO_PUBLIC_STELLAR_RCPHP_ISSUER || 'GBC6HZTIUH6C3KQR5D3NOS2PJ7YKQJQNAQGAO3WO4PICJEXPAPGRKSQ7';

export function useOrganizationTreasury() {
  const { profile } = useAuth();
  const [balances, setBalances] = useState<TreasuryBalances | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBalances = useCallback(async () => {
    if (!profile) return;
    setIsLoading(true);
    setError(null);

    // In demo mode, return mock balances
    if (DEMO_MODE) {
      setBalances({
        availableStroops: BigInt(213000 * 10000000), // 213,000 RCPHP
        reservedStroops: BigInt(50000 * 10000000),   // 50,000 RCPHP reserved
        totalStroops: BigInt(263000 * 10000000),     // 263,000 RCPHP total
      });
      setIsLoading(false);
      return;
    }

    try {
      // 1. Get the user's organization from memberships
      const { data: membershipData, error: memError } = await supabase
        .from('organization_memberships')
        .select('organization_id')
        .eq('user_id', profile.id)
        .eq('is_active', true)
        .limit(1)
        .single();

      if (memError || !membershipData) throw new Error('No active organization membership found');
      const orgId = membershipData.organization_id;

      // 2. Get the treasury wallet address
      const { data: walletData, error: walletError } = await supabase
        .from('wallets')
        .select('address')
        .eq('owner_type', 'organization')
        .eq('owner_id', orgId)
        .eq('purpose', 'organization_treasury')
        .eq('is_active', true)
        .limit(1)
        .single();

      if (walletError || !walletData) throw new Error('Organization treasury wallet not found');
      const treasuryAddress = walletData.address;

      // 3. Fetch balance from Horizon (dynamic import to avoid SDK issues)
      const { Horizon } = await import('@stellar/stellar-sdk');
      const server = new Horizon.Server(HORIZON_URL);
      const account = await server.loadAccount(treasuryAddress);
      
      const rcphpBalance = account.balances.find(
        (b) => b.asset_type !== 'native' && 'asset_code' in b && b.asset_code === 'RCPHP' && b.asset_issuer === RCPHP_ISSUER
      );

      const availableStr = rcphpBalance ? rcphpBalance.balance : '0';
      const availableStroops = BigInt(Math.floor(parseFloat(availableStr) * 10000000));

      // 4. Estimate reserved budget from programs
      const { data: programsData, error: progError } = await supabase
        .from('programs')
        .select('total_budget')
        .eq('organization_id', orgId)
        .eq('status', 'Published'); // Published programs hold reserved funds

      let reservedTotal = 0;
      if (!progError && programsData) {
        reservedTotal = programsData.reduce((sum, p) => sum + (p.total_budget || 0), 0);
      }
      const reservedStroops = BigInt(reservedTotal * 10000000);

      setBalances({
        availableStroops,
        reservedStroops,
        totalStroops: availableStroops + reservedStroops,
      });
    } catch (err: any) {
      console.error('Failed to fetch treasury balances:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    void fetchBalances();
  }, [fetchBalances]);

  return { balances, isLoading, error, refresh: fetchBalances };
}

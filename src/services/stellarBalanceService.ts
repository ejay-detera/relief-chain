import { Horizon } from '@stellar/stellar-sdk';
import { supabase } from '@/lib/supabase';

// Assuming testnet for this project, matching edge function behavior
const server = new Horizon.Server('https://horizon-testnet.stellar.org');

export type StellarBalance = {
  assetCode: string;
  balance: string;
};

/**
 * Fetches the real-time Stellar token balances for a given public key from Horizon.
 */
export const fetchStellarBalances = async (publicKey: string): Promise<StellarBalance[]> => {
  try {
    const account = await server.loadAccount(publicKey);
    return account.balances.map((b) => ({
      assetCode: b.asset_type === 'native' ? 'XLM' : (b as any).asset_code,
      balance: b.balance,
    }));
  } catch (error: any) {
    if (error?.response?.status === 404) {
      // Account not funded on chain yet
      return [{ assetCode: 'XLM', balance: '0.0000000' }];
    }
    throw error;
  }
};

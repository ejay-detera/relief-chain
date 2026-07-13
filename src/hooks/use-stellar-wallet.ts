import { useState, useEffect, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import * as StellarSdk from '@stellar/stellar-sdk';
import { StellarWallet, RedemptionRecord } from '@/types/wallet';
import { supabase } from '@/lib/supabase';

const HORIZON_TESTNET = 'https://horizon-testnet.stellar.org';
const SECRET_KEY_NAME = 'stellar_secret';

export function useStellarWallet() {
  const [wallet, setWallet] = useState<StellarWallet | null>(null);
  const [payments, setPayments] = useState<RedemptionRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const initWallet = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      let publicKey = '';

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("No active session");

      const { data: profile } = await supabase
        .from('profiles')
        .select('stellar_pubkey')
        .eq('id', session.user.id)
        .single();

      if (profile?.stellar_pubkey) {
        publicKey = profile.stellar_pubkey;
      } else {
        // Fallback to secure store logic if not in DB (should have been set during sign up)
        let secret = await SecureStore.getItemAsync(SECRET_KEY_NAME);
        if (!secret) {
          const keypair = StellarSdk.Keypair.random();
          secret = keypair.secret();
          await SecureStore.setItemAsync(SECRET_KEY_NAME, secret);
        }
        const keypair = StellarSdk.Keypair.fromSecret(secret);
        publicKey = keypair.publicKey();

        // Save to DB for future
        await supabase
          .from('profiles')
          .update({ stellar_pubkey: publicKey })
          .eq('id', session.user.id);
      }

      // Fetch from Horizon Testnet
      const accountResponse = await fetch(`${HORIZON_TESTNET}/accounts/${publicKey}`);
      if (accountResponse.status === 404) {
        setWallet({ publicKey, xlmBalance: '0.00', isActivated: false });
      } else if (!accountResponse.ok) {
        throw new Error(`Failed to fetch account: ${accountResponse.status}`);
      } else {
        const accountData = await accountResponse.json();
        const xlmBalanceObj = accountData.balances.find((b: any) => b.asset_type === 'native');
        const xlmBalance = xlmBalanceObj ? xlmBalanceObj.balance : '0.00';
        setWallet({ publicKey, xlmBalance, isActivated: true });
      }

      // Fetch payments
      const paymentsResponse = await fetch(`${HORIZON_TESTNET}/accounts/${publicKey}/payments?order=desc&limit=20`);
      if (paymentsResponse.ok) {
        const paymentsData = await paymentsResponse.json();
        
        const mappedRecords: RedemptionRecord[] = paymentsData._embedded.records.map((r: any) => ({
          id: r.id,
          merchant: r.from === publicKey ? 'Payment Sent' : 'Payment Received',
          amount: r.amount || '0',
          category: 'Cash',
          date: new Date(r.created_at).toLocaleDateString(),
          remainingBalance: '---',
          txHash: r.transaction_hash,
          status: r.successful ? 'Completed' : 'Failed'
        }));
        setPayments(mappedRecords);
      }

    } catch (err: any) {
      console.error('Wallet error', err);
      setError(err.message || 'An error occurred initializing wallet');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    initWallet();
  }, [initWallet]);

  return { wallet, payments, isLoading, error, refresh: initWallet };
}

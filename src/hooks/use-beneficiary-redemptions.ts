import { DUMMY_TRANSACTIONS } from '@/constants/dummy-data';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { RedemptionRecord } from '@/types/wallet';
import { useEffect, useState } from 'react';

export function useBeneficiaryRedemptions() {
  const { session } = useAuth();
  const [redemptions, setRedemptions] = useState<RedemptionRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!session) return;
    
    const fetchRedemptions = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('redemptions')
          .select('*')
          .eq('beneficiary_id', session.user.id)
          .order('redeemed_at', { ascending: false });
          
        if (error) throw error;
        
        if (data) {
          const mapped: RedemptionRecord[] = data.map((r: any) => ({
            id: r.id,
            merchant: r.merchant_name || 'Unknown Merchant',
            amount: `₱${r.amount}`,
            category: r.category,
            date: new Date(r.redeemed_at).toLocaleDateString(),
            remainingBalance: r.remaining_balance ? `₱${r.remaining_balance}` : '---',
            txHash: r.tx_hash || 'Pending...',
            status: r.status,
            direction: 'debit',
          }));
          setRedemptions(mapped.length > 0 ? mapped : DUMMY_TRANSACTIONS);
        } else {
          setRedemptions(DUMMY_TRANSACTIONS);
        }
      } catch (e) {
        console.error('Error fetching redemptions, using fallback transaction data', e);
        setRedemptions(DUMMY_TRANSACTIONS);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchRedemptions();
  }, [session]);

  return { redemptions, isLoading };
}

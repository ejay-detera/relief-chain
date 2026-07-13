import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { RedemptionRecord } from '@/types/wallet';

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
          }));
          setRedemptions(mapped);
        }
      } catch (e) {
        console.error('Error fetching redemptions', e);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchRedemptions();
  }, [session]);

  return { redemptions, isLoading };
}

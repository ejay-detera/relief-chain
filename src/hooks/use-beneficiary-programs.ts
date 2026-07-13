import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { EnrolledProgram, Voucher } from '@/types/wallet';

export function useBeneficiaryPrograms() {
  const { session } = useAuth();
  const [programs, setPrograms] = useState<EnrolledProgram[]>([]);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!session) return;
    
    const fetchPrograms = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('enrollments')
          .select(`
            id,
            approval_status,
            voucher_balance,
            category,
            expires_at,
            program:programs (
              id,
              name,
              purpose,
              status
            )
          `)
          .eq('beneficiary_id', session.user.id);
          
        if (error) throw error;
        
        if (data) {
          const mappedPrograms: EnrolledProgram[] = data.map((e: any) => ({
            id: e.program.id,
            name: e.program.name,
            approvalStatus: e.approval_status,
            voucherBalance: `₱${e.voucher_balance}`,
            purpose: e.program.purpose,
            expiresAt: new Date(e.expires_at).toLocaleDateString(),
          }));
          
          const mappedVouchers: Voucher[] = data.map((e: any) => ({
            id: e.id, 
            category: e.category,
            amount: `₱${e.voucher_balance}`,
            program: e.program.name,
            purpose: e.program.purpose,
            expiresAt: new Date(e.expires_at).toLocaleDateString(),
            status: e.voucher_balance > 0 ? 'Available' : 'Redeemed',
            stellarAssetCode: 'XLM' 
          }));
          
          setPrograms(mappedPrograms);
          setVouchers(mappedVouchers);
        }
      } catch (e) {
        console.error('Error fetching programs', e);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchPrograms();
  }, [session]);

  return { programs, vouchers, isLoading };
}

import { DUMMY_PROGRAMS, DUMMY_VOUCHERS } from '@/constants/dummy-data';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { EnrolledProgram, Voucher } from '@/types/wallet';
import { useEffect, useState } from 'react';

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
            // Placeholder until backend tracks disbursement progress and schedule.
            progressPercent: 65,
            nextDisbursementDate: 'July 23, 2026',
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
          
          setPrograms(mappedPrograms.length > 0 ? mappedPrograms : DUMMY_PROGRAMS);
          setVouchers(mappedVouchers.length > 0 ? mappedVouchers : DUMMY_VOUCHERS);
        } else {
          setPrograms(DUMMY_PROGRAMS);
          setVouchers(DUMMY_VOUCHERS);
        }
      } catch (e) {
        // Fall back to dummy data so the dashboard's Active Program section and
        // My Assistance page never render empty when the query fails.
        console.error('Error fetching programs, using fallback program data', e);
        setPrograms(DUMMY_PROGRAMS);
        setVouchers(DUMMY_VOUCHERS);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchPrograms();
  }, [session]);

  return { programs, vouchers, isLoading };
}

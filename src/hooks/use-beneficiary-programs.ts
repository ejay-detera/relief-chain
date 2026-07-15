import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { EnrolledProgram, Voucher } from '@/types/wallet';
import { useCallback, useEffect, useState } from 'react';

export function useBeneficiaryPrograms() {
  const { session } = useAuth();
  const [programs, setPrograms] = useState<EnrolledProgram[]>([]);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchPrograms = useCallback(async () => {
    if (!session) return;

    setIsLoading(true);
    try {
      const { data, error: queryError } = await supabase
        .from('enrollments')
        .select(`
          id,
          approval_status,
          voucher_balance,
          category,
          expires_at,
          created_at,
          program:programs (
            id,
            name,
            purpose,
            status
          )
        `)
        .eq('beneficiary_id', session.user.id);

      if (queryError) throw queryError;

      const rows = data ?? [];

      const mappedPrograms: EnrolledProgram[] = rows.map((e: any) => ({
        id: e.program.id,
        name: e.program.name,
        approvalStatus: e.approval_status,
        voucherBalance: `₱${e.voucher_balance}`,
        purpose: e.program.purpose,
        expiresAt: new Date(e.expires_at).toLocaleDateString(),
        createdAt: e.created_at,
        // Placeholder until backend tracks disbursement progress and schedule.
        progressPercent: 65,
        nextDisbursementDate: 'July 23, 2026',
      }));

      const mappedVouchers: Voucher[] = rows.map((e: any) => ({
        id: e.id,
        category: e.category,
        amount: `₱${e.voucher_balance}`,
        program: e.program.name,
        purpose: e.program.purpose,
        expiresAt: new Date(e.expires_at).toLocaleDateString(),
        status: e.voucher_balance > 0 ? 'Available' : 'Redeemed',
        stellarAssetCode: 'XLM',
      }));

      setPrograms(mappedPrograms);
      setVouchers(mappedVouchers);
      setError(null);
    } catch (e) {
      console.error('Error fetching beneficiary programs', e);
      // Retain the last successfully loaded data (if any) instead of clearing it,
      // per Requirement 6.5. Only surfaces as empty if nothing ever loaded.
      setError(e instanceof Error ? e : new Error('Unable to load assistance data.'));
    } finally {
      setIsLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void fetchPrograms();
  }, [fetchPrograms]);

  return { programs, vouchers, isLoading, error, refetch: fetchPrograms };
}

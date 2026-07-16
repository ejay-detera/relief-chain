import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { EnrolledProgram } from '@/types/wallet';
import { useCallback, useEffect, useState } from 'react';

type EnrollmentRow = {
  approval_status: EnrolledProgram['approvalStatus'];
  expires_at: string | null;
  created_at: string;
  program: { id: string; name: string; purpose: string | null; status: string } | null;
};

/**
 * Reads the beneficiary's program enrollment workflow (approval status, purpose,
 * expiry). This intentionally reads NO money: authoritative cash and voucher
 * balances are reconciled and come from `useBeneficiaryEntitlements`. A failed
 * read surfaces an error rather than fabricated rows (Requirements 21.1, 21.2).
 */
export function useBeneficiaryPrograms() {
  const { session } = useAuth();
  const [programs, setPrograms] = useState<EnrolledProgram[]>([]);
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

      const rows = (data ?? []) as unknown as EnrollmentRow[];

      const mappedPrograms: EnrolledProgram[] = rows
        .filter((e) => e.program != null)
        .map((e) => ({
          id: e.program!.id,
          name: e.program!.name,
          approvalStatus: e.approval_status,
          purpose: e.program!.purpose ?? '',
          expiresAt: e.expires_at ? new Date(e.expires_at).toLocaleDateString() : '—',
          createdAt: e.created_at,
        }));

      setPrograms(mappedPrograms);
      setError(null);
    } catch (e) {
      console.error('Error fetching beneficiary programs', e);
      setError(e instanceof Error ? e : new Error('Unable to load assistance data.'));
    } finally {
      setIsLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void fetchPrograms();
  }, [fetchPrograms]);

  return { programs, isLoading, error, refetch: fetchPrograms };
}

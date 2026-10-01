import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { EnrolledProgram } from '@/types/wallet';

type EnrollmentRow = {
  id: string;
  approval_status: EnrolledProgram['approvalStatus'];
  expires_at: string | null;
  created_at: string;
  category: string;
  rejection_remarks?: string | null;
  program: {
    id: string;
    name: string;
    purpose: string | null;
    status: string;
    voucher_type?: string | null;
    program_merchants?: {
      category: string;
    }[];
  } | null;
};

const DEFAULT_CATEGORY_MERCHANTS: Record<string, string[]> = {
  Food: ['Groceries & Supermarkets', 'Local Public Markets', 'Sari-Sari Stores'],
  Medicine: ['Pharmacies & Drugstores', 'Community Health Clinics'],
  'School Supplies': ['Bookstores & Stationery', 'School Merchandise Outlets'],
  Cash: ['Accredited Cash-Out Centers', 'Disaster Relief Outposts'],
};

/**
 * Reads the beneficiary's program enrollment workflow (approval status, purpose,
 * expiry, categories, and merchant redemption guidance).
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
          category,
          rejection_remarks,
          program:programs (
            id,
            name,
            purpose,
            status,
            voucher_type,
            program_merchants (
              category
            )
          )
        `)
        .eq('beneficiary_id', session.user.id)
        .order('created_at', { ascending: false });

      if (queryError) throw queryError;

      const rows = (data ?? []) as unknown as EnrollmentRow[];

      const mappedPrograms: EnrolledProgram[] = rows
        .filter((e) => e.program != null)
        .map((e) => {
          const aidCategory = e.category || e.program?.voucher_type || 'General Assistance';
          const explicitMerchants = (e.program?.program_merchants ?? [])
            .map((pm) => pm.category)
            .filter((cat): cat is string => Boolean(cat));

          const acceptedCategories =
            explicitMerchants.length > 0
              ? Array.from(new Set(explicitMerchants))
              : DEFAULT_CATEGORY_MERCHANTS[aidCategory] ?? ['Accredited Partner Merchants'];

          const instructions =
            aidCategory === 'Cash'
              ? 'Present your digital QR voucher at authorized cash disbursement stations.'
              : `Present your voucher QR to scan at accredited ${aidCategory.toLowerCase()} retail partners.`;

          return {
            id: e.program!.id,
            enrollmentId: e.id,
            name: e.program!.name,
            approvalStatus: e.approval_status,
            purpose: e.program!.purpose ?? '',
            expiresAt: e.expires_at ? new Date(e.expires_at).toLocaleDateString() : '—',
            createdAt: e.created_at,
            category: aidCategory,
            acceptedMerchantCategories: acceptedCategories,
            redemptionInstructions: instructions,
            rejectionRemarks: e.rejection_remarks ?? null,
          };
        });

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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchPrograms();
  }, [fetchPrograms]);

  return { programs, isLoading, error, refetch: fetchPrograms };
}

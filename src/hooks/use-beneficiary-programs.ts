import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { EnrolledProgram } from '@/types/wallet';
import { useCallback, useEffect, useState } from 'react';

type EnrollmentRow = {
  id: string;
  approval_status: EnrolledProgram['approvalStatus'];
  expires_at: string | null;
  created_at: string;
  category: string;
  rejection_remarks?: string | null;
  allocation_amount_stroops: number | string | null;
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
          allocation_amount_stroops,
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
          // `program_merchants` is the real, DB-enforced accreditation record
          // (validated by `validate_program_merchant_change`). Previously, an
          // empty result here silently fell back to a hardcoded
          // DEFAULT_CATEGORY_MERCHANTS map with invented merchant names like
          // "Groceries & Supermarkets" — showing redemption guidance for
          // merchants that were never actually accredited for this program.
          // Now an empty list is shown as empty, with the card itself
          // choosing a clear "not yet listed" message instead of fabricating
          // participants (US3).
          const acceptedCategories = Array.from(
            new Set(
              (e.program?.program_merchants ?? [])
                .map((pm) => pm.category)
                .filter((cat): cat is string => Boolean(cat))
            )
          );

          const instructions =
            acceptedCategories.length === 0
              ? null
              : aidCategory === 'Cash'
                ? 'Present your digital QR voucher at authorized cash disbursement stations.'
                : `Present your voucher QR to scan at accredited ${aidCategory.toLowerCase()} retail partners.`;

          const allocationAmountStroops =
            e.allocation_amount_stroops != null ? Number(e.allocation_amount_stroops) : null;

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
            // The approved allocation amount, independent of whether
            // reconciliation has produced a balance projection row yet (US3:
            // "amount... visible immediately after approval"). Only
            // meaningful once approved; null for Pending/Rejected.
            allocatedAmountStroops:
              e.approval_status === 'Approved' && allocationAmountStroops && allocationAmountStroops > 0
                ? allocationAmountStroops
                : null,
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

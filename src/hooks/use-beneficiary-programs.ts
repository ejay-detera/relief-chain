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
  voucher_balance?: number | string | null;
  program: {
    id: string;
    name: string;
    purpose: string | null;
    status: string;
    voucher_type?: string | null;
    organization_id?: string | null;
    selected_merchants?: unknown;
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
          voucher_balance,
          program:programs (
            id,
            organization_id,
            name,
            purpose,
            status,
            voucher_type,
            selected_merchants,
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

          // Extract real accredited merchants set by admin (programs.selected_merchants)
          // along with DB-enforced program_merchants accreditation categories.
          const rawSelected = e.program?.selected_merchants;
          const selectedList: string[] = Array.isArray(rawSelected)
            ? rawSelected.filter((m): m is string => typeof m === 'string' && m.trim().length > 0)
            : typeof rawSelected === 'string'
              ? (() => {
                  try {
                    const parsed = JSON.parse(rawSelected);
                    return Array.isArray(parsed)
                      ? parsed.filter((m): m is string => typeof m === 'string' && m.trim().length > 0)
                      : [rawSelected.trim()];
                  } catch {
                    return [rawSelected.trim()];
                  }
                })()
              : [];

          const pmCategories = Array.from(
            new Set(
              (e.program?.program_merchants ?? [])
                .map((pm) => pm.category)
                .filter((cat): cat is string => Boolean(cat))
            )
          );

          const acceptedMerchants = Array.from(
            new Set([...selectedList, ...pmCategories])
          );

          const instructions =
            acceptedMerchants.length === 0
              ? null
              : aidCategory === 'Cash'
                ? 'Present your digital QR voucher at authorized cash disbursement stations.'
                : `Present your voucher QR to scan at accredited ${aidCategory.toLowerCase()} retail partners.`;

          const allocationAmountStroops =
            e.allocation_amount_stroops != null ? Number(e.allocation_amount_stroops) : null;
          const rawVoucherBalance =
            e.voucher_balance != null ? Number(e.voucher_balance) : null;
          const remainingVoucherStroops =
            rawVoucherBalance != null
              ? Math.max(0, Math.round(rawVoucherBalance * 10_000_000))
              : null;

          return {
            id: e.program!.id,
            organizationId: e.program?.organization_id ?? null,
            enrollmentId: e.id,
            name: e.program!.name,
            approvalStatus: e.approval_status,
            purpose: e.program!.purpose ?? '',
            expiresAt: e.expires_at ? new Date(e.expires_at).toLocaleDateString() : '—',
            createdAt: e.created_at,
            category: aidCategory,
            acceptedMerchantCategories: acceptedMerchants,
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
            voucherBalance: rawVoucherBalance,
            remainingVoucherStroops,
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

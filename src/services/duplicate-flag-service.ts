import { supabase } from '@/lib/supabase';

export type DuplicateMatchType = 'gov_id' | 'name_address';
export type DuplicateFlagStatus = 'pending' | 'confirmed_duplicate' | 'not_duplicate';

export interface BeneficiaryDuplicateFlag {
  id: string;
  profileId: string;
  matchedProfileId: string;
  matchType: DuplicateMatchType;
  status: DuplicateFlagStatus;
  reviewerNotes: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  detectedAt: string;
  lastDetectedAt: string;
  profile?: { fullName: string | null; govId: string | null; completeAddress: string | null } | null;
  matchedProfile?: { fullName: string | null; govId: string | null; completeAddress: string | null } | null;
}

interface RawDuplicateFlagRow {
  id: string;
  profile_id: string;
  matched_profile_id: string;
  match_type: DuplicateMatchType;
  status: DuplicateFlagStatus;
  reviewer_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  detected_at: string;
  last_detected_at: string;
  profile?: { full_name: string | null; gov_id: string | null; complete_address: string | null } | null;
  matched_profile?: { full_name: string | null; gov_id: string | null; complete_address: string | null } | null;
}

const mapRow = (row: RawDuplicateFlagRow): BeneficiaryDuplicateFlag => ({
  id: row.id,
  profileId: row.profile_id,
  matchedProfileId: row.matched_profile_id,
  matchType: row.match_type,
  status: row.status,
  reviewerNotes: row.reviewer_notes,
  reviewedBy: row.reviewed_by,
  reviewedAt: row.reviewed_at,
  detectedAt: row.detected_at,
  lastDetectedAt: row.last_detected_at,
  profile: row.profile
    ? { fullName: row.profile.full_name, govId: row.profile.gov_id, completeAddress: row.profile.complete_address }
    : null,
  matchedProfile: row.matched_profile
    ? {
        fullName: row.matched_profile.full_name,
        govId: row.matched_profile.gov_id,
        completeAddress: row.matched_profile.complete_address,
      }
    : null,
});

/**
 * Fetches duplicate flags visible to the current LGU user (scoped
 * server-side by RLS to profiles they already have organization visibility
 * into — see `20261002200000_add_beneficiary_duplicate_detection.sql`).
 */
export const fetchDuplicateFlags = async (
  statusFilter?: DuplicateFlagStatus
): Promise<BeneficiaryDuplicateFlag[]> => {
  let query = supabase
    .from('beneficiary_duplicate_flags')
    .select(`
      *,
      profile:profiles!beneficiary_duplicate_flags_profile_id_fkey ( full_name, gov_id, complete_address ),
      matched_profile:profiles!beneficiary_duplicate_flags_matched_profile_id_fkey ( full_name, gov_id, complete_address )
    `)
    .order('last_detected_at', { ascending: false });

  if (statusFilter) {
    query = query.eq('status', statusFilter);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Error fetching duplicate flags:', error);
    return [];
  }

  return ((data ?? []) as unknown as RawDuplicateFlagRow[]).map(mapRow);
};

/**
 * Reviews a duplicate flag (confirmed_duplicate / not_duplicate). Delegates
 * to the `review_beneficiary_duplicate_flag` RPC so reviewer attribution
 * cannot be forged by a direct `.update()` call.
 */
export const reviewDuplicateFlag = async (
  flagId: string,
  status: 'confirmed_duplicate' | 'not_duplicate',
  reviewerNotes?: string
): Promise<void> => {
  const { error } = await supabase.rpc('review_beneficiary_duplicate_flag', {
    p_flag_id: flagId,
    p_status: status,
    p_reviewer_notes: reviewerNotes ?? null,
  });

  if (error) throw error;
};

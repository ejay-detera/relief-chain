import { supabase } from '@/lib/supabase';
import type { UserProfile } from '@/types/auth';

const PROFILE_COLUMNS =
  'id, full_name, gov_id, location, stellar_pubkey, verification_status, mobile_number, created_at, city_id, area_id, barangay_id';

export const fetchEligibleBeneficiaries = async (
  program: {
    id: string;
    program_areas?: { area_id: number; areas?: { name: string } | null }[];
    program_barangays?: { barangay_id: number; barangays?: { name: string; area_id: number } | null }[];
  },
  hasRegistration: boolean
): Promise<UserProfile[]> => {
  let mapped: UserProfile[] = [];

  if (hasRegistration) {
    // 1. If program has registration, query enrollments for this program joined with profiles
    const { data, error } = await supabase
      .from('enrollments')
      .select(`
        approval_status,
        profiles:beneficiary_id (${PROFILE_COLUMNS})
      `)
      .eq('program_id', program.id);

    if (error) throw error;

    mapped = (data || [])
      .filter((item: any) => item.profiles && item.profiles.verification_status === 'Verified')
      .map((item: any) => ({
        id: item.profiles.id,
        role: 'beneficiary',
        full_name: item.profiles.full_name,
        gov_id: item.profiles.gov_id,
        location: item.profiles.location,
        stellar_pubkey: item.profiles.stellar_pubkey,
        mobile_number: item.profiles.mobile_number,
        verification_status: item.profiles.verification_status,
        created_at: null,
        city_id: item.profiles.city_id,
        area_id: item.profiles.area_id,
        barangay_id: item.profiles.barangay_id,
      }));
  } else {
    // 2. If no registration, fetch all verified beneficiaries directly
    const { data, error } = await supabase
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .eq('role', 'beneficiary')
      .eq('verification_status', 'Verified');

    if (error) throw error;

    mapped = (data || []).map((p: any) => ({
      id: p.id,
      role: 'beneficiary',
      full_name: p.full_name,
      gov_id: p.gov_id,
      location: p.location,
      stellar_pubkey: p.stellar_pubkey,
      mobile_number: p.mobile_number,
      verification_status: p.verification_status,
      created_at: p.created_at,
      city_id: p.city_id,
      area_id: p.area_id,
      barangay_id: p.barangay_id,
    }));
  }

  // Filter based on the Program's assigned barangays/areas, matched against each
  // Beneficiary's structured barangay_id/area_id (set at registration) rather than
  // fuzzy-matching free-text location strings.
  const affectedBarangayIds = program.program_barangays?.map((pb) => pb.barangay_id) || [];
  const affectedAreaIds = program.program_areas?.map((pa) => pa.area_id) || [];

  if (affectedBarangayIds.length === 0 && affectedAreaIds.length === 0) {
    return mapped;
  }

  return mapped.filter((b) => {
    if (affectedBarangayIds.length > 0) {
      return b.barangay_id != null && affectedBarangayIds.includes(b.barangay_id);
    }

    if (affectedAreaIds.length > 0) {
      return b.area_id != null && affectedAreaIds.includes(b.area_id);
    }

    return true;
  });
};

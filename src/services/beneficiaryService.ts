import { supabase } from '@/lib/supabase';
import type { UserProfile } from '@/types/auth';

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
        profiles:beneficiary_id (
          id,
          full_name,
          gov_id,
          location,
          stellar_pubkey,
          verification_status,
          mobile_number,
          email
        )
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
        email: item.profiles.email,
        verification_status: item.profiles.verification_status,
        created_at: null,
      }));
  } else {
    // 2. If no registration, fetch all verified beneficiaries directly
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'beneficiary')
      .eq('verification_status', 'Verified');

    if (error) throw error;

    mapped = (data || []).map((p) => ({
      id: p.id,
      role: 'beneficiary',
      full_name: p.full_name,
      gov_id: p.gov_id,
      location: p.location,
      stellar_pubkey: p.stellar_pubkey,
      mobile_number: p.mobile_number,
      email: p.email,
      verification_status: p.verification_status,
      created_at: p.created_at,
    }));
  }

  // Filter based on program location eligibility
  const affectedBarangays = program.program_barangays?.map((pb: any) => pb.barangays?.name).filter(Boolean) || [];
  const affectedAreas = program.program_areas?.map((pa: any) => pa.areas?.name).filter(Boolean) || [];

  if (affectedBarangays.length === 0 && affectedAreas.length === 0) {
    return mapped;
  }

  return mapped.filter((b) => {
    const beneficiaryLocation = (b.location || '').toLowerCase();

    if (affectedBarangays.length > 0) {
      return affectedBarangays.some((bName: string) => beneficiaryLocation.includes(bName.toLowerCase()));
    }

    if (affectedAreas.length > 0) {
      return affectedAreas.some((aName: string) => beneficiaryLocation.includes(aName.toLowerCase()));
    }

    return true;
  });
};

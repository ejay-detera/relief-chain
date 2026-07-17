import { supabase } from '@/lib/supabase';
import { ProgramDraft } from '@/types/program';

export interface LookupData {
  disasterTypes: { id: number; name: string }[];
  cities: { id: number; name: string }[];
  areas: { id: number; city_id: number; name: string }[];
  agencies: { id: number; name: string }[];
  fundingSources: { id: number; name: string }[];
  barangays: { id: number; area_id: number; name: string }[];
}

const replaceProgramGeography = async (
  programId: string,
  areaIds: number[],
  barangayIds: number[],
): Promise<void> => {
  const { error } = await supabase.rpc('replace_program_geography', {
    p_program_id: programId,
    p_area_ids: areaIds,
    p_barangay_ids: barangayIds,
  });

  if (error) throw error;
};

export const fetchLookupData = async (): Promise<LookupData> => {
  const [dt, c, a, ag, fs, bg] = await Promise.all([
    supabase.from('disaster_types').select('*'),
    supabase.from('cities').select('*'),
    supabase.from('areas').select('*'),
    supabase.from('implementing_agencies').select('*'),
    supabase.from('funding_sources').select('*'),
    supabase.from('barangays').select('*'),
  ]);

  return {
    disasterTypes: dt.data || [],
    cities: c.data || [],
    areas: a.data || [],
    agencies: ag.data || [],
    fundingSources: fs.data || [],
    barangays: bg.data || [],
  };
};

export const fetchLguPrograms = async (): Promise<any[]> => {
  const { data, error } = await supabase
    .from('programs')
    .select(`
      *,
      disaster_types (name),
      implementing_agencies (name),
      funding_sources (name),
      program_areas (area_id, areas (name)),
      program_barangays (barangay_id, barangays (name, area_id))
    `)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data || []).map((item: any) => ({
    id: item.id,
    name: item.name,
    description: item.purpose || '',
    disasterType: item.disaster_types?.name || 'General',
    disasterTypeId: item.disaster_type_id,
    implementingAgency: item.implementing_agencies?.name || '',
    implementingAgencyId: item.implementing_agency_id,
    fundingSource: item.funding_sources?.name || '',
    fundingSourceId: item.funding_source_id,
    totalBudget: Number(item.total_budget),
    aidPerHousehold: Number(item.amount_per_beneficiary),
    maxBeneficiaries: item.amount_per_beneficiary > 0 ? Math.floor(item.total_budget / item.amount_per_beneficiary) : 0,
    startDate: item.start_date || '',
    endDate: item.expires_at || '',
    registrationOpen: item.registration_open || '',
    registrationClose: item.registration_close || '',
    distributionStart: item.distribution_start || '',
    distributionEnd: item.distribution_end || '',
    eligibilityCriteria: item.eligibility_criteria || [],
    voucherTypes: item.voucher_types || [],
    voucherValue: Number(item.voucher_value),
    voucherQuantity: item.voucher_quantity || 1,
    voucherExpiration: item.voucher_expiration || '',
    redemptionType: item.redemption_type || 'cash',
    selectedMerchants: item.selected_merchants || [],
    distributionMethod: item.distribution_method || 'automatic',
    walletTypeToggle: item.wallet_type_toggle || false,
    autoDistributeToggle: item.auto_distribute_toggle || true,
    supportingDocuments: item.supporting_documents || [],
    status: item.status === 'active' ? 'published' : (item.status || 'draft'),
    created_at: item.created_at,
    affectedAreas: item.program_areas?.map((pa: any) => pa.areas?.name).filter(Boolean) || [],
    affectedAreaIds: item.program_areas?.map((pa: any) => pa.area_id).filter(Boolean) || [],
    affectedBarangays: item.program_barangays?.map((pb: any) => pb.barangays?.name).filter(Boolean) || [],
    affectedBarangayIds: item.program_barangays?.map((pb: any) => pb.barangay_id).filter(Boolean) || [],
    districtId: item.program_barangays?.[0]?.barangays?.area_id || item.program_areas?.[0]?.area_id || null,
  }));
};

export const createLguProgram = async (
  draft: ProgramDraft,
  status: 'draft' | 'published',
  createdBy: string | null
): Promise<{ success: boolean; programId?: string; organizationId?: string }> => {
  if (!createdBy) throw new Error("User must be logged in to create a program");

  // Fetch the user's organization ID
  const { data: memData, error: memError } = await supabase
    .from('organization_memberships')
    .select('organization_id')
    .eq('user_id', createdBy)
    .eq('is_active', true)
    .limit(1)
    .single();

  if (memError || !memData) throw new Error("User does not have an active organization membership");

  const { data: programData, error: programError } = await supabase
    .from('programs')
    .insert({
      organization_id: memData.organization_id,
      name: draft.name,
      purpose: draft.description,
      total_budget: draft.totalBudget,
      amount_per_beneficiary: draft.aidPerHousehold,
      disaster_type_id: draft.disasterTypeId,
      implementing_agency_id: draft.implementingAgencyId,
      funding_source_id: draft.fundingSourceId,
      voucher_types: draft.voucherTypes,
      voucher_value: draft.voucherValue,
      voucher_quantity: draft.voucherQuantity,
      voucher_expiration: draft.voucherExpiration || null,
      redemption_type: draft.redemptionType,
      selected_merchants: draft.selectedMerchants,
      distribution_method: draft.distributionMethod,
      wallet_type_toggle: draft.walletTypeToggle,
      auto_distribute_toggle: draft.autoDistributeToggle,
      start_date: draft.startDate || null,
      expires_at: draft.endDate || null,
      registration_open: draft.registrationOpen || null,
      registration_close: draft.registrationClose || null,
      distribution_start: draft.distributionStart || null,
      distribution_end: draft.distributionEnd || null,
      eligibility_criteria: draft.eligibilityCriteria,
      supporting_documents: draft.supportingDocuments,
      status: status === 'published' ? 'active' : 'draft',
      created_by: createdBy,
      asset_code: 'RCPHP',
      asset_issuer: process.env.EXPO_PUBLIC_STELLAR_RCPHP_ISSUER ?? 'GBC6HZTIUH6C3KQR5D3NOS2PJ7YKQJQNAQGAO3WO4PICJEXPAPGRKSQ7',
    })
    .select('id, organization_id')
    .single();

  if (programError) throw programError;

  if (programData) {
    await replaceProgramGeography(
      programData.id,
      draft.affectedAreaIds,
      draft.affectedBarangayIds,
    );
  }

  return { success: true, programId: programData?.id, organizationId: programData?.organization_id };
};

export const fetchRegisteredMerchants = async (): Promise<string[]> => {
  const { data, error } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('role', 'merchant');

  if (error) throw error;
  return (data || []).map((item) => item.full_name).filter(Boolean) as string[];
};

export const updateLguProgram = async (
  id: string,
  draft: ProgramDraft,
  status: 'draft' | 'published'
): Promise<{ success: boolean; programId?: string; organizationId?: string }> => {
  const { data: programData, error: programError } = await supabase
    .from('programs')
    .update({
      name: draft.name,
      purpose: draft.description,
      total_budget: draft.totalBudget,
      amount_per_beneficiary: draft.aidPerHousehold,
      disaster_type_id: draft.disasterTypeId,
      implementing_agency_id: draft.implementingAgencyId,
      funding_source_id: draft.fundingSourceId,
      voucher_types: draft.voucherTypes,
      voucher_value: draft.voucherValue,
      voucher_quantity: draft.voucherQuantity,
      voucher_expiration: draft.voucherExpiration || null,
      redemption_type: draft.redemptionType,
      selected_merchants: draft.selectedMerchants,
      distribution_method: draft.distributionMethod,
      wallet_type_toggle: draft.walletTypeToggle,
      auto_distribute_toggle: draft.autoDistributeToggle,
      start_date: draft.startDate || null,
      expires_at: draft.endDate || null,
      registration_open: draft.registrationOpen || null,
      registration_close: draft.registrationClose || null,
      distribution_start: draft.distributionStart || null,
      distribution_end: draft.distributionEnd || null,
      eligibility_criteria: draft.eligibilityCriteria,
      supporting_documents: draft.supportingDocuments,
      status: status === 'published' ? 'active' : 'draft',
      asset_code: 'RCPHP',
      asset_issuer: process.env.EXPO_PUBLIC_STELLAR_RCPHP_ISSUER ?? 'GBC6HZTIUH6C3KQR5D3NOS2PJ7YKQJQNAQGAO3WO4PICJEXPAPGRKSQ7',
    })
    .eq('id', id)
    .select('id, organization_id')
    .single();

  if (programError) throw programError;

  if (programData) {
    await replaceProgramGeography(
      programData.id,
      draft.affectedAreaIds,
      draft.affectedBarangayIds,
    );
  }

  return { success: true, programId: programData?.id, organizationId: programData?.organization_id };
};

export const deleteLguProgram = async (id: string): Promise<boolean> => {
  // Related draft rows cascade. A financial-history reference intentionally
  // blocks deletion instead of deleting or rewriting a confirmed redemption.
  const { error } = await supabase
    .from('programs')
    .delete()
    .eq('id', id);

  if (error) throw error;
  return true;
};

export const updateProgramStatus = async (id: string, status: string): Promise<boolean> => {
  const { error } = await supabase
    .from('programs')
    .update({ status })
    .eq('id', id);

  if (error) throw error;
  return true;
};

export const fetchActiveProgramsWithLocations = async (): Promise<any[]> => {
  const { data, error } = await supabase
    .from('programs')
    .select(`
      *,
      program_areas (area_id, areas (name)),
      program_barangays (barangay_id, barangays (name, area_id))
    `)
    // No status filter – return all programs (including active, funding, published, etc.)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
};

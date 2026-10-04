import { supabase } from '@/lib/supabase';
import type {
  AccreditedMerchant,
  AddMerchantPayload,
  AvailableMerchant,
  MerchantAccreditationStatus,
  MerchantProgramApplicant,
  MerchantRedemptionTransaction,
  ProgramMerchantOption,
} from '@/types/merchant-management';

/**
 * Resolves the authenticated caller's active organization ID.
 */
export const resolveCallerOrganizationId = async (
  requestedOrgId?: string,
): Promise<string | null> => {
  if (requestedOrgId) return requestedOrgId;

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: memData } = await supabase
      .from('organization_memberships')
      .select('organization_id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('granted_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (memData?.organization_id) return memData.organization_id;

    const { data: orgData } = await supabase
      .from('organizations')
      .select('id')
      .eq('created_by', user.id)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    return orgData?.id || null;
  } catch {
    return null;
  }
};

/**
 * Fetch all accredited merchants for the caller's organization.
 */
export const fetchOrganizationMerchants = async (
  orgId?: string,
): Promise<AccreditedMerchant[]> => {
  try {
    const { data, error } = await supabase.rpc('get_organization_merchants', {
      p_org_id: orgId || null,
    });

    if (!error && Array.isArray(data)) {
      return data as AccreditedMerchant[];
    }
  } catch {
    // Fall back to direct query below if RPC is not yet applied
  }

  // Fallback direct table query
  try {
    let query = supabase
      .from('merchant_accreditations')
      .select(`
        id,
        organization_id,
        merchant_id,
        category,
        status,
        valid_from,
        valid_until,
        remarks,
        created_at,
        merchant_entities (
          id,
          display_name,
          profile_id
        )
      `)
      .order('updated_at', { ascending: false });

    if (orgId) {
      query = query.eq('organization_id', orgId);
    }

    const { data: directData, error: directError } = await query;
    if (directError) throw directError;

    const profileIds = (directData || [])
      .map((row: any) => row.merchant_entities?.profile_id)
      .filter((id: any): id is string => typeof id === 'string');
    const merchantIds = (directData || [])
      .map((row: any) => row.merchant_id)
      .filter((id: any): id is string => typeof id === 'string');

    const profileMap = new Map<string, any>();
    if (profileIds.length > 0) {
      const { data: profData } = await supabase
        .from('profiles')
        .select('id, full_name, mobile_number, stellar_pubkey')
        .in('id', profileIds);
      (profData || []).forEach((p: any) => profileMap.set(p.id, p));
    }

    const walletMap = new Map<string, string>();
    if (merchantIds.length > 0) {
      const { data: walletData } = await supabase
        .from('wallets')
        .select('owner_id, address')
        .in('owner_id', merchantIds)
        .eq('is_active', true);
      (walletData || []).forEach((w: any) => {
        if (w.address) walletMap.set(w.owner_id, w.address);
      });
    }

    return (directData || []).map((row: any) => {
      const me = row.merchant_entities || {};
      const prof = (me.profile_id && profileMap.get(me.profile_id)) || {};
      const pubkey =
        walletMap.get(row.merchant_id) || prof.stellar_pubkey || null;
      return {
        accreditation_id: row.id,
        organization_id: row.organization_id,
        merchant_id: row.merchant_id,
        display_name: me.display_name || prof.full_name || 'Merchant Store',
        category: row.category,
        status: row.status as MerchantAccreditationStatus,
        valid_from: row.valid_from,
        valid_until: row.valid_until,
        remarks: row.remarks || null,
        owner_name: prof.full_name || null,
        mobile_number: prof.mobile_number || null,
        stellar_pubkey: pubkey,
        created_at: row.created_at,
      };
    });
  } catch (err) {
    console.error('Error fetching organization merchants:', err);
    return [];
  }
};

/**
 * Search registered merchants available to be accredited by the organization.
 */
export const searchAvailableMerchants = async (
  queryText: string = '',
  orgId?: string,
): Promise<AvailableMerchant[]> => {
  try {
    const { data, error } = await supabase.rpc(
      'search_available_merchants_to_accredit',
      {
        p_query: queryText,
        p_org_id: orgId || null,
      },
    );

    if (!error && Array.isArray(data)) {
      return data as AvailableMerchant[];
    }
  } catch {
    // Fall back to query
  }

  // Fallback
  try {
    const { data: meRows, error: meErr } = await supabase
      .from('merchant_entities')
      .select('id, display_name, profile_id')
      .limit(50);

    if (meErr) throw meErr;

    const profileIds = (meRows || [])
      .map((row: any) => row.profile_id)
      .filter((id: any): id is string => typeof id === 'string');
    const meIds = (meRows || [])
      .map((row: any) => row.id)
      .filter((id: any): id is string => typeof id === 'string');

    const profileMap = new Map<string, any>();
    if (profileIds.length > 0) {
      const { data: profData } = await supabase
        .from('profiles')
        .select('id, full_name, mobile_number, stellar_pubkey')
        .in('id', profileIds);
      (profData || []).forEach((p: any) => profileMap.set(p.id, p));
    }

    const walletMap = new Map<string, string>();
    if (meIds.length > 0) {
      const { data: walletData } = await supabase
        .from('wallets')
        .select('owner_id, address')
        .in('owner_id', meIds)
        .eq('is_active', true);
      (walletData || []).forEach((w: any) => {
        if (w.address) walletMap.set(w.owner_id, w.address);
      });
    }

    const term = queryText.toLowerCase().trim();
    return (meRows || [])
      .map((row: any) => {
        const prof = (row.profile_id && profileMap.get(row.profile_id)) || {};
        const name = row.display_name || prof.full_name || 'Merchant Store';
        const pubkey = walletMap.get(row.id) || prof.stellar_pubkey || null;
        return {
          merchant_id: row.id,
          display_name: name,
          owner_name: prof.full_name || null,
          mobile_number: prof.mobile_number || null,
          stellar_pubkey: pubkey,
          is_already_accredited: false,
        };
      })
      .filter((m) => {
        if (!term) return true;
        return (
          m.display_name.toLowerCase().includes(term) ||
          (m.owner_name && m.owner_name.toLowerCase().includes(term))
        );
      });
  } catch (err) {
    console.error('Error searching available merchants:', err);
    return [];
  }
};

/**
 * Accredit a merchant into the organization.
 */
export const accreditMerchant = async (
  payload: AddMerchantPayload,
  orgId?: string,
): Promise<{ success: boolean; id?: string; error?: string }> => {
  try {
    const { data, error } = await supabase.rpc(
      'add_organization_merchant_accreditation',
      {
        p_merchant_id: payload.merchantId,
        p_category: payload.category,
        p_valid_until: payload.validUntil || null,
        p_org_id: orgId || null,
      },
    );

    if (error) {
      throw error;
    }
    return { success: true, id: data as string };
  } catch (rpcErr: any) {
    console.error('Error accrediting merchant via RPC:', rpcErr);
    return {
      success: false,
      error: rpcErr?.message || 'Failed to accredit merchant',
    };
  }
};

/**
 * Update merchant accreditation status (e.g. Suspend, Reactivate, Reject, or Edit remarks/category).
 */
export const updateMerchantStatus = async (
  accreditationId: string,
  status: MerchantAccreditationStatus,
  remarks?: string,
  category?: string,
  orgId?: string,
): Promise<{ success: boolean; error?: string }> => {
  try {
    const { error } = await supabase.rpc('update_organization_merchant_status', {
      p_accreditation_id: accreditationId,
      p_status: status,
      p_remarks: remarks || null,
      p_category: category || null,
      p_org_id: orgId || null,
    });

    if (error) {
      throw error;
    }
    return { success: true };
  } catch (rpcErr: any) {
    console.error('Error updating merchant status:', rpcErr);
    return {
      success: false,
      error: rpcErr?.message || 'Failed to update merchant status',
    };
  }
};

/**
 * Remove / un-accredit a merchant from the organization.
 */
export const removeMerchantAccreditation = async (
  accreditationId: string,
  orgId?: string,
): Promise<{ success: boolean; error?: string }> => {
  try {
    const { error } = await supabase.rpc(
      'remove_organization_merchant_accreditation',
      {
        p_accreditation_id: accreditationId,
        p_org_id: orgId || null,
      },
    );

    if (error) {
      throw error;
    }
    return { success: true };
  } catch (rpcErr: any) {
    console.error('Error removing merchant accreditation:', rpcErr);
    return {
      success: false,
      error: rpcErr?.message || 'Failed to remove merchant accreditation',
    };
  }
};

/**
 * Fetch active merchant names for the authenticated organization for program selection.
 */
export const fetchActiveOrgMerchantNames = async (
  orgId?: string,
): Promise<string[]> => {
  try {
    const { data, error } = await supabase.rpc(
      'get_active_organization_merchant_names',
      {
        p_org_id: orgId || null,
      },
    );

    if (!error && Array.isArray(data)) {
      return (data as { merchant_name: string }[]).map((r) => r.merchant_name);
    }
  } catch {
    // Fall back to direct query
  }

  try {
    let query = supabase
      .from('merchant_accreditations')
      .select(`
        category,
        merchant_entities (
          display_name,
          profile_id
        )
      `)
      .eq('status', 'active');

    if (orgId) {
      query = query.eq('organization_id', orgId);
    }

    const { data: rows, error: qErr } = await query;
    if (qErr) throw qErr;

    const profileIds = (rows || [])
      .map((row: any) => row.merchant_entities?.profile_id)
      .filter((id: any): id is string => typeof id === 'string');

    const profileMap = new Map<string, string>();
    if (profileIds.length > 0) {
      const { data: profData } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', profileIds);
      (profData || []).forEach((p: any) => {
        if (p.full_name) profileMap.set(p.id, p.full_name);
      });
    }

    const names = new Set<string>();
    (rows || []).forEach((row: any) => {
      const me = row.merchant_entities;
      const name = me?.display_name || (me?.profile_id && profileMap.get(me.profile_id));
      if (name) names.add(name);
    });

    return Array.from(names);
  } catch (err) {
    console.error('Error fetching active merchant names:', err);
    return [];
  }
};

export interface FetchMerchantRedemptionsParams {
  merchantId: string;
  orgId?: string;
  programId?: string;
  startDate?: string;
  endDate?: string;
}

/**
 * Fetch a merchant's redemption transaction history for the organization admin (ORG-11).
 */
export const fetchMerchantRedemptions = async (
  params: FetchMerchantRedemptionsParams,
): Promise<MerchantRedemptionTransaction[]> => {
  // 1. Try secure RPC get_organization_merchant_redemptions
  try {
    const { data, error } = await supabase.rpc(
      'get_organization_merchant_redemptions',
      {
        p_merchant_id: params.merchantId,
        p_org_id: params.orgId || null,
        p_program_id: params.programId || null,
        p_start_date: params.startDate || null,
        p_end_date: params.endDate || null,
      },
    );

    if (!error && Array.isArray(data)) {
      return (data as any[]).map((r) => ({
        id: r.id,
        merchant_id: r.merchant_id || params.merchantId,
        program_id: r.program_id || null,
        program_name: r.program_name || 'Relief Program',
        beneficiary_id: r.beneficiary_id,
        beneficiary_name: r.beneficiary_name || 'Citizen Beneficiary',
        beneficiary_reference: r.beneficiary_reference,
        category: r.category || 'General Aid',
        amount: Number(r.amount || 0),
        status: (r.status || 'Completed') as 'Completed' | 'Pending' | 'Failed',
        remaining_balance:
          r.remaining_balance != null ? Number(r.remaining_balance) : null,
        tx_hash: r.tx_hash || null,
        redeemed_at: r.redeemed_at,
      }));
    }
  } catch (rpcErr) {
    console.warn(
      'RPC get_organization_merchant_redemptions failed, falling back:',
      rpcErr,
    );
  }

  // 2. Direct Query Fallback with Strict Organization Program Scoping
  try {
    let effectiveOrgId = params.orgId;
    if (!effectiveOrgId) {
      effectiveOrgId = (await resolveCallerOrganizationId()) || undefined;
    }

    if (!effectiveOrgId) {
      console.warn(
        'Caller has no active organization; returning empty redemptions list.',
      );
      return [];
    }

    // A. Query only programs owned by this organization
    const { data: orgPrograms, error: progErr } = await supabase
      .from('programs')
      .select('id, name')
      .eq('organization_id', effectiveOrgId);

    if (progErr) throw progErr;

    const orgProgramMap = new Map<string, string>();
    (orgPrograms || []).forEach((p: any) => {
      if (p.id) orgProgramMap.set(p.id, p.name || 'Relief Program');
    });

    const allowedProgramIds = Array.from(orgProgramMap.keys());
    if (allowedProgramIds.length === 0) {
      // Organization has no programs created, so zero redemptions under their programs exist
      return [];
    }

    // B. If a specific program is requested, verify it belongs to this organization
    if (params.programId && !orgProgramMap.has(params.programId)) {
      // Requested program belongs to another organization, block access
      return [];
    }

    const targetProgramIds = params.programId
      ? [params.programId]
      : allowedProgramIds;

    let query = supabase
      .from('redemptions')
      .select(
        'id, merchant_id, program_id, enrollment_id, beneficiary_id, merchant_name, amount, category, status, remaining_balance, tx_hash, redeemed_at',
      )
      .in('program_id', targetProgramIds)
      .order('redeemed_at', { ascending: false });

    if (params.startDate) {
      query = query.gte('redeemed_at', params.startDate);
    }
    if (params.endDate) {
      query = query.lte('redeemed_at', params.endDate);
    }

    const { data: rows, error } = await query;
    if (error) throw error;

    // Filter by merchantId
    const filteredRows = (rows || []).filter(
      (r: any) => !r.merchant_id || r.merchant_id === params.merchantId,
    );

    const benIds = Array.from(
      new Set(
        filteredRows
          .map((r: any) => r.beneficiary_id)
          .filter((id: any): id is string => typeof id === 'string'),
      ),
    );

    const benMap = new Map<string, string>();
    if (benIds.length > 0) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', benIds);
      (profs || []).forEach((p: any) => {
        if (p.full_name) benMap.set(p.id, p.full_name);
      });
    }

    return filteredRows.map((r: any) => {
      const benName = benMap.get(r.beneficiary_id) || 'Citizen Beneficiary';
      const shortId = r.beneficiary_id
        ? r.beneficiary_id.substring(0, 4)
        : '????';
      return {
        id: r.id,
        merchant_id: r.merchant_id || params.merchantId,
        program_id: r.program_id || null,
        program_name:
          (r.program_id && orgProgramMap.get(r.program_id)) || 'Relief Program',
        beneficiary_id: r.beneficiary_id,
        beneficiary_name: benName,
        beneficiary_reference: `${benName} (B-${shortId})`,
        category: r.category || 'General Aid',
        amount: Number(r.amount || 0),
        status: (r.status || 'Completed') as 'Completed' | 'Pending' | 'Failed',
        remaining_balance:
          r.remaining_balance != null ? Number(r.remaining_balance) : null,
        tx_hash: r.tx_hash || null,
        redeemed_at: r.redeemed_at,
      };
    });
  } catch (err) {
    console.error('Error fetching merchant redemptions:', err);
    return [];
  }
};

/**
 * Fetch distinct programs created by this organization available for filtering a merchant's redemptions.
 */
export const fetchMerchantPrograms = async (
  merchantId: string,
  orgId?: string,
): Promise<{ id: string; name: string }[]> => {
  // 1. Try secure RPC get_organization_created_programs
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      'get_organization_created_programs',
      {
        p_org_id: orgId || null,
      },
    );

    if (!rpcError && Array.isArray(rpcData)) {
      return (rpcData as any[]).map((p) => ({
        id: p.id,
        name: p.name || 'Unnamed Program',
      }));
    }
  } catch {
    // Fall back to direct query below
  }

  // 2. Direct scoped query fallback
  try {
    let effectiveOrgId = orgId;
    if (!effectiveOrgId) {
      effectiveOrgId = (await resolveCallerOrganizationId()) || undefined;
    }

    if (!effectiveOrgId) return [];

    const { data } = await supabase
      .from('programs')
      .select('id, name')
      .eq('organization_id', effectiveOrgId)
      .order('name');

    return (data || []).map((p: any) => ({
      id: p.id,
      name: p.name || 'Unnamed Program',
    }));
  } catch {
    return [];
  }
};

/**
 * Fetch merchant applicants for a specific program.
 */
export const fetchProgramMerchantApplications = async (
  programId: string,
): Promise<MerchantProgramApplicant[]> => {
  try {
    const { data, error } = await supabase.rpc('get_program_merchant_applications', {
      p_program_id: programId,
    });

    if (!error && Array.isArray(data)) {
      return data as MerchantProgramApplicant[];
    }
  } catch (rpcErr) {
    console.warn('RPC get_program_merchant_applications fallback:', rpcErr);
  }

  // Fallback query
  try {
    const { data, error } = await supabase
      .from('merchant_program_applications')
      .select(`
        id,
        program_id,
        merchant_id,
        status,
        notes,
        rejection_reason,
        applied_at,
        reviewed_at,
        merchant_entities (
          id,
          display_name,
          profile_id
        )
      `)
      .eq('program_id', programId)
      .order('applied_at', { ascending: false });

    if (error) throw error;

    const profileIds = (data || [])
      .map((row: any) => row.merchant_entities?.profile_id)
      .filter((id: any): id is string => typeof id === 'string');

    const profileMap = new Map<string, any>();
    if (profileIds.length > 0) {
      const { data: profData } = await supabase
        .from('profiles')
        .select('id, full_name, mobile_number, stellar_pubkey')
        .in('id', profileIds);
      (profData || []).forEach((p: any) => profileMap.set(p.id, p));
    }

    return (data || []).map((row: any) => {
      const me = row.merchant_entities || {};
      const prof = (me.profile_id && profileMap.get(me.profile_id)) || {};
      return {
        application_id: row.id,
        program_id: row.program_id,
        merchant_id: row.merchant_id,
        display_name: me.display_name || prof.full_name || 'Merchant Store',
        owner_name: prof.full_name || null,
        mobile_number: prof.mobile_number || null,
        stellar_pubkey: prof.stellar_pubkey || null,
        status: row.status,
        notes: row.notes || null,
        rejection_reason: row.rejection_reason || null,
        applied_at: row.applied_at,
        reviewed_at: row.reviewed_at || null,
      };
    });
  } catch (err) {
    console.error('Error fetching program merchant applications:', err);
    return [];
  }
};

/**
 * Fetch all merchant applications across all programs for the organization.
 */
export const fetchOrganizationMerchantApplications = async (
  orgId?: string,
): Promise<MerchantProgramApplicant[]> => {
  try {
    const { data, error } = await supabase.rpc('get_organization_merchant_applications', {
      p_org_id: orgId || null,
    });

    if (!error && Array.isArray(data)) {
      return data as MerchantProgramApplicant[];
    }
  } catch (rpcErr) {
    console.warn('RPC get_organization_merchant_applications fallback:', rpcErr);
  }

  // Fallback direct query
  try {
    let effectiveOrgId = orgId;
    if (!effectiveOrgId) {
      effectiveOrgId = (await resolveCallerOrganizationId()) || undefined;
    }

    if (!effectiveOrgId) return [];

    const { data: progs, error: pErr } = await supabase
      .from('programs')
      .select('id, name')
      .eq('organization_id', effectiveOrgId);

    if (pErr || !progs || progs.length === 0) return [];

    const progMap = new Map<string, string>();
    progs.forEach((p: any) => progMap.set(p.id, p.name));
    const targetProgramIds = progs.map((p: any) => p.id);

    const { data, error } = await supabase
      .from('merchant_program_applications')
      .select(`
        id,
        program_id,
        merchant_id,
        status,
        notes,
        rejection_reason,
        applied_at,
        reviewed_at,
        merchant_entities (
          id,
          display_name,
          profile_id
        )
      `)
      .in('program_id', targetProgramIds)
      .order('applied_at', { ascending: false });

    if (error) throw error;

    const profileIds = (data || [])
      .map((row: any) => row.merchant_entities?.profile_id)
      .filter((id: any): id is string => typeof id === 'string');

    const profileMap = new Map<string, any>();
    if (profileIds.length > 0) {
      const { data: profData } = await supabase
        .from('profiles')
        .select('id, full_name, mobile_number, stellar_pubkey')
        .in('id', profileIds);
      (profData || []).forEach((p: any) => profileMap.set(p.id, p));
    }

    return (data || []).map((row: any) => {
      const me = row.merchant_entities || {};
      const prof = (me.profile_id && profileMap.get(me.profile_id)) || {};
      return {
        application_id: row.id,
        program_id: row.program_id,
        program_name: progMap.get(row.program_id) || 'Aid Program',
        merchant_id: row.merchant_id,
        display_name: me.display_name || prof.full_name || 'Merchant Store',
        owner_name: prof.full_name || null,
        mobile_number: prof.mobile_number || null,
        stellar_pubkey: prof.stellar_pubkey || null,
        status: row.status,
        notes: row.notes || null,
        rejection_reason: row.rejection_reason || null,
        applied_at: row.applied_at,
        reviewed_at: row.reviewed_at || null,
      };
    });
  } catch (err) {
    console.error('Error fetching organization merchant applications:', err);
    return [];
  }
};

/**
 * Review a merchant's application for a program (Approve or Reject).
 */
export const reviewMerchantApplication = async (
  applicationId: string,
  status: 'approved' | 'rejected',
  rejectionReason?: string,
): Promise<{ success: boolean; error?: string }> => {
  try {
    const { error } = await supabase.rpc('review_merchant_program_application', {
      p_application_id: applicationId,
      p_status: status,
      p_rejection_reason: rejectionReason || null,
    });

    if (error) throw error;
    return { success: true };
  } catch (rpcErr: any) {
    console.warn('RPC review_merchant_program_application error, running fallback:', rpcErr);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { data: appRow, error: fetchErr } = await supabase
        .from('merchant_program_applications')
        .select('id, program_id, merchant_id')
        .eq('id', applicationId)
        .single();

      if (fetchErr || !appRow) throw fetchErr || new Error('Application not found');

      const { error: updateErr } = await supabase
        .from('merchant_program_applications')
        .update({
          status,
          rejection_reason: status === 'rejected' ? rejectionReason || 'Declined' : null,
          reviewed_by: user?.id || null,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', applicationId);

      if (updateErr) throw updateErr;

      // Also sync programs.selected_merchants
      const { data: me } = await supabase
        .from('merchant_entities')
        .select('display_name')
        .eq('id', appRow.merchant_id)
        .single();

      if (me?.display_name) {
        const { data: prog } = await supabase
          .from('programs')
          .select('id, selected_merchants')
          .eq('id', appRow.program_id)
          .single();

        if (prog) {
          const current: string[] = Array.isArray(prog.selected_merchants)
            ? (prog.selected_merchants as string[])
            : [];

          let updated: string[];
          if (status === 'approved') {
            updated = current.includes(me.display_name)
              ? current
              : [...current, me.display_name];
          } else {
            updated = current.filter((m) => m !== me.display_name);
          }

          await supabase
            .from('programs')
            .update({ selected_merchants: updated })
            .eq('id', appRow.program_id);
        }
      }

      return { success: true };
    } catch (fallbackErr: any) {
      console.error('Error reviewing merchant application fallback:', fallbackErr);
      return {
        success: false,
        error: fallbackErr?.message || 'Failed to review application',
      };
    }
  }
};

/**
 * Fetch merchants who have been accepted / approved for a program or organization.
 * Used exclusively for selecting merchants when creating or editing programs.
 */
export const fetchProgramAcceptedMerchants = async (
  programId?: string,
  orgId?: string,
): Promise<ProgramMerchantOption[]> => {
  try {
    const { data, error } = await supabase.rpc('get_program_accepted_merchants', {
      p_program_id: programId || null,
      p_org_id: orgId || null,
    });

    if (!error && Array.isArray(data)) {
      return data as ProgramMerchantOption[];
    }
  } catch (rpcErr) {
    console.warn('RPC get_program_accepted_merchants fallback:', rpcErr);
  }

  // Fallback: check program applications if programId given
  try {
    if (programId) {
      const { data: appData } = await supabase
        .from('merchant_program_applications')
        .select(`
          merchant_id,
          merchant_entities (
            id,
            display_name
          )
        `)
        .eq('program_id', programId)
        .eq('status', 'approved');

      if (Array.isArray(appData) && appData.length > 0) {
        return appData
          .map((a: any) => ({
            merchant_id: a.merchant_id,
            display_name: a.merchant_entities?.display_name || 'Merchant Store',
          }))
          .filter((m) => Boolean(m.display_name));
      }
    }

    // Otherwise fall back to organization-accredited active merchants
    const accredited = await fetchOrganizationMerchants(orgId);
    return accredited
      .filter((m) => m.status === 'active')
      .map((m) => ({
        merchant_id: m.merchant_id,
        display_name: m.display_name,
      }));
  } catch (err) {
    console.error('Error in fetchProgramAcceptedMerchants fallback:', err);
    return [];
  }
};

import { supabase } from '@/lib/supabase';
import type {
  AvailableAidProgram,
  MerchantProgram,
  MerchantProgramApplicationStatus,
  MerchantProgramStatus,
} from '@/types/merchant-program';

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null;

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

const number = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const textArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(text).filter((item): item is string => item !== null) : [];

const relatedNames = (value: unknown, relationKey: string): string[] => {
  if (!Array.isArray(value)) return [];
  const names: string[] = [];
  value.forEach((entry) => {
    const relation = asRecord(entry)?.[relationKey];
    const candidates = Array.isArray(relation) ? relation : [relation];
    candidates.forEach((candidate) => {
      const name = text(asRecord(candidate)?.name);
      if (name) names.push(name);
    });
  });
  return names;
};

export const normalizeMerchantName = (value: string): string =>
  value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-PH');

const localDateKey = (): string => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
};

const deriveStatus = (
  rawStatus: string,
  startDate: string | null,
  endDate: string | null,
): MerchantProgramStatus => {
  const today = localDateKey();
  if (rawStatus === 'completed' || rawStatus === 'closed' || (endDate !== null && endDate < today))
    return 'completed';
  if (rawStatus === 'scheduled' || (startDate !== null && startDate > today)) return 'scheduled';
  return 'active';
};

const parseProgram = (
  value: unknown,
  merchantName: string,
  approvedProgramIds?: Set<string>,
): MerchantProgram | null => {
  const row = asRecord(value);
  if (!row) return null;
  const id = text(row.id);
  const name = text(row.name);
  const rawStatus = text(row.status)?.toLowerCase() ?? 'active';
  if (!id || !name || rawStatus === 'draft') return null;

  const selectedMerchants = textArray(row.selected_merchants);
  const normalizedMerchantName = normalizeMerchantName(merchantName);
  const isDirectlySelected =
    normalizedMerchantName.length > 0 &&
    selectedMerchants.some((selected) => normalizeMerchantName(selected) === normalizedMerchantName);
  const isApprovedViaApp = approvedProgramIds ? approvedProgramIds.has(id) : false;

  // Merchant is accepted if explicitly selected by name or has an approved application
  const isVisible = isDirectlySelected || isApprovedViaApp;
  if (!isVisible) return null;

  const startDate = text(row.start_date);
  const endDate = text(row.expires_at);
  const areas = relatedNames(row.program_areas, 'areas');
  const barangays = relatedNames(row.program_barangays, 'barangays');

  return {
    id,
    name,
    purpose: text(row.purpose) ?? 'No purpose provided.',
    voucherValue: number(row.voucher_value),
    voucherTypes: textArray(row.voucher_types),
    voucherExpiration: text(row.voucher_expiration) ?? endDate,
    voucherQuantity: Math.max(0, Math.trunc(number(row.voucher_quantity))),
    distributionMethod: text(row.distribution_method) ?? 'Not specified',
    startDate,
    endDate,
    distributionStart: text(row.distribution_start),
    distributionEnd: text(row.distribution_end),
    scope: Array.from(new Set([...areas, ...barangays])),
    isOpenToAllMerchants: false,
    status: deriveStatus(rawStatus, startDate, endDate),
    createdAt: text(row.created_at),
  };
};

const statusOrder: Record<MerchantProgramStatus, number> = {
  active: 0,
  scheduled: 1,
  completed: 2,
};

const comparePrograms = (left: MerchantProgram, right: MerchantProgram): number => {
  const statusDifference = statusOrder[left.status] - statusOrder[right.status];
  if (statusDifference !== 0) return statusDifference;
  if (left.status === 'scheduled') {
    const dateDifference = (left.startDate ?? '9999-12-31').localeCompare(
      right.startDate ?? '9999-12-31',
    );
    if (dateDifference !== 0) return dateDifference;
  } else if (left.status === 'completed') {
    const dateDifference = (right.endDate ?? '').localeCompare(left.endDate ?? '');
    if (dateDifference !== 0) return dateDifference;
  } else {
    const dateDifference = (left.endDate ?? '9999-12-31').localeCompare(
      right.endDate ?? '9999-12-31',
    );
    if (dateDifference !== 0) return dateDifference;
  }
  return left.name.localeCompare(right.name) || left.id.localeCompare(right.id);
};

/**
 * Fetch programs in which the merchant has been accepted/accredited to accept vouchers.
 */
export const fetchMerchantPrograms = async (
  merchantName: string | null,
): Promise<MerchantProgram[]> => {
  try {
    // 1. Check for approved applications for caller
    const approvedProgramIds = new Set<string>();
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: me } = await supabase
          .from('merchant_entities')
          .select('id')
          .eq('profile_id', user.id)
          .maybeSingle();

        if (me?.id) {
          const { data: appData } = await supabase
            .from('merchant_program_applications')
            .select('program_id')
            .eq('merchant_id', me.id)
            .eq('status', 'approved');

          if (appData) {
            appData.forEach((row: any) => {
              if (row.program_id) approvedProgramIds.add(row.program_id);
            });
          }
        }
      }
    } catch {
      // Ignore if table not yet present or unauthenticated
    }

    const { data, error } = await supabase
      .from('programs')
      .select(`
        id, name, purpose, voucher_value, voucher_types, voucher_quantity,
        voucher_expiration, distribution_method, start_date, expires_at,
        distribution_start, distribution_end, selected_merchants, status, created_at,
        program_areas (areas (name)),
        program_barangays (barangays (name))
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;
    if (!Array.isArray(data)) return [];

    return data
      .map((row: unknown) => parseProgram(row, merchantName ?? '', approvedProgramIds))
      .filter((program): program is MerchantProgram => program !== null)
      .sort(comparePrograms);
  } catch (err) {
    console.error('Error in fetchMerchantPrograms:', err);
    throw err;
  }
};

/**
 * Fetch all available programs (both Draft and Active) that merchants can discover and apply for.
 */
export const fetchAvailableAidPrograms = async (): Promise<AvailableAidProgram[]> => {
  try {
    // 1. Try secure RPC endpoint first
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      'get_merchant_available_programs',
    );

    if (!rpcError && Array.isArray(rpcData)) {
      return (rpcData as any[]).map((row) => ({
        id: row.id,
        name: row.name,
        purpose: row.purpose || 'Relief assistance program.',
        organizationId: row.organization_id,
        organizationName: row.organization_name || 'Relief Organization',
        voucherValue: number(row.voucher_value),
        voucherTypes: textArray(row.voucher_types),
        voucherQuantity: Math.max(1, number(row.voucher_quantity)),
        voucherExpiration: row.voucher_expiration ? String(row.voucher_expiration) : null,
        distributionMethod: row.distribution_method || 'Standard',
        startDate: row.start_date ? String(row.start_date) : null,
        endDate: row.expires_at ? String(row.expires_at) : null,
        distributionStart: row.distribution_start ? String(row.distribution_start) : null,
        distributionEnd: row.distribution_end ? String(row.distribution_end) : null,
        status: row.status || 'active',
        applicationStatus: (row.application_status as MerchantProgramApplicationStatus) || 'none',
        applicationId: row.application_id || null,
        appliedAt: row.applied_at ? String(row.applied_at) : null,
        rejectionReason: row.rejection_reason || null,
        notes: row.notes || null,
        createdAt: row.created_at ? String(row.created_at) : null,
      }));
    }
  } catch (rpcCatch) {
    console.warn('RPC get_merchant_available_programs not available, using fallback query:', rpcCatch);
  }

  // Fallback direct table query
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    let merchantEntityId: string | null = null;
    let merchantDisplayName: string | null = null;
    if (user) {
      const { data: me } = await supabase
        .from('merchant_entities')
        .select('id, display_name')
        .eq('profile_id', user.id)
        .maybeSingle();
      if (me) {
        merchantEntityId = me.id;
        merchantDisplayName = me.display_name;
      }
    }

    // Query programs where status in ('draft', 'active', 'scheduled', 'funding')
    const { data: programsData, error: progErr } = await supabase
      .from('programs')
      .select(`
        id, name, purpose, organization_id, voucher_value, voucher_types, voucher_quantity,
        voucher_expiration, distribution_method, start_date, expires_at,
        distribution_start, distribution_end, status, created_at, selected_merchants,
        organizations (name)
      `)
      .in('status', ['draft', 'active', 'scheduled', 'funding'])
      .order('created_at', { ascending: false });

    if (progErr) throw progErr;
    if (!Array.isArray(programsData)) return [];

    // Query existing applications if merchantEntityId is known
    const appsMap = new Map<string, any>();
    if (merchantEntityId) {
      try {
        const { data: appsData } = await supabase
          .from('merchant_program_applications')
          .select('id, program_id, status, applied_at, rejection_reason, notes')
          .eq('merchant_id', merchantEntityId);

        if (Array.isArray(appsData)) {
          appsData.forEach((a) => appsMap.set(a.program_id, a));
        }
      } catch {
        // Table may not yet be created in some environments
      }
    }

    return programsData.map((row: any) => {
      const app = appsMap.get(row.id);
      let appStatus: MerchantProgramApplicationStatus = 'none';

      if (app) {
        appStatus = app.status as MerchantProgramApplicationStatus;
      } else if (merchantDisplayName) {
        // If merchant was already in selected_merchants, treat as approved
        const selected = textArray(row.selected_merchants);
        const normMe = normalizeMerchantName(merchantDisplayName);
        if (selected.some((s) => normalizeMerchantName(s) === normMe)) {
          appStatus = 'approved';
        }
      }

      const orgName = row.organizations?.name || 'Relief Organization';

      return {
        id: row.id,
        name: row.name,
        purpose: row.purpose || 'Relief assistance program.',
        organizationId: row.organization_id,
        organizationName: orgName,
        voucherValue: number(row.voucher_value),
        voucherTypes: textArray(row.voucher_types),
        voucherQuantity: Math.max(1, number(row.voucher_quantity)),
        voucherExpiration: row.voucher_expiration ? String(row.voucher_expiration) : null,
        distributionMethod: row.distribution_method || 'Standard',
        startDate: row.start_date ? String(row.start_date) : null,
        endDate: row.expires_at ? String(row.expires_at) : null,
        distributionStart: row.distribution_start ? String(row.distribution_start) : null,
        distributionEnd: row.distribution_end ? String(row.distribution_end) : null,
        status: row.status || 'active',
        applicationStatus: appStatus,
        applicationId: app?.id || null,
        appliedAt: app?.applied_at ? String(app.applied_at) : null,
        rejectionReason: app?.rejection_reason || null,
        notes: app?.notes || null,
        createdAt: row.created_at ? String(row.created_at) : null,
      };
    });
  } catch (fallbackErr) {
    console.error('Error fetching available aid programs fallback:', fallbackErr);
    return [];
  }
};

/**
 * Submit an application to participate in an aid program.
 */
export const applyForAidProgram = async (
  programId: string,
  notes?: string,
): Promise<{ success: boolean; applicationId?: string; error?: string }> => {
  try {
    const { data, error } = await supabase.rpc('apply_for_merchant_program', {
      p_program_id: programId,
      p_notes: notes || null,
    });

    if (error) throw error;
    return { success: true, applicationId: data as string };
  } catch (rpcErr: any) {
    console.warn('RPC apply_for_merchant_program error, attempting fallback insert:', rpcErr);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('User is not authenticated.');

      // Find or provision merchant_entities
      let { data: me } = await supabase
        .from('merchant_entities')
        .select('id')
        .eq('profile_id', user.id)
        .maybeSingle();

      if (!me?.id) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .single();

        const { data: createdMe, error: createMeErr } = await supabase
          .from('merchant_entities')
          .insert({
            profile_id: user.id,
            display_name: profile?.full_name || 'Merchant Store',
          })
          .select('id')
          .single();

        if (createMeErr) throw createMeErr;
        me = createdMe;
      }

      if (!me?.id) throw new Error('Could not identify merchant entity.');

      const { data: appRow, error: appErr } = await supabase
        .from('merchant_program_applications')
        .upsert(
          {
            program_id: programId,
            merchant_id: me.id,
            status: 'pending',
            notes: notes || null,
            rejection_reason: null,
            applied_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'program_id,merchant_id' },
        )
        .select('id')
        .single();

      if (appErr) throw appErr;
      return { success: true, applicationId: appRow?.id };
    } catch (fallbackErr: any) {
      console.error('Failed to apply for aid program:', fallbackErr);
      return {
        success: false,
        error: fallbackErr?.message || 'Unable to submit application.',
      };
    }
  }
};

/**
 * Withdraw a pending merchant program application.
 */
export const withdrawAidProgramApplication = async (
  programId: string,
): Promise<{ success: boolean; error?: string }> => {
  try {
    const { error } = await supabase.rpc('withdraw_merchant_program_application', {
      p_program_id: programId,
    });
    if (error) throw error;
    return { success: true };
  } catch (rpcErr: any) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated.');

      const { data: me } = await supabase
        .from('merchant_entities')
        .select('id')
        .eq('profile_id', user.id)
        .maybeSingle();

      if (!me?.id) throw new Error('Merchant not found.');

      const { error: delErr } = await supabase
        .from('merchant_program_applications')
        .update({ status: 'withdrawn', updated_at: new Date().toISOString() })
        .eq('program_id', programId)
        .eq('merchant_id', me.id)
        .eq('status', 'pending');

      if (delErr) throw delErr;
      return { success: true };
    } catch (fallbackErr: any) {
      return {
        success: false,
        error: fallbackErr?.message || 'Unable to withdraw application.',
      };
    }
  }
};
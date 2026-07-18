import { supabase } from '@/lib/supabase';

export type PendingMerchant = {
  accreditationId: string;
  merchantEntityId: string;
  displayName: string;
  category: string;
  stellarPubkey: string | null;
  submittedAt: string; // ISO
};

export type AccreditedMerchant = {
  accreditationId: string;
  merchantEntityId: string;
  displayName: string;
  category: string;
  status: 'active' | 'suspended';
  validFrom: string;
  validUntil: string;
};

/**
 * Fetches all merchant accreditations with status='pending' for the given org.
 * Joins merchant_entities for display_name and profiles for stellar_pubkey.
 */
export const fetchPendingMerchants = async (organizationId: string): Promise<PendingMerchant[]> => {
  const { data, error } = await supabase
    .from('merchant_accreditations')
    .select(`
      id,
      merchant_id,
      category,
      created_at,
      merchant_entities!inner (
        id,
        display_name,
        profile_id
      )
    `)
    .eq('organization_id', organizationId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) throw error;

  // Fetch stellar_pubkeys from profiles for each merchant entity
  const entityIds = (data ?? []).map((row: any) => row.merchant_entities.profile_id).filter(Boolean);
  
  let profileMap = new Map();
  if (entityIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, stellar_pubkey')
      .in('id', entityIds);
    profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p.stellar_pubkey]));
  }

  return (data ?? []).map((row: any) => ({
    accreditationId: row.id,
    merchantEntityId: row.merchant_entities.id,
    displayName: row.merchant_entities.display_name,
    category: row.category,
    stellarPubkey: profileMap.get(row.merchant_entities.profile_id) ?? null,
    submittedAt: row.created_at,
  }));
};

/**
 * Fetches accredited (active + suspended) merchants for an org.
 */
export const fetchAccreditedMerchants = async (organizationId: string): Promise<AccreditedMerchant[]> => {
  const { data, error } = await supabase
    .from('merchant_accreditations')
    .select(`
      id,
      merchant_id,
      category,
      status,
      valid_from,
      valid_until,
      merchant_entities!inner ( id, display_name )
    `)
    .eq('organization_id', organizationId)
    .in('status', ['active', 'suspended'])
    .order('valid_from', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    accreditationId: row.id,
    merchantEntityId: row.merchant_entities.id,
    displayName: row.merchant_entities.display_name,
    category: row.category,
    status: row.status,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
  }));
};

/**
 * Approves a merchant accreditation.
 * Sets status → 'active', approved_by = current user, approved_at = now().
 * valid_from/until must be set; use now() + 1 year as default.
 */
export const approveMerchant = async (accreditationId: string): Promise<void> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('merchant_accreditations')
    .update({
      status: 'active',
      approved_by: user.id,
      approved_at: new Date().toISOString(),
      valid_from: new Date().toISOString(),
      valid_until: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .eq('id', accreditationId)
    .eq('status', 'pending');

  if (error) throw error;
};

/**
 * Rejects a pending merchant application.
 * Sets status → 'revoked'. rejection_reason is not in schema;
 * it is written to audit_events metadata instead.
 */
export const rejectMerchant = async (
  accreditationId: string,
  organizationId: string,
  rejectionReason: string,
): Promise<void> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('merchant_accreditations')
    .update({ status: 'revoked' })
    .eq('id', accreditationId)
    .eq('status', 'pending');

  if (error) throw error;

  // We fallback to just letting it fail if RPC doesn't exist, but it should exist.
  try {
    await supabase.rpc('append_audit_event', {
      p_organization_id: organizationId,
      p_actor_user_id: user.id,
      p_action: 'merchant.application.rejected',
      p_correlation_id: crypto.randomUUID(),
      p_sensitive_data_access: false,
      p_metadata: { accreditation_id: accreditationId, reason: rejectionReason },
    }).throwOnError();
  } catch (e) {
    console.error('Failed to write audit event:', e);
  }
};

/**
 * Suspends an active merchant accreditation. status → 'suspended'.
 * Enforced: only 'active' can be suspended.
 */
export const suspendMerchant = async (accreditationId: string): Promise<void> => {
  const { error } = await supabase
    .from('merchant_accreditations')
    .update({ status: 'suspended' })
    .eq('id', accreditationId)
    .eq('status', 'active');
  if (error) throw error;
};

/**
 * Reactivates a suspended merchant accreditation. status → 'active'.
 * Enforced: only 'suspended' can be reactivated.
 */
export const reactivateMerchant = async (accreditationId: string): Promise<void> => {
  const { error } = await supabase
    .from('merchant_accreditations')
    .update({ status: 'active' })
    .eq('id', accreditationId)
    .eq('status', 'suspended');
  if (error) throw error;
};

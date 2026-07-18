import { supabase } from '@/lib/supabase';

export type AccreditationSummary = {
  status: 'pending' | 'active' | 'suspended' | 'expired' | 'revoked';
  category: string;
  validFrom: string;
  validUntil: string;
  // rejection reason is not stored in the DB schema — show a status message for non-active statuses
};

/**
 * Fetches the accreditation for the currently logged-in merchant.
 * merchant_entities.profile_id = auth.uid() on the server via RLS.
 */
export const fetchMyAccreditation = async (): Promise<AccreditationSummary | null> => {
  // Step 1: get the merchant_entity for the current user
  const { data: entity, error: entityError } = await supabase
    .from('merchant_entities')
    .select('id')
    .maybeSingle();

  if (entityError) throw entityError;
  if (!entity) return null;

  // Step 2: get the most recent accreditation
  const { data: acc, error: accError } = await supabase
    .from('merchant_accreditations')
    .select('status, category, valid_from, valid_until')
    .eq('merchant_id', entity.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (accError) throw accError;
  if (!acc) return null;

  return {
    status: acc.status,
    category: acc.category,
    validFrom: acc.valid_from,
    validUntil: acc.valid_until,
  };
};

/**
 * Applies for accreditation with the given organization.
 */
export const applyForAccreditation = async (organizationId: string, category: string): Promise<void> => {
  const { data: entity, error: entityError } = await supabase
    .from('merchant_entities')
    .select('id')
    .maybeSingle();

  if (entityError) throw entityError;
  if (!entity) throw new Error('Merchant entity not found for current user');

  const { error } = await supabase
    .from('merchant_accreditations')
    .insert({
      organization_id: organizationId,
      merchant_id: entity.id,
      category,
      status: 'pending',
      valid_from: new Date().toISOString(),
      valid_until: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    });

  if (error) throw error;
};

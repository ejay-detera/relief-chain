import { supabase } from '@/lib/supabase';
import {
  buildMerchantProfileUpdatePayloads,
  extractMerchantMetadata,
  type ExtractedMerchantMetadata,
  type MerchantProfileFormData,
  type MerchantProfileValidationResult,
  type PreparedMerchantProfileUpdates,
  validateMerchantProfileForm,
} from '@/utils/merchant-profile';

export type {
  ExtractedMerchantMetadata,
  MerchantProfileFormData,
  MerchantProfileValidationResult,
  PreparedMerchantProfileUpdates,
};
export { extractMerchantMetadata, validateMerchantProfileForm, buildMerchantProfileUpdatePayloads };

export type MerchantProfileUpdatePayload = MerchantProfileFormData;

export interface ProfileUpdatePayload {
  full_name?: string;
  mobile_number?: string;
  location?: string;
  first_name?: string;
  last_name?: string;
  middle_initial?: string;
  complete_address?: string;
}

/**
 * Updates the authenticated user's own `profiles` row. Relies on the existing
 * "Own profile" RLS policy (auth.uid() = id) so this only ever affects the
 * caller's own account.
 */
export const updateOwnProfile = async (userId: string, payload: ProfileUpdatePayload): Promise<void> => {
  const { error } = await supabase.from('profiles').update(payload).eq('id', userId);
  if (error) throw error;
};

/**
 * Updates all merchant profile information across `profiles`, `auth.users` metadata,
 * and `merchant_entities` in a coordinated manner.
 */
export const updateMerchantProfile = async (
  userId: string,
  payload: MerchantProfileUpdatePayload,
): Promise<void> => {
  const updates = buildMerchantProfileUpdatePayloads(payload);

  // 1. Update public.profiles row
  const { error: profileError } = await supabase
    .from('profiles')
    .update(updates.profilesPayload)
    .eq('id', userId);

  if (profileError) throw profileError;

  // 2. Update auth.users raw_user_meta_data via supabase.auth.updateUser
  const { error: authError } = await supabase.auth.updateUser({
    data: updates.authMetadataPayload,
  });

  if (authError) throw authError;

  // 3. Attempt to update merchant_entities display_name if one exists
  try {
    await supabase
      .from('merchant_entities')
      .update({
        display_name: updates.merchantEntityPayload.display_name,
        updated_at: new Date().toISOString(),
      })
      .eq('profile_id', userId);
  } catch (err) {
    // Non-fatal if RLS restricts direct update to merchant_entities
    console.warn('Could not update merchant_entities display_name directly:', err);
  }
};

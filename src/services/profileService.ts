import { supabase } from '@/lib/supabase';

export interface ProfileUpdatePayload {
  full_name?: string;
  mobile_number?: string;
  location?: string;
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

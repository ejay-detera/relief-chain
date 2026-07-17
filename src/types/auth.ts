import type { AuthError, Session } from '@supabase/supabase-js';

import type { RegistrationSummary } from '@/types/registration';

export type UserRole = 'lgu' | 'beneficiary' | 'merchant';

export type UserProfile = {
  id: string;
  role: UserRole;
  full_name: string | null;
  gov_id: string | null;
  location: string | null;
  stellar_pubkey: string | null;
  created_at: string | null;
  first_name?: string | null;
  last_name?: string | null;
  middle_initial?: string | null;
  mobile_number?: string | null;
  sex?: string | null;
  civil_status?: string | null;
  birthdate?: string | null;
  gov_id_url?: string | null;
  complete_address?: string | null;
  municipality_city?: string | null;
  verification_status?: 'Pending' | 'Verified' | 'Rejected' | null;
  city_id?: number | null;
  area_id?: number | null;
  barangay_id?: number | null;
  /** Only present when role === 'lgu'; the caller's own organization registration. */
  registration?: RegistrationSummary | null;
};

export type AuthContextValue = {
  session: Session | null;
  profile: UserProfile | null;
  isLoading: boolean;
  profileError: Error | null;
  signOut: () => Promise<AuthError | null>;
  refreshProfile: () => Promise<void>;
};

export const PASSWORD_RECOVERY_OTP_LENGTH = 8;

export type PasswordRecoveryStep = 'code' | 'reset' | 'success';

export type PasswordRecoveryCode = string[];

export type PasswordRecoveryCodeIndex = number;

export const isUserRole = (value: unknown): value is UserRole =>
  value === 'lgu' || value === 'beneficiary' || value === 'merchant';

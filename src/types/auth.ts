import type { AuthError, Session } from '@supabase/supabase-js';

export type UserRole = 'lgu' | 'beneficiary' | 'merchant';

export type UserProfile = {
  id: string;
  role: UserRole;
  full_name: string | null;
  gov_id: string | null;
  location: string | null;
  stellar_pubkey: string | null;
  created_at: string | null;
};

export type AuthContextValue = {
  session: Session | null;
  profile: UserProfile | null;
  isLoading: boolean;
  profileError: Error | null;
  signOut: () => Promise<AuthError | null>;
};

export const PASSWORD_RECOVERY_OTP_LENGTH = 8;

export type PasswordRecoveryStep = 'code' | 'reset' | 'success';

export type PasswordRecoveryCode = string[];

export type PasswordRecoveryCodeIndex = number;

export const isUserRole = (value: unknown): value is UserRole =>
  value === 'lgu' || value === 'beneficiary' || value === 'merchant';

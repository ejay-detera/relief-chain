import type { UserProfile } from '@/types/auth';
import type { RegistrationSummary } from '@/types/registration';

export type ProfileFetchers = {
  fetchBaseProfile: (userId: string) => Promise<UserProfile>;
  fetchOwnRegistration: (userId: string) => Promise<RegistrationSummary | null>;
};

/**
 * Composes the base `profiles` row fetch with the caller's own `registrations`
 * row when the loaded profile's role is `lgu` (Requirements 12.1, 13.1).
 *
 * Any error thrown by either fetcher propagates unchanged. This is
 * intentional: AuthContext's `fetchProfile` awaits this function inside the
 * same try/catch that already sets `profileError` on a base-profile fetch
 * failure, so a `registrations` query error surfaces through that exact
 * existing "Profile unavailable" path rather than a new, ambiguous state.
 *
 * A missing registration row (no row yet, not a query error) is represented
 * by `fetchOwnRegistration` resolving `null`, which is attached as-is and
 * does not throw.
 */
export const fetchProfileWithRegistration = async (
  userId: string,
  fetchers: ProfileFetchers,
): Promise<UserProfile> => {
  const profile = await fetchers.fetchBaseProfile(userId);
  if (profile.role !== 'lgu') return profile;

  const registration = await fetchers.fetchOwnRegistration(userId);
  return { ...profile, registration };
};

/**
 * Pure render predicate mirrored from `RootLayoutNav` in `src/app/_layout.tsx`:
 * whenever there is a session AND a non-null `profileError` (whether that
 * error originated from the base `profiles` fetch or, as of Requirements
 * 12.1/13.1, from the `registrations` fetch composed by
 * `fetchProfileWithRegistration`), the "Profile unavailable" screen
 * (`ProfileAccessError`, which unconditionally renders a `LogoutButton`) is
 * shown instead of the app content.
 */
export const shouldShowProfileAccessError = (
  session: unknown,
  profileError: unknown,
): boolean => Boolean(session) && Boolean(profileError);

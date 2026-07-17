import type { ResubmissionData } from '@/services/registrationService';

export type ResubmissionOutcome =
  | { kind: 'success' }
  | { kind: 'error'; message: string };

export type ResubmissionDeps = {
  resubmitRegistration: (registrationId: string, data: ResubmissionData) => Promise<void>;
  /**
   * Re-fetches the caller's profile (and, for `lgu`, its `registrations`
   * row) after a resubmission attempt. On success this is what makes
   * `profile.registration.status` observe the `Pending` transition
   * (Requirement 15.6). On failure it re-fetches the *current* status so
   * the screen reflects reality rather than a stale `Rejected` value when
   * the update was refused (e.g. a Super_Admin decision landed
   * concurrently, Requirement 15.2) — mirrors
   * `AuthContext.refreshProfile`.
   */
  refreshProfile: () => Promise<void>;
};

/**
 * Orchestrates a Resubmission attempt (Requirements 15.3, 15.6): calls
 * `registrationService.resubmitRegistration`, then always refreshes the
 * caller's profile/registration data so the screen's derived status is
 * never stale — whether the update succeeded (status is now `Pending`) or
 * was refused by Supabase/RLS/the status-guard trigger because the
 * Registration's status was no longer `Rejected` when the update was
 * attempted (status reflects whatever it actually is now, e.g. `Approved`
 * or already `Pending`).
 *
 * Kept as a pure, dependency-injected async function (mirroring
 * `fetchProfileWithRegistration` in `auth-profile.ts`) so it is testable
 * without a Supabase client or React Native renderer. The screen
 * (`application-review.tsx`) owns wiring this to real
 * `registrationService`/`AuthContext` calls and to the `Alert.alert`/
 * navigation side effects, per the component-architecture rule that
 * screens hold state/logic and sub-components only emit callbacks.
 */
export const submitResubmission = async (
  registrationId: string,
  data: ResubmissionData,
  deps: ResubmissionDeps,
): Promise<ResubmissionOutcome> => {
  try {
    await deps.resubmitRegistration(registrationId, data);
    await deps.refreshProfile();
    return { kind: 'success' };
  } catch (error: unknown) {
    // Always refresh on failure too: a refused update (e.g. status was no
    // longer Rejected) must not leave the UI showing a stale Rejected
    // state — the caller's next render should reflect the actual current
    // status (Requirement 15.2).
    await deps.refreshProfile().catch(() => undefined);
    const message = error instanceof Error ? error.message : 'Please try again.';
    return { kind: 'error', message };
  }
};

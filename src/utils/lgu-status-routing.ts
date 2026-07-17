import type { RegistrationStatus } from '@/types/registration';

export type LguScreen = 'application-review' | 'lgu-dashboard';

/**
 * Pure function deciding which screen an `lgu` user should see, given only
 * their Registration_Status (Property 16).
 *
 * Deliberately takes no other parameters: the screen resolved here can
 * never depend on prior-session-history (which screen was shown earlier,
 * how many times the app was opened, etc.) — purity with respect to history
 * is what the accompanying property test demonstrates by threading
 * arbitrary prior-history values through and asserting the outcome never
 * changes.
 *
 * - `Pending` -> `application-review` (under-review messaging, Req 11.2, 12.1)
 * - `Rejected` -> `application-review` (reason + resubmit option, Req 13.1)
 * - `Approved` -> `lgu-dashboard`, reachable regardless of whether the
 *   Application_Review_Screen was shown earlier in the same session
 *   (Req 13.4, 15.6)
 */
export const resolveLguScreenForStatus = (status: RegistrationStatus): LguScreen => {
  if (status === 'Approved') return 'lgu-dashboard';
  return 'application-review';
};

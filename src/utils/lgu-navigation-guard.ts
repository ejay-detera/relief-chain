import type { RegistrationStatus } from '@/types/registration';

export type NavigationSegments = {
  group: string | undefined;
  route: string | undefined;
};

export type LguNavigationDecision = 'stay' | 'redirect-to-review' | 'redirect-to-dashboard';

/**
 * Pure navigation-guard decision for `lgu` users (Requirements 12.1, 12.2,
 * 13.1, 13.3, 13.4; Property 17).
 *
 * Mirrors the status check `resolveLguScreenForStatus` (Property 16) makes —
 * `status !== 'Approved'` always means the Application_Review_Screen — but
 * is kept self-contained (no cross-module value import) so this file can be
 * exercised directly by both the TypeScript compiler and a plain Node.js
 * test run, matching the existing convention of every other pure decision
 * util in this codebase (`lgu-status-routing.ts`, `signup-routing.ts`,
 * `messaging.ts`, `auth-profile.ts`).
 *
 * Given the current Registration_Status and the segments of whatever route
 * was just navigated to — by any path: a direct URL, a menu tap, or a deep
 * link, since `RootLayoutNav`'s effect re-runs on every `segments` change
 * regardless of how the navigation was triggered — this returns:
 *
 * - `'redirect-to-review'` for `Pending`/`Rejected` on any route other than
 *   the Application_Review_Screen itself, blocking the LGU_Dashboard — and
 *   everywhere else — unconditionally (Requirements 12.2, 13.3).
 * - `'redirect-to-dashboard'` for `Approved`, but only when still in the
 *   `(auth)` group (e.g. the Application_Review_Screen was shown earlier in
 *   the same session); already being in the `(lgu)` group (or any other
 *   role group, caught instead by the pre-existing `isRoleGroupForRole`
 *   check `RootLayoutNav` runs afterward) is left alone (Requirement 13.4).
 * - `'stay'` when the current route already matches where this status
 *   belongs and no redirect is needed.
 */
export const getLguNavigationDecision = (
  status: RegistrationStatus,
  segments: NavigationSegments,
): LguNavigationDecision => {
  const inAuthGroup = segments.group === '(auth)';
  const onReviewScreen = inAuthGroup && segments.route === 'application-review';

  if (status !== 'Approved') {
    return onReviewScreen ? 'stay' : 'redirect-to-review';
  }

  return inAuthGroup ? 'redirect-to-dashboard' : 'stay';
};

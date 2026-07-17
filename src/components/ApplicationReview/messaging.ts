import type { RegistrationStatus, RegistrationSummary } from '@/types/registration';

export type ApplicationReviewMessage =
  | { kind: 'under-review' }
  | { kind: 'rejected'; reason: string };

/**
 * Pure function deciding what messaging (if any) can be resolved for the
 * Application_Review_Screen from a `RegistrationSummary` alone.
 *
 * Returns `null` when the messaging cannot be resolved:
 * - no registration data at all (e.g. the caller's `registrations` row
 *   hasn't loaded yet, or failed to load) — Requirement 11.3;
 * - an `Approved` registration, which is never rendered on this screen
 *   (`RootLayoutNav` routes `Approved` `lgu` users to the `LGU_Dashboard`
 *   instead, per Requirement 13.4 — that wiring is Task 15's responsibility);
 * - a `Rejected` registration missing its recorded reason, which would
 *   violate the "Rejected always has a reason" invariant and should never
 *   be presented as if it were resolved.
 *
 * Callers (e.g. `ApplicationReviewContent`) fall back to the generic error
 * state instead of showing a broken screen when this returns `null`.
 */
export const resolveApplicationReviewMessage = (
  registration: RegistrationSummary | null | undefined,
): ApplicationReviewMessage | null => {
  if (!registration) return null;

  if (registration.status === 'Pending') return { kind: 'under-review' };

  if (registration.status === 'Rejected') {
    const reason = registration.rejectionReason?.trim();
    if (!reason) return null;
    return { kind: 'rejected', reason };
  }

  return null;
};

/**
 * Pure predicate for Property 19: resubmit option visibility is purely a
 * function of `status === 'Rejected'` (Requirements 15.1, 15.2).
 */
export const shouldShowResubmitOption = (status: RegistrationStatus): boolean => status === 'Rejected';

/**
 * Pure predicate mirroring `ApplicationReviewContent`'s render guard: true
 * whenever the messaging cannot be resolved and the generic error state
 * should render instead of this screen's content (Requirement 11.3).
 */
export const shouldShowGenericErrorState = (
  registration: RegistrationSummary | null | undefined,
): boolean => resolveApplicationReviewMessage(registration) === null;

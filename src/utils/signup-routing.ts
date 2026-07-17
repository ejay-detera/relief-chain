import type { UserRole } from '@/types/auth';

export type SignUpRoutingDecision = 'registration-success' | 'verify-email';

/**
 * Decides whether post-sign-up routing lands on the "has session" branch or
 * the "awaiting OTP" branch.
 *
 * `lgu` sign-up never requires email-OTP confirmation (Requirement 9.1): the
 * `lgu-signup` Edge Function creates a pre-confirmed account and the client
 * signs in immediately afterward, so an `lgu` submission always resolves to
 * `registration-success` and can never resolve to `verify-email`.
 *
 * `beneficiary`/`merchant` sign-up is unchanged (Requirement 9.2): it still
 * branches on whether Supabase's `signUp` call returned an established
 * session (`hasSession`) — no session means OTP confirmation is still
 * outstanding.
 *
 * Note: for `lgu`, this "has session" branch no longer maps to the literal
 * `registration-success` screen — see `getPostSignUpDestination`, which
 * retires that screen in favor of `application-review` for `lgu` only
 * (Requirement 11.1).
 */
export const getPostSignUpRoutingDecision = (
  role: UserRole,
  hasSession: boolean,
): SignUpRoutingDecision => {
  if (role === 'lgu') return 'registration-success';
  return hasSession ? 'registration-success' : 'verify-email';
};

export type SignUpDestination = 'application-review' | 'registration-success' | 'verify-email';

/**
 * Maps the abstract routing decision to the actual navigation destination
 * (Requirement 11.1, Property 15).
 *
 * `lgu` sign-up always completes with an established session (Requirement
 * 9.1 / Property 12), so `getPostSignUpRoutingDecision` always resolves to
 * `registration-success` for `lgu` — but that screen is retired for this
 * role: `lgu` always lands on `application-review` instead, and never on
 * `registration-success` or `verify-email`.
 *
 * `beneficiary`/`merchant` are unmodified: they keep resolving to whichever
 * screen `getPostSignUpRoutingDecision` returns (`registration-success` or
 * `verify-email`), unchanged from current behavior (Requirement 9.2).
 */
export const getPostSignUpDestination = (
  role: UserRole,
  hasSession: boolean,
): SignUpDestination => {
  if (role === 'lgu') return 'application-review';
  return getPostSignUpRoutingDecision(role, hasSession);
};

// Pure, client-side step-up freshness evaluation for sensitive financial actions
// (Requirement 20.2). This MIRRORS the server-authoritative rule enforced by the
// Edge `hasRecentStepUp` and the database `private.has_recent_step_up`: an AAL2
// session with a step-up method (totp/otp/webauthn) satisfied inside the allowed
// window. It exists purely so the UI can prompt for step-up early and honestly;
// the server and database policies remain the sole authority on whether an
// action is actually permitted.

import type { AssuranceSnapshot, StepUpEvaluation } from '@/types/mfa';

// Bounds mirror the Edge function and database function exactly.
export const DEFAULT_STEP_UP_MAX_AGE_SECONDS = 10 * 60;
const STEP_UP_MAX_AGE_CEILING_SECONDS = 60 * 60;
const STEP_UP_CLOCK_SKEW_SECONDS = 60;

/** Methods that count as a step-up, matching the server allow-list. */
export const STEP_UP_METHODS: ReadonlySet<string> = new Set(['totp', 'otp', 'webauthn']);

/**
 * Evaluates whether the current session already satisfies recent step-up. When it
 * does not, the caller should prompt the user to re-verify before the action.
 *
 * Freshness requires: AAL2, and at least one step-up auth method whose timestamp
 * falls within `[now - maxAge, now + skew]`. `secondsRemaining` reports the time
 * left on the most recent qualifying method so the UI can show a countdown.
 */
export const evaluateStepUp = (
  snapshot: AssuranceSnapshot,
  now: Date = new Date(),
  maxAgeSeconds: number = DEFAULT_STEP_UP_MAX_AGE_SECONDS,
): StepUpEvaluation => {
  const requiresEnrollment = snapshot.nextLevel !== 'aal2';

  if (maxAgeSeconds <= 0 || maxAgeSeconds > STEP_UP_MAX_AGE_CEILING_SECONDS) {
    return { isFresh: false, secondsRemaining: 0, requiresEnrollment };
  }
  if (snapshot.currentLevel !== 'aal2') {
    return { isFresh: false, secondsRemaining: 0, requiresEnrollment };
  }

  const nowSeconds = Math.floor(now.getTime() / 1000);
  const lowerBound = nowSeconds - maxAgeSeconds;
  const upperBound = nowSeconds + STEP_UP_CLOCK_SKEW_SECONDS;

  let mostRecent: number | null = null;
  for (const method of snapshot.authMethods) {
    if (
      STEP_UP_METHODS.has(method.method) &&
      Number.isFinite(method.timestamp) &&
      method.timestamp >= lowerBound &&
      method.timestamp <= upperBound
    ) {
      if (mostRecent === null || method.timestamp > mostRecent) {
        mostRecent = method.timestamp;
      }
    }
  }

  if (mostRecent === null) {
    return { isFresh: false, secondsRemaining: 0, requiresEnrollment };
  }

  const expiresAt = mostRecent + maxAgeSeconds;
  const secondsRemaining = Math.max(0, expiresAt - nowSeconds);
  return {
    isFresh: secondsRemaining > 0,
    secondsRemaining,
    requiresEnrollment: false,
  };
};

/** Formats remaining step-up validity as a compact `m:ss` label for the UI. */
export const formatStepUpRemaining = (secondsRemaining: number): string => {
  const clamped = Math.max(0, Math.floor(secondsRemaining));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

// Shared MFA/step-up domain types for the organization and merchant financial
// experiences (Requirements 20.1, 20.2). These mirror the server-authoritative
// AAL and recent-step-up rules enforced in Edge Functions and database policies;
// the client uses them only for usable, honest UX gating — never as the source
// of truth for whether an action is permitted.

/** Authenticator Assurance Level, matching Supabase Auth and the Edge session. */
export type AuthenticatorAssuranceLevel = 'aal1' | 'aal2';

/** MFA factor types the pilot supports for step-up. */
export type MfaFactorType = 'totp' | 'phone';

export type MfaFactorStatus = 'verified' | 'unverified';

/** A single enrolled factor, projected to the fields the UI needs. */
export type MfaFactorSummary = Readonly<{
  id: string;
  friendlyName: string | null;
  factorType: MfaFactorType;
  status: MfaFactorStatus;
  createdAt: string | null;
}>;

/**
 * One authentication method reference from the current session, used to compute
 * step-up freshness. `timestamp` is unix seconds, matching Supabase AMR entries.
 */
export type AuthMethodReference = Readonly<{
  method: string;
  timestamp: number;
}>;

/** Current assurance snapshot resolved from the active session. */
export type AssuranceSnapshot = Readonly<{
  currentLevel: AuthenticatorAssuranceLevel;
  /** The highest level the user could reach (aal2 when a verified factor exists). */
  nextLevel: AuthenticatorAssuranceLevel;
  authMethods: readonly AuthMethodReference[];
}>;

/**
 * The material returned when starting a TOTP enrollment. `qrCodeSvg` is an SVG
 * string suitable for direct rendering; `secret`/`uri` support manual entry.
 * No secret is persisted by the client beyond this in-memory enrollment step.
 */
export type MfaEnrollmentTicket = Readonly<{
  factorId: string;
  qrCodeSvg: string;
  secret: string;
  uri: string;
}>;

/** Result of a step-up freshness evaluation for a sensitive financial action. */
export type StepUpEvaluation = Readonly<{
  /** True only for an AAL2 session with a step-up method inside the window. */
  isFresh: boolean;
  /** Seconds of remaining validity when fresh; 0 otherwise. */
  secondsRemaining: number;
  /** True when the user has no verified factor and must enroll before stepping up. */
  requiresEnrollment: boolean;
}>;

/** Discriminated result for MFA/step-up service calls, keeping errors user-safe. */
export type MfaOperationResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; message: string }>;

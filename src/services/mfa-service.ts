// Supabase MFA integration for organization and merchant financial actions
// (Requirements 20.1, 20.2). This is a thin, typed wrapper over
// `supabase.auth.mfa` that projects provider results to the shared MFA types and
// maps failures to user-safe messages. It performs no signing and moves no value:
// verifying a TOTP challenge raises the session to AAL2 and refreshes the
// recent-step-up window; the Edge Functions and database policies remain the sole
// authority on whether a sensitive action is permitted.

import { supabase } from '@/lib/supabase';
import type {
    AssuranceSnapshot,
    AuthenticatorAssuranceLevel,
    MfaEnrollmentTicket,
    MfaFactorSummary,
    MfaFactorType,
    MfaOperationResult,
} from '@/types/mfa';

const userMessage = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message ? error.message : fallback;

const normalizeLevel = (level: string | null | undefined): AuthenticatorAssuranceLevel =>
  level === 'aal2' ? 'aal2' : 'aal1';

const toFactorType = (value: string): MfaFactorType => (value === 'phone' ? 'phone' : 'totp');

/** Lists the caller's enrolled MFA factors, projected to the UI shape. */
export const listMfaFactors = async (): Promise<MfaOperationResult<readonly MfaFactorSummary[]>> => {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error || !data) {
    return { ok: false, message: userMessage(error, 'Unable to load your security factors.') };
  }
  const factors: MfaFactorSummary[] = data.all.map((factor) => ({
    id: factor.id,
    friendlyName: factor.friendly_name ?? null,
    factorType: toFactorType(factor.factor_type),
    status: factor.status === 'verified' ? 'verified' : 'unverified',
    createdAt: factor.created_at ?? null,
  }));
  return { ok: true, value: factors };
};

/** Resolves the current assurance level and the session's authentication methods. */
export const getAssuranceSnapshot = async (): Promise<MfaOperationResult<AssuranceSnapshot>> => {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) {
    return { ok: false, message: userMessage(error, 'Unable to check your authentication level.') };
  }
  return {
    ok: true,
    value: {
      currentLevel: normalizeLevel(data.currentLevel),
      nextLevel: normalizeLevel(data.nextLevel),
      authMethods: (data.currentAuthenticationMethods ?? []).map((entry) => ({
        method: entry.method,
        timestamp: entry.timestamp,
      })),
    },
  };
};

/**
 * Begins TOTP enrollment and returns the QR/secret material for the user to add
 * to their authenticator app. Enrollment is not complete until the returned
 * factor is verified with a code via `verifyEnrollment`.
 */
export const enrollTotpFactor = async (
  friendlyName: string,
): Promise<MfaOperationResult<MfaEnrollmentTicket>> => {
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName,
  });
  if (error || !data) {
    return { ok: false, message: userMessage(error, 'Unable to start authenticator setup.') };
  }
  return {
    ok: true,
    value: {
      factorId: data.id,
      qrCodeSvg: data.totp.qr_code,
      secret: data.totp.secret,
      uri: data.totp.uri,
    },
  };
};

/**
 * Verifies the code from the authenticator app to finish enrollment. On success
 * the factor becomes `verified` and the session is raised to AAL2.
 */
export const verifyEnrollment = async (
  factorId: string,
  code: string,
): Promise<MfaOperationResult<null>> => {
  const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
  if (challengeError || !challenge) {
    return { ok: false, message: userMessage(challengeError, 'Unable to verify the code right now.') };
  }
  const { error } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code: code.trim(),
  });
  if (error) {
    return { ok: false, message: userMessage(error, 'That code did not match. Please try again.') };
  }
  return { ok: true, value: null };
};

/**
 * Performs a step-up: challenges an already-verified factor and verifies the
 * supplied code. Success refreshes the recent-step-up window so a sensitive
 * financial action can proceed (Requirement 20.2).
 */
export const stepUpWithCode = async (
  factorId: string,
  code: string,
): Promise<MfaOperationResult<null>> => {
  const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
  if (challengeError || !challenge) {
    return { ok: false, message: userMessage(challengeError, 'Unable to start step-up verification.') };
  }
  const { error } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code: code.trim(),
  });
  if (error) {
    return { ok: false, message: userMessage(error, 'That code did not match. Please try again.') };
  }
  return { ok: true, value: null };
};

/** Removes an enrolled factor. */
export const unenrollFactor = async (factorId: string): Promise<MfaOperationResult<null>> => {
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) {
    return { ok: false, message: userMessage(error, 'Unable to remove this factor.') };
  }
  return { ok: true, value: null };
};

/** Selects the first verified factor, preferring TOTP, for step-up prompts. */
export const pickStepUpFactor = (
  factors: readonly MfaFactorSummary[],
): MfaFactorSummary | null => {
  const verified = factors.filter((factor) => factor.status === 'verified');
  return verified.find((factor) => factor.factorType === 'totp') ?? verified[0] ?? null;
};

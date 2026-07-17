import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '@/context/AuthContext';
import {
    enrollTotpFactor,
    getAssuranceSnapshot,
    listMfaFactors,
    unenrollFactor,
    verifyEnrollment,
} from '@/services/mfa-service';
import type {
    AssuranceSnapshot,
    MfaEnrollmentTicket,
    MfaFactorSummary,
    MfaOperationResult,
} from '@/types/mfa';

export type MfaHook = Readonly<{
  factors: readonly MfaFactorSummary[];
  assurance: AssuranceSnapshot | null;
  /** True once the user holds at least one verified factor (MFA enabled). */
  isEnabled: boolean;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  enroll: (friendlyName: string) => Promise<MfaOperationResult<MfaEnrollmentTicket>>;
  confirmEnrollment: (factorId: string, code: string) => Promise<MfaOperationResult<null>>;
  removeFactor: (factorId: string) => Promise<MfaOperationResult<null>>;
}>;

/**
 * Loads and manages the authenticated user's MFA factors and assurance level for
 * organization and merchant financial accounts (Requirement 20.1). It never
 * asserts that an action is authorized; it only reflects real Supabase MFA state
 * so the security screen can guide enrollment and step-up.
 */
export const useMfa = (): MfaHook => {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [factors, setFactors] = useState<readonly MfaFactorSummary[]>([]);
  const [assurance, setAssurance] = useState<AssuranceSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    if (!userId) {
      setFactors([]);
      setAssurance(null);
      setError(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);

    const [factorsResult, assuranceResult] = await Promise.all([
      listMfaFactors(),
      getAssuranceSnapshot(),
    ]);
    if (request !== requestRef.current) return;

    if (!factorsResult.ok) {
      setError(factorsResult.message);
      setFactors([]);
    } else {
      setFactors(factorsResult.value);
    }
    setAssurance(assuranceResult.ok ? assuranceResult.value : null);
    setIsLoading(false);
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const enroll = useCallback(
    (friendlyName: string) => enrollTotpFactor(friendlyName),
    [],
  );

  const confirmEnrollment = useCallback(
    async (factorId: string, code: string) => {
      const result = await verifyEnrollment(factorId, code);
      if (result.ok) await load();
      return result;
    },
    [load],
  );

  const removeFactor = useCallback(
    async (factorId: string) => {
      const result = await unenrollFactor(factorId);
      if (result.ok) await load();
      return result;
    },
    [load],
  );

  const isEnabled = factors.some((factor) => factor.status === 'verified');

  return {
    factors,
    assurance,
    isEnabled,
    isLoading,
    error,
    refresh: load,
    enroll,
    confirmEnrollment,
    removeFactor,
  };
};

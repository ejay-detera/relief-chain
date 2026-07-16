import { useCallback, useMemo, useState } from 'react';

import { getAssuranceSnapshot, pickStepUpFactor, stepUpWithCode } from '@/services/mfa-service';
import type { MfaFactorSummary, StepUpEvaluation } from '@/types/mfa';
import { evaluateStepUp } from '@/utils/step-up';

export type StepUpPhase = 'idle' | 'prompting' | 'verifying';

export type StepUpHook = Readonly<{
  /** Current freshness derived from the latest assurance snapshot. */
  evaluation: StepUpEvaluation;
  phase: StepUpPhase;
  error: string | null;
  /** True when a sensitive action should show the step-up prompt first. */
  needsStepUp: boolean;
  /** Opens the step-up prompt (no-op when a fresh step-up already exists). */
  begin: () => void;
  /** Verifies the supplied code; on success the step-up window is refreshed. */
  submitCode: (code: string) => Promise<boolean>;
  /** Dismisses the prompt without verifying. */
  cancel: () => void;
}>;

const NO_FACTOR_MESSAGE =
  'Set up an authenticator app before authorizing financial actions.';

/**
 * Orchestrates recent step-up for a sensitive financial action (Requirement
 * 20.2). It reads the current assurance snapshot to decide whether a fresh
 * step-up already exists; if not, it drives a challenge/verify prompt against the
 * user's verified factor. This gates the UX early — the Edge Functions and
 * database policies still enforce the real requirement on submission.
 */
export const useStepUp = (
  factors: readonly MfaFactorSummary[],
  evaluation: StepUpEvaluation,
): StepUpHook => {
  const [phase, setPhase] = useState<StepUpPhase>('idle');
  const [error, setError] = useState<string | null>(null);

  const factor = useMemo(() => pickStepUpFactor(factors), [factors]);

  const begin = useCallback(() => {
    setError(null);
    if (evaluation.isFresh) {
      setPhase('idle');
      return;
    }
    if (!factor) {
      setError(NO_FACTOR_MESSAGE);
    }
    setPhase('prompting');
  }, [evaluation.isFresh, factor]);

  const cancel = useCallback(() => {
    setPhase('idle');
    setError(null);
  }, []);

  const submitCode = useCallback(
    async (code: string): Promise<boolean> => {
      if (!factor) {
        setError(NO_FACTOR_MESSAGE);
        return false;
      }
      if (code.trim().length < 6) {
        setError('Enter the 6-digit code from your authenticator app.');
        return false;
      }
      setPhase('verifying');
      setError(null);

      const result = await stepUpWithCode(factor.id, code);
      if (!result.ok) {
        setError(result.message);
        setPhase('prompting');
        return false;
      }
      // Confirm the session actually advanced before reporting success.
      const snapshot = await getAssuranceSnapshot();
      const fresh = snapshot.ok ? evaluateStepUp(snapshot.value).isFresh : true;
      setPhase('idle');
      return fresh;
    },
    [factor],
  );

  return {
    evaluation,
    phase,
    error,
    needsStepUp: !evaluation.isFresh,
    begin,
    submitCode,
    cancel,
  };
};

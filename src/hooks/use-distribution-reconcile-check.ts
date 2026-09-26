import { useCallback, useRef, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { reconcileDistributionJob } from '@/services/distribution-reconcile-service';
import type { DistributionReconcileCheckResult } from '@/types/distribution-reconcile';
import type { FinancialError } from '@/types/errors';

export type DistributionReconcileCheckHook = Readonly<{
  isChecking: boolean;
  error: FinancialError | null;
  lastCheck: DistributionReconcileCheckResult | null;
  checkDistribution: () => Promise<void>;
  resetCheck: () => void;
}>;

/**
 * Owns loading and error state for the LGU's authorized distribution check.
 * Relays the check with the LGU user's own session (org role passes the Edge
 * job-branch authorization check), then leaves refresh orchestration to the
 * screen: the caller re-observes the reconciled job and recipient reads so a
 * `confirmed` render comes only from reconciler-owned DB truth — never from
 * the invoke response alone.
 */
export function useDistributionReconcileCheck(jobId: string | null): DistributionReconcileCheckHook {
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<FinancialError | null>(null);
  const [lastCheck, setLastCheck] = useState<DistributionReconcileCheckResult | null>(null);
  const requestRef = useRef(0);

  const checkDistribution = useCallback(async () => {
    const request = ++requestRef.current;
    if (!jobId) return;
    setIsChecking(true);
    setError(null);
    try {
      const result = await reconcileDistributionJob(
        { jobId },
        (name, options) => supabase.functions.invoke(name, options),
      );
      if (request !== requestRef.current) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setLastCheck(result.data);
    } catch (caught: unknown) {
      if (request !== requestRef.current) return;
      setError({
        code: 'dependency_unavailable',
        message: caught instanceof Error ? caught.message : 'Distribution status is unavailable.',
        retryable: true,
        correlationId: 'client-unresolved',
      });
    } finally {
      if (request === requestRef.current) setIsChecking(false);
    }
  }, [jobId]);

  const resetCheck = useCallback(() => {
    requestRef.current += 1;
    setError(null);
    setLastCheck(null);
  }, []);

  return {
    isChecking,
    error,
    lastCheck,
    checkDistribution,
    resetCheck,
  };
}

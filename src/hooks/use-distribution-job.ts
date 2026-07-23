import { useCallback, useEffect, useRef, useState } from 'react';

import {
    fetchRecipientOutcomes,
    observeDistributionJob,
    retryDistribution,
} from '@/services/distribution-service';
import type {
    DistributionJobObservation,
    DistributionRecipientOutcome,
} from '@/types/distribution';
import type { FinancialError } from '@/types/errors';

export type DistributionRecipientsState =
  | { status: 'loading' }
  | { status: 'loaded'; outcomes: readonly DistributionRecipientOutcome[] }
  | { status: 'unavailable'; reason: string; retryable: boolean };

/**
 * State of a relayed safe-retry. It stays honest about the relay itself: an
 * accepted retry never marks any transfer confirmed — it only re-observes
 * reconciled state — and a failed relay surfaces the server's typed error
 * without inventing success (Requirements 8.6, 21.4).
 */
export type DistributionRetryState =
  | { status: 'idle' }
  | { status: 'retrying' }
  | { status: 'error'; error: FinancialError };

export type DistributionJobHook = Readonly<{
  job: DistributionJobObservation;
  recipients: DistributionRecipientsState;
  refreshing: boolean;
  refresh: () => Promise<void>;
  retryState: DistributionRetryState;
  /** Relays a safe-retry to the server, then re-observes reconciled state. */
  retrySafe: () => Promise<void>;
}>;

/**
 * Observes a server-managed distribution job and its recipient outcomes from
 * reconciled state. It loads once on mount and exposes an explicit `refresh`;
 * it deliberately runs no progress timer and never implies blockchain work
 * (Requirement 21.1). Passing `null` (no job started yet) yields an `empty`
 * observation without touching the network.
 */
export function useDistributionJob(jobId: string | null): DistributionJobHook {
  const [job, setJob] = useState<DistributionJobObservation>(
    jobId ? { status: 'loading' } : { status: 'empty' },
  );
  const [recipients, setRecipients] = useState<DistributionRecipientsState>({ status: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const [retryState, setRetryState] = useState<DistributionRetryState>({ status: 'idle' });
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    if (!jobId) {
      setJob({ status: 'empty' });
      setRecipients({ status: 'loading' });
      return;
    }

    const request = ++requestRef.current;
    setRefreshing(true);
    try {
      const [observation, outcomes] = await Promise.all([
        observeDistributionJob(jobId),
        fetchRecipientOutcomes(jobId),
      ]);

      if (request !== requestRef.current) return;

      setJob(observation);
      setRecipients(
        outcomes.ok
          ? { status: 'loaded', outcomes: outcomes.data }
          : { status: 'unavailable', reason: outcomes.error.message, retryable: outcomes.error.retryable },
      );
    } finally {
      if (request === requestRef.current) setRefreshing(false);
    }
  }, [jobId]);

  /**
   * Relays a safe-retry to the server for the current job. The server owns
   * retry classification and idempotency; on acceptance we simply re-observe the
   * reconciled projection. On failure we keep the last observed state and expose
   * the typed error — a failed relay is never shown as success.
   */
  const retrySafe = useCallback(async () => {
    if (!jobId) return;
    setRetryState({ status: 'retrying' });
    const result = await retryDistribution({ jobId, requestedAt: new Date().toISOString() });
    if (!result.ok) {
      setRetryState({ status: 'error', error: result.error });
      return;
    }
    setRetryState({ status: 'idle' });
    await load();
  }, [jobId, load]);

  useEffect(() => {
    void load();
  }, [load]);

  return { job, recipients, refreshing, refresh: load, retryState, retrySafe };
}

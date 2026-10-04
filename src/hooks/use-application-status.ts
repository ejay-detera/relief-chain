import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { ApplicationStatusDetails } from '@/types/application-status';
import {
  fetchApplicationStatusDetails,
  fetchBeneficiaryApplicationHistory,
} from '@/services/application-status-service';
import {
  markVoucherScannedLocally,
  subscribeToVoucherLifecycle,
  VoucherSyncEvent,
} from '@/services/voucher-sync-service';

export function useApplicationStatus(enrollmentId?: string) {
  const { session } = useAuth();
  const [details, setDetails] = useState<ApplicationStatusDetails | null>(null);
  const [history, setHistory] = useState<ApplicationStatusDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const reload = useCallback(async () => {
    if (!session) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      if (enrollmentId) {
        const item = await fetchApplicationStatusDetails(enrollmentId);
        setDetails(item);
      } else {
        const items = await fetchBeneficiaryApplicationHistory(session.user.id);
        setHistory(items);
        if (items.length > 0) {
          setDetails(items[0]);
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [session, enrollmentId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);

  // Realtime listener for merchant scans, redemptions, and enrollment changes
  useEffect(() => {
    if (!session?.user?.id) return;

    const handleSync = (event: VoucherSyncEvent) => {
      if (event.enrollmentId) {
        markVoucherScannedLocally(event.enrollmentId);
      }

      // Optimistically move stage to 'redeemed' upon scan for instant UX feedback
      if (event.type === 'scanned') {
        setDetails((prev) => {
          if (!prev) return prev;
          if (!enrollmentId || prev.enrollmentId === event.enrollmentId) {
            if (prev.currentStage === 'aid_released') {
              return {
                ...prev,
                currentStage: 'redeemed',
                currentStageLabel: 'Redeemed',
                timeline: prev.timeline.map((item) => {
                  if (item.stage === 'aid_released') {
                    return { ...item, isCompleted: true, isCurrent: false };
                  }
                  if (item.stage === 'redeemed') {
                    return { ...item, isCompleted: false, isCurrent: true, timestamp: event.timestamp };
                  }
                  return item;
                }),
              };
            }
          }
          return prev;
        });
      }

      // Authoritative reload from DB
      void reload();
    };

    const unsubscribe = subscribeToVoucherLifecycle({
      enrollmentId: enrollmentId ?? null,
      beneficiaryId: session.user.id,
      onSync: handleSync,
    });

    return () => {
      unsubscribe();
    };
  }, [session?.user?.id, enrollmentId, reload]);

  return {
    details,
    history,
    isLoading,
    error,
    refresh: reload,
  };
}

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { ApplicationStatusDetails } from '@/types/application-status';
import {
  fetchApplicationStatusDetails,
  fetchBeneficiaryApplicationHistory,
} from '@/services/application-status-service';

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

  return {
    details,
    history,
    isLoading,
    error,
    refresh: reload,
  };
}

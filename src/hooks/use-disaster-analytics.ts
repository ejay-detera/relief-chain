import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { getDisasterAnalytics } from '@/services/disasterAnalyticsService';
import type {
  DisasterAnalyticsFilter,
  DisasterAnalyticsSummary,
} from '@/types/analytics';

export function useDisasterAnalytics(organizationId?: string | null) {
  const [filter, setFilterState] = useState<DisasterAnalyticsFilter>({
    programId: 'all',
    aidType: 'all',
    datePreset: 'all',
  });

  const [analytics, setAnalytics] = useState<DisasterAnalyticsSummary | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [availablePrograms, setAvailablePrograms] = useState<{ id: string; name: string }[]>([]);

  // Fetch available programs for the program filter dropdown
  useEffect(() => {
    let isMounted = true;

    async function loadPrograms() {
      try {
        let query = supabase
          .from('programs')
          .select('id, name')
          .order('created_at', { ascending: false });

        if (organizationId) {
          query = query.eq('organization_id', organizationId);
        }

        const { data, error: pError } = await query;
        if (!pError && data && isMounted) {
          setAvailablePrograms(data.map((p) => ({ id: p.id, name: p.name || 'Untitled Program' })));
        }
      } catch (err) {
        console.warn('[useDisasterAnalytics] Error fetching programs for filter:', err);
      }
    }

    void loadPrograms();

    return () => {
      isMounted = false;
    };
  }, [organizationId]);

  // Load analytics whenever filter or organizationId changes
  useEffect(() => {
    let isMounted = true;

    void getDisasterAnalytics(filter, organizationId)
      .then((data) => {
        if (isMounted) {
          setAnalytics(data);
          setError(null);
        }
      })
      .catch((err: any) => {
        if (isMounted) {
          console.error('[useDisasterAnalytics] Error loading disaster analytics:', err);
          setError(err?.message || 'Failed to calculate disaster analytics.');
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [filter, organizationId]);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getDisasterAnalytics(filter, organizationId);
      setAnalytics(data);
    } catch (err: any) {
      console.error('[useDisasterAnalytics] Error refreshing disaster analytics:', err);
      setError(err?.message || 'Failed to calculate disaster analytics.');
    } finally {
      setIsLoading(false);
    }
  }, [filter, organizationId]);

  const updateFilter = useCallback((partialFilter: Partial<DisasterAnalyticsFilter>) => {
    setIsLoading(true);
    setFilterState((prev) => ({
      ...prev,
      ...partialFilter,
    }));
  }, []);

  return {
    analytics,
    isLoading,
    error,
    filter,
    setFilter: updateFilter,
    refresh,
    availablePrograms,
  };
}

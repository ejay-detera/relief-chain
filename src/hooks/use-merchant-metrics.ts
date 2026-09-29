import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { getOrCreateMerchantMetrics } from '@/services/merchantMetricsService';
import type { MerchantMetrics } from '@/types/merchant-metrics';

type MerchantMetricsState = {
  error: Error | null;
  isLoading: boolean;
  metrics: MerchantMetrics | null;
  reload: () => Promise<void>;
};

const toError = (error: unknown) =>
  error instanceof Error ? error : new Error('Unable to load merchant metrics.');

export const useMerchantMetrics = (merchantEntityId?: string | null): MerchantMetricsState => {
  const [metrics, setMetrics] = useState<MerchantMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const requestRef = useRef(0);

  const reload = useCallback(async () => {
    const request = ++requestRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const data = await getOrCreateMerchantMetrics(merchantEntityId);
      if (request === requestRef.current) {
        setMetrics(data);
      }
    } catch (caught: unknown) {
      if (request === requestRef.current) {
        setError(toError(caught));
      }
    } finally {
      if (request === requestRef.current) {
        setIsLoading(false);
      }
    }
  }, [merchantEntityId]);

  useFocusEffect(useCallback(() => { void reload(); }, [reload]));

  return { error, isLoading, metrics, reload };
};

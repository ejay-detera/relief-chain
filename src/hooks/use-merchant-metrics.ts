import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

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

export const useMerchantMetrics = (): MerchantMetricsState => {
  const [metrics, setMetrics] = useState<MerchantMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const reload = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setMetrics(await getOrCreateMerchantMetrics());
    } catch (caught: unknown) {
      setError(toError(caught));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void reload(); }, [reload]));

  return { error, isLoading, metrics, reload };
};

import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { useAuth } from '@/context/AuthContext';
import { fetchMerchantPrograms } from '@/services/merchantProgramsService';
import type { MerchantProgram } from '@/types/merchant-program';

type MerchantProgramsState = {
  programs: MerchantProgram[];
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
};

const toError = (error: unknown): Error =>
  error instanceof Error ? error : new Error('Unable to load merchant programs.');

export const useMerchantPrograms = (): MerchantProgramsState => {
  const { profile } = useAuth();
  const [programs, setPrograms] = useState<MerchantProgram[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const requestId = useRef(0);
  const merchantName = profile?.full_name ?? null;

  const refresh = useCallback(async () => {
    const request = ++requestId.current;
    setIsLoading(true);
    setError(null);
    try {
      const nextPrograms = await fetchMerchantPrograms(merchantName);
      if (request === requestId.current) setPrograms(nextPrograms);
    } catch (caught: unknown) {
      if (request === requestId.current) setError(toError(caught));
    } finally {
      if (request === requestId.current) setIsLoading(false);
    }
  }, [merchantName]);

  useFocusEffect(useCallback(() => {
    void refresh();
    return () => { requestId.current += 1; };
  }, [refresh]));

  return { programs, isLoading, error, refresh };
};
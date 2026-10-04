import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { useAuth } from '@/context/AuthContext';
import {
  applyForAidProgram,
  fetchAvailableAidPrograms,
  fetchMerchantPrograms,
  withdrawAidProgramApplication,
} from '@/services/merchantProgramsService';
import type { AvailableAidProgram, MerchantProgram } from '@/types/merchant-program';

type MerchantProgramsState = {
  programs: MerchantProgram[];
  availablePrograms: AvailableAidProgram[];
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  applyProgram: (
    programId: string,
    notes?: string,
  ) => Promise<{ success: boolean; error?: string }>;
  withdrawApplication: (programId: string) => Promise<{ success: boolean; error?: string }>;
};

const toError = (error: unknown): Error =>
  error instanceof Error ? error : new Error('Unable to load merchant programs.');

export const useMerchantPrograms = (): MerchantProgramsState => {
  const { profile } = useAuth();
  const [programs, setPrograms] = useState<MerchantProgram[]>([]);
  const [availablePrograms, setAvailablePrograms] = useState<AvailableAidProgram[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const requestId = useRef(0);
  const merchantName = profile?.full_name ?? null;

  const refresh = useCallback(async () => {
    const request = ++requestId.current;
    setIsLoading(true);
    setError(null);
    try {
      const [nextAccepted, nextAvailable] = await Promise.all([
        fetchMerchantPrograms(merchantName),
        fetchAvailableAidPrograms(),
      ]);
      if (request === requestId.current) {
        setPrograms(nextAccepted);
        setAvailablePrograms(nextAvailable);
      }
    } catch (caught: unknown) {
      if (request === requestId.current) setError(toError(caught));
    } finally {
      if (request === requestId.current) setIsLoading(false);
    }
  }, [merchantName]);

  const applyProgram = useCallback(
    async (
      programId: string,
      notes?: string,
    ): Promise<{ success: boolean; error?: string }> => {
      const result = await applyForAidProgram(programId, notes);
      if (result.success) {
        // Optimistically update availablePrograms applicationStatus
        setAvailablePrograms((prev) =>
          prev.map((prog) =>
            prog.id === programId
              ? {
                  ...prog,
                  applicationStatus: 'pending',
                  notes: notes || null,
                  appliedAt: new Date().toISOString(),
                }
              : prog,
          ),
        );
        void refresh();
      }
      return result;
    },
    [refresh],
  );

  const withdrawApplication = useCallback(
    async (programId: string): Promise<{ success: boolean; error?: string }> => {
      const result = await withdrawAidProgramApplication(programId);
      if (result.success) {
        setAvailablePrograms((prev) =>
          prev.map((prog) =>
            prog.id === programId
              ? {
                  ...prog,
                  applicationStatus: 'none',
                  notes: null,
                }
              : prog,
          ),
        );
        void refresh();
      }
      return result;
    },
    [refresh],
  );

  useFocusEffect(
    useCallback(() => {
      void refresh();
      return () => {
        requestId.current += 1;
      };
    }, [refresh]),
  );

  return {
    programs,
    availablePrograms,
    isLoading,
    error,
    refresh,
    applyProgram,
    withdrawApplication,
  };
};
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { fetchCashOutRequests } from '@/services/cashout-service';
import type { CashOutRequest } from '@/types/cashout';

export type CashOutListState =
  | { status: 'loading' }
  | { status: 'ready'; requests: readonly CashOutRequest[] }
  | { status: 'unavailable'; reason: string };

export type CashOutRequestsHook = Readonly<{
  state: CashOutListState;
  refresh: () => Promise<void>;
}>;

/**
 * Reads the caller's reconciled simulated cash-out requests. A failed read
 * surfaces `unavailable` and is never converted into a fabricated list
 * (Requirements 12.6, 21.2, 21.4).
 */
export function useCashOutRequests(): CashOutRequestsHook {
  const [state, setState] = useState<CashOutListState>({ status: 'loading' });
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    setState({ status: 'loading' });
    const result = await fetchCashOutRequests();
    if (request !== requestRef.current) return;
    setState(
      result.ok
        ? { status: 'ready', requests: result.data }
        : { status: 'unavailable', reason: result.error.message },
    );
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return { state, refresh: load };
}

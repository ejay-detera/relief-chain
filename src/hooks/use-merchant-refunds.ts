import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { fetchRefunds } from '@/services/refund-service';
import type { Refund } from '@/types/refund';

export type RefundListState =
  | { status: 'loading' }
  | { status: 'ready'; refunds: readonly Refund[] }
  | { status: 'unavailable'; reason: string };

export type MerchantRefundsHook = Readonly<{
  state: RefundListState;
  refresh: () => Promise<void>;
}>;

/**
 * Reads the merchant's reconciled refunds. Each refund is a distinct compensating
 * record linked to an immutable original settlement (Requirements 15.1, 15.2). A
 * failed read surfaces `unavailable` and is never fabricated.
 */
export function useMerchantRefunds(): MerchantRefundsHook {
  const [state, setState] = useState<RefundListState>({ status: 'loading' });
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    setState({ status: 'loading' });
    const result = await fetchRefunds();
    if (request !== requestRef.current) return;
    setState(
      result.ok
        ? { status: 'ready', refunds: result.data }
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

// src/hooks/use-pending-payments.ts
import { supabase } from '@/lib/supabase';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Represents a pending payment intent visible to the merchant.
 */
export type PendingPayment = Readonly<{
  id: string;
  amountStroops: string; // StroopAmount as string
  createdAt: string; // ISO timestamp
  transactionHash: string | null;
}>;

/** Hook to fetch and refresh pending payment intents for a merchant. */
export function usePendingPayments(merchantEntityId: string | null) {
  const [payments, setPayments] = useState<PendingPayment[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    if (!merchantEntityId) {
      setPayments([]);
      setError(null);
      setLoading(false);
      return;
    }
    const request = ++requestRef.current;
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('payment_intents')
        .select('id, amount_stroops, created_at, transaction_hash, status')
        .eq('merchant_entity_id', merchantEntityId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (request !== requestRef.current) return; // stale request

      const pending: PendingPayment[] = (data ?? []).map((row: any) => ({
        id: row.id,
        amountStroops: row.amount_stroops.toString(),
        createdAt: row.created_at,
        transactionHash: row.transaction_hash ?? null,
      }));
      setPayments(pending);
    } catch (err: unknown) {
      if (request !== requestRef.current) return;
      setError(err instanceof Error ? err.message : 'Failed to load pending payments');
      setPayments([]);
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [merchantEntityId]);

  // Load on mount and when merchantEntityId changes.
  useEffect(() => {
    // eslint-disable-next-line react-compiler/react-compiler
    void load();
  }, [load]);

  // Subscribe to realtime updates for new pending payments.
  useEffect(() => {
    if (!merchantEntityId) return;
    const channel = supabase
      .channel(`payment_intents:merchant:${merchantEntityId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'payment_intents',
          // `postgres_changes` filters support exactly one `column=operator.value`
          // condition; chaining a second condition with `&` is not valid syntax
          // and is silently ignored, so it does NOT additionally scope by
          // status. Scope the subscription to this merchant only (the
          // security-relevant boundary) and re-check `status` client-side
          // below before ever showing the row.
          filter: `merchant_entity_id=eq.${merchantEntityId}`,
        },
        (payload) => {
          const row = payload.new;
          if (row.status !== 'pending') return;
          const newPayment: PendingPayment = {
            id: row.id,
            amountStroops: row.amount_stroops.toString(),
            createdAt: row.created_at,
            transactionHash: row.transaction_hash ?? null,
          };
          // Prepend the new payment to the list to keep most recent first.
          // De-dupe defensively in case the realtime event and the initial
          // `load()` race and both deliver the same row.
          setPayments((prev) => (prev.some((p) => p.id === newPayment.id) ? prev : [newPayment, ...prev]));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [merchantEntityId]);

  return { payments, loading, error, refresh: load };
}

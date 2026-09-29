import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { getStoredInvoices, updateInvoiceStatus } from '@/services/merchant-invoice-storage';
import { reconcileMerchantSettlement } from '@/services/merchant-settlement-service';
import { parseStroopAmount, type LedgerEvidence, type StroopAmount } from '@/types/blockchain';
import type {
    MerchantInvoiceRecord,
    MerchantPaymentHistoryFilter,
    MerchantPaymentHistorySummary,
    PaymentHistorySortOrder,
} from '@/types/merchant-payment-history';
import { addStroops, ZERO_STROOPS } from '@/utils/format-stroops';

const PAGE_SIZE = 10;

type SettlementRow = Readonly<{
  id: string;
  amount_stroops: number;
  transaction_hash: string | null;
  ledger: number | null;
  confirmed_at: string | null;
  correlation_id: string | null;
  payment_intent_id: string | null;
}>;

export type MerchantInvoiceHistoryHook = Readonly<{
  invoices: readonly MerchantInvoiceRecord[];
  allCount: number;
  filteredCount: number;
  visibleCount: number;
  hasMore: boolean;
  isLoading: boolean;
  error: string | null;
  filter: MerchantPaymentHistoryFilter;
  sortOrder: PaymentHistorySortOrder;
  summary: MerchantPaymentHistorySummary;
  setFilter: (filter: MerchantPaymentHistoryFilter) => void;
  toggleSortOrder: () => void;
  setSortOrder: (order: PaymentHistorySortOrder) => void;
  loadMore: () => void;
  refresh: () => Promise<void>;
  checkInvoiceSettlement: (record: MerchantInvoiceRecord) => Promise<boolean>;
}>;

export function useMerchantInvoiceHistory(merchantEntityId: string | null): MerchantInvoiceHistoryHook {
  const [records, setRecords] = useState<readonly MerchantInvoiceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<MerchantPaymentHistoryFilter>('all');
  const [sortOrder, setSortOrder] = useState<PaymentHistorySortOrder>('newest');
  const [visibleCount, setVisibleCount] = useState<number>(PAGE_SIZE);

  const requestRef = useRef(0);

  const load = useCallback(async () => {
    if (!merchantEntityId) {
      setRecords([]);
      setIsLoading(false);
      return;
    }
    const request = ++requestRef.current;
    setIsLoading(true);
    setError(null);

    try {
      // 1. Fetch local stored invoices
      const stored = await getStoredInvoices(merchantEntityId);
      if (request !== requestRef.current) return;

      // 2. Fetch remote confirmed settlements for this merchant
      let settlements: SettlementRow[] = [];
      try {
        const { data: settlementData, error: settlementError } = await supabase
          .from('settlements')
          .select('id, amount_stroops, transaction_hash, ledger, confirmed_at, correlation_id, payment_intent_id')
          .eq('merchant_id', merchantEntityId)
          .eq('status', 'confirmed')
          .order('confirmed_at', { ascending: false });

        if (!settlementError && Array.isArray(settlementData)) {
          settlements = settlementData as SettlementRow[];
        }
      } catch {
        // Fallback gracefully if database or offline
      }

      if (request !== requestRef.current) return;

      const now = Date.now();
      const updatedRecords: MerchantInvoiceRecord[] = [];

      for (const item of stored) {
        let status = item.status;
        let evidence = item.settlementEvidence ?? null;

        // Check if settlement matched
        const matchedSettlement = settlements.find((s) =>
          (evidence?.transactionHash && s.transaction_hash === evidence.transactionHash) ||
          (item.id && s.correlation_id === item.id)
        );

        if (matchedSettlement && matchedSettlement.transaction_hash && matchedSettlement.ledger) {
          status = 'settled';
          evidence = {
            network: 'testnet',
            transactionHash: matchedSettlement.transaction_hash,
            ledgerSequence: matchedSettlement.ledger,
            confirmedAt: matchedSettlement.confirmed_at ?? new Date().toISOString(),
            correlationId: matchedSettlement.correlation_id ?? item.id,
          };
        } else if (status !== 'settled') {
          const isExpired = Date.parse(item.invoice.expiresAt) <= now;
          status = isExpired ? 'expired' : 'active';
        }

        // If status changed in storage, persist update
        if (status !== item.status || evidence !== item.settlementEvidence) {
          void updateInvoiceStatus(merchantEntityId, item.id, status, evidence);
        }

        updatedRecords.push({
          ...item,
          status,
          settlementEvidence: evidence,
        });
      }

      setRecords(Object.freeze(updatedRecords));
    } catch (caught: unknown) {
      if (request !== requestRef.current) return;
      setError(caught instanceof Error ? caught.message : 'Failed to load payment history.');
    } finally {
      if (request === requestRef.current) {
        setIsLoading(false);
      }
    }
  }, [merchantEntityId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // Filter and sort records
  const filteredAndSortedRecords = useMemo(() => {
    let result = records.slice();

    if (filter !== 'all') {
      result = result.filter((item) => item.status === filter);
    }

    result.sort((a, b) => {
      const timeA = Date.parse(a.createdAt || a.invoice.issuedAt);
      const timeB = Date.parse(b.createdAt || b.invoice.issuedAt);
      return sortOrder === 'newest' ? timeB - timeA : timeA - timeB;
    });

    return result;
  }, [records, filter, sortOrder]);

  // Paginated records for display
  const displayedRecords = useMemo(() => {
    return filteredAndSortedRecords.slice(0, visibleCount);
  }, [filteredAndSortedRecords, visibleCount]);

  const hasMore = visibleCount < filteredAndSortedRecords.length;

  const loadMore = useCallback(() => {
    setVisibleCount((prev) => prev + PAGE_SIZE);
  }, []);

  const toggleSortOrder = useCallback(() => {
    setSortOrder((prev) => (prev === 'newest' ? 'oldest' : 'newest'));
  }, []);

  // Compute metrics summary
  const summary = useMemo<MerchantPaymentHistorySummary>(() => {
    let total = ZERO_STROOPS;
    let settled = 0;
    let active = 0;
    let expired = 0;

    for (const item of records) {
      if (item.status === 'settled') {
        settled += 1;
        total = addStroops(total, item.invoice.amountStroops);
      } else if (item.status === 'active') {
        active += 1;
      } else if (item.status === 'expired') {
        expired += 1;
      }
    }

    return {
      totalReceivedStroops: parseStroopAmount(total),
      settledCount: settled,
      activeCount: active,
      expiredCount: expired,
    };
  }, [records]);

  // Single invoice settlement check
  const checkInvoiceSettlement = useCallback(
    async (record: MerchantInvoiceRecord): Promise<boolean> => {
      if (!merchantEntityId) return false;
      try {
        const { data: accData } = await supabase
          .from('merchant_accreditations')
          .select('organization_id')
          .eq('merchant_id', merchantEntityId)
          .eq('status', 'active')
          .limit(1);

        const orgId = (accData as { organization_id: string }[] | null)?.[0]?.organization_id;
        if (!orgId) return false;

        const result = await reconcileMerchantSettlement(
          { merchantId: merchantEntityId, organizationId: orgId },
          (name, options) => supabase.functions.invoke(name, options),
        );

        if (result.ok && result.data.confirmedCount > 0) {
          await load();
          return true;
        }
      } catch {
        // Handled gracefully
      }
      return false;
    },
    [merchantEntityId, load],
  );

  return {
    invoices: displayedRecords,
    allCount: records.length,
    filteredCount: filteredAndSortedRecords.length,
    visibleCount,
    hasMore,
    isLoading,
    error,
    filter,
    sortOrder,
    summary,
    setFilter: (f) => {
      setFilter(f);
      setVisibleCount(PAGE_SIZE);
    },
    toggleSortOrder,
    setSortOrder: (order) => {
      setSortOrder(order);
      setVisibleCount(PAGE_SIZE);
    },
    loadMore,
    refresh: load,
    checkInvoiceSettlement,
  };
}

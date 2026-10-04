import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { getStoredInvoices } from '@/services/merchant-invoice-storage';
import { parseStroopAmount } from '@/types/blockchain';
import type {
  MerchantTransaction,
  MerchantTransactionFilter,
  MerchantTransactionsSummary,
} from '@/types/merchant-transaction';
import { addStroops, ZERO_STROOPS } from '@/utils/format-stroops';

type SettlementRow = Readonly<{
  id: string;
  amount_stroops: number;
  kind: 'voucher_redemption' | 'cash_payment';
  transaction_hash: string | null;
  ledger: number | null;
  status: 'confirmed' | 'pending' | 'failed';
  correlation_id: string | null;
  confirmed_at: string | null;
  created_at: string;
  program_id: string | null;
  program: { id?: string; name?: string } | { id?: string; name?: string }[] | null;
}>;

export const formatTransactionDate = (dateIso: string): string => {
  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) return dateIso;
  const isToday = new Date().toDateString() === date.toDateString();
  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (isToday) return `Today, ${timeStr}`;
  const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  return `${dateStr}, ${timeStr}`;
};

export const shortReference = (correlationId: string | null, id: string): string => {
  const raw = correlationId || id;
  return `STL-${raw.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
};

export type DateRangePreset = 'all' | 'today' | '7d' | '30d';

export const matchesDateRange = (
  dateIso: string,
  preset: DateRangePreset,
  now = new Date(),
): boolean => {
  if (preset === 'all') return true;
  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) return false;

  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const endOfDay = startOfDay + 24 * 60 * 60 * 1000 - 1;
  const targetTime = date.getTime();

  if (preset === 'today') {
    return targetTime >= startOfDay && targetTime <= endOfDay;
  }
  if (preset === '7d') {
    const sevenDaysAgo = startOfDay - 6 * 24 * 60 * 60 * 1000;
    return targetTime >= sevenDaysAgo && targetTime <= endOfDay;
  }
  if (preset === '30d') {
    const thirtyDaysAgo = startOfDay - 29 * 24 * 60 * 60 * 1000;
    return targetTime >= thirtyDaysAgo && targetTime <= endOfDay;
  }
  return true;
};

export const exportTransactionsToCsv = (transactions: readonly MerchantTransaction[]): string => {
  const headers = [
    'Reference',
    'Date',
    'Payer',
    'Program',
    'Kind',
    'Amount (PHP)',
    'Status',
    'Transaction Hash',
  ];

  const escapeCsv = (val: string | number | null | undefined): string => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const rows = transactions.map((tx) => [
    escapeCsv(shortReference(tx.correlationId, tx.id)),
    escapeCsv(tx.occurredAt),
    escapeCsv(tx.payerName),
    escapeCsv(tx.programName || 'N/A'),
    escapeCsv(tx.kind === 'voucher_redemption' ? 'Voucher' : 'Cash'),
    escapeCsv(tx.amount.toFixed(2)),
    escapeCsv(tx.status),
    escapeCsv(tx.transactionHash || 'N/A'),
  ].join(','));

  return [headers.map((h) => `"${h}"`).join(','), ...rows].join('\n');
};

export type MerchantTransactionsHook = Readonly<{
  transactions: readonly MerchantTransaction[];
  filteredTransactions: readonly MerchantTransaction[];
  summary: MerchantTransactionsSummary;
  filter: MerchantTransactionFilter;
  setFilter: (filter: MerchantTransactionFilter) => void;
  datePreset: DateRangePreset;
  setDatePreset: (preset: DateRangePreset) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}>;

export function useMerchantTransactions(merchantEntityId: string | null): MerchantTransactionsHook {
  const [transactions, setTransactions] = useState<readonly MerchantTransaction[]>([]);
  const [filter, setFilter] = useState<MerchantTransactionFilter>('all');
  const [datePreset, setDatePreset] = useState<DateRangePreset>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    if (!merchantEntityId) {
      setTransactions([]);
      setIsLoading(false);
      return;
    }

    const request = ++requestRef.current;
    setIsLoading(true);
    setError(null);

    try {
      // 1. Fetch remote confirmed settlements for this merchant
      const { data: settlementData, error: settlementError } = await supabase
        .from('settlements')
        .select(`
          id,
          amount_stroops,
          kind,
          transaction_hash,
          ledger,
          status,
          correlation_id,
          confirmed_at,
          created_at,
          program_id,
          program:programs ( id, name )
        `)
        .eq('merchant_id', merchantEntityId)
        .eq('status', 'confirmed')
        .order('created_at', { ascending: false });

      if (settlementError) throw settlementError;
      if (request !== requestRef.current) return;

      const settlementRows = (settlementData ?? []) as unknown as SettlementRow[];

      // 2. Fetch remote voucher redemptions for this merchant
      const { data: redemptionData } = await supabase
        .from('redemptions')
        .select(`
          id,
          amount,
          category,
          status,
          tx_hash,
          redeemed_at,
          program_id,
          program:programs ( id, name )
        `)
        .order('redeemed_at', { ascending: false });

      if (request !== requestRef.current) return;

      // 3. Fetch local invoices to link nonces or check for locally known settled items
      let storedInvoices: Awaited<ReturnType<typeof getStoredInvoices>> = [];
      try {
        storedInvoices = await getStoredInvoices(merchantEntityId);
      } catch {
        // Fall back gracefully
      }
      if (request !== requestRef.current) return;

      const settledInvoiceMap = new Map<string, string>();
      for (const inv of storedInvoices) {
        if (inv.status === 'settled' && inv.settlementEvidence?.transactionHash) {
          settledInvoiceMap.set(inv.settlementEvidence.transactionHash, inv.invoice.nonce);
        }
      }

      // 4. Map settlements to clean domain MerchantTransaction records
      const mappedTransactions: MerchantTransaction[] = settlementRows.map((row) => {
        const programObj = Array.isArray(row.program) ? row.program[0] : row.program;
        const programName = programObj?.name ?? null;
        const payerName = programName
          ? programName
          : row.kind === 'voucher_redemption'
            ? 'Voucher Redemption'
            : 'Direct Payment';

        const rawDate = row.confirmed_at || row.created_at;
        const amountNumber = Number(row.amount_stroops) / 10_000_000;

        return {
          id: row.id,
          settlementId: row.id,
          payerName,
          programName,
          programId: row.program_id,
          occurredAt: formatTransactionDate(rawDate),
          rawDate,
          amount: amountNumber,
          amountStroops: parseStroopAmount(row.amount_stroops),
          status: row.status,
          kind: row.kind,
          transactionHash: row.transaction_hash,
          ledger: row.ledger,
          correlationId: row.correlation_id,
        };
      });

      // 5. Map voucher redemptions to domain MerchantTransaction records
      const mappedRedemptions: MerchantTransaction[] = ((redemptionData ?? []) as Array<Record<string, unknown>>).map((row) => {
        const programObj = Array.isArray(row.program) ? row.program[0] : row.program;
        const prog = programObj as { id?: string; name?: string } | null;
        const programName = prog?.name ?? (row.category ? `${row.category} Voucher` : 'Voucher Redemption');
        const payerName = programName;
        const rawDate = (row.redeemed_at as string) || new Date().toISOString();
        const amountNumber = Number(row.amount);
        let amountStroops = ZERO_STROOPS;
        try {
          amountStroops = parseStroopAmount(BigInt(Math.round(amountNumber * 10_000_000)).toString());
        } catch {
          amountStroops = ZERO_STROOPS;
        }

        return {
          id: row.id as string,
          settlementId: row.id as string,
          payerName,
          programName,
          programId: (row.program_id as string) || null,
          occurredAt: formatTransactionDate(rawDate),
          rawDate,
          amount: amountNumber,
          amountStroops,
          status: 'confirmed' as const,
          kind: 'voucher_redemption' as const,
          transactionHash: (row.tx_hash as string) || null,
          ledger: null,
          correlationId: (row.id as string) || null,
        };
      });

      const allTransactions = [...mappedTransactions, ...mappedRedemptions].sort(
        (a, b) => new Date(b.rawDate).getTime() - new Date(a.rawDate).getTime()
      );

      setTransactions(Object.freeze(allTransactions));
    } catch (caught: unknown) {
      if (request !== requestRef.current) return;
      setError(caught instanceof Error ? caught.message : 'Unable to load past transactions.');
      // Never fabricate sample or mock fallback data on error
      setTransactions([]);
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

  const filteredTransactions = useMemo(() => {
    let result = transactions.slice();

    if (filter !== 'all') {
      result = result.filter((item) => item.kind === filter);
    }

    if (datePreset !== 'all') {
      result = result.filter((item) => matchesDateRange(item.rawDate, datePreset));
    }

    if (searchQuery.trim().length > 0) {
      const query = searchQuery.trim().toLowerCase();
      result = result.filter(
        (item) =>
          item.payerName.toLowerCase().includes(query) ||
          (item.programName && item.programName.toLowerCase().includes(query)) ||
          (item.transactionHash && item.transactionHash.toLowerCase().includes(query)) ||
          (item.correlationId && item.correlationId.toLowerCase().includes(query)),
      );
    }

    return result;
  }, [transactions, filter, datePreset, searchQuery]);

  const summary = useMemo<MerchantTransactionsSummary>(() => {
    let total = ZERO_STROOPS;
    let voucherCount = 0;
    let cashCount = 0;

    for (const item of transactions) {
      total = addStroops(total, item.amountStroops);
      if (item.kind === 'voucher_redemption') {
        voucherCount += 1;
      } else {
        cashCount += 1;
      }
    }

    return {
      totalSettledStroops: parseStroopAmount(total),
      totalSettledPhp: Number(total) / 10_000_000,
      totalCount: transactions.length,
      voucherCount,
      cashCount,
    };
  }, [transactions]);

  return {
    transactions,
    filteredTransactions,
    summary,
    filter,
    setFilter,
    datePreset,
    setDatePreset,
    searchQuery,
    setSearchQuery,
    isLoading,
    error,
    refresh: load,
  };
}

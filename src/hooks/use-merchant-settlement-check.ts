import { useCallback, useEffect, useRef, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { reconcileMerchantSettlement } from '@/services/merchant-settlement-service';
import type { LedgerEvidence } from '@/types/blockchain';
import type { FinancialError } from '@/types/errors';
import type { MerchantSettlementCheckResult } from '@/types/merchant-settlement';

export type MerchantSettlementCheckHook = Readonly<{
  organizationId: string | null;
  isResolvingOrg: boolean;
  isChecking: boolean;
  error: FinancialError | null;
  lastCheck: MerchantSettlementCheckResult | null;
  settledEvidence: LedgerEvidence | null;
  checkSettlement: () => Promise<void>;
  resetCheck: () => void;
}>;

type SettlementRow = Readonly<{
  transaction_hash: string | null;
  ledger: number | null;
  confirmed_at: string | null;
  correlation_id: string | null;
}>;

const toEvidence = (row: SettlementRow): LedgerEvidence | null => {
  if (!row.transaction_hash || typeof row.ledger !== 'number' || !Number.isSafeInteger(row.ledger)) {
    return null;
  }
  return {
    network: 'testnet',
    transactionHash: row.transaction_hash,
    ledgerSequence: row.ledger,
    confirmedAt: row.confirmed_at ?? new Date().toISOString(),
    correlationId: row.correlation_id ?? 'client-unresolved',
  };
};

/**
 * Owns loading and error state for the merchant's authorized settlement check.
 * Resolves the merchant's active organization under RLS, relays the check with
 * the merchant's own session (merchant-self authorization), then re-reads the
 * latest reconciled confirmed settlement so `settled` renders only from
 * reconciler-owned DB truth — never from the invoke response alone.
 */
export function useMerchantSettlementCheck(merchantId: string | null): MerchantSettlementCheckHook {
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [isResolvingOrg, setIsResolvingOrg] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<FinancialError | null>(null);
  const [lastCheck, setLastCheck] = useState<MerchantSettlementCheckResult | null>(null);
  const [settledEvidence, setSettledEvidence] = useState<LedgerEvidence | null>(null);
  const requestRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const resolve = async () => {
      if (!merchantId) {
        setOrganizationId(null);
        return;
      }
      setIsResolvingOrg(true);
      try {
        const { data, error: queryError } = await supabase
          .from('merchant_accreditations')
          .select('organization_id')
          .eq('merchant_id', merchantId)
          .eq('status', 'active')
          .limit(1);
        if (cancelled) return;
        if (queryError) throw queryError;
        const rows = (data ?? []) as readonly Readonly<{ organization_id: string }>[];
        setOrganizationId(rows[0]?.organization_id ?? null);
      } catch {
        if (!cancelled) setOrganizationId(null);
      } finally {
        if (!cancelled) setIsResolvingOrg(false);
      }
    };
    void resolve();
    return () => {
      cancelled = true;
    };
  }, [merchantId]);

  const checkSettlement = useCallback(async () => {
    const request = ++requestRef.current;
    if (!merchantId || !organizationId) return;
    setIsChecking(true);
    setError(null);
    try {
      const result = await reconcileMerchantSettlement(
        { merchantId, organizationId },
        (name, options) => supabase.functions.invoke(name, options),
      );
      if (request !== requestRef.current) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setLastCheck(result.data);

      // Refresh from reconciled DB truth: the latest confirmed settlement row.
      // A `settled` render requires real ledger evidence here.
      const { data, error: settlementError } = await supabase
        .from('settlements')
        .select('transaction_hash, ledger, confirmed_at, correlation_id')
        .eq('merchant_id', merchantId)
        .eq('status', 'confirmed')
        .order('confirmed_at', { ascending: false })
        .limit(1);
      if (request !== requestRef.current) return;
      if (settlementError) throw settlementError;
      const rows = (data ?? []) as readonly SettlementRow[];
      const evidence = rows[0] ? toEvidence(rows[0]) : null;
      if (evidence) setSettledEvidence(evidence);
    } catch (caught: unknown) {
      if (request !== requestRef.current) return;
      setError({
        code: 'dependency_unavailable',
        message: caught instanceof Error ? caught.message : 'Settlement status is unavailable.',
        retryable: true,
        correlationId: 'client-unresolved',
      });
    } finally {
      if (request === requestRef.current) setIsChecking(false);
    }
  }, [merchantId, organizationId]);

  const resetCheck = useCallback(() => {
    requestRef.current += 1;
    setError(null);
    setLastCheck(null);
    setSettledEvidence(null);
  }, []);

  return {
    organizationId,
    isResolvingOrg,
    isChecking,
    error,
    lastCheck,
    settledEvidence,
    checkSettlement,
    resetCheck,
  };
}

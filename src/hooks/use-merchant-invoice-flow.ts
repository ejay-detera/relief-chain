import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/context/AuthContext';
import { useMerchantSettlementCheck } from '@/hooks/use-merchant-settlement-check';
import { isVerifiedMerchantWallet, merchantWalletPublicKey, useMerchantWallet } from '@/hooks/use-merchant-wallet';
import { createSignedInvoice } from '@/services/invoice-service';
import { getStoredInvoiceByNonce, saveInvoice, updateInvoiceStatus } from '@/services/merchant-invoice-storage';
import type {
  InvoiceSettlementState,
  InvoiceTransport,
  InvoiceV1,
  MerchantInvoiceDraft,
  MerchantInvoiceStep,
} from '@/types/invoice';
import type { PilotWalletState } from '@/types/wallet';

export type PresentedInvoice = Readonly<{ invoice: InvoiceV1; transport: InvoiceTransport }>;

export type MerchantInvoiceSettlementCheck = Readonly<{
  disabled: boolean;
  errorText: string | null;
  isChecking: boolean;
  lastCheckText: string | null;
  onCheck: () => void;
}>;

export type MerchantInvoiceFlow = Readonly<{
  step: MerchantInvoiceStep;
  presented: PresentedInvoice | null;
  displayedSettlement: InvoiceSettlementState;
  formError: string | null;
  walletState: PilotWalletState | null;
  isWalletLoading: boolean;
  walletBindingError: string | null;
  canCreate: boolean;
  needsRecovery: boolean;
  settlementCheck: MerchantInvoiceSettlementCheck;
  createInvoice: (draft: MerchantInvoiceDraft) => Promise<void>;
  startNewInvoice: () => void;
  handleExpired: () => void;
}>;

/**
 * Owns the merchant "Receive payment" invoice flow: signer gating, signed
 * invoice creation, persistence, resume-by-nonce, expiry, and the authorized
 * settlement check. Router-free so the route file keeps navigation concerns.
 *
 * `merchantId` is always the merchant entity id (never the auth user id): the
 * backend prepare-payment function resolves accreditations from it. `settled`
 * renders only from reconciler-owned evidence returned by the settlement check.
 */
export function useMerchantInvoiceFlow(nonce: string | undefined): MerchantInvoiceFlow {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const {
    state: walletState,
    merchantEntityId,
    isLoading: isWalletLoading,
    error: walletBindingError,
  } = useMerchantWallet();
  const {
    organizationId: settlementOrganizationId,
    isResolvingOrg: isResolvingSettlementOrg,
    isChecking: isCheckingSettlement,
    error: settlementCheckError,
    lastCheck: settlementLastCheck,
    settledEvidence,
    checkSettlement,
    resetCheck,
  } = useMerchantSettlementCheck(merchantEntityId ?? null);

  const [step, setStep] = useState<MerchantInvoiceStep>('collect');
  const [presented, setPresented] = useState<PresentedInvoice | null>(null);
  const [settlement, setSettlement] = useState<InvoiceSettlementState>({ status: 'awaiting_scan' });
  const [formError, setFormError] = useState<string | null>(null);

  // `settled` renders only from reconciler-owned DB evidence re-read after the
  // authorized check, never from the invoke response alone. Derived during
  // render (no effect) so no cascading setState is introduced.
  const displayedSettlement: InvoiceSettlementState = settledEvidence
    ? { status: 'settled', evidence: settledEvidence }
    : settlement;

  const settlementCheckSummary = settlementLastCheck
    ? `Checked ${settlementLastCheck.checkedAt} — ` +
      `${settlementLastCheck.confirmedCount} confirmed, ` +
      `${settlementLastCheck.failedCount} failed.`
    : null;

  const merchantWallet = merchantWalletPublicKey(walletState);
  // Invoice signing requires the local secret to match the verified active
  // wallet. `merchantWalletPublicKey` also returns the expected address while in
  // `recovery_required` for display, so creation is gated on verified readiness
  // explicitly; otherwise signing fails late with a low-level signer error.
  const isReady = isVerifiedMerchantWallet(walletState);
  const canCreate = Boolean(userId && merchantEntityId && merchantWallet && isReady);
  const needsRecovery = walletState?.status === 'recovery_required';

  // If a nonce is supplied, resume that invoice from storage.
  useEffect(() => {
    if (!nonce || !merchantEntityId) return;
    let cancelled = false;
    void getStoredInvoiceByNonce(merchantEntityId, nonce).then((record) => {
      if (cancelled || !record) return;
      setPresented({ invoice: record.invoice, transport: record.transport });
      const isExpired = Date.parse(record.invoice.expiresAt) <= Date.now();
      setSettlement(
        record.settlementEvidence
          ? { status: 'settled', evidence: record.settlementEvidence }
          : isExpired
            ? { status: 'expired' }
            : { status: 'awaiting_scan' },
      );
      setStep('present');
    });
    return () => {
      cancelled = true;
    };
  }, [nonce, merchantEntityId]);

  const createInvoice = useCallback(
    async (draft: MerchantInvoiceDraft) => {
      if (!userId || !merchantEntityId || !merchantWallet) return;
      if (!isReady) {
        setFormError(
          'Complete wallet recovery before creating invoices. Your verified merchant signer is not ready on this device.',
        );
        setStep('collect');
        return;
      }
      setStep('signing');
      setFormError(null);
      try {
        const result = await createSignedInvoice({
          userId,
          merchantId: merchantEntityId,
          merchantWallet,
          kind: draft.kind,
          amountStroops: draft.amountStroops,
          category: draft.category,
          programId: draft.programId,
          contractId: draft.contractId,
          receiptDigest: draft.receiptDigest,
        });
        // Persist immediately so the invoice survives back-navigation.
        void saveInvoice(merchantEntityId, {
          id: result.invoice.nonce,
          invoice: result.invoice,
          transport: result.transport,
          createdAt: new Date().toISOString(),
          status: 'active',
        });
        setPresented(result);
        setSettlement({ status: 'awaiting_scan' });
        resetCheck();
        setStep('present');
      } catch (caught: unknown) {
        const message = caught instanceof Error ? caught.message : 'Could not create the invoice.';
        // Map the low-level missing-secret error to the actionable recovery
        // message when the wallet is in recovery: the signer is the blocker.
        setFormError(
          needsRecovery && message.includes('disposable testnet signer')
            ? 'This device has no signer for the active merchant wallet. Start wallet recovery before creating invoices.'
            : message,
        );
        setStep('collect');
      }
    },
    [userId, merchantEntityId, merchantWallet, isReady, needsRecovery, resetCheck],
  );

  const startNewInvoice = useCallback(() => {
    setPresented(null);
    setSettlement({ status: 'awaiting_scan' });
    setFormError(null);
    resetCheck();
    setStep('collect');
  }, [resetCheck]);

  const displayedStatus = displayedSettlement.status;
  const handleExpired = useCallback(() => {
    // A settled invoice must never be downgraded to expired (for example when
    // resuming a settled invoice whose expiresAt is already in the past).
    if (displayedStatus === 'settled') return;
    setSettlement({ status: 'expired' });
    if (merchantEntityId && presented?.invoice.nonce) {
      void updateInvoiceStatus(merchantEntityId, presented.invoice.nonce, 'expired');
    }
  }, [merchantEntityId, presented, displayedStatus]);

  const onCheck = useCallback(() => {
    void checkSettlement();
  }, [checkSettlement]);

  return {
    step,
    presented,
    displayedSettlement,
    formError,
    walletState,
    isWalletLoading,
    walletBindingError,
    canCreate,
    needsRecovery,
    settlementCheck: {
      disabled: !merchantEntityId || !settlementOrganizationId || isResolvingSettlementOrg,
      errorText: settlementCheckError ? settlementCheckError.message : null,
      isChecking: isCheckingSettlement,
      lastCheckText: settlementCheckSummary,
      onCheck,
    },
    createInvoice,
    startNewInvoice,
    handleExpired,
  };
}

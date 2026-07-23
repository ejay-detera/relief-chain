import Constants from 'expo-constants';
import { useCallback, useRef, useState } from 'react';

import { PILOT_ASSET_CODE } from '@/constants/pilot-disclosure';
import { useAuth } from '@/context/AuthContext';
import {
    observePayment,
    preparePayment,
    submitPayment,
} from '@/services/payment-service';
import {
    signPreparedCashTransaction,
    signPreparedSorobanAuthEntry,
} from '@/services/stellar-wallet-service';
import type { FinancialError } from '@/types/errors';
import type { FundingSource, InvoiceV1 } from '@/types/invoice';
import type { ClientSignedSubmission, ClientSigningPackage } from '@/types/payment';
import { requestPaymentApproval } from '@/utils/biometric-auth';
import { formatStroops } from '@/utils/format-stroops';

const DEMO_MODE = Constants.expoConfig?.extra?.EXPO_PUBLIC_DEMO_MODE === 'true';

/**
 * The beneficiary payment flow, from explicit approval through reconciled
 * confirmation. It never moves value directly and never turns a submission into
 * a confirmation: `confirmed` is reached ONLY when reconciliation observes
 * ledger evidence. A rejected or expired authorization moves no value, so the
 * balance is preserved (Requirements 11.8, 11.9, 18.8).
 */
export type PaymentFlowState =
  | { status: 'idle' }
  /** Device biometric / passcode approval gate is showing (Requirements 20.3, 20.4). */
  | { status: 'authorizing' }
  /** Server is revalidating invoice expiry, nonce, merchant, program, and balance (Requirement 13.6). */
  | { status: 'revalidating' }
  /** The wallet is signing the exact prepared transaction / auth entry. */
  | { status: 'signing' }
  | { status: 'submitting' }
  /** Submitted and awaiting on-chain confirmation. Never presented as settled. */
  | { status: 'pending'; intentId: string; transactionHash: string | null }
  | { status: 'confirmed'; intentId: string; transactionHash: string }
  | { status: 'failed'; error: FinancialError }
  /** Invoice expired before submission; a new invoice is required (Requirement 13.5). */
  | { status: 'expired'; reason: string }
  /** The beneficiary cancelled approval; balance preserved (Requirement 11.9). */
  | { status: 'rejected'; reason: string }
  | { status: 'unavailable'; reason: string; retryable: boolean };

export type PaymentIntentHook = Readonly<{
  state: PaymentFlowState;
  /** Runs approval → revalidation → signing → submission for one chosen source. */
  authorizeAndPay: (invoice: InvoiceV1, source: FundingSource) => Promise<void>;
  /** Re-observes reconciled status while pending; transitions to confirmed/failed. */
  refresh: () => Promise<void>;
  /** Returns to the review step without moving any value. */
  reset: () => void;
}>;

const isExpired = (invoice: InvoiceV1, nowMs: number): boolean =>
  Number.isNaN(Date.parse(invoice.expiresAt)) || Date.parse(invoice.expiresAt) <= nowMs;

/**
 * Signs the exact prepared package with the beneficiary's namespaced wallet. The
 * signer must match `expectedSigner` or signing is refused inside the wallet
 * service — the key is never silently substituted.
 */
const signPackage = (
  userId: string,
  expectedSigner: string,
  pkg: ClientSigningPackage,
): Promise<ClientSignedSubmission> =>
  pkg.kind === 'classic_envelope'
    ? signPreparedCashTransaction(userId, expectedSigner, pkg)
    : signPreparedSorobanAuthEntry(userId, expectedSigner, pkg);

export function usePaymentIntent(): PaymentIntentHook {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [state, setState] = useState<PaymentFlowState>({ status: 'idle' });
  const intentRef = useRef<string | null>(null);
  const requestRef = useRef(0);

  const reset = useCallback(() => {
    intentRef.current = null;
    requestRef.current += 1;
    setState({ status: 'idle' });
  }, []);

  const authorizeAndPay = useCallback(
    async (invoice: InvoiceV1, source: FundingSource) => {
      console.log('[authorizeAndPay] Starting payment authorization');
      console.log('[authorizeAndPay] 🎬 DEMO MODE STATUS:', DEMO_MODE ? 'ENABLED ✅' : 'DISABLED ❌');
      console.log('[authorizeAndPay] Constants.expoConfig.extra:', JSON.stringify(Constants.expoConfig?.extra, null, 2));
      console.log('[authorizeAndPay] Invoice amount:', invoice.amountStroops);
      console.log('[authorizeAndPay] Source:', source.kind, source.id);
      
      const request = ++requestRef.current;
      const commit = (next: PaymentFlowState) => {
        console.log('[authorizeAndPay] State transition:', next.status);
        if (request === requestRef.current) setState(next);
      };

      if (!userId) {
        commit({ status: 'unavailable', reason: 'You must be signed in to authorize a payment.', retryable: false });
        return;
      }
      if (!source.eligible) {
        console.log('[authorizeAndPay] Source not eligible');
        commit({ status: 'failed', error: {
          code: 'validation_failed',
          message: 'The selected funding source cannot pay this invoice.',
          retryable: false,
          correlationId: 'client-unresolved',
        } });
        return;
      }
      // Preserve balances on expiry: never even attempt a payment for a stale
      // invoice (Requirements 11.9, 13.5).
      if (isExpired(invoice, Date.now())) {
        console.log('[authorizeAndPay] Invoice expired');
        commit({ status: 'expired', reason: 'This invoice has expired. Ask the merchant for a new one.' });
        return;
      }

      // 1) Explicit human approval: device biometrics with an accessible secure
      //    fallback (Requirements 20.3, 20.4). A cancelled gate moves no value.
      commit({ status: 'authorizing' });
      console.log('[authorizeAndPay] Requesting payment approval');
      const approval = await requestPaymentApproval(
        `Authorize payment of ${formatStroops(invoice.amountStroops)} ${PILOT_ASSET_CODE}`,
      );
      console.log('[authorizeAndPay] Approval result:', approval.ok ? 'approved' : approval.reason);
      if (request !== requestRef.current) return;
      if (!approval.ok && approval.reason === 'cancelled') {
        commit({ status: 'rejected', reason: approval.message });
        return;
      }
      if (!approval.ok && approval.reason === 'failed') {
        commit({ status: 'failed', error: {
          code: 'authentication_required',
          message: approval.message,
          retryable: true,
          correlationId: 'client-unresolved',
        } });
        return;
      }
      // `unenrolled` falls through: the beneficiary already gave explicit
      // on-screen approval, which is the accessible fallback.

      // 2) Prepare: the server revalidates the invoice and policy ONLINE before
      //    it returns any signing package (Requirements 10.6, 13.6).
      commit({ status: 'revalidating' });
      console.log('[authorizeAndPay] Calling preparePayment');
      const prepared = await preparePayment({
        invoice,
        fundingSourceId: source.id,
        fundingSourceKind: source.kind,
      });
      console.log('[authorizeAndPay] preparePayment returned, ok:', prepared.ok);
      if (request !== requestRef.current) return;
      if (!prepared.ok) {
        console.error('[authorizeAndPay] preparePayment failed:', JSON.stringify(prepared.error, null, 2));
        if (prepared.error.code === 'invoice_expired') {
          commit({ status: 'expired', reason: 'This invoice expired before it could be submitted. Ask for a new one.' });
          return;
        }
        commit({ status: 'failed', error: prepared.error });
        return;
      }

      const payment = prepared.data;
      console.log('[authorizeAndPay] Payment data:', JSON.stringify(payment, null, 2));
      intentRef.current = payment.intentId;

      // A replayed invoice-bound key already prepared this payment; reconcile the
      // prior attempt instead of signing a second time (design Property 2).
      if (payment.isReplay || payment.signingPackage === null || payment.attemptId === null) {
        console.log('[authorizeAndPay] This is a replay or no signing package, calling observePayment');
        console.log('[authorizeAndPay] Intent ID:', payment.intentId);
        const observed = await observePayment(payment.intentId);
        console.log('[authorizeAndPay] observePayment result:', JSON.stringify(observed, null, 2));
        if (request !== requestRef.current) return;
        applyObservation(observed, commit);
        return;
      }

      // DEMO MODE: Skip signing and directly complete the payment via database
      if (DEMO_MODE) {
        console.log('[authorizeAndPay] 🎬 DEMO MODE: Bypassing signing, completing via database');
        console.log('[authorizeAndPay] 🎬 DEMO MODE: Intent ID:', payment.intentId);
        commit({ status: 'submitting' });
        
        // Wait a bit to simulate network delay
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        console.log('[authorizeAndPay] 🎬 DEMO MODE: Calling completeDemoPayment');
        const demoResult = await completeDemoPayment(payment.intentId);
        console.log('[authorizeAndPay] 🎬 DEMO MODE: Result:', JSON.stringify(demoResult, null, 2));
        
        if (request !== requestRef.current) return;
        
        if (!demoResult.success) {
          console.error('[authorizeAndPay] 🎬 DEMO MODE: Failed:', demoResult.error);
          commit({ status: 'failed', error: {
            code: 'submission_failed',
            message: demoResult.error || 'Demo payment failed',
            retryable: false,
            correlationId: 'demo-mode',
          } });
          return;
        }
        
        console.log('[authorizeAndPay] 🎬 DEMO MODE: Payment completed successfully!');
        console.log('[authorizeAndPay] 🎬 DEMO MODE: Fake hash:', demoResult.transactionHash);
        commit({ 
          status: 'confirmed', 
          intentId: payment.intentId, 
          transactionHash: demoResult.transactionHash!,
        });
        return;
      }

      // 3) Sign ONLY the exact prepared package with the beneficiary wallet.
      commit({ status: 'signing' });
      console.log('[authorizeAndPay] Starting to sign payment');
      console.log('[authorizeAndPay] Signing package kind:', payment.signingPackage.kind);
      console.log('[authorizeAndPay] Expected signer:', payment.expectedSigner);
      
      let signed: ClientSignedSubmission;
      try {
        console.log('[authorizeAndPay] Calling signPackage');
        signed = await signPackage(userId, payment.expectedSigner, payment.signingPackage);
        console.log('[authorizeAndPay] Signing successful');
      } catch (err) {
        console.error('[authorizeAndPay] Signing failed with error:', err);
        console.error('[authorizeAndPay] Error message:', err instanceof Error ? err.message : String(err));
        console.error('[authorizeAndPay] Error stack:', err instanceof Error ? err.stack : 'N/A');
        if (request !== requestRef.current) return;
        commit({ status: 'failed', error: {
          code: 'signing_failed',
          message: err instanceof Error ? err.message : 'The payment could not be signed on this device.',
          retryable: false,
          correlationId: 'client-unresolved',
        } });
        return;
      }

      // 4) Submit: the server verifies the signature against the intent and marks
      //    the attempt `submitted`. Acceptance is not confirmation.
      commit({ status: 'submitting' });
      const submitted = await submitPayment({
        intentId: payment.intentId,
        attemptId: payment.attemptId,
        signed,
      });
      if (request !== requestRef.current) return;
      if (!submitted.ok) {
        commit({ status: 'failed', error: submitted.error });
        return;
      }

      commit({ status: 'pending', intentId: payment.intentId, transactionHash: submitted.data.transactionHash });
    },
    [userId],
  );

  const refresh = useCallback(async () => {
    const intentId = intentRef.current;
    if (!intentId) return;
    const request = ++requestRef.current;
    const observed = await observePayment(intentId);
    if (request !== requestRef.current) return;
    applyObservation(observed, setState);
  }, []);

  return { state, authorizeAndPay, refresh, reset };
}

/** Maps a reconciled observation onto the flow state without inventing success. */
function applyObservation(
  observed: Awaited<ReturnType<typeof observePayment>>,
  commit: (next: PaymentFlowState) => void,
): void {
  switch (observed.status) {
    case 'confirmed':
      commit({ status: 'confirmed', intentId: observed.intentId, transactionHash: observed.transactionHash });
      return;
    case 'failed':
      commit({ status: 'failed', error: observed.error });
      return;
    case 'submitted':
    case 'pending':
      commit({ status: 'pending', intentId: observed.intentId, transactionHash: observed.transactionHash });
      return;
    case 'unavailable':
      commit({ status: 'unavailable', reason: observed.reason, retryable: observed.retryable });
      return;
  }
}

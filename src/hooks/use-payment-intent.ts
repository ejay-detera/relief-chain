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
      const request = ++requestRef.current;
      const commit = (next: PaymentFlowState) => {
        if (request === requestRef.current) setState(next);
      };

      if (!userId) {
        commit({ status: 'unavailable', reason: 'You must be signed in to authorize a payment.', retryable: false });
        return;
      }
      if (!source.eligible) {
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
        commit({ status: 'expired', reason: 'This invoice has expired. Ask the merchant for a new one.' });
        return;
      }

      // 1) Explicit human approval: device biometrics with an accessible secure
      //    fallback (Requirements 20.3, 20.4). A cancelled gate moves no value.
      commit({ status: 'authorizing' });
      const approval = await requestPaymentApproval(
        `Authorize payment of ${formatStroops(invoice.amountStroops)} ${PILOT_ASSET_CODE}`,
      );
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
      const prepared = await preparePayment({
        invoice,
        fundingSourceId: source.id,
        fundingSourceKind: source.kind,
      });
      if (request !== requestRef.current) return;
      if (!prepared.ok) {
        if (prepared.error.code === 'invoice_expired') {
          commit({ status: 'expired', reason: 'This invoice expired before it could be submitted. Ask for a new one.' });
          return;
        }
        commit({ status: 'failed', error: prepared.error });
        return;
      }

      const payment = prepared.data;
      intentRef.current = payment.intentId;

      // A replayed invoice-bound key already prepared this payment; reconcile the
      // prior attempt instead of signing a second time (design Property 2).
      if (payment.isReplay || payment.signingPackage === null || payment.attemptId === null) {
        const observed = await observePayment(payment.intentId);
        if (request !== requestRef.current) return;
        applyObservation(observed, commit);
        return;
      }

      // 3) Sign ONLY the exact prepared package with the beneficiary wallet.
      commit({ status: 'signing' });
      let signed: ClientSignedSubmission;
      try {
        signed = await signPackage(userId, payment.expectedSigner, payment.signingPackage);
      } catch (err) {
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

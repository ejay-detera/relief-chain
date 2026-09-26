import { useCallback, useRef, useState } from 'react';

import { DEMO_MODE } from '@/config/demo-mode';
import { PILOT_ASSET_CODE } from '@/constants/pilot-disclosure';
import { useAuth } from '@/context/AuthContext';
import { completeDemoPayment } from '@/services/demo-payment-service';
import {
    observePayment,
    preparePayment,
    retryPayment,
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

/**
 * How many hash-less pending observations are tolerated before the UI stops
 * showing "awaiting confirmation" forever. An `accepted` attempt that never
 * submits (biometric cancel, app kill, network drop) leaves no hash behind, so
 * beyond this cap the flow transitions to `unavailable` with guidance instead
 * of pending indefinitely.
 */
export const MAX_PENDING_OBSERVATIONS = 10;
/** Wall-clock twin of the polling cap: five minutes without ledger evidence. */
export const PENDING_OBSERVATION_TIMEOUT_MS = 5 * 60 * 1000;

const UNAVAILABLE_AFTER_CAP_REASON =
  'This payment could not be confirmed in time — ask the merchant for a new invoice and try again. No funds were moved.';

const isExpired = (invoice: InvoiceV1, nowMs: number): boolean =>
  Number.isNaN(Date.parse(invoice.expiresAt)) || Date.parse(invoice.expiresAt) <= nowMs;

/**
 * Detects rotation-window prepare rejections: the invoice was valid at decode
 * time but lapsed (expiry, nonce reuse, signer rotation window) before the
 * server could prepare it. These need a fresh merchant invoice, not a retry of
 * the same payload, so they route to the expired state. Decode strictness
 * itself is untouched — this only classifies server rejections.
 */
const isRotationWindowError = (error: FinancialError): boolean => {
  if (error.code === 'invoice_expired' || error.code === 'invoice_used') {
    return true;
  }
  if (error.code !== 'validation_failed') {
    return false;
  }
  const message = error.message.toLowerCase();
  return (
    message.includes('expir') ||
    message.includes('nonce') ||
    message.includes('rotation') ||
    message.includes('window') ||
    message.includes('no longer valid') ||
    message.includes('stale')
  );
};

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
  // True while an authorizeAndPay run owns the active request. `refresh` must
  // never bump the shared request counter while this is true: doing so would
  // silently no-op every subsequent `commit` inside the in-flight authorize
  // call (its captured `request` would stop matching `requestRef.current`),
  // leaving the UI frozen on a stale status while signing/submission continues
  // invisibly in the background.
  const authorizingRef = useRef(false);
  // Polling-cap bookkeeping for hash-less pending observations. Reset whenever
  // a new intent takes over or the flow resets.
  const pendingObservationsRef = useRef(0);
  const pendingSinceRef = useRef<number | null>(null);
  // True once the orphan retry has been attempted for the current intent, so a
  // hash-less replay triggers at most one retry-payment call per intent.
  const retriedRef = useRef(false);

  const reset = useCallback(() => {
    intentRef.current = null;
    requestRef.current += 1;
    authorizingRef.current = false;
    pendingObservationsRef.current = 0;
    pendingSinceRef.current = null;
    retriedRef.current = false;
    setState({ status: 'idle' });
  }, []);

  /**
   * Maps a reconciled observation onto the flow state with a polling cap: past
   * MAX_PENDING_OBSERVATIONS hash-less observations (or past the wall-clock
   * timeout), pending becomes `unavailable` with new-invoice guidance instead
   * of "awaiting confirmation" forever.
   */
  const commitObservation = useCallback(
    (
      observed: Awaited<ReturnType<typeof observePayment>>,
      commit: (next: PaymentFlowState) => void,
    ): void => {
      if (observed.status === 'pending' || observed.status === 'submitted') {
        if (observed.transactionHash === null) {
          pendingObservationsRef.current += 1;
          if (pendingSinceRef.current === null) {
            pendingSinceRef.current = Date.now();
          }
          const elapsed = Date.now() - (pendingSinceRef.current ?? Date.now());
          if (
            pendingObservationsRef.current > MAX_PENDING_OBSERVATIONS ||
            elapsed > PENDING_OBSERVATION_TIMEOUT_MS
          ) {
            commit({ status: 'unavailable', reason: UNAVAILABLE_AFTER_CAP_REASON, retryable: false });
            return;
          }
        }
      }
      applyObservation(observed, commit);
    },
    [],
  );

  const authorizeAndPay = useCallback(
    async (invoice: InvoiceV1, source: FundingSource) => {
      const request = ++requestRef.current;
      authorizingRef.current = true;
      const commit = (next: PaymentFlowState) => {
        if (request === requestRef.current) setState(next);
      };
      const finishAuthorizing = () => {
        if (request === requestRef.current) authorizingRef.current = false;
      };

      if (!userId) {
        commit({ status: 'unavailable', reason: 'You must be signed in to authorize a payment.', retryable: false });
        finishAuthorizing();
        return;
      }
      if (!source.eligible) {
        commit({ status: 'failed', error: {
          code: 'validation_failed',
          message: 'The selected funding source cannot pay this invoice.',
          retryable: false,
          correlationId: 'client-unresolved',
        } });
        finishAuthorizing();
        return;
      }
      // Preserve balances on expiry: never even attempt a payment for a stale
      // invoice (Requirements 11.9, 13.5).
      if (isExpired(invoice, Date.now())) {
        commit({ status: 'expired', reason: 'This invoice has expired. Ask the merchant for a new one.' });
        finishAuthorizing();
        return;
      }

      try {
        // 1) Explicit human approval: device biometrics with an accessible
        //    secure fallback (Requirements 20.3, 20.4). A cancelled gate moves
        //    no value.
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

        // 2) Prepare: the server revalidates the invoice and policy ONLINE
        //    before it returns any signing package (Requirements 10.6, 13.6).
        commit({ status: 'revalidating' });
        const prepared = await preparePayment({
          invoice,
          fundingSourceId: source.id,
          fundingSourceKind: source.kind,
        });
        if (request !== requestRef.current) return;
        if (!prepared.ok) {
          // Rotation-window lapses (expired nonce, stale window) need a fresh
          // merchant invoice — never a retry of the same payload.
          if (isRotationWindowError(prepared.error)) {
            commit({ status: 'expired', reason: 'This invoice expired before it could be submitted. Ask the merchant for a new one.' });
            return;
          }
          commit({ status: 'failed', error: prepared.error });
          return;
        }

        const payment = prepared.data;
        intentRef.current = payment.intentId;
        pendingObservationsRef.current = 0;
        pendingSinceRef.current = null;
        retriedRef.current = false;

        // A fresh attempt carries its own signing package; a replayed
        // invoice-bound key returns none, so reconcile — or repair — the prior
        // attempt instead of signing a second time (design Property 2).
        let attemptId = payment.attemptId;
        let signingPackage = payment.signingPackage;
        let expectedSigner = payment.expectedSigner;

        if (payment.isReplay || signingPackage === null || attemptId === null) {
          const observed = await observePayment(payment.intentId);
          if (request !== requestRef.current) return;
          // Orphan-accepted: the prior attempt sits `accepted` with no hash
          // because signing/submission never completed. Retry once for a fresh
          // attempt under the same intent, then sign/submit it below like a
          // fresh prepare. Settled or hash-bearing outcomes reconcile normally.
          const isOrphan = !retriedRef.current &&
            (observed.status === 'pending' || observed.status === 'submitted') &&
            observed.transactionHash === null;
          if (isOrphan) {
            retriedRef.current = true;
            const retried = await retryPayment(payment.intentId);
            if (request !== requestRef.current) return;
            if (retried.ok && !retried.data.settled && retried.data.signingPackage !== null && retried.data.attemptId && retried.data.expectedSigner) {
              attemptId = retried.data.attemptId;
              signingPackage = retried.data.signingPackage;
              expectedSigner = retried.data.expectedSigner;
            } else {
              if (retried.ok && retried.data.settled) {
                const reobserved = await observePayment(payment.intentId);
                if (request !== requestRef.current) return;
                commitObservation(reobserved, commit);
                return;
              }
              commitObservation(observed, commit);
              return;
            }
          } else {
            commitObservation(observed, commit);
            return;
          }
        }

        if (signingPackage === null || attemptId === null) {
          commitObservation(await observePayment(payment.intentId), commit);
          return;
        }

        // Demo mode simulates settlement locally instead of signing/submitting
        // to Stellar. Gated on DEMO_MODE, which is itself hard-locked to
        // `__DEV__` builds only (see src/config/demo-mode.ts) so this branch
        // can never run in a shipped release build.
        if (DEMO_MODE) {
          commit({ status: 'submitting' });
          await new Promise((resolve) => setTimeout(resolve, 1500));
          const demoResult = await completeDemoPayment(payment.intentId);
          if (request !== requestRef.current) return;

          if (!demoResult.success) {
            commit({ status: 'failed', error: {
              code: 'submission_rejected',
              message: demoResult.error || 'Demo payment failed',
              retryable: false,
              correlationId: 'demo-mode',
            } });
            return;
          }

          commit({
            status: 'confirmed',
            intentId: payment.intentId,
            transactionHash: demoResult.transactionHash!,
          });
          return;
        }

        // 3) Sign ONLY the exact prepared package with the beneficiary wallet.
        commit({ status: 'signing' });
        let signed: ClientSignedSubmission;
        try {
          signed = await signPackage(userId, expectedSigner, signingPackage);
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

        // 4) Submit: the server verifies the signature against the intent and
        //    marks the attempt `submitted`. Acceptance is not confirmation.
        commit({ status: 'submitting' });
        const submitted = await submitPayment({
          intentId: payment.intentId,
          attemptId,
          signed,
        });
        if (request !== requestRef.current) return;
        if (!submitted.ok) {
          commit({ status: 'failed', error: submitted.error });
          return;
        }

        pendingSinceRef.current = Date.now();
        commit({ status: 'pending', intentId: payment.intentId, transactionHash: submitted.data.transactionHash });
      } finally {
        finishAuthorizing();
      }
    },
    [commitObservation, userId],
  );

  const refresh = useCallback(async () => {
    // Never clobber an in-flight authorizeAndPay: bumping requestRef here
    // would make its later `commit` calls silently no-op, freezing the UI on
    // a stale status while signing/submission keeps running in the background.
    if (authorizingRef.current) return;
    const intentId = intentRef.current;
    if (!intentId) return;
    const request = ++requestRef.current;
    const observed = await observePayment(intentId);
    if (request !== requestRef.current) return;
    commitObservation(observed, setState);
  }, [commitObservation]);

  return { state, authorizeAndPay, refresh, reset };
}

/**
 * Maps a reconciled observation onto the flow state without inventing success.
 * A `failed` observation carries the reconciler's `error_detail` as its message
 * (see payment-service observePayment), so on-chain rejection reasons reach the
 * UI verbatim instead of being replaced with a generic failure.
 */
function applyObservation(
  observed: Awaited<ReturnType<typeof observePayment>>,
  commit: (next: PaymentFlowState) => void,
): void {
  switch (observed.status) {
    case 'confirmed':
      commit({ status: 'confirmed', intentId: observed.intentId, transactionHash: observed.transactionHash });
      return;
    case 'failed':
      // observed.error.message surfaces the stored error_detail when present.
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

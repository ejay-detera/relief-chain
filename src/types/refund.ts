import type { LedgerEvidence, StroopAmount } from '@/types/blockchain';
import type { FinancialError } from '@/types/errors';

/**
 * Refund workflow lifecycle. A refund is a signed compensating transaction that
 * references the original payment; it never edits or deletes the immutable
 * original settlement (Requirements 15.1, 15.2). `exception_required` is the
 * audited exception route taken when a refund is requested after program expiry
 * (Requirement 15.5).
 */
export type RefundStatus =
  | 'requested'
  | 'approved'
  | 'signed'
  | 'submitted'
  | 'confirmed'
  | 'failed'
  | 'exception_required';

/**
 * A confirmed merchant settlement that can be refunded, with the bounds the UI
 * needs to prevent over-refunding. `remainingRefundableStroops` is the original
 * amount minus everything already refunded; cumulative refunds may never exceed
 * the original (Requirement 15.4). Authoritative enforcement lives in the
 * contract/Edge Function — this only guards the client and explains limits.
 */
export type RefundableSettlement = Readonly<{
  settlementId: string;
  /** Present for voucher settlements; refunds return value to the entitlement. */
  voucherRedemptionId: string | null;
  merchantId: string;
  programId: string | null;
  originalAmountStroops: StroopAmount;
  alreadyRefundedStroops: StroopAmount;
  remainingRefundableStroops: StroopAmount;
  /** When true, a refund routes to the audited exception workflow (Req 15.5). */
  isProgramExpired: boolean;
  reference: string;
}>;

/**
 * The non-privileged input the mobile client relays to the refund Edge Function.
 * The server resolves the organization, beneficiary entitlement, refund nonce,
 * and builds the exact compensating transaction; the client never supplies them.
 */
export type RefundRequestInput = Readonly<{
  originalSettlementId: string;
  amountStroops: StroopAmount;
}>;

/** A refund intent prepared by the server and awaiting merchant authorization. */
export type PreparedRefund = Readonly<{
  refundId: string;
  originalSettlementId: string;
  amountStroops: StroopAmount;
  status: RefundStatus;
  /** True when the server routed the request to the audited exception workflow. */
  requiresException: boolean;
}>;

/** The explicit authorization the merchant relays to start a prepared refund. */
export type RefundAuthorization = Readonly<{
  refundId: string;
}>;

/**
 * A reconciled refund read model. Confirmed refunds carry verifiable ledger
 * evidence; failed refunds carry a typed error. The original settlement is never
 * mutated — the refund is a distinct, linked compensating record (Req 15.1, 15.2).
 */
export type Refund = Readonly<{
  id: string;
  originalSettlementId: string;
  merchantId: string;
  programId: string | null;
  amountStroops: StroopAmount;
  reference: string;
  requestedAt: string;
}> & (
  | { status: 'requested' | 'approved' | 'signed' | 'submitted' }
  | { status: 'confirmed'; evidence: LedgerEvidence }
  | { status: 'failed'; error: FinancialError }
  | { status: 'exception_required'; exceptionReason: string }
);

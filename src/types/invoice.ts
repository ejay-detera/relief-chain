import type { AssetDescriptor, FinancialOperationStatus, LedgerEvidence, PilotAssetCode, StellarNetwork, StroopAmount } from '@/types/blockchain';
import type { FinancialError } from '@/types/errors';

// Re-export the canonical wire transport type so invoice consumers can depend on
// the domain type barrel (`@/types/invoice`) rather than the shared codec path.
export type { InvoiceTransport } from '../../shared/invoice-codec';

export type InvoiceKind = 'cash' | 'voucher';
export type InvoiceLifecycleStatus =
  | 'issued' | 'presented' | 'authorization_pending' | 'submitted'
  | 'consumed' | 'expired' | 'cancelled' | 'failed';

type InvoiceV1Base = Readonly<{
  version: 1;
  asset: AssetDescriptor;
  merchantId: string;
  settlementWallet: string;
  invoiceSigner: string;
  amountStroops: StroopAmount;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
  merchantSignature: string;
  receiptDigest?: string;
}>;

export type InvoiceV1 = InvoiceV1Base & (
  | { kind: 'cash'; category?: never; programId?: never; contractId?: never }
  | { kind: 'voucher'; category: string; programId: string; contractId: string }
);

export type InvoicePaymentState =
  | { status: Extract<FinancialOperationStatus, 'pending' | 'submitted'>; intentId: string }
  | { status: 'confirmed'; intentId: string; transactionHash: string }
  | { status: 'failed'; intentId: string; error: FinancialError }
  | { status: 'cancelled'; intentId: string; reason: string }
  | { status: 'unavailable'; reason: string; retryable: boolean };

// ---------------------------------------------------------------------------
// Merchant invoice creation (Requirements 10.1–10.5, 17.1–17.6).
// ---------------------------------------------------------------------------

/**
 * A voucher program the merchant is accredited to invoice against. The pilot
 * only surfaces programs that already have a deployed, activated Soroban
 * contract, so a voucher invoice can always carry a real `programId`/`contractId`
 * pair (Requirement 10.2). No such option is fabricated for programs without a
 * confirmed on-chain contract.
 */
export type VoucherInvoiceProgramOption = Readonly<{
  programId: string;
  contractId: string;
  name: string;
  /** Accreditation category the merchant may attest against (Requirement 17.1). */
  category: string;
}>;

/**
 * The merchant's local, pre-signing invoice draft. `categoryAttested` captures
 * the merchant's signed statement that the sale complies with the selected
 * program category (Requirement 17.2). `receiptDigest` is the only evidence that
 * ever reaches the on-chain payload; `evidenceNote` and any richer receipt data
 * stay strictly off-chain (Requirements 17.3, 17.4, 19.1).
 */
export type MerchantInvoiceDraft = Readonly<{
  kind: InvoiceKind;
  amountStroops: StroopAmount;
  category?: string;
  programId?: string;
  contractId?: string;
  categoryAttested: boolean;
  receiptDigest?: string;
  evidenceNote?: string;
}>;

/**
 * Honest settlement observation for a presented invoice. Settlement is only ever
 * `settled` once reconciliation matches confirmed ledger evidence; a presented
 * invoice is never optimistically reported as paid (Requirements 12.3, 13.4,
 * 21.2, 21.4).
 */
export type InvoiceSettlementState =
  | { status: 'awaiting_scan' }
  | { status: 'pending'; intentId: string }
  | { status: 'settled'; evidence: LedgerEvidence }
  | { status: 'expired' }
  | { status: 'unavailable'; reason: string };

/** The merchant invoice-flow shell steps. */
export type MerchantInvoiceStep = 'collect' | 'signing' | 'present' | 'error';

// ---------------------------------------------------------------------------
// Beneficiary payment review & funding-source selection
// (Requirements 10.7, 11.1, 11.2, 11.3, 11.4).
// ---------------------------------------------------------------------------

export type FundingSourceKind = 'cash' | 'voucher';

/**
 * One candidate funding source presented for a scanned invoice. Unrestricted
 * cash and each voucher entitlement are surfaced SEPARATELY (Requirement 11.1),
 * always as canonical integer stroops of the non-monetary RCPHP test asset.
 *
 * The MVP pays each invoice from exactly ONE beneficiary-selected source
 * (Requirement 11.3); split payments are deferred (Requirement 11.4). An
 * ineligible or insufficient source is never silently hidden — it is returned
 * with `eligible: false` and a user-facing `disabledReason` so the review screen
 * can disable it and explain why it cannot pay the invoice (Requirement 11.2).
 */
type FundingSourceBase = Readonly<{
  /** Stable identifier: `cash` for the aggregated cash balance, else the program id. */
  id: string;
  kind: FundingSourceKind;
  label: string;
  /** Optional secondary line (program purpose / cash description). */
  detail: string | null;
  /** Voucher category restriction, when the source is a voucher entitlement. */
  category: string | null;
  availableStroops: StroopAmount;
  assetCode: PilotAssetCode;
  network: StellarNetwork;
}>;

export type FundingSource = FundingSourceBase & (
  | { eligible: true; resultingBalanceStroops: StroopAmount }
  | { eligible: false; disabledReason: string }
);

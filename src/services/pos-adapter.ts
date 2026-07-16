// Future POS-validation adapter boundary (Requirement 17.6).
//
// The MVP does NOT validate individual basket items and does NOT claim that
// blockchain settlement verifies what was purchased (Requirements 17.4, 17.5).
// A merchant instead signs a category attestation and may attach optional
// off-chain evidence. This module defines the seam a future point-of-sale
// integration plugs into WITHOUT weakening the on-chain contract authorization:
// an adapter can only ever contribute an opaque, off-chain receipt digest that
// is bound into the invoice; it can never relax merchant, category, amount,
// nonce, or beneficiary-authorization checks.

/**
 * Optional off-chain purchase evidence a merchant attaches to an invoice. Only
 * the 32-byte `receiptDigest` (lowercase hex) is ever bound into the on-chain
 * invoice payload; `note` stays strictly off-chain for authorized audit access.
 */
export type PosPurchaseEvidence = Readonly<{
  receiptDigest?: string;
  note?: string;
}>;

/**
 * The seam a future POS integration implements. It is deliberately narrow: it
 * receives the merchant's draft context and returns only off-chain evidence.
 * It has no access to signing keys and cannot alter contract-enforced rules.
 */
export type PosEvidenceAdapter = Readonly<{
  readonly id: string;
  collectEvidence: (context: Readonly<{
    kind: 'cash' | 'voucher';
    category?: string;
  }>) => Promise<PosPurchaseEvidence>;
}>;

const HEX_32_BYTES = /^[0-9a-f]{64}$/;

/**
 * The MVP default: no POS integration. Merchants may still supply a manual
 * off-chain evidence digest/note, which this adapter simply passes through
 * after validating the digest shape.
 */
export const manualPosEvidenceAdapter: PosEvidenceAdapter = Object.freeze({
  id: 'manual',
  collectEvidence: async () => Object.freeze({}),
});

/** Validates an optional off-chain receipt digest, returning normalized hex or undefined. */
export const normalizeReceiptDigest = (digest: string | undefined): string | undefined => {
  const trimmed = digest?.trim().toLowerCase();
  if (!trimmed) return undefined;
  if (!HEX_32_BYTES.test(trimmed)) {
    throw new RangeError('Receipt digest must be a 32-byte lowercase hex value.');
  }
  return trimmed;
};

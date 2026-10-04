/**
 * A beneficiary's enrollment workflow state for one program. This carries only
 * eligibility and approval intent — never money. Reconciled cash and voucher
 * balances come exclusively from `beneficiary_balance_projection` via
 * `useBeneficiaryEntitlements` (Requirements 18.1, 18.2, 21.1).
 */
export type EnrolledProgram = {
  id: string;
  organizationId?: string | null;
  enrollmentId?: string;
  name: string;               // "Typhoon Odette Relief"
  approvalStatus: 'Approved' | 'Pending' | 'Rejected';
  purpose: string;
  expiresAt: string;
  createdAt: string;           // ISO timestamp; used to determine the most recent Approved enrollment
  category?: string;
  /** Real `program_merchants` accreditation rows only — never a fabricated fallback list (US3). */
  acceptedMerchantCategories?: string[];
  redemptionInstructions?: string | null;
  rejectionRemarks?: string | null;
  /** The approved per-beneficiary allocation in stroops, independent of reconciliation. Null unless Approved with a positive allocation on file (US3). */
  allocatedAmountStroops?: number | null;
  /** Live voucher balance in PHP from enrollments.voucher_balance. */
  voucherBalance?: number | null;
  /** Live remaining voucher balance in stroops from enrollments.voucher_balance. */
  remainingVoucherStroops?: number | null;
};

export type RedemptionRecord = {
  id: string;
  merchant: string;           // "SM Supermarket Cebu"
  amount: string;             // "450.0000000 RCPHP"
  /**
   * The funding source this transaction actually moved through — 'Cash' or
   * 'Voucher' — sourced from `payment_intents.funding_source`, not a
   * fabricated category label. The voucher rail is currently gated (see
   * docs/flow-reliefchain.md), so this is 'Cash' for every live transaction
   * today; it will reflect 'Voucher' once that rail is reachable.
   */
  fundingSource: 'Cash' | 'Voucher';
  date: string;               // "Jul 10, 2025"
  /**
   * No per-transaction running balance is tracked anywhere in the schema —
   * this is intentionally not synthesized. Null means "not available",
   * shown as such rather than a fabricated figure.
   */
  remainingBalance: string | null;
  txHash: string | null;             // Stellar transaction hash; null until submitted
  status: 'Completed' | 'Pending' | 'Failed';
  direction: 'credit' | 'debit'; // credit = received (e.g. grant), debit = spent (e.g. merchant payment)
};


export type PilotWalletNetwork = 'stellar_testnet';

export type ActivePilotWalletRow = Readonly<{
  id: string;
  network: PilotWalletNetwork;
  address: string;
  is_active: true;
}>;

export type PilotWalletRecoveryReason =
  | 'missing_signer'
  | 'invalid_signer'
  | 'signer_mismatch';

export type PilotWalletState =
  | Readonly<{
      status: 'ready';
      custodyModel: 'disposable_testnet';
      storageNamespace: string;
      walletId: string;
      publicKey: string;
    }>
  | Readonly<{
      status: 'binding_required';
      custodyModel: 'disposable_testnet';
      storageNamespace: string;
      publicKey: string;
      wasProvisioned: boolean;
    }>
  | Readonly<{
      status: 'recovery_required';
      custodyModel: 'disposable_testnet';
      storageNamespace: string;
      reason: PilotWalletRecoveryReason;
      walletId: string | null;
      expectedAddress: string | null;
      derivedAddress: string | null;
      canStartRotation: boolean;
    }>
  | Readonly<{
      status: 'unavailable';
      custodyModel: 'disposable_testnet';
      storageNamespace: string;
      reason: 'secure_storage_unavailable' | 'secure_storage_error' | 'invalid_wallet_binding';
    }>;

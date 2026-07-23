/**
 * A beneficiary's enrollment workflow state for one program. This carries only
 * eligibility and approval intent — never money. Reconciled cash and voucher
 * balances come exclusively from `beneficiary_balance_projection` via
 * `useBeneficiaryEntitlements` (Requirements 18.1, 18.2, 21.1).
 */
export type EnrolledProgram = {
  id: string;
  name: string;               // "Typhoon Odette Relief"
  approvalStatus: 'Approved' | 'Pending' | 'Rejected';
  purpose: string;
  expiresAt: string;
  createdAt: string;           // ISO timestamp; used to determine the most recent Approved enrollment
};

export type RedemptionRecord = {
  id: string;
  merchant: string;           // "SM Supermarket Cebu"
  amount: string;             // "₱450"
  category: 'Food' | 'Medicine' | 'School Supplies' | 'Cash';
  date: string;               // "Jul 10, 2025"
  remainingBalance: string;   // "₱4,550"
  txHash: string;             // Stellar transaction hash
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

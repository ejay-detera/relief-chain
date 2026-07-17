import type { LedgerEvidence, StroopAmount } from '@/types/blockchain';
import type { FinancialError } from '@/types/errors';

export type RedemptionStatus =
  | 'requested' | 'prepared' | 'signed' | 'submitted'
  | 'confirmed' | 'failed' | 'expired' | 'cancelled';
export type MerchantCashOutStatus = 'requested' | 'processing' | 'completed' | 'failed';

export type VoucherEntitlement = Readonly<{
  id: string;
  programId: string;
  contractId: string;
  beneficiaryWallet: string;
  availableAmountStroops: StroopAmount;
  expiresAt: string;
}>;

export type Redemption = Readonly<{
  id: string;
  invoiceId: string;
  entitlementId: string;
  merchantId: string;
  amountStroops: StroopAmount;
}> & (
  | { status: 'requested' | 'prepared' | 'signed' }
  | { status: 'submitted'; attemptId: string; transactionHash: string | null }
  | { status: 'confirmed'; evidence: LedgerEvidence; remainingAmountStroops: StroopAmount }
  | { status: 'failed'; error: FinancialError; safeToRetry: boolean }
  | { status: 'expired' | 'cancelled'; reason: string }
);

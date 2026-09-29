import type { StroopAmount } from '@/types/blockchain';

export type MerchantTransactionKind = 'voucher_redemption' | 'cash_payment';
export type MerchantTransactionStatus = 'confirmed' | 'pending' | 'failed';

export type MerchantTransaction = Readonly<{
  id: string;
  settlementId: string;
  payerName: string;
  programName: string | null;
  programId: string | null;
  occurredAt: string;
  rawDate: string;
  amount: number;
  amountStroops: StroopAmount;
  status: MerchantTransactionStatus;
  kind: MerchantTransactionKind;
  transactionHash: string | null;
  ledger: number | null;
  correlationId: string | null;
}>;

export type MerchantTransactionFilter = 'all' | 'voucher_redemption' | 'cash_payment';

export type MerchantTransactionsSummary = Readonly<{
  totalSettledStroops: StroopAmount;
  totalSettledPhp: number;
  totalCount: number;
  voucherCount: number;
  cashCount: number;
}>;

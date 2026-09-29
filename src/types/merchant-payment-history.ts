import type { LedgerEvidence, StroopAmount } from '@/types/blockchain';
import type { InvoiceTransport, InvoiceV1 } from '@/types/invoice';

export type InvoiceHistoryStatus = 'active' | 'settled' | 'expired';

export type MerchantInvoiceRecord = Readonly<{
  id: string; // Nonce or correlation ID
  invoice: InvoiceV1;
  transport: InvoiceTransport;
  createdAt: string; // ISO date string
  status: InvoiceHistoryStatus;
  settlementEvidence?: LedgerEvidence | null;
  payerName?: string | null;
  updatedAt?: string;
}>;

export type MerchantPaymentHistoryFilter = 'all' | 'active' | 'settled' | 'expired';
export type PaymentHistorySortOrder = 'newest' | 'oldest';

export type MerchantPaymentHistorySummary = Readonly<{
  totalReceivedStroops: StroopAmount;
  settledCount: number;
  activeCount: number;
  expiredCount: number;
}>;

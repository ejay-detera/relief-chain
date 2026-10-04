export type ReportType =
  | 'program'
  | 'distribution'
  | 'beneficiary'
  | 'merchant'
  | 'financial'
  | 'transaction'
  | 'audit';

export type DateRangePreset =
  | 'all'
  | 'specific_date'
  | 'custom_range'
  | 'last_7_days'
  | 'last_30_days'
  | 'this_month'
  | 'last_90_days';

export interface ReportFilter {
  reportType: ReportType;
  programId: string; // 'all' or specific UUID
  datePreset: DateRangePreset;
  startDate?: string | null; // ISO string or YYYY-MM-DD
  endDate?: string | null; // ISO string or YYYY-MM-DD
  specificDate?: string | null; // YYYY-MM-DD
}

export interface ReportKpi {
  id: string;
  label: string;
  value: string;
  subtext?: string;
  highlight?: boolean;
}

export interface LedgerReconciliation {
  isReconciled: boolean;
  ledgerAsset: string; // 'RCPHP'
  treasuryBalance: number;
  totalAllocated: number;
  totalDisbursed: number;
  drift: number;
  verifiedAt: string;
  ledgerProofHash: string;
}

export interface ReportColumn {
  key: string;
  label: string;
  align?: 'left' | 'center' | 'right';
  format?: 'text' | 'currency' | 'date' | 'status' | 'hash';
}

export interface GeneratedReport {
  title: string;
  reportType: ReportType;
  organizationName: string;
  organizationId: string;
  generatedAt: string;
  dateRangeLabel: string;
  programLabel: string;
  summaryKpis: ReportKpi[];
  reconciliation?: LedgerReconciliation;
  columns: ReportColumn[];
  rows: Record<string, any>[];
  totalRecords: number;
}

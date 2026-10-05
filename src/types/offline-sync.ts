/**
 * Offline Sync Domain Types
 * Defines data structures for air-gapped voucher exchange, cryptographic envelopes,
 * dual transport (BLE / QR), local queuing, and batch reconciliation.
 */

import type { StroopAmount } from './blockchain.ts';

export interface OfflineVoucherBalanceItem {
  programId: string;
  programName: string;
  organizationId: string;
  aidType: 'cash' | 'voucher';
  voucherType: string;
  category: string;
  canonicalType?: string;
  availableStroops: StroopAmount;
  availablePhp: string;
  reconciledAt: string | null;
  isAllowedForMerchant: boolean;
  disallowedReason?: string;
}

export interface OfflineBeneficiaryLookupRecord {
  beneficiaryIdentityId: string;
  beneficiaryName: string;
  beneficiaryWallet: string;
  isOffline: boolean;
  syncedAt: string;
  balances: OfflineVoucherBalanceItem[];
}

export type OfflineSyncStatus = 'pending_sync' | 'syncing' | 'settled' | 'rejected';

export type OfflineRejectionReason =
  | 'BENEFICIARY_OVERSPENT_REJECTED'
  | 'MERCHANT_NOT_ACCREDITED'
  | 'PROGRAM_NOT_ACTIVE'
  | 'INVALID_SIGNATURE'
  | 'EXPIRED_OFFLINE_WINDOW'
  | 'DUPLICATE_NONCE';

/**
 * Cryptographic envelope passed between beneficiary and merchant during offline exchange.
 */
export interface OfflineRedemptionEnvelope {
  version: '1.0';
  nonce: string; // Deterministic unique nonce (UUIDv7 or UUIDv4 with timestamp)
  programId: string;
  programName?: string;
  voucherType?: string;
  beneficiaryId: string;
  beneficiaryWallet: string;
  beneficiaryName: string;
  merchantId: string;
  merchantName?: string;
  amountStroops: string;
  amountPhp: string;
  clientTimestamp: string;
  signature?: string; // Optional client Ed25519 signature
  deviceAttestationId?: string;
  transportMode: 'ble' | 'qr';
}

/**
 * Item persisted in device SecureStore queue awaiting reconnection.
 */
export interface OfflineSyncQueueItem {
  id: string; // Internal queue ID
  envelope: OfflineRedemptionEnvelope;
  status: OfflineSyncStatus;
  retryCount: number;
  lastError?: string;
  transactionHash?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Batch payload submitted to backend RPC.
 */
export interface OfflineSyncBatchRequest {
  merchantEntityId: string;
  items: OfflineRedemptionEnvelope[];
}

/**
 * Per-item reconciliation result returned by the backend RPC.
 */
export interface OfflineSyncItemResult {
  nonce: string;
  status: 'settled' | 'rejected' | 'already_settled';
  transactionHash?: string;
  redemptionId?: string;
  errorReason?: OfflineRejectionReason | string;
  message?: string;
  remainingBalancePhp?: string;
  remainingBalanceStroops?: string;
}

/**
 * Overall batch response from Supabase RPC `sync_offline_redemption_batch`.
 */
export interface OfflineSyncBatchResponse {
  ok: boolean;
  totalReceived: number;
  settledCount: number;
  rejectedCount: number;
  results: OfflineSyncItemResult[];
}

/**
 * Network connectivity snapshot.
 */
export interface NetworkState {
  isConnected: boolean;
  isOffline: boolean;
  connectionType: 'wifi' | 'cellular' | 'none' | 'unknown';
  isInternetReachable?: boolean;
}

/**
 * Compact compressed representation of an offline voucher for QR rendering.
 */
export interface CompactQrEnvelope {
  v: '1.0';
  n: string; // nonce
  p: string; // programId
  pn?: string; // programName
  vt?: string; // voucherType
  b: string; // beneficiaryId
  bw: string; // beneficiaryWallet
  bn: string; // beneficiaryName
  m: string; // merchantId
  as: string; // amountStroops
  ap: string; // amountPhp
  t: string; // clientTimestamp
  sig?: string; // signature
}

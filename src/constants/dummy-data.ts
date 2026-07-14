// Fallback/dummy data used when live data sources (Supabase, Stellar Horizon) are
// unavailable or return an error. Keeps the UI populated with representative content
// instead of empty states, per project convention (no API calls until backend integration
// is fully wired; these values mirror the design's sample content).

import type { EnrolledProgram, RedemptionRecord, StellarWallet, Voucher } from '@/types/wallet';

export const DUMMY_WALLET: StellarWallet = {
  publicKey: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVWX',
  xlmBalance: '1786.00',
  isActivated: true,
};

export const DUMMY_PROGRAMS: EnrolledProgram[] = [
  {
    id: 'dummy-program-1',
    name: 'Livelihood Grant Phase 2',
    approvalStatus: 'Approved',
    voucherBalance: '₱10,000',
    purpose: 'Livelihood Assistance',
    expiresAt: 'July 23, 2026',
    progressPercent: 65,
    nextDisbursementDate: 'July 23, 2026',
  },
];

export const DUMMY_VOUCHERS: Voucher[] = [
  {
    id: 'dummy-voucher-1',
    category: 'Cash',
    amount: '₱10,000',
    program: 'Livelihood Grant Phase 2',
    purpose: 'Livelihood Assistance',
    expiresAt: 'July 23, 2026',
    status: 'Available',
    stellarAssetCode: 'CASH',
  },
];

export const DUMMY_TRANSACTIONS: RedemptionRecord[] = [
  {
    id: 'dummy-txn-1',
    merchant: 'Puregold Supermarket',
    amount: '₱1,500.00',
    category: 'Food',
    date: 'Today, 10:45 AM',
    remainingBalance: '₱8,500.00',
    txHash: 'dummy-hash-1',
    status: 'Completed',
    direction: 'debit',
  },
  {
    id: 'dummy-txn-2',
    merchant: 'Mercury Drug Store',
    amount: '₱245.50',
    category: 'Medicine',
    date: 'Yesterday, 4:20 PM',
    remainingBalance: '₱8,754.50',
    txHash: 'dummy-hash-2',
    status: 'Completed',
    direction: 'debit',
  },
  {
    id: 'dummy-txn-3',
    merchant: 'ReliefChain Grant',
    amount: '₱10,000.00',
    category: 'Cash',
    date: 'Oct 24, 09:12 AM',
    remainingBalance: '₱10,000.00',
    txHash: 'dummy-hash-3',
    status: 'Completed',
    direction: 'credit',
  },
];

export type DummyOrganization = {
  id: string;
  name: string;
  category: string;
  location: string;
  distanceKm: number;
};

export const DUMMY_ORGANIZATIONS: DummyOrganization[] = [
  { id: 'org-1', name: 'City Social Welfare Office', category: 'Government', location: 'Cebu City', distanceKm: 1.2 },
  { id: 'org-2', name: 'Red Cross Cebu Chapter', category: 'NGO', location: 'Cebu City', distanceKm: 2.8 },
  { id: 'org-3', name: 'Barangay Relief Center', category: 'Local Government', location: 'Mandaue City', distanceKm: 4.5 },
  { id: 'org-4', name: 'Caritas Philippines', category: 'NGO', location: 'Lapu-Lapu City', distanceKm: 6.1 },
];

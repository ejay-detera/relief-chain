// Fallback/dummy data used when live data sources (Supabase, Stellar Horizon) are
// unavailable or return an error. Keeps the UI populated with representative content
// instead of empty states, per project convention (no API calls until backend integration
// is fully wired; these values mirror the design's sample content).

import type { RedemptionRecord, StellarWallet } from '@/types/wallet';

export const DUMMY_WALLET: StellarWallet = {
  publicKey: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVWX',
  xlmBalance: '1786.00',
  isActivated: true,
};

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


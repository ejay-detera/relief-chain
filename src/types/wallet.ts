export type StellarWallet = {
  publicKey: string;
  xlmBalance: string;         // "12.50"
  isActivated: boolean;       // false when account is unfunded on testnet
};

export type Voucher = {
  id: string;
  category: 'Food' | 'Medicine' | 'School Supplies' | 'Cash';
  amount: string;             // "₱2,000"
  program: string;            // "Typhoon Odette Relief"
  purpose: string;            // "Food Assistance"
  expiresAt: string;          // "Dec 31, 2025"
  status: 'Available' | 'Redeemed' | 'Expired';
  stellarAssetCode: string;   // "FOOD" | "MED" | "SCHL"
};

export type EnrolledProgram = {
  id: string;
  name: string;               // "Typhoon Odette Relief"
  approvalStatus: 'Approved' | 'Pending' | 'Rejected';
  voucherBalance: string;     // "₱5,000"
  purpose: string;
  expiresAt: string;
  progressPercent: number;    // 0-100, placeholder until backend tracks disbursement progress
  nextDisbursementDate: string; // e.g. "July 23, 2026", placeholder until backend tracks schedule
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

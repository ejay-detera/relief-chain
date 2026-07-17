// Fixed wallet-recovery disclosures shown to beneficiaries (Requirements 16.5,
// 16.6, 16.7). These state honestly what Relief Chain can and cannot recover.
// Relief Chain never backs up or reveals production private keys as part of
// recovery (Requirement 16.7); recovery of partner-managed wallets follows the
// partner's approved process (Requirement 16.5), and unrestricted cash in a lost
// external self-custody wallet cannot be recovered by Relief Chain (Requirement 16.6).

import type { RecoveryDisclosure } from '@/types/wallet-recovery';

/** Partner-managed wallet recovery (Requirement 16.5). */
export const PARTNER_RECOVERY_DISCLOSURE: RecoveryDisclosure = {
  title: 'Partner-managed wallet recovery',
  body:
    'If your wallet is managed by a regulated partner, recovery follows the partner’s '
    + 'approved process after you re-verify your identity. Relief Chain coordinates the '
    + 'request but never stores, backs up, or reveals your private keys.',
  tone: 'info',
};

/** Unrestricted cash in a lost external self-custody wallet (Requirement 16.6). */
export const EXTERNAL_CASH_RECOVERY_DISCLOSURE: RecoveryDisclosure = {
  title: 'Cash in a self-custody wallet can’t be recovered',
  body:
    'If you connect your own external wallet and lose access to it, Relief Chain cannot '
    + 'recover the unrestricted cash held there. Only you control that wallet’s keys. Keep '
    + 'your recovery phrase safe — no one at Relief Chain can restore it for you.',
  tone: 'warning',
};

/** Testnet pilot wallet replacement (Requirement 16.2). */
export const PILOT_ROTATION_DISCLOSURE: RecoveryDisclosure = {
  title: 'Replacing your pilot wallet',
  body:
    'During the testnet pilot you can replace a lost wallet without ever exposing the old '
    + 'secret. After you re-verify your identity and confirm a recent step-up, your active '
    + 'voucher entitlements migrate to the new wallet and the old wallet can no longer authorize redemptions.',
  tone: 'info',
};

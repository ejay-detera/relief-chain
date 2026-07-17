// View-model types for the beneficiary wallet-recovery experience
// (Requirements 16.1, 16.4, 16.5, 16.6, 16.7). These describe only what the UI
// renders: the confirmed status of a wallet rotation, and the fixed recovery
// disclosures. Confirmed status originates exclusively from reconciled ledger
// evidence via the wallet-rotation infrastructure (Tasks 4.3/4.5); the UI never
// derives confirmation itself, and it never stores or reveals private keys.

/**
 * Lifecycle of a wallet rotation as surfaced to the beneficiary. `confirmed` is
 * reached only after reconciliation observes matching ledger evidence; a
 * submission alone is always shown as `submitted`, never confirmed
 * (Requirements 16.4, 18.8).
 */
export type WalletRotationUiStatus =
  | 'none'
  | 'prerequisites_required'
  | 'prepared'
  | 'submitted'
  | 'confirmed'
  | 'failed';

/** A rotation status the recovery screen can render, with verifiable references. */
export type WalletRotationStatusView = Readonly<{
  status: WalletRotationUiStatus;
  /** Truncated/full replacement wallet address, shown once known. */
  replacementAddress: string | null;
  /** Verifiable Stellar transaction reference, present only when confirmed. */
  transactionHash: string | null;
  /** Observed ledger of the confirmed rotation, present only when confirmed. */
  confirmedLedger: number | null;
  /** Reasons the rotation cannot yet proceed (identity re-verification, step-up). */
  blockingReasons: readonly string[];
}>;

/** Custody models a beneficiary may hold in production, driving which disclosure applies. */
export type BeneficiaryCustodyModel =
  | 'disposable_testnet'
  | 'partner_managed'
  | 'external_self_custody';

/** Fixed recovery-disclosure content rendered to the beneficiary. */
export type RecoveryDisclosure = Readonly<{
  title: string;
  body: string;
  /** `warning` for non-recoverable external cash; `info` for partner recovery. */
  tone: 'info' | 'warning';
}>;

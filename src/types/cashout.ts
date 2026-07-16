import type { PilotAssetCode, StellarNetwork, StroopAmount } from '@/types/blockchain';

/**
 * Simulated partner cash-out lifecycle. These states are tracked independently of
 * on-chain settlement: a cash-out never moves the settled RCPHP balance, and a
 * `failed` cash-out must NOT reverse confirmed on-chain ownership (Requirements
 * 12.6, 12.8).
 */
export type CashOutStatus = 'requested' | 'processing' | 'completed' | 'failed';

/**
 * Which participant is requesting the simulated cash-out. The pilot supports both
 * an accredited merchant cashing out settled funds (Requirement 12.5) and a
 * beneficiary requesting a simulated partner cash-out of unrestricted cash
 * (Requirement 6.7). Both are simulated and never a real bank/e-wallet transfer.
 */
export type CashOutActorKind = 'merchant' | 'beneficiary';

/**
 * The minimal, non-privileged input the mobile client relays to the cash-out Edge
 * Function. The server resolves the authenticated merchant/beneficiary,
 * organization, settlement wallet, and idempotency/correlation identifiers; the
 * client never supplies them (Requirement 18.3, 18.4).
 */
export type CashOutRequestInput = Readonly<{
  actor: CashOutActorKind;
  amountStroops: StroopAmount;
}>;

/**
 * A reconciled simulated cash-out request. `isSimulated` is always true in the
 * pilot and drives the mandatory SIMULATED labeling in the UI (Requirement 12.7).
 * Timestamps reflect the independent lifecycle transitions the partner adapter
 * reports; the client never fabricates a `completed` result locally.
 */
export type CashOutRequest = Readonly<{
  id: string;
  status: CashOutStatus;
  amountStroops: StroopAmount;
  assetCode: PilotAssetCode;
  network: StellarNetwork;
  isSimulated: boolean;
  /** Opaque partner reference, present once the simulated partner accepts the request. */
  partnerReference: string | null;
  requestedAt: string;
  processingAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  failureCode: string | null;
  correlationId: string;
}>;

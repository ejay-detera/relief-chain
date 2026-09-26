// Merchant settlement-check domain types.
//
// The merchant Receive screen offers an authorized "Check settlement status"
// action that invokes `reconcile-stellar` with the merchant's own session
// (merchant-self passes the Edge authorization check). Confirmation stays
// reconciler-owned: these types carry the reconciler's observed counts, never
// a client-side verdict.

/** Input for an authorized merchant settlement check. */
export type MerchantSettlementCheckInput = Readonly<{
  merchantId: string;
  organizationId: string;
}>;

/**
 * Honest, reconciler-owned result of a settlement check. `confirmedCount` is
 * the reconciler's observed `confirmedIntents` — zero means nothing confirmed
 * yet, never a fabricated confirmation.
 */
export type MerchantSettlementCheckResult = Readonly<{
  checkedAt: string;
  confirmedCount: number;
  failedCount: number;
  observedCount: number;
  projectionWritten: boolean;
  /** The reconciler summary payload, passed through for debugging only. */
  rawSummary: unknown;
}>;

// Distribution reconcile-check domain types.
//
// The LGU distribution observation screen offers an authorized
// "Check distribution status" action that invokes `reconcile-stellar` with the
// LGU user's own session (org role passes the Edge authorization check).
// Confirmation stays reconciler-owned: these types carry the reconciler's
// observed job status and counts, never a client-side verdict.

import type { DistributionJobStatus } from './distribution';

/** Input for an authorized distribution reconcile check (job branch). */
export type DistributionReconcileCheckInput = Readonly<{
  jobId: string;
}>;

/**
 * Honest, reconciler-owned result of a distribution reconcile check.
 * `confirmedCount` is the reconciler's observed `counts.confirmed` — zero means
 * nothing confirmed yet, never a fabricated confirmation.
 */
export type DistributionReconcileCheckResult = Readonly<{
  checkedAt: string;
  jobStatus: DistributionJobStatus;
  confirmedCount: number;
  failedCount: number;
  totalCount: number;
  projectionWritten: boolean;
  beneficiaryProjectionsWritten: number;
  /** The reconciler payload, passed through for debugging only. */
  rawResponse: unknown;
}>;

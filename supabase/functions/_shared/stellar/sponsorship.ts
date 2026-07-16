// Fee-and-reserve sponsorship controls.
//
// The dedicated operations account (the transaction sponsor) pays network fees
// and sponsors account/trustline reserves so beneficiaries and merchants never
// need XLM to participate (Requirement 14.1, 14.7). This module enforces the
// guardrails around that account so it cannot be drained or misused:
//
//   - Reserve floor (14.5): new sponsored operations STOP being accepted before
//     the sponsor balance would fall below a configured insolvency buffer. The
//     projected post-spend balance — not the current balance — is checked, so
//     the account never crosses the floor.
//   - Spend and rate caps (14.3): sponsorship spending and operation count are
//     bounded within a rolling window, throttling runaway sponsorship.
//   - Fund separation (14.2): the sponsor account MUST be distinct from the
//     issuer, organization treasury, program escrow, beneficiary, and merchant
//     accounts. Sponsorship pays fees; it never authorizes or holds aid value.
//   - Audit (14.4): every sponsored-fee/reserve decision — allowed or refused —
//     is recorded through an injected audit sink for the immutable log.
//
// A refusal surfaces as a retryable `sponsor_unavailable` error (the design's
// "temporarily unavailable, resume after sponsor health restored" class), so a
// throttled or nearly-insolvent sponsor pauses new work rather than converting a
// funding shortfall into a failed transfer. Crucially, sponsor failure NEVER
// alters ownership of already-confirmed aid (Requirement 14.6): this gate runs
// only BEFORE a new sponsored operation is accepted, never against settled state.
//
// The arithmetic is pure and the balance/audit ports are injected, so the module
// reads no Deno globals and stays inside the project-wide type check and the
// unit-test harness.
//
// Validates: Requirements 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7, 20.7

import type { Json } from '../../../../src/types/database.types.ts';
import { FinancialErrorException, makeFinancialError } from '../errors.ts';
import { safeLog } from '../redaction.ts';

// ---------------------------------------------------------------------------
// Thresholds, balance snapshot, and request.
// ---------------------------------------------------------------------------

/** Sponsor guardrail thresholds. All amounts are integer stroops. */
export interface SponsorThresholds {
  /**
   * The sponsor balance must never be projected to fall below this floor; it
   * covers the sponsor's own base reserve plus an operating buffer. New
   * sponsored operations stop being accepted before this floor is crossed.
   */
  readonly minReserveStroops: number;
  /** Maximum total stroops the sponsor may spend within `windowSeconds`. */
  readonly maxSpendPerWindowStroops: number;
  /** Maximum number of sponsored operations within `windowSeconds`. */
  readonly maxOperationsPerWindow: number;
  /** The rolling window, in seconds, for the spend and operation caps. */
  readonly windowSeconds: number;
}

/** A point-in-time view of the sponsor account and its rolling-window usage. */
export interface SponsorUsageSnapshot {
  /** The sponsor's current spendable balance, in stroops. */
  readonly availableStroops: number;
  /** Stroops already spent within the current window. */
  readonly spentInWindowStroops: number;
  /** Sponsored operations already performed within the current window. */
  readonly operationsInWindow: number;
}

/** A request to sponsor one operation's fees and/or reserves. */
export interface SponsorshipRequest {
  /** Estimated stroops this operation will draw from the sponsor (fee + reserves). */
  readonly estimatedCostStroops: number;
  /** A non-secret label for the audit trail, e.g. `cash_disbursement_fee_bump`. */
  readonly purpose: string;
  readonly correlationId: string;
  /** Optional linkage for the audit record. */
  readonly organizationId?: string | null;
  readonly programId?: string | null;
  readonly financialIntentId?: string | null;
}

/** Why a sponsorship request was refused (or `ok` when allowed). */
export type SponsorshipDecisionReason =
  | 'ok'
  | 'invalid_cost'
  | 'reserve_floor'
  | 'spend_cap'
  | 'rate_cap';

export interface SponsorshipDecision {
  readonly allowed: boolean;
  readonly reason: SponsorshipDecisionReason;
  /** The sponsor balance projected after this operation, in stroops. */
  readonly projectedBalanceStroops: number;
  /** Window spend projected after this operation, in stroops. */
  readonly projectedWindowSpendStroops: number;
  /** Window operation count projected after this operation. */
  readonly projectedWindowOperations: number;
}

const isNonNegativeInteger = (value: number): boolean =>
  Number.isInteger(value) && value >= 0;

/**
 * Pure evaluation of a sponsorship request against the current usage snapshot
 * and thresholds. Checks, in order: a valid non-negative integer cost, the
 * reserve floor (projected balance), the window spend cap, and the window
 * operation cap. The FIRST failing guard determines the reason. This never reads
 * or mutates confirmed aid state — it only decides whether to admit new work.
 */
export const evaluateSponsorship = (
  snapshot: SponsorUsageSnapshot,
  thresholds: SponsorThresholds,
  request: Pick<SponsorshipRequest, 'estimatedCostStroops'>,
): SponsorshipDecision => {
  const cost = request.estimatedCostStroops;
  const projectedBalanceStroops = snapshot.availableStroops - cost;
  const projectedWindowSpendStroops = snapshot.spentInWindowStroops + cost;
  const projectedWindowOperations = snapshot.operationsInWindow + 1;

  const base = {
    projectedBalanceStroops,
    projectedWindowSpendStroops,
    projectedWindowOperations,
  };

  if (!isNonNegativeInteger(cost) || cost === 0) {
    return { allowed: false, reason: 'invalid_cost', ...base };
  }
  // Reserve floor: refuse BEFORE the balance would cross the insolvency buffer.
  if (projectedBalanceStroops < thresholds.minReserveStroops) {
    return { allowed: false, reason: 'reserve_floor', ...base };
  }
  if (projectedWindowSpendStroops > thresholds.maxSpendPerWindowStroops) {
    return { allowed: false, reason: 'spend_cap', ...base };
  }
  if (projectedWindowOperations > thresholds.maxOperationsPerWindow) {
    return { allowed: false, reason: 'rate_cap', ...base };
  }
  return { allowed: true, reason: 'ok', ...base };
};

// ---------------------------------------------------------------------------
// Fund separation (Requirement 14.2).
// ---------------------------------------------------------------------------

/** The role accounts the sponsor must remain distinct from. */
export interface SponsorSeparationAccounts {
  readonly sponsor: string;
  readonly issuer?: string | null;
  readonly organizationTreasury?: string | null;
  readonly programEscrow?: string | null;
  readonly beneficiary?: string | null;
  readonly merchant?: string | null;
}

/**
 * Asserts the sponsor account is distinct from every other role account. A
 * sponsor that doubles as the issuer, treasury, escrow, beneficiary, or merchant
 * would let fee sponsorship touch aid value — forbidden by design. Throws a
 * non-retryable validation error identifying the colliding role.
 */
export const assertSponsorSeparation = (
  accounts: SponsorSeparationAccounts,
  correlationId: string,
): void => {
  const roles: readonly [string, string | null | undefined][] = [
    ['issuer', accounts.issuer],
    ['organization treasury', accounts.organizationTreasury],
    ['program escrow', accounts.programEscrow],
    ['beneficiary', accounts.beneficiary],
    ['merchant', accounts.merchant],
  ];
  for (const [roleName, account] of roles) {
    if (account && account === accounts.sponsor) {
      throw FinancialErrorException.of(
        'validation_failed',
        'The fee sponsor account must be separate from aid-holding accounts.',
        { correlationId, fieldErrors: { sponsor: [`must not equal the ${roleName} account`] } },
      );
    }
  }
};

// ---------------------------------------------------------------------------
// Audit and balance ports (injected).
// ---------------------------------------------------------------------------

/** A single sponsored-operation audit entry (allowed or refused). */
export interface SponsorshipAuditEntry {
  readonly outcome: 'allowed' | 'refused';
  readonly reason: SponsorshipDecisionReason;
  readonly estimatedCostStroops: number;
  readonly projectedBalanceStroops: number;
  readonly purpose: string;
  readonly correlationId: string;
  readonly organizationId: string | null;
  readonly programId: string | null;
  readonly financialIntentId: string | null;
  readonly recordedAt: string;
}

/** Records a sponsorship decision to the immutable audit log (14.4). */
export interface SponsorshipAuditSink {
  record(entry: SponsorshipAuditEntry): Promise<void>;
}

/** Reads the live sponsor balance and rolling-window usage. */
export interface SponsorUsageStore {
  loadUsage(): Promise<SponsorUsageSnapshot>;
}

/** Builds the redactable audit context payload for structured logging. */
export const auditEntryToJson = (entry: SponsorshipAuditEntry): Json => ({
  outcome: entry.outcome,
  reason: entry.reason,
  estimated_cost_stroops: entry.estimatedCostStroops,
  projected_balance_stroops: entry.projectedBalanceStroops,
  purpose: entry.purpose,
  correlation_id: entry.correlationId,
  organization_id: entry.organizationId,
  program_id: entry.programId,
  financial_intent_id: entry.financialIntentId,
  recorded_at: entry.recordedAt,
});

// ---------------------------------------------------------------------------
// Governor.
// ---------------------------------------------------------------------------

export interface SponsorGovernorDependencies {
  readonly thresholds: SponsorThresholds;
  readonly usage: SponsorUsageStore;
  readonly audit: SponsorshipAuditSink;
  /** Injected clock; defaults to `Date`. */
  readonly clock?: () => Date;
}

export interface SponsorGovernor {
  /**
   * Authorizes one sponsored operation. Reads live usage, evaluates the
   * guardrails, records the decision to the audit log, and — on refusal — throws
   * a retryable `sponsor_unavailable` error. Returns the decision on success.
   */
  authorize(request: SponsorshipRequest): Promise<SponsorshipDecision>;
  /** Evaluates without recording or throwing, for health surfaces. */
  preview(request: Pick<SponsorshipRequest, 'estimatedCostStroops'>): Promise<SponsorshipDecision>;
}

const refusalMessageFor = (reason: SponsorshipDecisionReason): string => {
  switch (reason) {
    case 'reserve_floor':
      return 'Fee sponsorship is temporarily unavailable while the sponsor balance is replenished.';
    case 'spend_cap':
    case 'rate_cap':
      return 'Fee sponsorship is temporarily rate-limited. Please try again shortly.';
    case 'invalid_cost':
    case 'ok':
      return 'Fee sponsorship could not be authorized for this operation.';
  }
};

/**
 * Builds the sponsor governor. Every authorization — allowed or refused — is
 * audited; an `invalid_cost` request is a client error (non-retryable
 * validation), while capacity refusals are retryable `sponsor_unavailable`
 * incidents so the caller resumes after sponsor health is restored.
 */
export const createSponsorGovernor = (deps: SponsorGovernorDependencies): SponsorGovernor => {
  const clock = deps.clock ?? (() => new Date());

  const evaluateNow = async (
    request: Pick<SponsorshipRequest, 'estimatedCostStroops'>,
  ): Promise<SponsorshipDecision> => {
    const snapshot = await deps.usage.loadUsage();
    return evaluateSponsorship(snapshot, deps.thresholds, request);
  };

  const authorize = async (request: SponsorshipRequest): Promise<SponsorshipDecision> => {
    const decision = await evaluateNow(request);

    const entry: SponsorshipAuditEntry = {
      outcome: decision.allowed ? 'allowed' : 'refused',
      reason: decision.reason,
      estimatedCostStroops: request.estimatedCostStroops,
      projectedBalanceStroops: decision.projectedBalanceStroops,
      purpose: request.purpose,
      correlationId: request.correlationId,
      organizationId: request.organizationId ?? null,
      programId: request.programId ?? null,
      financialIntentId: request.financialIntentId ?? null,
      recordedAt: clock().toISOString(),
    };
    await deps.audit.record(entry);

    if (decision.allowed) {
      return decision;
    }

    safeLog('sponsorship refused', {
      reason: decision.reason,
      purpose: request.purpose,
      correlationId: request.correlationId,
    });

    if (decision.reason === 'invalid_cost') {
      throw FinancialErrorException.of(
        'validation_failed',
        'The sponsorship cost estimate is invalid.',
        { correlationId: request.correlationId, fieldErrors: { estimatedCostStroops: ['must be a positive integer'] } },
      );
    }

    throw new FinancialErrorException(
      makeFinancialError('sponsor_unavailable', refusalMessageFor(decision.reason), {
        correlationId: request.correlationId,
        retryable: true,
      }),
    );
  };

  return Object.freeze({ authorize, preview: evaluateNow });
};

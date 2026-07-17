// Mainnet production-gate evidence model and fail-closed gate evaluator.
//
// A successful testnet pilot must NEVER be mistaken for permission to move real
// funds. This module is the single shared specification of the production
// prerequisites (Requirement 24) and the fail-closed evaluator that keeps
// mainnet disabled until every prerequisite is recorded as approved, fresh, and
// independently signed off.
//
// The module does NOT unlock mainnet. Pilot builds pin `mainnetEnabled: false`
// in the trusted Stellar config (see shared/stellar-config.ts and
// stellar/network-guard.ts), so `isMainnetPermitted` is structurally incapable
// of returning true in a pilot build. The evaluator MODELS the readiness
// decision so the controls are typed, testable, and auditable today, and so the
// gate can be reused unchanged by a future production build.
//
// Requirements coverage:
//   - 1.3  Reject configuration that attempts to use Stellar mainnet.
//   - 1.6  Live PHP issuer/redemption configuration comes from a regulated
//          partner adapter, never hard-coded client values.
//   - 2.8  Maker/checker approval, non-self-approval of production disbursements.
//   - 19.9 Production retention policy requires qualified PH privacy/compliance
//          counsel review (rolled into the legal-review prerequisite).
//   - 20.9 Production emergency pause/resume require organization AND independent
//          platform/security authorization.
//   - 24.1 Mainnet stays disabled until every prerequisite is approved.
//   - 24.2 Regulated PHP issuer with mint/reserve/redemption/freeze/compliance.
//   - 24.3 Institutional custody, beneficiary recovery, merchant settlement, and
//          fee-sponsorship arrangements.
//   - 24.4 Maker/checker disbursement authorization and multi-party emergency.
//   - 24.5 Independent Soroban contract and application security review with
//          critical findings resolved.
//   - 24.6 Legal review of custody, privacy, AML/KYC, consumer protection, audit
//          retention, and PH regulatory obligations.
//   - 24.7 Tested incident response, key rotation, disaster recovery, monitoring,
//          reconciliation, and partner-outage procedures.
//   - 24.8 Load and reliability evidence at intended production scale.
//   - 24.9 No pilot UI, documentation, or test asset implies RCPHP is redeemable
//          for real Philippine pesos.
//
// The module is pure and Deno-global free (clock and all inputs are injected),
// so it stays inside the project-wide type check and the unit-test harness.

import type { StellarTestnetConfig } from '../../../shared/stellar-config.ts';
import { PRODUCTION_APPROVAL_PREREQUISITES } from './approval-policy.ts';

// ---------------------------------------------------------------------------
// Prerequisite catalog (Requirement 24)
// ---------------------------------------------------------------------------

/**
 * Every prerequisite that MUST be recorded as approved before mainnet activation
 * is even considered. The maker/checker and multi-party emergency ids are shared
 * verbatim with {@link PRODUCTION_APPROVAL_PREREQUISITES} so the approval policy
 * and the production gate never drift apart.
 */
export const PRODUCTION_PREREQUISITE_IDS = [
  // 24.2 + 1.6 — regulated PHP issuer with documented interfaces (adapter-sourced).
  'regulated_php_issuer',
  // 24.3 — custody / recovery / settlement / sponsorship arrangements.
  'institutional_custody',
  'beneficiary_recovery',
  'merchant_settlement',
  'fee_sponsorship',
  // 2.8 + 24.4 — maker/checker disbursement authorization (shared id).
  'maker_checker_disbursement',
  // 7.12 + 20.9 + 24.4 — multi-party emergency control (shared id).
  'multi_party_emergency_control',
  // 24.5 — independent contract + application security review, criticals resolved.
  'independent_security_review',
  // 24.6 + 19.9 — legal / privacy / AML-KYC / retention review.
  'legal_compliance_review',
  // 24.7 — tested incident response, rotation, DR, monitoring, reconciliation.
  'operational_procedures',
  // 24.8 — load and reliability evidence at production scale.
  'load_reliability_evidence',
] as const;

export type ProductionPrerequisiteId = (typeof PRODUCTION_PREREQUISITE_IDS)[number];

export interface ProductionPrerequisiteDefinition {
  readonly id: ProductionPrerequisiteId;
  readonly description: string;
  /** The Requirement 24 (and cross-referenced) acceptance criteria satisfied. */
  readonly requirements: readonly string[];
}

/**
 * The authoritative, frozen catalog of prerequisites with their descriptions and
 * requirement traceability. The evaluator requires an approved evidence record
 * for every entry here; nothing less passes.
 */
export const PRODUCTION_PREREQUISITES: readonly ProductionPrerequisiteDefinition[] =
  Object.freeze([
    Object.freeze({
      id: 'regulated_php_issuer',
      description:
        'Regulated PHP-asset issuer with documented mint, reserve, redemption, freeze, and compliance interfaces sourced from a regulated-partner adapter.',
      requirements: Object.freeze(['1.6', '24.2']),
    }),
    Object.freeze({
      id: 'institutional_custody',
      description:
        'Approved institutional custody or multisignature arrangement for organization treasuries.',
      requirements: Object.freeze(['24.3']),
    }),
    Object.freeze({
      id: 'beneficiary_recovery',
      description: 'Approved beneficiary wallet recovery arrangement.',
      requirements: Object.freeze(['24.3']),
    }),
    Object.freeze({
      id: 'merchant_settlement',
      description: 'Approved merchant settlement arrangement.',
      requirements: Object.freeze(['24.3']),
    }),
    Object.freeze({
      id: 'fee_sponsorship',
      description: 'Approved fee and reserve sponsorship arrangement.',
      requirements: Object.freeze(['24.3']),
    }),
    Object.freeze({
      id: 'maker_checker_disbursement',
      description:
        'Disbursement authorization requires maker/checker approval with non-self-approval by distinct authorized signers.',
      requirements: Object.freeze(['2.8', '24.4']),
    }),
    Object.freeze({
      id: 'multi_party_emergency_control',
      description:
        'Emergency pause/resume requires both organization and independent platform/security authorization by distinct parties.',
      requirements: Object.freeze(['7.12', '20.9', '24.4']),
    }),
    Object.freeze({
      id: 'independent_security_review',
      description:
        'Independent Soroban contract and application security review completed with all critical findings resolved.',
      requirements: Object.freeze(['24.5']),
    }),
    Object.freeze({
      id: 'legal_compliance_review',
      description:
        'Legal review of custody, privacy, AML/KYC, consumer protection, audit retention, and Philippine regulatory obligations by qualified counsel.',
      requirements: Object.freeze(['19.9', '24.6']),
    }),
    Object.freeze({
      id: 'operational_procedures',
      description:
        'Tested incident response, key rotation, disaster recovery, monitoring, reconciliation, and partner-outage procedures.',
      requirements: Object.freeze(['24.7']),
    }),
    Object.freeze({
      id: 'load_reliability_evidence',
      description:
        'Load and reliability evidence gathered at the intended production scale.',
      requirements: Object.freeze(['24.8']),
    }),
  ]);

// A defensive cross-check: every shared approval-policy prerequisite id must be a
// known production prerequisite so the two modules cannot silently diverge.
const PREREQUISITE_ID_SET: ReadonlySet<string> = new Set(PRODUCTION_PREREQUISITE_IDS);
for (const shared of PRODUCTION_APPROVAL_PREREQUISITES) {
  if (!PREREQUISITE_ID_SET.has(shared.id)) {
    throw new Error(
      `Approval-policy prerequisite "${shared.id}" is not modeled in the production gate.`,
    );
  }
}

/** True when `value` names a known production prerequisite. */
export const isProductionPrerequisiteId = (
  value: string,
): value is ProductionPrerequisiteId => PREREQUISITE_ID_SET.has(value);

// ---------------------------------------------------------------------------
// Evidence model
// ---------------------------------------------------------------------------

export type EvidenceStatus = 'approved' | 'rejected' | 'pending';

/**
 * A recorded production-readiness approval for a single prerequisite.
 *
 * `submittedBy` is the party that prepared/submitted the evidence; `approvedBy`
 * is the independent approver. Self-approval (same party) always fails closed.
 * `expiresAt` bounds the approval's validity window — an approval with no
 * expiry, or one past its window, is treated as STALE and fails closed. All
 * fields are non-secret operational metadata.
 */
export interface PrerequisiteEvidence {
  readonly prerequisiteId: ProductionPrerequisiteId;
  readonly status: EvidenceStatus;
  /** The party that prepared/submitted the evidence. */
  readonly submittedBy: string;
  /** The independent party that approved it, or null when not yet approved. */
  readonly approvedBy: string | null;
  /** ISO-8601 approval timestamp, or null when not yet approved. */
  readonly approvedAt: string | null;
  /** ISO-8601 end of the approval's validity window. */
  readonly expiresAt: string | null;
  /** Optional non-secret reference to the evidence artifact. */
  readonly reference?: string | null;
}

export type PrerequisiteDenialReason =
  | 'missing'
  | 'pending'
  | 'rejected'
  | 'stale'
  | 'self_approved';

export interface PrerequisiteEvaluation {
  readonly prerequisiteId: ProductionPrerequisiteId;
  readonly satisfied: boolean;
  /** Null when satisfied; otherwise the fail-closed reason. */
  readonly reason: PrerequisiteDenialReason | null;
}

export interface ProductionGateDecision {
  /**
   * True only when every prerequisite is satisfied. This is a readiness
   * statement; it never by itself flips mainnet on — see {@link isMainnetPermitted}.
   */
  readonly ready: boolean;
  readonly evaluations: readonly PrerequisiteEvaluation[];
  /** The subset of evaluations that are not satisfied (empty when ready). */
  readonly unsatisfied: readonly PrerequisiteEvaluation[];
}

export interface ProductionGateInput {
  readonly evidence: readonly PrerequisiteEvidence[];
  /** Injected clock; defaults to `new Date()`. */
  readonly now?: Date;
}

const isValidTimestamp = (value: string | null): value is string => {
  if (value === null) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed);
};

/**
 * Evaluates a single evidence record, fail-closed. The order of checks fixes the
 * reported reason for a record that fails more than one way.
 */
const evaluateRecord = (
  record: PrerequisiteEvidence,
  now: Date,
): PrerequisiteDenialReason | null => {
  if (record.status === 'rejected') return 'rejected';
  if (record.status === 'pending') return 'pending';

  // status === 'approved'
  if (record.approvedBy === null || record.approvedBy.trim() === '') {
    // Marked approved with no approver recorded — incomplete, treat as pending.
    return 'pending';
  }
  if (record.approvedBy === record.submittedBy) {
    return 'self_approved';
  }
  if (!isValidTimestamp(record.approvedAt)) {
    return 'stale';
  }
  if (!isValidTimestamp(record.expiresAt)) {
    // An approval with no defined validity window cannot be trusted indefinitely.
    return 'stale';
  }
  if (Date.parse(record.expiresAt) <= now.getTime()) {
    return 'stale';
  }
  return null;
};

// Reason severity ordering used when a prerequisite has several records; the most
// serious problem is reported.
const REASON_SEVERITY: Readonly<Record<PrerequisiteDenialReason, number>> = Object.freeze({
  rejected: 5,
  self_approved: 4,
  stale: 3,
  pending: 2,
  missing: 1,
});

const moreSevere = (
  a: PrerequisiteDenialReason,
  b: PrerequisiteDenialReason,
): PrerequisiteDenialReason => (REASON_SEVERITY[a] >= REASON_SEVERITY[b] ? a : b);

/**
 * Evaluates the full production gate. Mainnet readiness requires that EVERY
 * prerequisite in {@link PRODUCTION_PREREQUISITES} has at least one satisfying
 * evidence record and NO record that is rejected, stale, pending, or
 * self-approved. Anything less keeps the gate closed.
 */
export function evaluateProductionGate(
  input: ProductionGateInput,
): ProductionGateDecision {
  const now = input.now ?? new Date();

  const evaluations: PrerequisiteEvaluation[] = PRODUCTION_PREREQUISITES.map(
    (definition) => {
      const records = input.evidence.filter(
        (record) => record.prerequisiteId === definition.id,
      );

      if (records.length === 0) {
        return { prerequisiteId: definition.id, satisfied: false, reason: 'missing' };
      }

      // Fail-closed: every record for the prerequisite must be satisfied.
      let worstReason: PrerequisiteDenialReason | null = null;
      for (const record of records) {
        const reason = evaluateRecord(record, now);
        if (reason !== null) {
          worstReason = worstReason === null ? reason : moreSevere(worstReason, reason);
        }
      }

      return {
        prerequisiteId: definition.id,
        satisfied: worstReason === null,
        reason: worstReason,
      };
    },
  );

  const unsatisfied = evaluations.filter((evaluation) => !evaluation.satisfied);

  return Object.freeze({
    ready: unsatisfied.length === 0,
    evaluations: Object.freeze(evaluations),
    unsatisfied: Object.freeze(unsatisfied),
  });
}

// ---------------------------------------------------------------------------
// Pilot mainnet lock (Req 1.3, 24.1)
// ---------------------------------------------------------------------------

export class ProductionGateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProductionGateError';
  }
}

/**
 * The minimal config shape the mainnet decision reads. A pilot
 * {@link StellarTestnetConfig} (whose `mainnetEnabled` is the literal `false`)
 * is assignable here, while the widened `boolean` keeps the production term of
 * {@link isMainnetPermitted} meaningful and exercisable by the gate tests.
 */
export interface MainnetCapableConfig {
  readonly mainnetEnabled: boolean;
}

/**
 * The single decision point for whether real-fund (mainnet) activation is
 * permitted. It requires BOTH that the build's trusted config enables mainnet
 * AND that the production gate is ready.
 *
 * In every pilot build `config.mainnetEnabled` is the literal `false`, so this
 * function is structurally incapable of returning true no matter how much
 * evidence is supplied — mainnet stays hard-disabled. The gate readiness term is
 * retained so the same code governs a future production build unchanged.
 */
export const isMainnetPermitted = (
  config: MainnetCapableConfig,
  decision: ProductionGateDecision,
): boolean => config.mainnetEnabled === true && decision.ready;

/**
 * Fails closed if a pilot build's config is anything other than mainnet-disabled.
 * A defence-in-depth re-assertion for callers that hold a config which should
 * always be a pilot config.
 */
export const assertPilotMainnetDisabled = (
  config: StellarTestnetConfig,
): void => {
  if (config.mainnetEnabled !== false) {
    throw new ProductionGateError('Mainnet is hard-disabled for the pilot.');
  }
};

// ---------------------------------------------------------------------------
// Real-PHP redeemability claim guard (Req 24.9, 1.2)
// ---------------------------------------------------------------------------

// Phrases that would wrongly imply the non-monetary RCPHP test asset can be
// redeemed for real Philippine pesos. Matching is case-insensitive and tolerant
// of the peso sign, the "PHP"/"peso" spellings, and hyphen/space vari/ation.
const REAL_PHP_CLAIM_PATTERNS: readonly RegExp[] = Object.freeze([
  // "redeem ... for/into/to ... (real) PHP / Philippine pesos" within one clause.
  /\bredeem(?:ed|able|s)?\b[^.!?]*?\b(?:for|into|to)\b[^.!?]*?\b(?:php|philippine\s+pesos?|pesos?|peso|₱)\b/i,
  /\bredeemable\b[^.!?]*?\b(?:php|philippine\s+pesos?|pesos?|peso|₱)\b/i,
  /\b(?:real|actual)\s+(?:money|cash|php|pesos?)\b/i,
  /\bbacked\s+(?:1:1\s+)?by\s+(?:real\s+)?(?:php|pesos?|peso|₱)\b/i,
  /\bworth\s+real\s+(?:money|php|pesos?)\b/i,
  // "withdraw ... to/as ... (real) PHP / pesos / cash / bank" within one clause.
  /\bwithdraw(?:al|n|s)?\b[^.!?]*?\b(?:to|as|into)\b[^.!?]*?\b(?:real\s+)?(?:php|pesos?|peso|cash|bank)\b/i,
  /₱\s*\d/,
]);

/**
 * True when `text` implies RCPHP is redeemable for real Philippine pesos. Used
 * to keep pilot UI copy, documentation, and test-asset labels honest.
 */
export const containsRealPhpRedeemabilityClaim = (text: string): boolean =>
  REAL_PHP_CLAIM_PATTERNS.some((pattern) => pattern.test(text));

/**
 * Fails closed when `text` implies real-PHP redeemability. `context` is included
 * in the error message to point at the offending surface (UI copy, doc, label).
 */
export const assertNoRealPhpClaim = (text: string, context = 'content'): void => {
  if (containsRealPhpRedeemabilityClaim(text)) {
    throw new ProductionGateError(
      `Pilot ${context} must not imply RCPHP is redeemable for real Philippine pesos.`,
    );
  }
};

// ---------------------------------------------------------------------------
// Regulated-partner adapter boundary (Req 1.6, 24.2, 24.3)
// ---------------------------------------------------------------------------

/** The documented issuer interfaces a regulated PHP-asset partner must provide. */
export interface RegulatedIssuerInterfaces {
  readonly mint: boolean;
  readonly reserve: boolean;
  readonly redemption: boolean;
  readonly freeze: boolean;
  readonly compliance: boolean;
}

/**
 * Configuration for a live, regulated PHP asset. These values are trusted only
 * when they originate from a server-side {@link RegulatedPartnerAdapter}; they
 * must never be accepted from client input.
 */
export interface RegulatedPartnerConfig {
  readonly issuerAccountId: string;
  readonly interfaces: RegulatedIssuerInterfaces;
  readonly custodyArrangement: string;
  readonly redemptionArrangement: string;
}

/**
 * Server-side source of regulated-partner configuration. A pilot build has no
 * regulated partner, so {@link createPilotRegulatedPartnerAdapter} always
 * refuses — the live-asset path cannot be reached, and no client value can stand
 * in for a real regulated issuer.
 */
export interface RegulatedPartnerAdapter {
  loadConfiguration(): Promise<RegulatedPartnerConfig>;
}

/**
 * The pilot regulated-partner adapter. It never returns configuration: the pilot
 * uses only the non-monetary RCPHP testnet asset, and any attempt to source live
 * regulated values fails closed. This encodes Requirement 1.6 — live issuer and
 * redemption configuration must come from a regulated adapter, and none exists
 * in the pilot.
 */
export const createPilotRegulatedPartnerAdapter = (): RegulatedPartnerAdapter =>
  Object.freeze({
    loadConfiguration(): Promise<RegulatedPartnerConfig> {
      return Promise.reject(
        new ProductionGateError(
          'No regulated PHP-asset partner is configured in the pilot; RCPHP is a non-monetary testnet asset.',
        ),
      );
    },
  });

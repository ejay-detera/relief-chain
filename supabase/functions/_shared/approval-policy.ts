// Environment-aware approval and emergency-control policy.
//
// This module is the single shared specification of WHO may authorize a
// disbursement and WHO may pause/resume a voucher contract, and how those
// requirements differ between the testnet pilot and a future production build.
// It exists so that every trusted Edge Function evaluates one leak-free policy
// rather than re-deriving approval rules inline.
//
// The pilot is testnet-only; production remains hard-disabled elsewhere in the
// stack (see stellar-config.ts and network-guard.ts). This module does not
// unlock production — it MODELS the production approval controls as mandatory,
// enforceable prerequisites so the production-gate evaluator (Task 15) can reuse
// exactly the same logic and so those controls are testable today.
//
// Requirements coverage:
//   - 2.7  Testnet MVP MAY permit one organization administrator to authorize a
//          disbursement (single-admin approval).
//   - 2.8  Before mainnet activation, maker/checker approval is required and
//          self-approval of production disbursements is prevented.
//   - 7.12 Production pause/resume require multi-party authority; single-admin
//          authority is testnet-only.
//   - 20.9 Production emergency pause/resume require BOTH organization and an
//          independent platform/security authorization.
//   - 24.4 Production activation requires maker/checker disbursement
//          authorization and multi-party emergency control.
//
// The module is pure and Deno-global free (all inputs are injected), so it stays
// inside the project-wide type check and is unit-testable in isolation.

import type { OrganizationRole } from './tenant-authorization.ts';

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

export type PolicyEnvironment = 'testnet' | 'production';

/**
 * Derives the approval-policy environment from the network's mainnet flag. The
 * pilot's {@link StellarTestnetConfig} pins `mainnetEnabled` to `false`, so this
 * resolves to `'testnet'` for every pilot build. Production evaluation is only
 * reachable by passing `true`, which the production-gate evaluator does when it
 * checks that the required controls WOULD be satisfied before mainnet is ever
 * approved.
 */
export const policyEnvironmentFromMainnet = (
  mainnetEnabled: boolean,
): PolicyEnvironment => (mainnetEnabled ? 'production' : 'testnet');

// ---------------------------------------------------------------------------
// Shared decision shape
// ---------------------------------------------------------------------------

export interface PolicyDecision<TReason extends string> {
  /** True only when no denial reason applies. */
  readonly allowed: boolean;
  readonly environment: PolicyEnvironment;
  /** Deduplicated denial reasons; empty when {@link allowed} is true. */
  readonly reasons: readonly TReason[];
  /** The named controls that were satisfied to reach an allow decision. */
  readonly controls: readonly string[];
}

const dedupe = <T>(items: readonly T[]): T[] => [...new Set(items)];

const decide = <TReason extends string>(
  environment: PolicyEnvironment,
  reasons: readonly TReason[],
  controls: readonly string[],
): PolicyDecision<TReason> => {
  const uniqueReasons = dedupe(reasons);
  return Object.freeze({
    allowed: uniqueReasons.length === 0,
    environment,
    reasons: Object.freeze(uniqueReasons),
    controls: Object.freeze(dedupe(controls)),
  });
};

// ---------------------------------------------------------------------------
// Disbursement approval (Req 2.7, 2.8, 24.4)
// ---------------------------------------------------------------------------

// The membership roles permitted to authorize a disbursement. Only finance
// approvers and organization administrators may sign off on moving aid.
export const DISBURSEMENT_AUTHORIZER_ROLES: readonly OrganizationRole[] = [
  'organization_administrator',
  'finance_approver',
];

const isAuthorizerRole = (role: OrganizationRole): boolean =>
  DISBURSEMENT_AUTHORIZER_ROLES.includes(role);

/**
 * A party involved in a disbursement approval. `recentStepUp` is true only when
 * the party holds a fresh AAL2 step-up within the configured window
 * (Requirement 20.2); disbursement authorization always requires it.
 */
export interface ApprovalParticipant {
  readonly userId: string;
  readonly role: OrganizationRole;
  readonly recentStepUp: boolean;
}

export interface DisbursementApprovalRequest {
  readonly environment: PolicyEnvironment;
  /** The party that prepared/submitted the disbursement (the "maker"). */
  readonly maker: ApprovalParticipant;
  /** Recorded approvals (the "checkers"); may include the maker on testnet. */
  readonly approvals: readonly ApprovalParticipant[];
}

export type DisbursementDenialReason =
  | 'no_authorized_approver'
  | 'approver_missing_step_up'
  | 'maker_not_authorized'
  | 'self_approval_forbidden'
  | 'checker_required';

const isValidAuthorizer = (party: ApprovalParticipant): boolean =>
  isAuthorizerRole(party.role) && party.recentStepUp;

/**
 * Evaluates whether a disbursement is authorized under the given environment.
 *
 * Testnet (Req 2.7): a single authorizer — an organization administrator or
 * finance approver with recent step-up — is sufficient. The maker may
 * self-authorize.
 *
 * Production (Req 2.8, 24.4): maker/checker is mandatory. The maker must hold an
 * authorizer role, and at least one DISTINCT checker (a different user, also an
 * authorized signer with recent step-up) must approve. The maker can never
 * approve their own disbursement — any self-approval attempt fails closed.
 */
export function evaluateDisbursementApproval(
  request: DisbursementApprovalRequest,
): PolicyDecision<DisbursementDenialReason> {
  const { environment, maker, approvals } = request;
  const reasons: DisbursementDenialReason[] = [];
  const controls: string[] = [];

  if (environment === 'testnet') {
    // Single-admin authorization is permitted; the maker counts as an approver.
    const candidates = [maker, ...approvals];
    const authorized = candidates.some(isValidAuthorizer);
    if (authorized) {
      controls.push('testnet_single_admin_authorization');
    } else {
      const anyRole = candidates.some((p) => isAuthorizerRole(p.role));
      reasons.push(anyRole ? 'approver_missing_step_up' : 'no_authorized_approver');
    }
    return decide(environment, reasons, controls);
  }

  // Production maker/checker.
  if (!isAuthorizerRole(maker.role)) {
    reasons.push('maker_not_authorized');
  }

  // Non-self-approval: the maker's own approval never counts, and submitting one
  // is a policy violation that fails closed.
  if (approvals.some((a) => a.userId === maker.userId)) {
    reasons.push('self_approval_forbidden');
  }

  const distinctCheckers = approvals.filter((a) => a.userId !== maker.userId);
  const validCheckers = distinctCheckers.filter(isValidAuthorizer);
  if (validCheckers.length === 0) {
    const hadRoleButNoStepUp = distinctCheckers.some(
      (a) => isAuthorizerRole(a.role) && !a.recentStepUp,
    );
    reasons.push(hadRoleButNoStepUp ? 'approver_missing_step_up' : 'checker_required');
  }

  if (reasons.length === 0) {
    controls.push('production_maker_checker');
  }
  return decide(environment, reasons, controls);
}

// ---------------------------------------------------------------------------
// Emergency control: pause / resume (Req 7.12, 20.9, 24.4)
// ---------------------------------------------------------------------------

export type EmergencyAuthority = 'organization' | 'platform_security';

/**
 * A party authorizing an emergency pause/resume. `authority` distinguishes the
 * organization side from the independent platform/security side required in
 * production. `recentStepUp` follows Requirement 20.2.
 */
export interface EmergencyAuthorizer {
  readonly userId: string;
  readonly authority: EmergencyAuthority;
  readonly recentStepUp: boolean;
}

export interface EmergencyControlRequest {
  readonly environment: PolicyEnvironment;
  readonly operation: 'pause' | 'resume';
  readonly authorizers: readonly EmergencyAuthorizer[];
}

export type EmergencyDenialReason =
  | 'no_authorizer'
  | 'authorizer_missing_step_up'
  | 'organization_authority_required'
  | 'independent_authority_required'
  | 'independent_parties_required';

/**
 * Evaluates whether an emergency pause/resume is authorized.
 *
 * Testnet (Req 7.12): single-admin authority is allowed. One authorizer of
 * either authority with recent step-up is sufficient.
 *
 * Production (Req 7.12, 20.9, 24.4): multi-party authority is mandatory. Both an
 * organization authorizer AND an independent platform/security authorizer must
 * approve, each with recent step-up, and they must be two distinct people.
 */
export function evaluateEmergencyControl(
  request: EmergencyControlRequest,
): PolicyDecision<EmergencyDenialReason> {
  const { environment, authorizers } = request;
  const reasons: EmergencyDenialReason[] = [];
  const controls: string[] = [];

  if (environment === 'testnet') {
    if (authorizers.length === 0) {
      reasons.push('no_authorizer');
    } else if (!authorizers.some((a) => a.recentStepUp)) {
      reasons.push('authorizer_missing_step_up');
    } else {
      controls.push('testnet_single_admin_emergency');
    }
    return decide(environment, reasons, controls);
  }

  // Production multi-party.
  const organization = authorizers.filter((a) => a.authority === 'organization');
  const independent = authorizers.filter((a) => a.authority === 'platform_security');
  const organizationReady = organization.filter((a) => a.recentStepUp);
  const independentReady = independent.filter((a) => a.recentStepUp);

  if (organizationReady.length === 0) {
    reasons.push(
      organization.length > 0
        ? 'authorizer_missing_step_up'
        : 'organization_authority_required',
    );
  }
  if (independentReady.length === 0) {
    reasons.push(
      independent.length > 0
        ? 'authorizer_missing_step_up'
        : 'independent_authority_required',
    );
  }

  // The organization and independent approvers must be distinct people so that a
  // single compromised actor cannot satisfy both sides.
  const hasDistinctPair = organizationReady.some((org) =>
    independentReady.some((ind) => ind.userId !== org.userId),
  );
  if (
    organizationReady.length > 0 &&
    independentReady.length > 0 &&
    !hasDistinctPair
  ) {
    reasons.push('independent_parties_required');
  }

  if (reasons.length === 0) {
    controls.push('production_multi_party_emergency');
  }
  return decide(environment, reasons, controls);
}

// ---------------------------------------------------------------------------
// Production-gate prerequisites (Req 24.4)
// ---------------------------------------------------------------------------

export interface ProductionApprovalPrerequisite {
  readonly id: string;
  readonly description: string;
}

/**
 * The approval controls that MUST be enforceable before mainnet activation is
 * ever approved. The production-gate evaluator (Task 15) records these as
 * mandatory prerequisites; single-admin authorization is explicitly NOT among
 * them because it is testnet-only.
 */
export const PRODUCTION_APPROVAL_PREREQUISITES: readonly ProductionApprovalPrerequisite[] =
  Object.freeze([
    Object.freeze({
      id: 'maker_checker_disbursement',
      description:
        'Disbursement authorization requires maker/checker approval with non-self-approval by distinct authorized signers.',
    }),
    Object.freeze({
      id: 'multi_party_emergency_control',
      description:
        'Emergency pause/resume requires both organization and independent platform/security authorization by distinct parties.',
    }),
  ]);

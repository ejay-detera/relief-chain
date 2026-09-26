/**
 * Program status workflow (ORG-04, database-vocabulary implementation).
 *
 * The backlog names its own stages, but the database, the reconciler, and all
 * server queries run on a different vocabulary (see sprint §8 for the mapping).
 * This module encodes who may move a program where:
 *
 * - draft, funding, funding_failed → the treasury funding/activation flow owns
 *   these (prepare/submit-cash-activation + reconcile-stellar markFunded).
 *   The client never writes them; it only launches the flow.
 * - active → closing, closing → closed → direct, manager-initiated writes
 *   (RLS may additionally require a recent step-up for active rows).
 * - completed is NOT a database state (lifecycle constraint) — the legacy
 *   Completed button is replaced by the Close flow. completed/closed and any
 *   unknown value are terminal for this UI.
 *
 * Pure: no imports, no I/O — unit-tested via scripts/tests.
 */

export type ProgramLifecycleStatus =
  | 'draft'
  | 'funding'
  | 'funding_failed'
  | 'active'
  | 'closing'
  | 'closed';

export type ProgramStatusAction =
  | Readonly<{
      kind: 'flow';
      flow: 'activation';
      label: string;
      headline: string;
    }>
  | Readonly<{
      kind: 'write';
      to: 'closing' | 'closed';
      label: string;
      headline: string;
    }>;

export type ProgramActivationFields = Readonly<{
  name: string;
  totalBudget: number;
  aidType: string;
  maxBeneficiaries: number;
}>;

/**
 * The valid next actions for a program in `status` (database truth, not the
 * display badge). Empty for terminal or unknown states.
 */
export const programStatusActions = (status: string): readonly ProgramStatusAction[] => {
  switch (status) {
    case 'draft':
      return [{ kind: 'flow', flow: 'activation', label: 'Fund & Activate', headline: 'Start treasury funding and activation' }];
    case 'funding':
      return [{ kind: 'flow', flow: 'activation', label: 'Complete Activation', headline: 'Resume funding and reconcile to active' }];
    case 'funding_failed':
      return [{ kind: 'flow', flow: 'activation', label: 'Retry Funding', headline: 'Retry treasury funding and activation' }];
    case 'active':
      return [{ kind: 'write', to: 'closing', label: 'Begin Closing', headline: 'Begin closing' }];
    case 'closing':
      return [{ kind: 'write', to: 'closed', label: 'Close Program', headline: 'Close program' }];
    default:
      return [];
  }
};

/** True only for the two manager-initiated direct writes (closing/closed). */
export const isAllowedDirectWrite = (from: string, to: string): boolean => {
  if (to === 'closing') return from === 'active';
  if (to === 'closed') return from === 'closing';
  return false;
};

/** Activation gate (ORG-04 intent): a program going live must be complete. */
export const activationBlockers = (program: ProgramActivationFields): readonly string[] => {
  const blockers: string[] = [];
  if (!program.name.trim()) blockers.push('a program name');
  if (!(program.totalBudget > 0)) blockers.push('a positive budget');
  if (!program.aidType.trim()) blockers.push('an aid type');
  if (!(program.maxBeneficiaries > 0)) blockers.push('a positive beneficiary count');
  return blockers;
};

/**
 * Validates a manager-initiated direct status write, returning null when it
 * may proceed or an explanatory message when it must be blocked. Anything
 * involving draft/funding/funding_failed/active-as-target belongs to the
 * activation flow or the reconciler — never to a direct write.
 */
export const validateDirectWrite = (
  from: string,
  to: string,
): string | null => {
  if (from === to) return 'The program is already in this status.';
  if (isAllowedDirectWrite(from, to)) return null;
  if (to === 'active' || to === 'funding' || to === 'funding_failed' || to === 'draft') {
    return `Status '${to}' is reached through the funding and activation flow or reconciliation, not by direct edit.`;
  }
  const allowed = programStatusActions(from);
  if (allowed.length === 0) {
    return `Programs in status '${from}' have no further transitions.`;
  }
  return `Programs cannot move from '${from}' to '${to}' by direct edit.`;
};

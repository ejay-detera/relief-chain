import { EnrolledProgram } from '@/types/wallet';

/**
 * Selects the active program summary for the Beneficiary Dashboard per
 * Requirement 4, Criterion 4: the most recently created Enrollment with
 * `approval_status` equal to "Approved", tie-broken by the higher id.
 */
export function selectActiveProgram(programs: EnrolledProgram[]): EnrolledProgram | null {
  const approved = programs.filter((program) => program.approvalStatus === 'Approved');
  if (approved.length === 0) return null;

  return approved.reduce((mostRecent, candidate) => {
    const candidateTime = new Date(candidate.createdAt).getTime();
    const mostRecentTime = new Date(mostRecent.createdAt).getTime();

    if (candidateTime > mostRecentTime) return candidate;
    if (candidateTime < mostRecentTime) return mostRecent;

    // Tie-break: higher id wins. IDs are UUID strings, so compare lexicographically
    // as a stable, deterministic fallback (UUIDs are not numerically ordered).
    return candidate.id > mostRecent.id ? candidate : mostRecent;
  });
}

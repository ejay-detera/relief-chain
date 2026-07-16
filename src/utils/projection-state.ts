import type { ProjectionMetadata, ProjectionState } from '@/types/projection';

/**
 * The reconciliation metadata every projection row carries. A projection is only
 * ever shown with its provenance (`as_of_ledger`, `reconciled_at`) and trust
 * state (`is_stale`, `is_quarantined`) attached, so the UI can never present a
 * reconciled value as fresh or authoritative when it is not (Requirements 18.6,
 * 21.2, 21.3).
 */
export type ProjectionRowMeta = Readonly<{
  reconciled_at: string;
  as_of_ledger: number;
  is_stale: boolean;
  is_quarantined: boolean;
  quarantine_issue_id: string | null;
}>;

const STALE_REASON = 'Showing the last reconciled value while newer ledger data is pending.';
const QUARANTINE_REASON = 'A reconciliation mismatch is under operator review.';

/** Oldest reconciliation across the rows drives the freshness shown to the user. */
const oldest = <TRow extends ProjectionRowMeta>(rows: readonly TRow[]): TRow =>
  rows.reduce((acc, row) => (row.reconciled_at < acc.reconciled_at ? row : acc), rows[0]);

/**
 * Converts one or more reconciled projection rows into an explicit
 * {@link ProjectionState}. An empty result is `empty`, a quarantined row wins
 * over a stale row, and a healthy set is `current`. A failed read is handled by
 * the caller as `unavailable`; it is never converted into a populated success
 * (Requirements 18.1, 21.2, 21.4).
 */
export function buildProjectionState<TRow extends ProjectionRowMeta, TData>(
  rows: readonly TRow[],
  map: (rows: readonly TRow[]) => TData,
): ProjectionState<TData> {
  if (rows.length === 0) {
    return { status: 'empty', checkedAt: new Date().toISOString() };
  }

  const reference = oldest(rows);
  const metadata: ProjectionMetadata = {
    asOfLedger: reference.as_of_ledger,
    reconciledAt: reference.reconciled_at,
  };
  const data = map(rows);

  const quarantined = rows.find((row) => row.is_quarantined);
  if (quarantined) {
    return {
      status: 'quarantined',
      data,
      metadata,
      issueId: quarantined.quarantine_issue_id ?? 'unknown',
      reason: QUARANTINE_REASON,
    };
  }

  if (rows.some((row) => row.is_stale)) {
    return { status: 'stale', data, metadata, reason: STALE_REASON };
  }

  return { status: 'current', data, metadata };
}

/** Formats a reconciliation timestamp for display, tolerant of malformed input. */
export const reconciledAtLabel = (reconciledAt: string): string => {
  const parsed = new Date(reconciledAt);
  return Number.isNaN(parsed.getTime())
    ? 'Reconciled recently'
    : `Reconciled ${parsed.toLocaleString()}`;
};

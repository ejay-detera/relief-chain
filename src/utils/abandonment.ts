// Abandonment disposition helpers for stranded program cash entitlements.
//
// A stranded entitlement (e.g. disbursed to a lost wallet) is never deleted,
// zeroed, or quarantined with fabricated evidence. It is marked abandoned with
// additive metadata (flag + note + evidence ref + actor/timestamp) while its
// distributed/redeemed history is preserved. Spendable sums exclude abandoned
// rows so the dashboard agrees with chain truth instead of silently
// overstating. Testnet RCPHP has no monetary value; the invariant is honesty,
// not money movement.
//
// Validates the display rule: spendable sums (dashboard, funding sources,
// review screens) exclude abandoned rows; abandoned rows render separately
// with their history and note. Live-vs-reconciled agreement is the invariant:
// after disposition, spendable sums must equal chain.

import type { StroopAmount } from '@/types/blockchain';

/** Minimal shape any projection/entitlement row carries for disposition. */
export type AbandonableRow = Readonly<{
  availableStroops: StroopAmount;
  isAbandoned?: boolean | null;
  abandonmentNote?: string | null;
}>;

/** Full history a greyed abandoned section shows (never rewritten). */
export type AbandonedHistoryRow = AbandonableRow &
  Readonly<{
    programId: string;
    distributedStroops: StroopAmount;
    redeemedStroops: StroopAmount;
    refundedStroops?: StroopAmount | null;
  }>;

/** True only when the row is explicitly marked abandoned with a human note. */
export const isAbandonedRow = (row: AbandonableRow): boolean =>
  row.isAbandoned === true &&
  typeof row.abandonmentNote === 'string' &&
  row.abandonmentNote.trim().length > 0;

/** Spendable rows only; abandoned rows are excluded, never deleted. */
export const excludeAbandonedRows = <TRow extends AbandonableRow>(
  rows: readonly TRow[],
): TRow[] => rows.filter((row) => !isAbandonedRow(row));

/** Splits rows into spendable and abandoned while preserving both histories. */
export const splitSpendableAbandoned = <TRow extends AbandonableRow>(
  rows: readonly TRow[],
): { readonly spendable: TRow[]; readonly abandoned: TRow[] } => {
  const spendable: TRow[] = [];
  const abandoned: TRow[] = [];
  for (const row of rows) {
    if (isAbandonedRow(row)) abandoned.push(row);
    else spendable.push(row);
  }
  return { spendable, abandoned };
};

/**
 * Sums spendable cash across rows. Abandoned rows never contribute, so the
 * dashboard cannot silently overstate what the user actually holds.
 */
export const sumSpendableCashStroops = <TRow extends AbandonableRow>(
  rows: readonly TRow[],
): number => {
  let total = 0;
  for (const row of rows) {
    if (isAbandonedRow(row)) continue;
    const value = Number(row.availableStroops);
    if (!Number.isSafeInteger(value) || value < 0) continue;
    const next = total + value;
    if (!Number.isSafeInteger(next)) continue;
    total = next;
  }
  return total;
};

/** Live-vs-reconciled agreement: spendable must equal chain truth exactly. */
export const liveReconciledAgrees = (
  spendableStroops: number,
  chainStroops: number,
): boolean => spendableStroops === chainStroops;

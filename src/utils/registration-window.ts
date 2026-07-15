// Implements the Registration_Window truth table from
// .kiro/specs/beneficiary-verification/requirements.md (Requirement 2, Criteria 1-7).
// All comparisons are at day-level granularity (time-of-day is ignored).

export type RegistrationStatus = 'Not Yet Open' | 'Closed' | 'Open';

export type RegistrationWindowResult = {
  status: RegistrationStatus;
  canApply: boolean;
};

const startOfDay = (date: Date): number => {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy.getTime();
};

const parseDateOnly = (value: string | null): number | null => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return startOfDay(parsed);
};

/**
 * Determines whether registration is open for a Program, given its
 * `registration_open` / `registration_close` date columns (nullable ISO date strings).
 */
export function getRegistrationStatus(
  registrationOpen: string | null,
  registrationClose: string | null,
  now: Date = new Date()
): RegistrationWindowResult {
  const today = startOfDay(now);
  const open = parseDateOnly(registrationOpen);
  const close = parseDateOnly(registrationClose);

  // Criterion 7: open date later than close date -> not open, regardless of today.
  if (open !== null && close !== null && open > close) {
    return { status: 'Closed', canApply: false };
  }

  // Criterion 1: registration_open is later than today -> Not Yet Open.
  if (open !== null && open > today) {
    return { status: 'Not Yet Open', canApply: false };
  }

  // Criterion 2: registration_close is earlier than today -> Closed.
  if (close !== null && close < today) {
    return { status: 'Closed', canApply: false };
  }

  // Criterion 3: both null -> Open indefinitely.
  // Criterion 4: today falls between open and close inclusive -> Open.
  // Criterion 5: open is null, close is non-null and not earlier than today -> Open.
  // Criterion 6: close is null, open is non-null and not later than today -> Open.
  // All remaining cases (having failed the Not Yet Open / Closed checks above) are Open.
  return { status: 'Open', canApply: true };
}

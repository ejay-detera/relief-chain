// Beneficiary balance abandonment disposition (shared, pure + service-owned).
//
// A stranded cash entitlement is marked abandoned with additive metadata while
// its distributed/redeemed history is preserved. The write reuses the row's
// existing reconciliation evidence (run id, reconciled_at, as_of_ledger) and
// bumps projection_version by one, so `validate_financial_projection` still
// passes without fabricating any run or issue row. Distributed/redeemed are
// never rewritten, so the available=distributed-redeemed+refunded invariant
// holds. Idempotent: an already-abandoned row returns `already_abandoned`
// without a write. Operator-approved only; beneficiaries can never self-serve
// (enforced in the Edge Function via `requireOrganizationRole`).

export interface AbandonableProjectionRow {
  readonly id: string;
  readonly organization_id: string;
  readonly program_id: string;
  readonly beneficiary_identity_id: string;
  readonly asset_code: string;
  readonly aid_type: 'cash' | 'voucher';
  readonly allocated_stroops: number;
  readonly distributed_stroops: number;
  readonly redeemed_stroops: number;
  readonly refunded_stroops: number;
  readonly available_balance_stroops: number;
  readonly confirmed_transaction_count: number;
  readonly reconciliation_run_id: string;
  readonly as_of_ledger: number;
  readonly reconciled_at: string;
  readonly projection_version: number;
  readonly is_quarantined: boolean;
  readonly quarantine_issue_id: string | null;
  readonly is_abandoned: boolean | null;
  readonly abandoned_at: string | null;
  readonly abandoned_by: string | null;
  readonly abandonment_note: string | null;
  readonly abandonment_evidence_ref: string | null;
}

export interface AbandonmentInput {
  readonly note: string;
  readonly evidenceRef?: string | null;
  readonly operatorUserId: string;
  readonly abandonedAt?: string | null;
}

export type AbandonmentValidation =
  | { readonly ok: true; readonly note: string; readonly evidenceRef: string | null }
  | { readonly ok: false; readonly code: string; readonly message: string };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const validateAbandonmentInput = (input: AbandonmentInput): AbandonmentValidation => {
  const note = (input.note ?? '').trim();
  if (note.length < 1 || note.length > 2000) {
    return {
      ok: false,
      code: 'validation_failed',
      message: 'An abandonment note (1-2000 characters) is required.',
    };
  }
  const evidenceRef = (input.evidenceRef ?? null)?.trim() || null;
  if (evidenceRef !== null && (evidenceRef.length < 1 || evidenceRef.length > 500)) {
    return {
      ok: false,
      code: 'validation_failed',
      message: 'The evidence reference must be 1-500 characters when provided.',
    };
  }
  if (!UUID_PATTERN.test(input.operatorUserId ?? '')) {
    return { ok: false, code: 'validation_failed', message: 'A valid operator user id is required.' };
  }
  if (input.abandonedAt !== undefined && input.abandonedAt !== null) {
    const parsed = Date.parse(input.abandonedAt);
    if (!Number.isFinite(parsed)) {
      return { ok: false, code: 'validation_failed', message: 'The abandonment timestamp is invalid.' };
    }
  }
  return { ok: true, note, evidenceRef };
};

export type AbandonmentOutcome =
  | { readonly status: 'already_abandoned'; readonly rowId: string }
  | {
      readonly status: 'ready';
      readonly rowId: string;
      readonly update: {
        readonly is_abandoned: true;
        readonly abandoned_at: string;
        readonly abandoned_by: string;
        readonly abandonment_note: string;
        readonly abandonment_evidence_ref: string | null;
        readonly projection_version: number;
      };
    }
  | { readonly status: 'rejected'; readonly code: string; readonly message: string };

/**
 * Builds the service-owned abandonment UPDATE for one projection row.
 * Only cash rows may be abandoned (voucher rail untouched). History fields
 * are never changed; only disposition metadata plus a monotonic version bump.
 */
export const planAbandonmentUpdate = (
  row: AbandonableProjectionRow,
  input: AbandonmentInput,
  nowIso: string = new Date().toISOString(),
): AbandonmentOutcome => {
  if (row.is_abandoned === true) {
    return { status: 'already_abandoned', rowId: row.id };
  }
  if (row.aid_type !== 'cash') {
    return {
      status: 'rejected',
      code: 'validation_failed',
      message: 'Only cash entitlements can be marked abandoned.',
    };
  }
  const validation = validateAbandonmentInput(input);
  if (validation.ok === false) {
    return { status: 'rejected', code: validation.code, message: validation.message };
  }
  const abandonedAt = input.abandonedAt ?? nowIso;
  if (!Number.isFinite(Date.parse(abandonedAt))) {
    return { status: 'rejected', code: 'validation_failed', message: 'The abandonment timestamp is invalid.' };
  }
  return {
    status: 'ready',
    rowId: row.id,
    update: {
      is_abandoned: true,
      abandoned_at: abandonedAt,
      abandoned_by: input.operatorUserId,
      abandonment_note: validation.note,
      abandonment_evidence_ref: validation.evidenceRef,
      projection_version: row.projection_version + 1,
    },
  };
};

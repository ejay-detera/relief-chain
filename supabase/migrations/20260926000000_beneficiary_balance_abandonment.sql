-- Abandonment disposition for stranded program cash entitlements.
--
-- A stranded entitlement (e.g. disbursed to a lost wallet) is never deleted,
-- zeroed, or quarantined with fabricated evidence. This migration adds
-- additive disposition metadata so an operator-approved action can mark one
-- projection row abandoned while preserving its distributed/redeemed history.
-- Spendable sums exclude abandoned rows; abandoned rows render separately
-- with their history and note. Testnet RCPHP has no monetary value.
--
-- Why each guard is satisfied honestly (no trigger/RLS weakening):
--   - New columns are additive with defaults that satisfy the new check for
--     all existing rows (is_abandoned=false, all abandonment fields null).
--   - `private.validate_financial_projection()` is untouched. An abandonment
--     UPDATE reuses the row's existing reconciliation_run_id / reconciled_at /
--     as_of_ledger, enrollment, and program/asset policy, and bumps
--     projection_version by exactly one, so the trigger's "matching completed
--     reconciliation evidence", enrollment, policy, and monotonic-version
--     requirements still pass without fabricating any run or issue row.
--   - Distributed/redeemed/refunded/available are never rewritten by the
--     disposition (available=distributed-redeemed+refunded invariant intact).
--   - RLS is unchanged: authenticated SELECT policies still return all rows
--     (spendable + abandoned) with the same USING clauses; no authenticated
--     INSERT/UPDATE/DELETE is granted. Writes stay service_role-only through
--     the operator-gated Edge Function (`abandon-beneficiary-balance`), which
--     enforces organization_administrator/finance_approver/program_manager via
--     `requireOrganizationRole`. No narrow authenticated write policy is added
--     because least privilege (service-only writes) is stricter.
--   - New indexes are additive WHERE clauses; existing indexes are untouched.
--
-- PUSH-REQUIRED: run `supabase db push` (NOT run here) to apply to hosted.

alter table public.beneficiary_balance_projection
  add column if not exists is_abandoned boolean not null default false,
  add column if not exists abandoned_at timestamptz,
  add column if not exists abandoned_by uuid,
  add column if not exists abandonment_note text,
  add column if not exists abandonment_evidence_ref text;

-- Disposition state must be complete or empty; a note is required when abandoned.
alter table public.beneficiary_balance_projection
  add constraint beneficiary_balance_projection_abandonment_check check (
    (
      not is_abandoned
      and abandoned_at is null
      and abandoned_by is null
      and abandonment_note is null
      and abandonment_evidence_ref is null
    )
    or (
      is_abandoned
      and abandoned_at is not null
      and abandoned_by is not null
      and abandonment_note is not null
      and length(btrim(abandonment_note)) between 1 and 2000
      and (
        abandonment_evidence_ref is null
        or length(btrim(abandonment_evidence_ref)) between 1 and 500
      )
    )
  );

-- Spendable dashboard predicate (abandoned rows excluded from sums).
create index if not exists beneficiary_projection_spendable_dashboard_idx
  on public.beneficiary_balance_projection (beneficiary_identity_id, reconciled_at desc, program_id)
  where not is_quarantined and not is_abandoned;

-- Abandoned section predicate (greyed history with note).
create index if not exists beneficiary_projection_abandoned_idx
  on public.beneficiary_balance_projection (beneficiary_identity_id, abandoned_at desc, program_id)
  where is_abandoned;

comment on column public.beneficiary_balance_projection.is_abandoned is
  'Operator-approved disposition for stranded cash (e.g. lost wallet). Excluded from spendable sums; history preserved.';
comment on column public.beneficiary_balance_projection.abandoned_at is
  'Timestamp of the operator-approved abandonment action.';
comment on column public.beneficiary_balance_projection.abandoned_by is
  'Operator user id that approved the abandonment (never a beneficiary self-service).';
comment on column public.beneficiary_balance_projection.abandonment_note is
  'Human-readable reason, including the stranded wallet and waiver reference.';
comment on column public.beneficiary_balance_projection.abandonment_evidence_ref is
  'Free-text operator evidence reference (e.g. waiver id); never a fabricated reconciliation run or issue id.';

-- Close two US2 gaps:
--
-- 1. "Each status change is timestamped" was false — only `created_at` and
--    `approved_at` existed on `enrollments`; a rejection reused `approved_at`
--    for its displayed timestamp (`application-status-service.ts`
--    `buildTimeline`, `row.approved_at ?? row.created_at`), which is
--    semantically wrong for a rejection. This adds a real `rejected_at`.
--
-- 2. "If my application is rejected... the rejection reason [is] shown
--    clearly" assumed a reason always exists, but `rejection_remarks` was
--    optional in `updateEnrollmentStatus` — a rejection could be recorded
--    with no reason at all, and the UI silently substituted a generic
--    fallback string. This makes a non-empty reason mandatory at the
--    database level on every transition into 'Rejected'.

alter table public.enrollments
  add column if not exists rejected_at timestamptz;

create or replace function private.set_enrollment_rejected_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.approval_status = 'Rejected'
    and (tg_op = 'INSERT' or old.approval_status is distinct from 'Rejected') then
    if new.rejection_remarks is null or length(btrim(new.rejection_remarks)) = 0 then
      raise exception 'a rejection reason is required when rejecting an enrollment'
        using errcode = '23514';
    end if;
    new.rejected_at := coalesce(new.rejected_at, now());
  elsif new.approval_status <> 'Rejected' then
    -- Reopening (e.g. an approved appeal resetting to Pending, see
    -- resolve_beneficiary_appeal()) clears the stale rejection timestamp so
    -- a later re-rejection gets its own fresh value rather than silently
    -- keeping the first one.
    new.rejected_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists enrollments_set_rejected_at on public.enrollments;
create trigger enrollments_set_rejected_at
before insert or update of approval_status on public.enrollments
for each row execute function private.set_enrollment_rejected_at();

comment on column public.enrollments.rejected_at is
  'Set the first time approval_status transitions to Rejected; cleared if the enrollment is later reopened. BEN-02''s rejection timestamp should read this column, not approved_at.';
comment on function private.set_enrollment_rejected_at() is
  'Enforces BEN-02: rejection_remarks is mandatory on any transition into Rejected, and stamps rejected_at with the real moment of rejection rather than reusing approved_at.';

-- ---------------------------------------------------------------------------
-- Let a beneficiary read their own distribution_recipients rows. Previously
-- only "Organization members can view distribution recipients" existed
-- (20260716080000) — a beneficiary querying their own aid-release timestamp
-- (confirmed_at) got silently empty results from RLS, not an error. This
-- mirrors the existing beneficiary-can-view-own pattern already used for
-- `financial_intents` and `transaction_attempts` in the same migration.
-- ---------------------------------------------------------------------------
create policy "Beneficiaries can view own distribution recipients"
on public.distribution_recipients for select to authenticated
using (
  exists (
    select 1 from public.beneficiary_identities identity
    where identity.id = beneficiary_identity_id
      and identity.user_id = (select auth.uid())
  )
);

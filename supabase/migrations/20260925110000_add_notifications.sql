-- In-app notifications for beneficiaries, organizations, and merchants.
--
-- Three triggers create notifications server-side (security definer, never
-- client-writable — the anon/authenticated grant is select + update-own-read-
-- status only):
--   1. enrollments INSERT -> notify the applying beneficiary ("submitted") and
--      every active organization_administrator/program_manager/
--      beneficiary_verifier member of that program's organization
--      ("new applicant").
--   2. enrollments UPDATE where approval_status changes to Approved/Rejected
--      -> notify the beneficiary of the decision.
--   3. settlements INSERT/UPDATE where status becomes 'confirmed' -> notify
--      the receiving merchant's profile that a payment settled.
--
-- Notifications are informational only: they never gate a workflow, and
-- deleting/losing one has no financial consequence. They deliberately do NOT
-- carry the append-only/immutability guarantees applied to audit_events or
-- program_policy_events elsewhere in this schema.

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (
    type in (
      'application_submitted',
      'application_approved',
      'application_rejected',
      'new_applicant',
      'merchant_payment_received'
    )
  ),
  title text not null check (length(btrim(title)) between 1 and 200),
  body text not null check (length(btrim(body)) between 1 and 1000),
  data jsonb not null default '{}'::jsonb,
  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_read_state_check check (
    (is_read and read_at is not null) or (not is_read and read_at is null)
  )
);

create index notifications_recipient_created_idx
  on public.notifications (recipient_id, created_at desc);
create index notifications_recipient_unread_idx
  on public.notifications (recipient_id, is_read)
  where not is_read;

alter table public.notifications enable row level security;

-- A recipient may read their own notifications and mark them read, but never
-- insert or delete — creation is exclusively the triggers below (security
-- definer) and the service role.
create policy "Recipients can view their own notifications"
on public.notifications for select
to authenticated
using (recipient_id = (select auth.uid()));

create policy "Recipients can mark their own notifications read"
on public.notifications for update
to authenticated
using (recipient_id = (select auth.uid()))
with check (recipient_id = (select auth.uid()));

revoke all privileges on table public.notifications from anon, authenticated;
grant select, update on table public.notifications to authenticated;
grant all privileges on table public.notifications to service_role;

comment on table public.notifications is
  'Informational in-app notifications. Client-writable for read-state only; all rows are created by triggers or the service role.';

-- RLS policies cannot restrict which COLUMNS an update touches, only which
-- ROWS are visible. A client with UPDATE on this table could otherwise
-- rewrite title/body/type/data on their own notifications. Enforce that a
-- non-service-role update may only flip is_read/read_at.
create or replace function private.restrict_notification_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) = 'service_role' then
    return new;
  end if;

  if new.recipient_id is distinct from old.recipient_id
    or new.type is distinct from old.type
    or new.title is distinct from old.title
    or new.body is distinct from old.body
    or new.data is distinct from old.data
    or new.created_at is distinct from old.created_at then
    raise exception 'only is_read/read_at may be updated on a notification'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all privileges on function private.restrict_notification_update() from public, anon, authenticated;

create trigger notifications_restrict_update
before update on public.notifications
for each row execute function private.restrict_notification_update();

-- ---------------------------------------------------------------------------
-- Helper: enqueue one notification. security definer so trigger functions can
-- write here regardless of the acting user's own row-level grants.
-- ---------------------------------------------------------------------------
create or replace function private.enqueue_notification(
  p_recipient_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_data jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (recipient_id, type, title, body, data)
  values (p_recipient_id, p_type, p_title, p_body, coalesce(p_data, '{}'::jsonb));
$$;

revoke all privileges on function private.enqueue_notification(uuid, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function private.enqueue_notification(uuid, text, text, text, jsonb)
  to service_role;

-- ---------------------------------------------------------------------------
-- 1 & 2: enrollments -> application submitted / approved / rejected / new applicant
-- ---------------------------------------------------------------------------
create or replace function private.notify_on_enrollment_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  program_row public.programs;
  member_row record;
begin
  select * into program_row from public.programs where id = new.program_id;
  if not found then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.beneficiary_id is not null then
      perform private.enqueue_notification(
        new.beneficiary_id,
        'application_submitted',
        'Application submitted',
        format('Your application to "%s" was submitted and is pending review.', program_row.name),
        jsonb_build_object('programId', new.program_id, 'enrollmentId', new.id)
      );
    end if;

    for member_row in
      select membership.user_id
      from public.organization_memberships membership
      where membership.organization_id = program_row.organization_id
        and membership.is_active
        and membership.role in (
          'organization_administrator', 'program_manager', 'beneficiary_verifier'
        )
    loop
      perform private.enqueue_notification(
        member_row.user_id,
        'new_applicant',
        'New applicant',
        format('A new applicant applied to "%s".', program_row.name),
        jsonb_build_object('programId', new.program_id, 'enrollmentId', new.id)
      );
    end loop;

    return new;
  end if;

  -- tg_op = 'UPDATE': notify only on a genuine transition into Approved/Rejected.
  if new.approval_status is distinct from old.approval_status
    and new.beneficiary_id is not null then
    if new.approval_status = 'Approved' then
      perform private.enqueue_notification(
        new.beneficiary_id,
        'application_approved',
        'Application approved',
        format('Your application to "%s" was approved.', program_row.name),
        jsonb_build_object('programId', new.program_id, 'enrollmentId', new.id)
      );
    elsif new.approval_status = 'Rejected' then
      perform private.enqueue_notification(
        new.beneficiary_id,
        'application_rejected',
        'Application rejected',
        format('Your application to "%s" was rejected.', program_row.name),
        jsonb_build_object('programId', new.program_id, 'enrollmentId', new.id)
      );
    end if;
  end if;

  return new;
end;
$$;

revoke all privileges on function private.notify_on_enrollment_change() from public, anon, authenticated;

create trigger enrollments_notify_on_change
after insert or update on public.enrollments
for each row execute function private.notify_on_enrollment_change();

-- ---------------------------------------------------------------------------
-- 3: settlements -> merchant payment received (on confirmation only)
-- ---------------------------------------------------------------------------
create or replace function private.notify_on_settlement_confirmed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  merchant_profile_id uuid;
  amount_display text;
begin
  if new.status <> 'confirmed' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'confirmed' then
    -- Already notified when it first became confirmed; never re-notify.
    return new;
  end if;

  select profile_id into merchant_profile_id
  from public.merchant_entities
  where id = new.merchant_id;

  if merchant_profile_id is null then
    return new;
  end if;

  amount_display := to_char(new.amount_stroops::numeric / 10000000.0, 'FM999999999990.0000000');

  perform private.enqueue_notification(
    merchant_profile_id,
    'merchant_payment_received',
    'Payment received',
    format('You received a payment of %s RCPHP.', amount_display),
    jsonb_build_object('settlementId', new.id, 'amountStroops', new.amount_stroops::text)
  );

  return new;
end;
$$;

revoke all privileges on function private.notify_on_settlement_confirmed() from public, anon, authenticated;

create trigger settlements_notify_on_confirmed
after insert or update on public.settlements
for each row execute function private.notify_on_settlement_confirmed();

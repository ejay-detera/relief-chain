-- Close the US8 CSV-import dedupe gap.
--
-- Previously `createPendingSmsInvites` unconditionally inserted every parsed
-- CSV row into `pending_sms_invites` with no check against existing invites
-- or existing beneficiary accounts: re-uploading the same CSV created
-- duplicate invite rows every time, and a person already registered on
-- ReliefChain got a fresh "activate your account" invite row indistinguishable
-- from a brand-new beneficiary. The client-side dedupe added alongside this
-- migration (`src/services/sms-service.ts`) handles the common path; this
-- migration adds the database-level backstop so the invariant holds even if
-- a future caller inserts directly.
--
-- Phone matching uses the same last-10-digit normalization as
-- `private.normalize_phone()` (20261002120000_enforce_private_program_access.sql)
-- so "+639171234567" / "09171234567" / "9171234567" are treated as one number.

-- A generated column lets a unique index be built directly on the
-- normalized phone, rather than needing a functional unique index (which
-- Postgres also supports, but a generated column keeps the normalized form
-- introspectable in ordinary queries too).
alter table public.pending_sms_invites
  add column if not exists normalized_phone text
  generated always as (private.normalize_phone(phone_number)) stored;

-- Backfill is automatic for a generated column on existing rows; no explicit
-- update needed. Guard against any pre-existing duplicates (there were none
-- as of this migration, confirmed via live introspection) before the unique
-- index is added, so this migration fails loudly rather than silently if
-- that assumption no longer holds.
do $$
declare
  v_dupe_count integer;
begin
  select count(*) into v_dupe_count
  from (
    select program_id, normalized_phone
    from public.pending_sms_invites
    where normalized_phone <> ''
    group by program_id, normalized_phone
    having count(*) > 1
  ) dupes;

  if v_dupe_count > 0 then
    raise exception
      'pending_sms_invites has % existing duplicate (program_id, phone) pairs — resolve manually before this migration can add its unique index',
      v_dupe_count;
  end if;
end
$$;

create unique index if not exists pending_sms_invites_program_phone_key
  on public.pending_sms_invites (program_id, normalized_phone)
  where normalized_phone <> '';

comment on column public.pending_sms_invites.normalized_phone is
  'Last 10 digits of phone_number, used to dedupe invites regardless of +63/0/bare-digit formatting. See private.normalize_phone().';

-- `new_applicant` is reserved for notifying org staff about a new applicant
-- (see 20260925110000_add_notifications.sql) — reusing it here for a
-- beneficiary-facing message would be semantically wrong, so this adds a
-- dedicated type instead.
alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check check (
    type in (
      'application_submitted',
      'application_approved',
      'application_rejected',
      'new_applicant',
      'merchant_payment_received',
      'aid_released',
      'appeal_submitted',
      'appeal_decision',
      'redemption_confirmed',
      'added_to_program_list'
    )
  );

-- ---------------------------------------------------------------------------
-- Notify an already-registered beneficiary in-app when a CSV import targets
-- them, instead of the SMS activation flow meant for people without an
-- account yet. `createPendingSmsInvites` sets `status = 'registered'`
-- directly on insert for a phone match; this trigger fires only for that
-- case to avoid guessing intent from an UPDATE.
-- ---------------------------------------------------------------------------
create or replace function private.notify_on_registered_sms_invite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  beneficiary_user_id uuid;
  program_name text;
begin
  if new.status <> 'registered' then
    return new;
  end if;

  select id into beneficiary_user_id
  from public.profiles
  where role = 'beneficiary'
    and mobile_number is not null
    and private.normalize_phone(mobile_number) = new.normalized_phone
  limit 1;

  if beneficiary_user_id is null then
    return new;
  end if;

  select name into program_name from public.programs where id = new.program_id;

  perform private.enqueue_notification(
    beneficiary_user_id,
    'added_to_program_list',
    'You have been added to a program',
    format(
      'An organization has added you to the targeted beneficiary list for "%s". Check your assistance list to see if you need to apply.',
      coalesce(program_name, 'a relief program')
    ),
    jsonb_build_object('programId', new.program_id, 'pendingSmsInviteId', new.id)
  );

  return new;
end;
$$;

revoke all privileges on function private.notify_on_registered_sms_invite()
  from public, anon, authenticated;

create trigger pending_sms_invites_notify_on_registered
after insert on public.pending_sms_invites
for each row execute function private.notify_on_registered_sms_invite();

comment on function private.notify_on_registered_sms_invite() is
  'Notifies an already-registered beneficiary in-app when a CSV import adds them to a private program''s invite list, instead of sending the account-activation SMS meant for unregistered phone numbers.';

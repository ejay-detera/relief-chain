-- Close the US1 "duplicate registration" gap.
--
-- BEN-01 requires: "The system checks for likely duplicate registrations
-- (matching ID number or name + address) and flags them for staff review
-- rather than silently rejecting." Nothing in the schema or app did this —
-- the only related control (enrollments_beneficiary_identity_program_key /
-- _campaign_key, 20260716010000) prevents the SAME identity from
-- double-enrolling in the same program/campaign, which is a different
-- question, and it hard-rejects via a unique-index violation rather than
-- flagging. Two people could register today with identical gov_id numbers,
-- or identical name+address, with zero friction and zero visibility.
--
-- This adds:
--   1. `beneficiary_duplicate_flags` — one row per detected likely-duplicate
--      pair, keyed so the same pair is never flagged twice for the same
--      match reason.
--   2. A trigger on `profiles` that runs the check on every beneficiary
--      profile insert/update (covers both the initial `handle_new_user()`
--      insert and any later profile edit) and inserts a flag — it NEVER
--      raises, blocks, or rejects the write.
--   3. RLS so a flag is visible to a user with the `lgu` role, but only if
--      they already have organization-scoped visibility into at least one
--      of the two flagged profiles (reusing the existing
--      `private.is_profile_organization_member()` boundary rather than
--      granting a platform-wide duplicate feed to every organization).
--   4. A review RPC so staff can mark a flag reviewed (confirmed duplicate /
--      not a duplicate) with an audit trail, without ever deleting or
--      silently resolving it.

create table public.beneficiary_duplicate_flags (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  matched_profile_id uuid not null references public.profiles(id) on delete cascade,
  match_type text not null check (match_type in ('gov_id', 'name_address')),
  status text not null default 'pending'
    check (status in ('pending', 'confirmed_duplicate', 'not_duplicate')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  reviewer_notes text,
  detected_at timestamptz not null default now(),
  last_detected_at timestamptz not null default now(),
  constraint beneficiary_duplicate_flags_distinct_pair check (profile_id <> matched_profile_id),
  constraint beneficiary_duplicate_flags_review_state_check check (
    (status = 'pending' and reviewed_by is null and reviewed_at is null)
    or (status in ('confirmed_duplicate', 'not_duplicate') and reviewed_by is not null and reviewed_at is not null)
  ),
  -- One flag per unordered pair per match reason: normalize the pair so
  -- (A, B, 'gov_id') and (B, A, 'gov_id') collapse to the same row via the
  -- `least`/`greatest` generated columns below, instead of growing by one
  -- new flag every time either profile is updated.
  pair_low uuid generated always as (least(profile_id, matched_profile_id)) stored,
  pair_high uuid generated always as (greatest(profile_id, matched_profile_id)) stored,
  constraint beneficiary_duplicate_flags_pair_key unique (pair_low, pair_high, match_type)
);

create index beneficiary_duplicate_flags_profile_idx
  on public.beneficiary_duplicate_flags (profile_id);
create index beneficiary_duplicate_flags_matched_profile_idx
  on public.beneficiary_duplicate_flags (matched_profile_id);
create index beneficiary_duplicate_flags_pending_idx
  on public.beneficiary_duplicate_flags (status) where status = 'pending';

alter table public.beneficiary_duplicate_flags enable row level security;

-- Visible to an LGU/organization user only if they already have
-- organization-scoped visibility into at least one side of the pair — this
-- deliberately does not create a platform-wide duplicate feed in a codebase
-- with no Platform Admin role (see sprint-reliefchain.md §7.1).
create policy "Org members can view duplicate flags for visible profiles"
  on public.beneficiary_duplicate_flags for select
  to authenticated
  using (
    public.is_lgu((select auth.uid()))
    and (
      private.is_profile_organization_member(profile_id)
      or private.is_profile_organization_member(matched_profile_id)
    )
  );

revoke all privileges on table public.beneficiary_duplicate_flags from anon, authenticated;
grant select on table public.beneficiary_duplicate_flags to authenticated;
grant all privileges on table public.beneficiary_duplicate_flags to service_role;

comment on table public.beneficiary_duplicate_flags is
  'Likely-duplicate beneficiary registrations (matching gov_id, or matching normalized full_name + complete_address), surfaced for staff review (BEN-01). Detection never blocks or rejects a registration.';

-- ---------------------------------------------------------------------------
-- Detection trigger. `security definer` so it can see every beneficiary
-- profile for comparison regardless of the inserting/updating caller's own
-- RLS visibility (an ordinary beneficiary cannot read other beneficiaries'
-- profiles at all).
-- ---------------------------------------------------------------------------
create or replace function private.detect_beneficiary_duplicates()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  match_row record;
begin
  if new.role <> 'beneficiary' then
    return new;
  end if;

  -- Match 1: same government ID number (exact, case/whitespace-insensitive).
  if new.gov_id is not null and length(btrim(new.gov_id)) > 0 then
    for match_row in
      select id from public.profiles
      where role = 'beneficiary'
        and id <> new.id
        and gov_id is not null
        and upper(btrim(gov_id)) = upper(btrim(new.gov_id))
    loop
      insert into public.beneficiary_duplicate_flags (profile_id, matched_profile_id, match_type)
      values (new.id, match_row.id, 'gov_id')
      on conflict (pair_low, pair_high, match_type)
        do update set last_detected_at = now()
        where public.beneficiary_duplicate_flags.status = 'pending';
    end loop;
  end if;

  -- Match 2: same normalized full name + complete address.
  if new.full_name is not null and new.complete_address is not null
    and length(btrim(new.full_name)) > 0 and length(btrim(new.complete_address)) > 0 then
    for match_row in
      select id from public.profiles
      where role = 'beneficiary'
        and id <> new.id
        and full_name is not null
        and complete_address is not null
        and lower(regexp_replace(btrim(full_name), '\s+', ' ', 'g'))
          = lower(regexp_replace(btrim(new.full_name), '\s+', ' ', 'g'))
        and lower(regexp_replace(btrim(complete_address), '\s+', ' ', 'g'))
          = lower(regexp_replace(btrim(new.complete_address), '\s+', ' ', 'g'))
    loop
      insert into public.beneficiary_duplicate_flags (profile_id, matched_profile_id, match_type)
      values (new.id, match_row.id, 'name_address')
      on conflict (pair_low, pair_high, match_type)
        do update set last_detected_at = now()
        where public.beneficiary_duplicate_flags.status = 'pending';
    end loop;
  end if;

  return new;
end;
$$;

revoke all privileges on function private.detect_beneficiary_duplicates()
  from public, anon, authenticated;

create trigger profiles_detect_beneficiary_duplicates
after insert or update of gov_id, full_name, complete_address, role on public.profiles
for each row execute function private.detect_beneficiary_duplicates();

comment on function private.detect_beneficiary_duplicates() is
  'Flags (never blocks) likely-duplicate beneficiary registrations by matching gov_id or normalized full_name+complete_address against every other beneficiary profile. Runs after every insert/update so it also covers the initial handle_new_user() signup row.';

-- ---------------------------------------------------------------------------
-- Review RPC — same atomic, authorization-checked pattern as
-- `resolve_beneficiary_appeal()` / `review_requirement_response()`, so
-- `reviewed_by`/`reviewed_at` cannot be forged by a direct `.update()` call.
-- ---------------------------------------------------------------------------
create or replace function public.review_beneficiary_duplicate_flag(
  p_flag_id uuid,
  p_status text,
  p_reviewer_notes text default null
)
returns public.beneficiary_duplicate_flags
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_flag public.beneficiary_duplicate_flags;
  v_is_authorized boolean;
begin
  if p_status not in ('confirmed_duplicate', 'not_duplicate') then
    raise exception 'invalid duplicate flag review status: %', p_status using errcode = '22023';
  end if;

  select exists (
    select 1 from public.beneficiary_duplicate_flags f
    where f.id = p_flag_id
      and public.is_lgu((select auth.uid()))
      and (
        private.is_profile_organization_member(f.profile_id)
        or private.is_profile_organization_member(f.matched_profile_id)
      )
  ) into v_is_authorized;

  if not v_is_authorized then
    raise exception 'not authorized to review this duplicate flag' using errcode = '42501';
  end if;

  update public.beneficiary_duplicate_flags
  set status = p_status, reviewer_notes = p_reviewer_notes,
      reviewed_by = (select auth.uid()), reviewed_at = now()
  where id = p_flag_id
  returning * into v_flag;

  return v_flag;
end;
$$;

revoke all privileges on function public.review_beneficiary_duplicate_flag(uuid, text, text)
  from public, anon;
grant execute on function public.review_beneficiary_duplicate_flag(uuid, text, text)
  to authenticated, service_role;

comment on function public.review_beneficiary_duplicate_flag(uuid, text, text) is
  'Marks a beneficiary_duplicate_flags row confirmed_duplicate or not_duplicate with reviewer attribution, scoped to lgu users with organization visibility into at least one flagged profile.';

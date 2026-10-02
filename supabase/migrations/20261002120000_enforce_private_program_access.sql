-- Enforce `programs.is_private` and program geography server-side.
--
-- Until now `is_private` was written at program creation (eligibility.tsx)
-- and shown in the LGU summary screen, but no RLS policy ever read it: the
-- beneficiary-facing SELECT policy on `programs`
-- ("Beneficiaries can discover active programs to apply") and the
-- enrollment INSERT policy ("Beneficiaries can apply to programs") only
-- checked `status = 'active'`. Any authenticated beneficiary could discover
-- and enroll in a "private" CSV-targeted program whether or not they were on
-- the imported list. Likewise, the client-side geographic filter in
-- `program-applicability.ts` could be bypassed by calling the enrollment
-- insert directly, since the database performed no matching check of its
-- own.
--
-- This migration adds two scoping functions and wires both policies to them.
-- Both are `security definer` to read `profiles`/`program_barangays`/
-- `program_areas`/`pending_sms_invites` regardless of the caller's own
-- row-level grants, matching the existing `private.is_active_program()` /
-- `private.is_program_organization_member()` pattern elsewhere in the
-- schema.

-- ---------------------------------------------------------------------------
-- Phone matching helper: compares only the last 10 digits so that
-- "+639171234567", "09171234567", and "9171234567" are treated as the same
-- number regardless of which format the CSV import or the registration form
-- used.
-- ---------------------------------------------------------------------------
create or replace function private.normalize_phone(p_phone text)
returns text
language sql
immutable
set search_path = ''
as $$
  select right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10);
$$;

revoke all privileges on function private.normalize_phone(text) from public, anon;
grant execute on function private.normalize_phone(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Is this user on the program's imported beneficiary list?
-- Matches `pending_sms_invites.phone_number` (set at CSV import time) against
-- the user's own `profiles.mobile_number` (set at registration time).
-- ---------------------------------------------------------------------------
create or replace function private.is_program_invited_beneficiary(
  p_program_id uuid,
  p_user_id uuid
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.pending_sms_invites invite
    join public.profiles profile on profile.id = p_user_id
    where invite.program_id = p_program_id
      and profile.mobile_number is not null
      and private.normalize_phone(invite.phone_number) <> ''
      and private.normalize_phone(invite.phone_number)
        = private.normalize_phone(profile.mobile_number)
  );
$$;

revoke all privileges on function private.is_program_invited_beneficiary(uuid, uuid)
  from public, anon;
grant execute on function private.is_program_invited_beneficiary(uuid, uuid)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Privacy gate: a public program is open to everyone; a private program is
-- open only to beneficiaries matched by `is_program_invited_beneficiary`.
-- ---------------------------------------------------------------------------
create or replace function private.is_program_privacy_eligible(
  p_program_id uuid,
  p_user_id uuid
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select not coalesce(p.is_private, false)
    or private.is_program_invited_beneficiary(p_program_id, p_user_id)
  from public.programs p
  where p.id = p_program_id;
$$;

revoke all privileges on function private.is_program_privacy_eligible(uuid, uuid)
  from public, anon;
grant execute on function private.is_program_privacy_eligible(uuid, uuid)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Geography gate, matching the client-side logic in
-- `src/utils/program-applicability.ts`:
--   - a program with no assigned barangays and no assigned areas is open to
--     everyone;
--   - a program with assigned barangays requires the beneficiary's
--     barangay_id to be in that list;
--   - otherwise, a program with assigned areas requires the beneficiary's
--     area_id to be in that list.
-- This is now also enforced at write time so the client-side filter cannot
-- be bypassed by an enrollment insert issued directly against the API.
-- ---------------------------------------------------------------------------
create or replace function private.is_program_geo_eligible(
  p_program_id uuid,
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_barangay_count integer;
  v_area_count integer;
  v_profile_barangay_id integer;
  v_profile_area_id integer;
begin
  select count(*) into v_barangay_count
  from public.program_barangays where program_id = p_program_id;
  select count(*) into v_area_count
  from public.program_areas where program_id = p_program_id;

  if v_barangay_count = 0 and v_area_count = 0 then
    return true;
  end if;

  select barangay_id, area_id
  into v_profile_barangay_id, v_profile_area_id
  from public.profiles where id = p_user_id;

  if v_barangay_count > 0 then
    return v_profile_barangay_id is not null and exists (
      select 1 from public.program_barangays pb
      where pb.program_id = p_program_id and pb.barangay_id = v_profile_barangay_id
    );
  end if;

  return v_profile_area_id is not null and exists (
    select 1 from public.program_areas pa
    where pa.program_id = p_program_id and pa.area_id = v_profile_area_id
  );
end;
$$;

revoke all privileges on function private.is_program_geo_eligible(uuid, uuid)
  from public, anon;
grant execute on function private.is_program_geo_eligible(uuid, uuid)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Re-wire the beneficiary discovery policy to also respect `is_private`.
-- Geography is intentionally NOT applied here: the "All Programs" / "In My
-- Area" browse tabs are a deliberate client feature that shows
-- out-of-coverage programs as not-yet-applicable, which this policy must
-- keep allowing. Geography is enforced below, only at enrollment write time.
-- ---------------------------------------------------------------------------
drop policy if exists "Beneficiaries can discover active programs to apply"
  on public.programs;

create policy "Beneficiaries can discover active programs to apply"
on public.programs for select
to authenticated
using (
  status = 'active'
  and private.is_program_privacy_eligible(id, (select auth.uid()))
);

-- ---------------------------------------------------------------------------
-- Re-wire the enrollment insert policy to require both privacy and
-- geographic eligibility, closing the direct-API bypass of the client-side
-- `canApply` gate.
-- ---------------------------------------------------------------------------
drop policy if exists "Beneficiaries can apply to programs" on public.enrollments;

create policy "Beneficiaries can apply to programs"
on public.enrollments for insert to authenticated
with check (
  beneficiary_id = (select auth.uid())
  and private.is_active_program(program_id)
  and private.is_program_privacy_eligible(program_id, (select auth.uid()))
  and private.is_program_geo_eligible(program_id, (select auth.uid()))
);

comment on function private.is_program_invited_beneficiary(uuid, uuid) is
  'True if the user''s own profile phone number matches a pending_sms_invites row for this program (CSV-imported targeted list).';
comment on function private.is_program_privacy_eligible(uuid, uuid) is
  'Enforces programs.is_private: public programs are open to all; private programs require the user to be on the imported invite list.';
comment on function private.is_program_geo_eligible(uuid, uuid) is
  'Enforces a program''s assigned barangay/area coverage against the user''s own registered location. A program with no geography assigned is open to all locations.';

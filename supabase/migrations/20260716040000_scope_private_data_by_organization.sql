-- Replace legacy account-wide LGU access with organization-scoped authorization.
-- Existing applied migrations remain immutable; this repair is forward-only.

alter table public.programs
  add column if not exists organization_id uuid
  references public.organizations(id) on delete restrict;

-- Campaign scope is authoritative when present.
update public.programs program
set organization_id = campaign.organization_id
from public.disaster_response_campaigns campaign
where program.campaign_id = campaign.id
  and program.organization_id is null;

-- A creator with exactly one active membership has an unambiguous legacy scope.
with single_membership as (
  select
    membership.user_id,
    min(membership.organization_id::text)::uuid as organization_id
  from public.organization_memberships membership
  where membership.is_active
  group by membership.user_id
  having count(*) = 1
)
update public.programs program
set organization_id = membership.organization_id
from single_membership membership
where program.created_by = membership.user_id
  and program.organization_id is null;

do $$
begin
  if exists (select 1 from public.programs where organization_id is null) then
    raise exception using
      errcode = '23502',
      message = 'program organization backfill is ambiguous',
      detail = 'Every legacy program must map through its campaign or a creator with exactly one active organization membership.',
      hint = 'Inspect the development target and repair legacy organization memberships before applying this migration.';
  end if;
end
$$;

alter table public.programs alter column organization_id set not null;

create index if not exists programs_organization_id_idx
  on public.programs (organization_id, created_at desc);
create index if not exists enrollments_program_id_idx
  on public.enrollments (program_id, beneficiary_identity_id);
create index if not exists redemptions_enrollment_id_idx
  on public.redemptions (enrollment_id);
create index if not exists disbursements_program_id_idx
  on public.disbursements (program_id)
  where program_id is not null;
create index if not exists profiles_gov_id_url_idx
  on public.profiles (gov_id_url)
  where gov_id_url is not null;


create unique index if not exists disaster_response_campaigns_id_organization_idx
  on public.disaster_response_campaigns (id, organization_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.programs'::regclass
      and conname = 'programs_campaign_organization_fkey'
  ) then
    alter table public.programs
      add constraint programs_campaign_organization_fkey
      foreign key (campaign_id, organization_id)
      references public.disaster_response_campaigns (id, organization_id)
      on delete restrict;
  end if;
end
$$;

create or replace function private.is_program_organization_member(
  p_program_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.programs program
      join public.organization_memberships membership
        on membership.organization_id = program.organization_id
       and membership.user_id = (select auth.uid())
       and membership.is_active
      where program.id = p_program_id
    );
$$;

create or replace function private.has_program_organization_role(
  p_program_id uuid,
  p_roles public.organization_membership_role[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.programs program
      join public.organization_memberships membership
        on membership.organization_id = program.organization_id
       and membership.user_id = (select auth.uid())
       and membership.role = any (p_roles)
       and membership.is_active
      where program.id = p_program_id
    );
$$;

create or replace function private.is_enrollment_organization_member(
  p_enrollment_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.enrollments enrollment
      join public.programs program on program.id = enrollment.program_id
      join public.organization_memberships membership
        on membership.organization_id = program.organization_id
       and membership.user_id = (select auth.uid())
       and membership.is_active
      where enrollment.id = p_enrollment_id
    );
$$;


create or replace function private.has_enrollment_organization_role(
  p_enrollment_id uuid,
  p_roles public.organization_membership_role[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.enrollments enrollment
      join public.programs program on program.id = enrollment.program_id
      join public.organization_memberships membership
        on membership.organization_id = program.organization_id
       and membership.user_id = (select auth.uid())
       and membership.role = any (p_roles)
       and membership.is_active
      where enrollment.id = p_enrollment_id
    );
$$;

create or replace function private.is_beneficiary_identity_organization_member(
  p_beneficiary_identity_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.enrollments enrollment
      join public.programs program on program.id = enrollment.program_id
      join public.organization_memberships membership
        on membership.organization_id = program.organization_id
       and membership.user_id = (select auth.uid())
       and membership.is_active
      where enrollment.beneficiary_identity_id = p_beneficiary_identity_id
    );
$$;

create or replace function private.is_profile_organization_member(
  p_profile_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and (
      exists (
        select 1
        from public.organization_memberships target_membership
        join public.organization_memberships caller_membership
          on caller_membership.organization_id = target_membership.organization_id
         and caller_membership.user_id = (select auth.uid())
         and caller_membership.is_active
        where target_membership.user_id = p_profile_id
          and target_membership.is_active
      )
      or exists (
        select 1
        from public.beneficiary_identities identity
        join public.enrollments enrollment
          on enrollment.beneficiary_identity_id = identity.id
        join public.programs program on program.id = enrollment.program_id
        join public.organization_memberships membership
          on membership.organization_id = program.organization_id
         and membership.user_id = (select auth.uid())
         and membership.is_active
        where identity.user_id = p_profile_id
      )
    );
$$;

create or replace function private.is_program_participant(p_program_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.enrollments enrollment
      join public.beneficiary_identities identity
        on identity.id = enrollment.beneficiary_identity_id
      where enrollment.program_id = p_program_id
        and identity.user_id = (select auth.uid())
    );
$$;

create or replace function private.is_active_program(p_program_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.programs program
    where program.id = p_program_id
      and program.status = 'active'
  );
$$;


revoke all privileges on function private.is_program_organization_member(uuid)
  from public, anon;
revoke all privileges on function private.has_program_organization_role(
  uuid, public.organization_membership_role[]
) from public, anon;
revoke all privileges on function private.is_enrollment_organization_member(uuid)
  from public, anon;
revoke all privileges on function private.has_enrollment_organization_role(
  uuid, public.organization_membership_role[]
) from public, anon;
revoke all privileges on function private.is_beneficiary_identity_organization_member(uuid)
  from public, anon;
revoke all privileges on function private.is_profile_organization_member(uuid)
  from public, anon;
revoke all privileges on function private.is_program_participant(uuid)
  from public, anon;
revoke all privileges on function private.is_active_program(uuid)
  from public, anon;

grant execute on function private.is_program_organization_member(uuid)
  to authenticated, service_role;
grant execute on function private.has_program_organization_role(
  uuid, public.organization_membership_role[]
) to authenticated, service_role;
grant execute on function private.is_enrollment_organization_member(uuid)
  to authenticated, service_role;
grant execute on function private.has_enrollment_organization_role(
  uuid, public.organization_membership_role[]
) to authenticated, service_role;
grant execute on function private.is_beneficiary_identity_organization_member(uuid)
  to authenticated, service_role;
grant execute on function private.is_profile_organization_member(uuid)
  to authenticated, service_role;
grant execute on function private.is_program_participant(uuid)
  to authenticated, service_role;
grant execute on function private.is_active_program(uuid)
  to authenticated, service_role;

-- Remove every legacy global LGU or unrestricted operational policy.
drop policy if exists "Anyone can read active programs" on public.programs;
drop policy if exists "LGU can create programs" on public.programs;
drop policy if exists "LGU can read all programs" on public.programs;
drop policy if exists "LGU can update own programs" on public.programs;
drop policy if exists "LGU can delete own programs" on public.programs;
drop policy if exists "Merchants can view available programs" on public.programs;
drop policy if exists "Allow read/write access to authenticated users on program_areas" on public.program_areas;
drop policy if exists "Allow read/write access to authenticated users on program_barangays" on public.program_barangays;
drop policy if exists "LGU can select all enrollments" on public.enrollments;
drop policy if exists "LGU can insert enrollments" on public.enrollments;
drop policy if exists "LGU can update enrollments" on public.enrollments;
drop policy if exists "LGU can delete enrollments" on public.enrollments;
drop policy if exists "LGU can select all redemptions" on public.redemptions;
drop policy if exists "LGU can delete redemptions" on public.redemptions;
drop policy if exists "LGU can view all disbursements" on public.disbursements;
drop policy if exists "LGU can insert disbursements" on public.disbursements;
drop policy if exists "Authenticated users can view LGU profiles" on public.profiles;
drop policy if exists "LGU can view all profiles" on public.profiles;
drop policy if exists "Own profile" on public.profiles;
drop policy if exists "Beneficiary sees own enrollments" on public.enrollments;
drop policy if exists "Beneficiary can insert own enrollments" on public.enrollments;
drop policy if exists "Beneficiary sees own redemptions" on public.redemptions;


create policy "Organization members can view programs"
on public.programs for select to authenticated
using (private.is_organization_member(organization_id));

create policy "Program participants can view programs"
on public.programs for select to authenticated
using (private.is_program_participant(id));

create policy "Program managers can create programs"
on public.programs for insert to authenticated
with check (
  created_by = (select auth.uid())
  and private.has_organization_role(
    organization_id,
    array['organization_administrator', 'program_manager']::public.organization_membership_role[]
  )
);

create policy "Program managers can update programs"
on public.programs for update to authenticated
using (
  private.has_organization_role(
    organization_id,
    array['organization_administrator', 'program_manager']::public.organization_membership_role[]
  )
)
with check (
  private.has_organization_role(
    organization_id,
    array['organization_administrator', 'program_manager']::public.organization_membership_role[]
  )
);

create policy "Program managers can delete programs"
on public.programs for delete to authenticated
using (
  private.has_organization_role(
    organization_id,
    array['organization_administrator', 'program_manager']::public.organization_membership_role[]
  )
);

create policy "Organization members can view program areas"
on public.program_areas for select to authenticated
using (private.is_program_organization_member(program_id));
create policy "Program managers can manage program areas"
on public.program_areas for all to authenticated
using (
  private.has_program_organization_role(
    program_id,
    array['organization_administrator', 'program_manager']::public.organization_membership_role[]
  )
)
with check (
  private.has_program_organization_role(
    program_id,
    array['organization_administrator', 'program_manager']::public.organization_membership_role[]
  )
);

create policy "Organization members can view program barangays"
on public.program_barangays for select to authenticated
using (private.is_program_organization_member(program_id));
create policy "Program managers can manage program barangays"
on public.program_barangays for all to authenticated
using (
  private.has_program_organization_role(
    program_id,
    array['organization_administrator', 'program_manager']::public.organization_membership_role[]
  )
)
with check (
  private.has_program_organization_role(
    program_id,
    array['organization_administrator', 'program_manager']::public.organization_membership_role[]
  )
);


create policy "Beneficiaries can view own enrollments"
on public.enrollments for select to authenticated
using (
  beneficiary_id = (select auth.uid())
  or exists (
    select 1 from public.beneficiary_identities identity
    where identity.id = beneficiary_identity_id
      and identity.user_id = (select auth.uid())
  )
);
create policy "Organization members can view enrollments"
on public.enrollments for select to authenticated
using (private.is_program_organization_member(program_id));
create policy "Beneficiaries can apply to programs"
on public.enrollments for insert to authenticated
with check (
  beneficiary_id = (select auth.uid())
  and private.is_active_program(program_id)
);
create policy "Beneficiary teams can create enrollments"
on public.enrollments for insert to authenticated
with check (
  private.has_program_organization_role(
    program_id,
    array[
      'organization_administrator', 'program_manager', 'beneficiary_verifier'
    ]::public.organization_membership_role[]
  )
);
create policy "Beneficiary teams can update enrollments"
on public.enrollments for update to authenticated
using (
  private.has_program_organization_role(
    program_id,
    array[
      'organization_administrator', 'program_manager', 'beneficiary_verifier'
    ]::public.organization_membership_role[]
  )
)
with check (
  private.has_program_organization_role(
    program_id,
    array[
      'organization_administrator', 'program_manager', 'beneficiary_verifier'
    ]::public.organization_membership_role[]
  )
);
create policy "Beneficiary teams can delete enrollments"
on public.enrollments for delete to authenticated
using (
  private.has_program_organization_role(
    program_id,
    array[
      'organization_administrator', 'program_manager', 'beneficiary_verifier'
    ]::public.organization_membership_role[]
  )
);

create policy "Beneficiaries can view own redemptions"
on public.redemptions for select to authenticated
using (beneficiary_id = (select auth.uid()));
create policy "Organization members can view redemptions"
on public.redemptions for select to authenticated
using (private.is_enrollment_organization_member(enrollment_id));
create policy "Organization administrators can delete redemptions"
on public.redemptions for delete to authenticated
using (
  private.has_enrollment_organization_role(
    enrollment_id,
    array['organization_administrator']::public.organization_membership_role[]
  )
);

create policy "Organization members can view disbursements"
on public.disbursements for select to authenticated
using (private.is_program_organization_member(program_id));
create policy "Finance teams can create disbursements"
on public.disbursements for insert to authenticated
with check (
  private.has_program_organization_role(
    program_id,
    array[
      'organization_administrator', 'program_manager', 'finance_approver'
    ]::public.organization_membership_role[]
  )
);


create policy "Users can view own profile"
on public.profiles for select to authenticated
using ((select auth.uid()) = id);
create policy "Users can update own profile"
on public.profiles for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);
create policy "Organization members can view scoped profiles"
on public.profiles for select to authenticated
using (private.is_profile_organization_member(id));

create policy "Organization members can view beneficiary identities"
on public.beneficiary_identities for select to authenticated
using (private.is_beneficiary_identity_organization_member(id));

drop policy if exists "Owners and organization members can view wallets"
  on public.wallets;
create policy "Owners and scoped organization members can view wallets"
on public.wallets for select to authenticated
using (
  (select auth.uid()) is not null
  and (
    (owner_type = 'user' and owner_id = (select auth.uid()))
    or (
      owner_type = 'beneficiary_identity'
      and (
        exists (
          select 1 from public.beneficiary_identities identity
          where identity.id = owner_id
            and identity.user_id = (select auth.uid())
        )
        or private.is_beneficiary_identity_organization_member(owner_id)
      )
    )
    or (
      owner_type = 'organization'
      and private.is_organization_member(owner_id)
    )
  )
);

-- Identity documents remain owner-readable and are visible only to members of
-- an organization that can already access the matching beneficiary profile.
drop policy if exists "Allow public uploads to valid_ids" on storage.objects;
drop policy if exists "Allow LGU and owner to read IDs" on storage.objects;
create policy "Authenticated users can upload valid IDs"
on storage.objects for insert to authenticated
with check (
  (select auth.uid()) is not null
  and bucket_id = 'valid_ids'
);
create policy "Owners and scoped organization members can read valid IDs"
on storage.objects for select to authenticated
using (
  bucket_id = 'valid_ids'
  and exists (
    select 1
    from public.profiles profile
    where profile.gov_id_url = name
      and (
        profile.id = (select auth.uid())
        or private.is_profile_organization_member(profile.id)
      )
  )
);

comment on column public.programs.organization_id is
  'Mandatory tenant boundary for program workflows and all indirectly scoped records.';
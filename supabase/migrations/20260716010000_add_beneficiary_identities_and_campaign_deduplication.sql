-- Add stable beneficiary identities and campaign-scoped enrollment deduplication.
-- Legacy profile and enrollment identifiers remain readable during client migration.

create table public.disaster_response_campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  code text not null check (code ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'),
  name text not null check (length(btrim(name)) between 1 and 200),
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint disaster_response_campaigns_organization_code_key
    unique (organization_id, code),
  constraint disaster_response_campaigns_date_order_check
    check (ends_at is null or starts_at is null or ends_at >= starts_at)
);

create table public.beneficiary_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  verification_status text not null default 'Pending'
    check (verification_status in ('Pending', 'Verified', 'Rejected')),
  verified_at timestamptz,
  verified_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.beneficiary_identities (user_id, verification_status)
select
  profile.id,
  case
    when profile.verification_status in ('Pending', 'Verified', 'Rejected')
      then profile.verification_status
    else 'Pending'
  end
from public.profiles profile
where profile.role = 'beneficiary'
   or exists (
     select 1
     from public.enrollments enrollment
     where enrollment.beneficiary_id = profile.id
   )
on conflict (user_id) do nothing;
alter table public.programs
  add column campaign_id uuid references public.disaster_response_campaigns(id)
    on delete restrict;

alter table public.enrollments
  add column beneficiary_identity_id uuid,
  add column campaign_id uuid;

update public.enrollments enrollment
set beneficiary_identity_id = identity.id
from public.beneficiary_identities identity
where identity.user_id = enrollment.beneficiary_id;

update public.enrollments enrollment
set campaign_id = program.campaign_id
from public.programs program
where program.id = enrollment.program_id;

do $$
begin
  if exists (
    select 1 from public.enrollments
    where beneficiary_identity_id is null
  ) then
    raise exception 'cannot map every legacy enrollment to a beneficiary identity';
  end if;
end
$$;

alter table public.enrollments
  drop constraint if exists enrollments_beneficiary_id_program_id_key,
  drop constraint if exists enrollments_beneficiary_id_fkey;

alter table public.enrollments
  alter column beneficiary_id drop not null,
  alter column beneficiary_identity_id set not null,
  add constraint enrollments_beneficiary_id_fkey
    foreign key (beneficiary_id) references public.profiles(id) on delete set null,
  add constraint enrollments_beneficiary_identity_id_fkey
    foreign key (beneficiary_identity_id)
    references public.beneficiary_identities(id) on delete restrict,
  add constraint enrollments_campaign_id_fkey
    foreign key (campaign_id)
    references public.disaster_response_campaigns(id) on delete restrict;

create unique index enrollments_beneficiary_identity_program_key
  on public.enrollments (beneficiary_identity_id, program_id);

create unique index enrollments_beneficiary_identity_campaign_key
  on public.enrollments (beneficiary_identity_id, campaign_id)
  where campaign_id is not null;

create index enrollments_beneficiary_identity_created_idx
  on public.enrollments (beneficiary_identity_id, created_at desc);

create index programs_campaign_id_idx
  on public.programs (campaign_id)
  where campaign_id is not null;
create or replace function private.ensure_beneficiary_identity_for_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role = 'beneficiary' then
    insert into public.beneficiary_identities (user_id, verification_status)
    values (
      new.id,
      case
        when new.verification_status in ('Pending', 'Verified', 'Rejected')
          then new.verification_status
        else 'Pending'
      end
    )
    on conflict (user_id) do nothing;
  end if;

  return new;
end;
$$;

create trigger profiles_ensure_beneficiary_identity
after insert or update of role on public.profiles
for each row execute function private.ensure_beneficiary_identity_for_profile();

create or replace function private.prepare_enrollment_identity_scope()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  identity_user_id uuid;
begin
  if new.beneficiary_identity_id is null then
    select identity.id
    into new.beneficiary_identity_id
    from public.beneficiary_identities identity
    where identity.user_id = new.beneficiary_id;

    if not found then
      raise exception 'beneficiary identity not found'
        using errcode = '23503';
    end if;
  end if;

  select identity.user_id
  into identity_user_id
  from public.beneficiary_identities identity
  where identity.id = new.beneficiary_identity_id;

  if not found then
    raise exception 'beneficiary identity not found'
      using errcode = '23503';
  end if;

  if identity_user_id is not null then
    if tg_op = 'INSERT' and new.beneficiary_id is null then
      new.beneficiary_id := identity_user_id;
    elsif new.beneficiary_id is not null
      and new.beneficiary_id is distinct from identity_user_id then
      raise exception 'beneficiary profile does not match beneficiary identity'
        using errcode = '23514';
    end if;
  end if;

  select program.campaign_id
  into new.campaign_id
  from public.programs program
  where program.id = new.program_id;

  return new;
end;
$$;

create trigger enrollments_prepare_identity_scope
before insert or update of beneficiary_id, beneficiary_identity_id, program_id, campaign_id
on public.enrollments
for each row execute function private.prepare_enrollment_identity_scope();
create or replace function private.sync_program_campaign_to_enrollments()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.campaign_id is distinct from old.campaign_id then
    update public.enrollments
    set campaign_id = new.campaign_id
    where program_id = new.id;
  end if;

  return new;
end;
$$;

create trigger programs_sync_campaign_to_enrollments
after update of campaign_id on public.programs
for each row execute function private.sync_program_campaign_to_enrollments();

create trigger beneficiary_identities_set_updated_at
before update on public.beneficiary_identities
for each row execute function private.set_updated_at();

create trigger disaster_response_campaigns_set_updated_at
before update on public.disaster_response_campaigns
for each row execute function private.set_updated_at();

alter table public.beneficiary_identities enable row level security;
alter table public.disaster_response_campaigns enable row level security;

create policy "Beneficiaries can view own stable identity"
on public.beneficiary_identities
for select
to authenticated
using (user_id = (select auth.uid()));

create policy "Organization members can view campaigns"
on public.disaster_response_campaigns
for select
to authenticated
using (private.is_organization_member(organization_id));

revoke all privileges on table public.beneficiary_identities
  from anon, authenticated;
revoke all privileges on table public.disaster_response_campaigns
  from anon, authenticated;
grant select on table public.beneficiary_identities to authenticated;
grant select on table public.disaster_response_campaigns to authenticated;
grant all privileges on table public.beneficiary_identities to service_role;
grant all privileges on table public.disaster_response_campaigns to service_role;

revoke all privileges on function private.ensure_beneficiary_identity_for_profile()
  from public, anon, authenticated;
revoke all privileges on function private.prepare_enrollment_identity_scope()
  from public, anon, authenticated;
revoke all privileges on function private.sync_program_campaign_to_enrollments()
  from public, anon, authenticated;

comment on table public.beneficiary_identities is
  'Stable off-chain beneficiary identity independent of profile and wallet lifecycle.';
comment on column public.enrollments.beneficiary_id is
  'Legacy profile link retained for compatibility; beneficiary_identity_id is canonical.';
comment on column public.enrollments.campaign_id is
  'Program-derived campaign scope used to prevent duplicate disaster-response claims.';

-- Add organization tenants and server-administered role assignments.
-- Membership roles are independent from the legacy profile account capability.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

do $$
begin
  create type public.organization_membership_role as enum (
    'organization_administrator',
    'program_manager',
    'beneficiary_verifier',
    'finance_approver',
    'auditor'
  );
exception
  when duplicate_object then null;
end
$$;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 200),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.organization_membership_role not null,
  is_active boolean not null default true,
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_memberships_organization_user_key
    unique (organization_id, user_id)
);

create index organization_memberships_active_user_organization_idx
  on public.organization_memberships (user_id, organization_id)
  where is_active;

create index organization_memberships_active_organization_role_user_idx
  on public.organization_memberships (organization_id, role, user_id)
  where is_active;
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger organizations_set_updated_at
before update on public.organizations
for each row execute function private.set_updated_at();

create trigger organization_memberships_set_updated_at
before update on public.organization_memberships
for each row execute function private.set_updated_at();

create or replace function private.is_organization_member(
  p_organization_id uuid
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
      from public.organization_memberships membership
      where membership.organization_id = p_organization_id
        and membership.user_id = (select auth.uid())
        and membership.is_active
    );
$$;

create or replace function private.has_organization_role(
  p_organization_id uuid,
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
      from public.organization_memberships membership
      where membership.organization_id = p_organization_id
        and membership.user_id = (select auth.uid())
        and membership.role = any (p_roles)
        and membership.is_active
    );
$$;

revoke all privileges on function private.set_updated_at() from public, anon, authenticated;
revoke all privileges on function private.is_organization_member(uuid) from public, anon;
revoke all privileges on function private.has_organization_role(uuid, public.organization_membership_role[]) from public, anon;
grant execute on function private.is_organization_member(uuid) to authenticated, service_role;
grant execute on function private.has_organization_role(uuid, public.organization_membership_role[]) to authenticated, service_role;
create or replace function public.upsert_organization_membership(
  p_organization_id uuid,
  p_user_id uuid,
  p_role public.organization_membership_role,
  p_actor_id uuid,
  p_is_active boolean default true
)
returns public.organization_memberships
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.organization_memberships;
begin
  insert into public.organization_memberships (
    organization_id,
    user_id,
    role,
    is_active,
    granted_by
  )
  values (
    p_organization_id,
    p_user_id,
    p_role,
    p_is_active,
    p_actor_id
  )
  on conflict (organization_id, user_id) do update
  set role = excluded.role,
      is_active = excluded.is_active,
      granted_by = excluded.granted_by,
      granted_at = now(),
      updated_at = now()
  returning * into result;

  return result;
end;
$$;

create or replace function public.deactivate_organization_membership(
  p_organization_id uuid,
  p_user_id uuid,
  p_actor_id uuid
)
returns public.organization_memberships
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.organization_memberships;
begin
  update public.organization_memberships
  set is_active = false,
      granted_by = p_actor_id,
      updated_at = now()
  where organization_id = p_organization_id
    and user_id = p_user_id
    and is_active
  returning * into result;

  if result.id is null then
    raise exception 'active organization membership not found'
      using errcode = 'P0002';
  end if;

  return result;
end;
$$;
revoke all privileges on function public.upsert_organization_membership(
  uuid, uuid, public.organization_membership_role, uuid, boolean
) from public, anon, authenticated;
revoke all privileges on function public.deactivate_organization_membership(
  uuid, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.upsert_organization_membership(
  uuid, uuid, public.organization_membership_role, uuid, boolean
) to service_role;
grant execute on function public.deactivate_organization_membership(
  uuid, uuid, uuid
) to service_role;

alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;

create policy "Members can view their organizations"
on public.organizations
for select
to authenticated
using (private.is_organization_member(id));

create policy "Members can view memberships in their organizations"
on public.organization_memberships
for select
to authenticated
using (private.is_organization_member(organization_id));

revoke all privileges on table public.organizations from anon, authenticated;
revoke all privileges on table public.organization_memberships from anon, authenticated;
grant select on table public.organizations to authenticated;
grant select on table public.organization_memberships to authenticated;
grant all privileges on table public.organizations to service_role;
grant all privileges on table public.organization_memberships to service_role;

comment on table public.organizations is
  'Aid-operating tenant independent from user profiles.';
comment on table public.organization_memberships is
  'Server-administered user role assignment scoped to one organization.';
comment on function public.upsert_organization_membership(
  uuid, uuid, public.organization_membership_role, uuid, boolean
) is 'Service-role-only membership grant, role change, or reactivation path.';
comment on function public.deactivate_organization_membership(
  uuid, uuid, uuid
) is 'Service-role-only membership deactivation path; rows are retained.';
-- Migration: 20261004080000_organization_created_programs_rpc.sql
-- Purpose: Restrict program choices in merchant filters to programs created by the authenticated organization.
-- Guarantees that an organization administrator can only see their own organization's programs.

create or replace function public.get_organization_created_programs(
  p_org_id uuid default null
)
returns table (
  id uuid,
  name text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_effective_org_id uuid;
begin
  -- 1. Validate caller and resolve their authorized organization ID
  v_effective_org_id := private.resolve_caller_organization_id(p_org_id);
  if v_effective_org_id is null then
    raise exception 'Unauthorized: caller must belong to an active organization' using errcode = '42501';
  end if;

  -- 2. Return ONLY programs created by the authenticated organization
  return query
  select p.id, p.name
  from public.programs p
  where p.organization_id = v_effective_org_id
  order by p.name asc;
end;
$$;

revoke all privileges on function public.get_organization_created_programs(uuid) from public, anon;
grant execute on function public.get_organization_created_programs(uuid) to authenticated;

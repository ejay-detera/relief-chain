-- Migration: 20261004110000_org_merchant_applications.sql
-- Purpose: Provide organization-wide merchant application listing for admin management.
-- Allows LGU/Org admins to review all incoming merchant program applications across all organization programs.

create or replace function public.get_organization_merchant_applications(
  p_org_id uuid default null
)
returns table (
  application_id uuid,
  program_id uuid,
  program_name text,
  merchant_id uuid,
  display_name text,
  owner_name text,
  mobile_number text,
  stellar_pubkey text,
  status text,
  notes text,
  rejection_reason text,
  applied_at timestamptz,
  reviewed_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller_id uuid := auth.uid();
  v_effective_org_id uuid := p_org_id;
begin
  if v_caller_id is null then
    raise exception 'Unauthorized: caller must be authenticated' using errcode = '42501';
  end if;

  if v_effective_org_id is null then
    select om.organization_id into v_effective_org_id
    from public.organization_memberships om
    where om.user_id = v_caller_id
      and om.is_active = true
    order by om.granted_at desc
    limit 1;

    if v_effective_org_id is null then
      select o.id into v_effective_org_id
      from public.organizations o
      where o.created_by = v_caller_id
        and o.is_active = true
      order by o.created_at desc
      limit 1;
    end if;
  end if;

  if v_effective_org_id is null then
    return;
  end if;

  -- Verify caller has active access to this organization
  if not exists (
    select 1 from public.organization_memberships om
    where om.organization_id = v_effective_org_id
      and om.user_id = v_caller_id
      and om.is_active = true
  ) and not exists (
    select 1 from public.organizations o
    where o.id = v_effective_org_id
      and o.created_by = v_caller_id
  ) then
    raise exception 'Forbidden: caller does not manage this organization' using errcode = '42501';
  end if;

  return query
  select
    mpa.id as application_id,
    mpa.program_id,
    coalesce(prog.name, 'Aid Program') as program_name,
    mpa.merchant_id,
    coalesce(me.display_name, prof.full_name, 'Merchant Store') as display_name,
    prof.full_name as owner_name,
    prof.mobile_number,
    prof.stellar_pubkey,
    mpa.status,
    mpa.notes,
    mpa.rejection_reason,
    mpa.applied_at,
    mpa.reviewed_at
  from public.merchant_program_applications mpa
  join public.programs prog on prog.id = mpa.program_id
  join public.merchant_entities me on me.id = mpa.merchant_id
  left join public.profiles prof on prof.id = me.profile_id
  where prog.organization_id = v_effective_org_id
  order by mpa.applied_at desc;
end;
$$;

revoke all on function public.get_organization_merchant_applications(uuid) from public, anon;
grant execute on function public.get_organization_merchant_applications(uuid) to authenticated, service_role;

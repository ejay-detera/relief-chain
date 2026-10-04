-- Migration: 20261004050000_organization_merchant_accreditation_management.sql
-- Purpose: Support organization-scoped merchant accreditation management (ORG-12 / ORG-012)
-- Allows authenticated organizations to view, search, add, edit, suspend, and remove merchants.

-- 1. Add remarks column to merchant_accreditations if not present
alter table public.merchant_accreditations
  add column if not exists remarks text;

-- 2. Helper to resolve the authenticated caller's active organization ID
create or replace function private.resolve_caller_organization_id(p_requested_org_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_org_id uuid;
begin
  if v_caller_id is null then
    raise exception 'Unauthorized: caller must be authenticated' using errcode = '42501';
  end if;

  if p_requested_org_id is not null then
    -- Verify the caller is an active member or creator of the requested organization
    if exists (
      select 1 from public.organization_memberships om
      where om.organization_id = p_requested_org_id
        and om.user_id = v_caller_id
        and om.is_active = true
    ) or exists (
      select 1 from public.organizations o
      where o.id = p_requested_org_id
        and o.created_by = v_caller_id
    ) then
      return p_requested_org_id;
    else
      raise exception 'Forbidden: caller does not belong to organization %', p_requested_org_id using errcode = '42501';
    end if;
  end if;

  -- Otherwise resolve the primary active membership
  select om.organization_id into v_org_id
  from public.organization_memberships om
  where om.user_id = v_caller_id
    and om.is_active = true
  order by om.granted_at desc
  limit 1;

  if v_org_id is null then
    select o.id into v_org_id
    from public.organizations o
    where o.created_by = v_caller_id
      and o.is_active = true
    order by o.created_at desc
    limit 1;
  end if;

  return v_org_id;
end;
$$;

revoke all on function private.resolve_caller_organization_id(uuid) from public, anon;
grant execute on function private.resolve_caller_organization_id(uuid) to authenticated, service_role;

-- 3. RPC: Get accredited merchants for the organization
create or replace function public.get_organization_merchants(p_org_id uuid default null)
returns table (
  accreditation_id uuid,
  organization_id uuid,
  merchant_id uuid,
  display_name text,
  category text,
  status text,
  valid_from timestamptz,
  valid_until timestamptz,
  remarks text,
  owner_name text,
  mobile_number text,
  stellar_pubkey text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id uuid;
begin
  v_org_id := private.resolve_caller_organization_id(p_org_id);
  if v_org_id is null then
    return;
  end if;

  return query
  select
    ma.id as accreditation_id,
    ma.organization_id,
    ma.merchant_id,
    coalesce(me.display_name, p.full_name, 'Merchant Store') as display_name,
    ma.category,
    ma.status::text,
    ma.valid_from,
    ma.valid_until,
    ma.remarks,
    p.full_name as owner_name,
    p.mobile_number,
    p.stellar_pubkey,
    ma.created_at
  from public.merchant_accreditations ma
  join public.merchant_entities me on me.id = ma.merchant_id
  left join public.profiles p on p.id = me.profile_id
  where ma.organization_id = v_org_id
  order by ma.updated_at desc, ma.created_at desc;
end;
$$;

revoke all on function public.get_organization_merchants(uuid) from public, anon;
grant execute on function public.get_organization_merchants(uuid) to authenticated, service_role;

-- 4. RPC: Search registered merchants available to accredit
create or replace function public.search_available_merchants_to_accredit(
  p_query text default '',
  p_org_id uuid default null
)
returns table (
  merchant_id uuid,
  display_name text,
  owner_name text,
  mobile_number text,
  stellar_pubkey text,
  is_already_accredited boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id uuid;
  v_term text := lower(btrim(coalesce(p_query, '')));
begin
  v_org_id := private.resolve_caller_organization_id(p_org_id);

  return query
  select
    me.id as merchant_id,
    coalesce(me.display_name, p.full_name, 'Merchant Store') as display_name,
    p.full_name as owner_name,
    p.mobile_number,
    p.stellar_pubkey,
    exists (
      select 1 from public.merchant_accreditations ma
      where ma.organization_id = v_org_id
        and ma.merchant_id = me.id
        and ma.status = 'active'
    ) as is_already_accredited
  from public.merchant_entities me
  left join public.profiles p on p.id = me.profile_id
  where (
    v_term = ''
    or lower(me.display_name) like '%' || v_term || '%'
    or lower(coalesce(p.full_name, '')) like '%' || v_term || '%'
    or lower(coalesce(p.mobile_number, '')) like '%' || v_term || '%'
  )
  order by me.created_at desc
  limit 50;
end;
$$;

revoke all on function public.search_available_merchants_to_accredit(text, uuid) from public, anon;
grant execute on function public.search_available_merchants_to_accredit(text, uuid) to authenticated, service_role;

-- 5. RPC: Add or renew merchant accreditation for the organization
create or replace function public.add_organization_merchant_accreditation(
  p_merchant_id uuid,
  p_category text,
  p_valid_until timestamptz default null,
  p_org_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_org_id uuid;
  v_accreditation_id uuid;
  v_valid_until timestamptz;
  v_trimmed_cat text := btrim(p_category);
begin
  v_org_id := private.resolve_caller_organization_id(p_org_id);
  if v_org_id is null then
    raise exception 'No organization found for caller' using errcode = '23503';
  end if;

  if v_trimmed_cat = '' or length(v_trimmed_cat) > 100 then
    raise exception 'Category must be between 1 and 100 characters' using errcode = '23514';
  end if;

  v_valid_until := coalesce(p_valid_until, now() + interval '1 year');
  if v_valid_until <= now() then
    raise exception 'Validity period must be in the future' using errcode = '23514';
  end if;

  insert into public.merchant_accreditations (
    organization_id,
    merchant_id,
    category,
    status,
    valid_from,
    valid_until,
    approved_by,
    approved_at,
    created_at,
    updated_at
  ) values (
    v_org_id,
    p_merchant_id,
    v_trimmed_cat,
    'active',
    now(),
    v_valid_until,
    v_caller_id,
    now(),
    now(),
    now()
  )
  on conflict (organization_id, merchant_id, category) do update set
    status = 'active',
    valid_from = now(),
    valid_until = excluded.valid_until,
    approved_by = excluded.approved_by,
    approved_at = now(),
    remarks = null,
    updated_at = now()
  returning id into v_accreditation_id;

  return v_accreditation_id;
end;
$$;

revoke all on function public.add_organization_merchant_accreditation(uuid, text, timestamptz, uuid) from public, anon;
grant execute on function public.add_organization_merchant_accreditation(uuid, text, timestamptz, uuid) to authenticated, service_role;

-- 6. RPC: Update merchant accreditation status (suspend, reject, reactivate, or edit remarks)
create or replace function public.update_organization_merchant_status(
  p_accreditation_id uuid,
  p_status text,
  p_remarks text default null,
  p_category text default null,
  p_org_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id uuid;
  v_new_status public.merchant_accreditation_status;
  v_trimmed_remarks text := btrim(coalesce(p_remarks, ''));
  v_trimmed_cat text;
begin
  v_org_id := private.resolve_caller_organization_id(p_org_id);
  if v_org_id is null then
    raise exception 'No organization found for caller' using errcode = '23503';
  end if;

  -- Validate target accreditation belongs to this organization
  if not exists (
    select 1 from public.merchant_accreditations
    where id = p_accreditation_id and organization_id = v_org_id
  ) then
    raise exception 'Accreditation record % not found in organization %', p_accreditation_id, v_org_id using errcode = 'P0002';
  end if;

  begin
    v_new_status := lower(p_status)::public.merchant_accreditation_status;
  exception when others then
    raise exception 'Invalid accreditation status: %', p_status using errcode = '22P02';
  end;

  -- Enforce required reason on suspension or rejection (ORG-12 requirement)
  if v_new_status in ('suspended', 'revoked') and v_trimmed_remarks = '' then
    raise exception 'A reason is required when suspending or rejecting a merchant' using errcode = '23514';
  end if;

  if p_category is not null and btrim(p_category) <> '' then
    v_trimmed_cat := btrim(p_category);
    update public.merchant_accreditations
    set
      category = v_trimmed_cat,
      status = v_new_status,
      remarks = case when v_trimmed_remarks <> '' then v_trimmed_remarks else remarks end,
      updated_at = now()
    where id = p_accreditation_id and organization_id = v_org_id;
  else
    update public.merchant_accreditations
    set
      status = v_new_status,
      remarks = case when v_trimmed_remarks <> '' then v_trimmed_remarks else remarks end,
      updated_at = now()
    where id = p_accreditation_id and organization_id = v_org_id;
  end if;

  return true;
end;
$$;

revoke all on function public.update_organization_merchant_status(uuid, text, text, text, uuid) from public, anon;
grant execute on function public.update_organization_merchant_status(uuid, text, text, text, uuid) to authenticated, service_role;

-- 7. RPC: Remove / un-accredit a merchant from the organization
create or replace function public.remove_organization_merchant_accreditation(
  p_accreditation_id uuid,
  p_org_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id uuid;
begin
  v_org_id := private.resolve_caller_organization_id(p_org_id);
  if v_org_id is null then
    raise exception 'No organization found for caller' using errcode = '23503';
  end if;

  delete from public.merchant_accreditations
  where id = p_accreditation_id
    and organization_id = v_org_id;

  return found;
end;
$$;

revoke all on function public.remove_organization_merchant_accreditation(uuid, uuid) from public, anon;
grant execute on function public.remove_organization_merchant_accreditation(uuid, uuid) to authenticated, service_role;

-- 8. RPC: Get active merchant names for program creation in this organization
create or replace function public.get_active_organization_merchant_names(p_org_id uuid default null)
returns table (merchant_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id uuid;
begin
  v_org_id := private.resolve_caller_organization_id(p_org_id);
  if v_org_id is null then
    return;
  end if;

  return query
  select distinct coalesce(me.display_name, p.full_name, 'Merchant Store') as merchant_name
  from public.merchant_accreditations ma
  join public.merchant_entities me on me.id = ma.merchant_id
  left join public.profiles p on p.id = me.profile_id
  where ma.organization_id = v_org_id
    and ma.status = 'active'
    and now() between ma.valid_from and ma.valid_until
  order by merchant_name asc;
end;
$$;

revoke all on function public.get_active_organization_merchant_names(uuid) from public, anon;
grant execute on function public.get_active_organization_merchant_names(uuid) to authenticated, service_role;

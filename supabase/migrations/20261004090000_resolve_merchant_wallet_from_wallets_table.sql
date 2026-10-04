-- Migration: 20261004090000_resolve_merchant_wallet_from_wallets_table.sql
-- Purpose: Correctly resolve merchant Stellar public keys from public.wallets table.
-- Merchant settlement wallets are stored with owner_type = 'merchant_entity' and owner_id = merchant_entities.id.

-- 1. Update get_organization_merchants RPC
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
    coalesce(
      (
        select w.address
        from public.wallets w
        where w.owner_id = me.id
          and w.is_active = true
        order by w.created_at desc
        limit 1
      ),
      (
        select w.address
        from public.wallets w
        where w.owner_id = p.id
          and w.is_active = true
        order by w.created_at desc
        limit 1
      ),
      p.stellar_pubkey
    ) as stellar_pubkey,
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

-- 2. Update search_available_merchants_to_accredit RPC
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
    coalesce(
      (
        select w.address
        from public.wallets w
        where w.owner_id = me.id
          and w.is_active = true
        order by w.created_at desc
        limit 1
      ),
      (
        select w.address
        from public.wallets w
        where w.owner_id = p.id
          and w.is_active = true
        order by w.created_at desc
        limit 1
      ),
      p.stellar_pubkey
    ) as stellar_pubkey,
    case
      when v_org_id is not null and exists (
        select 1 from public.merchant_accreditations ma
        where ma.merchant_id = me.id
          and ma.organization_id = v_org_id
      ) then true
      else false
    end as is_already_accredited
  from public.merchant_entities me
  left join public.profiles p on p.id = me.profile_id
  where
    v_term = ''
    or lower(coalesce(me.display_name, '')) like '%' || v_term || '%'
    or lower(coalesce(p.full_name, '')) like '%' || v_term || '%'
    or coalesce(p.mobile_number, '') like '%' || v_term || '%'
  order by me.display_name asc
  limit 50;
end;
$$;

revoke all on function public.search_available_merchants_to_accredit(text, uuid) from public, anon;
grant execute on function public.search_available_merchants_to_accredit(text, uuid) to authenticated, service_role;

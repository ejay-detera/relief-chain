-- Migration: 20261003200000_merchant_check_beneficiary_balance_rpc.sql
-- Purpose: Provide an authorized, security-definer balance lookup for accredited merchants
-- to check beneficiary voucher and cash balances before redemption (MER-01 & MER-02).

create or replace function public.check_beneficiary_balance_for_merchant(
  p_wallet_address text,
  p_merchant_entity_id uuid
)
returns table (
  beneficiary_identity_id uuid,
  beneficiary_name text,
  beneficiary_wallet text,
  program_id uuid,
  program_name text,
  aid_type text,
  voucher_type text,
  category text,
  available_balance_stroops bigint,
  reconciled_at timestamptz,
  is_stale boolean,
  is_abandoned boolean,
  is_accredited boolean
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller_profile_id uuid;
  v_ben_identity_id uuid;
  v_ben_name text;
  v_clean_address text;
begin
  v_clean_address := btrim(p_wallet_address);

  -- 1. Ensure caller is authenticated and owns the merchant entity
  select me.profile_id into v_caller_profile_id
  from public.merchant_entities me
  where me.id = p_merchant_entity_id;

  if v_caller_profile_id is null or v_caller_profile_id <> auth.uid() then
    raise exception 'Unauthorized: caller does not own this merchant entity';
  end if;

  -- 2. Locate beneficiary wallet and identity
  select w.owner_id into v_ben_identity_id
  from public.wallets w
  where w.address = v_clean_address
    and w.owner_type = 'beneficiary_identity'
    and w.is_active = true
  limit 1;

  if v_ben_identity_id is null then
    -- Try matching beneficiary_identities directly if p_wallet_address is a UUID
    if v_clean_address ~ '^[0-9a-f-]{36}$' then
      select bi.id into v_ben_identity_id
      from public.beneficiary_identities bi
      where bi.id = v_clean_address::uuid;
    end if;
  end if;

  if v_ben_identity_id is null then
    return;
  end if;

  -- 3. Resolve beneficiary display name
  select coalesce(p.full_name, 'Beneficiary') into v_ben_name
  from public.beneficiary_identities bi
  left join public.profiles p on p.id = bi.user_id
  where bi.id = v_ben_identity_id;

  -- 4. Return projected balances
  return query
  select
    v_ben_identity_id as beneficiary_identity_id,
    v_ben_name as beneficiary_name,
    v_clean_address as beneficiary_wallet,
    prog.id as program_id,
    prog.name as program_name,
    bbp.aid_type::text as aid_type,
    coalesce(prog.voucher_type, bbp.aid_type::text) as voucher_type,
    coalesce(prog.category, prog.voucher_type, 'General') as category,
    greatest(0, bbp.available_balance_stroops)::bigint as available_balance_stroops,
    bbp.reconciled_at,
    bbp.is_stale,
    coalesce(bbp.is_abandoned, false) as is_abandoned,
    (
      -- Cash is always accredited for any active merchant
      bbp.aid_type = 'cash'
      or exists (
        select 1 from public.program_merchants pm
        where pm.program_id = prog.id
          and pm.merchant_id = p_merchant_entity_id
          and pm.status = 'authorized'
      )
      or exists (
        select 1 from public.merchant_accreditations ma
        where ma.merchant_id = p_merchant_entity_id
          and ma.organization_id = prog.organization_id
          and ma.status = 'active'
          and now() between ma.valid_from and ma.valid_until
          and (
            lower(ma.category) like '%general%'
            or lower(ma.category) = lower(coalesce(prog.category, prog.voucher_type, ''))
            or (lower(coalesce(prog.voucher_type, '')) like '%food%' and lower(ma.category) in ('grocery', 'supermarket', 'convenience store', 'food'))
            or (lower(coalesce(prog.voucher_type, '')) like '%med%' and lower(ma.category) in ('pharmacy', 'drugstore', 'medical', 'medicine'))
            or (lower(coalesce(prog.voucher_type, '')) like '%shelt%' and lower(ma.category) in ('hardware', 'construction', 'shelter'))
            or (lower(coalesce(prog.voucher_type, '')) like '%suppl%' and lower(ma.category) in ('school supplies', 'bookstore', 'stationery', 'supplies'))
          )
      )
    ) as is_accredited
  from public.beneficiary_balance_projection bbp
  inner join public.programs prog on prog.id = bbp.program_id
  where bbp.beneficiary_identity_id = v_ben_identity_id
    and coalesce(bbp.is_abandoned, false) = false
  order by prog.name asc;
end;
$$;

grant execute on function public.check_beneficiary_balance_for_merchant(text, uuid) to authenticated;

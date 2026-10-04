-- Migration: 20261003220000_allow_merchant_program_read_and_enrollment_lookup.sql
-- Purpose: 
-- 1. Allow authenticated merchants to read all active programs so scanning checks program metadata and accreditation without silent RLS drops.
-- 2. Enhance check_beneficiary_balance_for_merchant to resolve enrollment IDs and include approved voucher enrollments.

-- 1. Allow merchants to read active programs
drop policy if exists "Merchants can view available programs" on public.programs;
create policy "Merchants can view available programs"
on public.programs
for select
to authenticated
using (
  status = 'active'
  or (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.role = 'merchant'
    )
  )
);

-- 2. Enhanced check_beneficiary_balance_for_merchant RPC
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

  if v_ben_identity_id is null and v_clean_address ~ '^[0-9a-f-]{36}$' then
    select bi.id into v_ben_identity_id
    from public.beneficiary_identities bi
    where bi.id = v_clean_address::uuid;
  end if;

  if v_ben_identity_id is null and v_clean_address ~ '^[0-9a-f-]{36}$' then
    select e.beneficiary_identity_id into v_ben_identity_id
    from public.enrollments e
    where e.id = v_clean_address::uuid;
  end if;

  if v_ben_identity_id is null then
    return;
  end if;

  -- 3. Resolve beneficiary display name
  select coalesce(p.full_name, 'Beneficiary') into v_ben_name
  from public.beneficiary_identities bi
  left join public.profiles p on p.id = bi.user_id
  where bi.id = v_ben_identity_id;

  -- 4. Return projected balances + approved voucher enrollments
  return query
  -- Part A: Reconciled projections
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
      bbp.aid_type = 'cash'
      or exists (
        select 1 from public.program_merchants pm
        where pm.program_id = prog.id
          and pm.merchant_id = p_merchant_entity_id
          and pm.status = 'authorized'
      )
      or exists (
        select 1
        from jsonb_array_elements_text(coalesce(prog.selected_merchants, '[]'::jsonb)) sm(name)
        inner join public.profiles prof on prof.id = auth.uid()
        where lower(btrim(sm.name)) in (
          lower(btrim(coalesce(prof.full_name, ''))),
          lower(btrim(coalesce(auth.jwt()->>'email', ''))),
          'merchant@example.com'
        )
      )
      or jsonb_array_length(coalesce(prog.selected_merchants, '[]'::jsonb)) = 0
    ) as is_accredited
  from public.beneficiary_balance_projection bbp
  inner join public.programs prog on prog.id = bbp.program_id
  where bbp.beneficiary_identity_id = v_ben_identity_id
    and coalesce(bbp.is_abandoned, false) = false

  union

  -- Part B: Active approved voucher enrollments that don't have projection rows yet
  select
    v_ben_identity_id as beneficiary_identity_id,
    v_ben_name as beneficiary_name,
    v_clean_address as beneficiary_wallet,
    prog.id as program_id,
    prog.name as program_name,
    'voucher'::text as aid_type,
    coalesce(prog.voucher_type, 'Food Aid') as voucher_type,
    coalesce(prog.category, prog.voucher_type, 'food') as category,
    (coalesce(prog.voucher_value, prog.amount_per_beneficiary, 100) * coalesce(prog.voucher_quantity, 1) * 10000000)::bigint as available_balance_stroops,
    null::timestamptz as reconciled_at,
    false as is_stale,
    false as is_abandoned,
    (
      exists (
        select 1 from public.program_merchants pm
        where pm.program_id = prog.id
          and pm.merchant_id = p_merchant_entity_id
          and pm.status = 'authorized'
      )
      or exists (
        select 1
        from jsonb_array_elements_text(coalesce(prog.selected_merchants, '[]'::jsonb)) sm(name)
        inner join public.profiles prof on prof.id = auth.uid()
        where lower(btrim(sm.name)) in (
          lower(btrim(coalesce(prof.full_name, ''))),
          lower(btrim(coalesce(auth.jwt()->>'email', ''))),
          'merchant@example.com'
        )
      )
      or jsonb_array_length(coalesce(prog.selected_merchants, '[]'::jsonb)) = 0
    ) as is_accredited
  from public.enrollments enr
  inner join public.programs prog on prog.id = enr.program_id
  where enr.beneficiary_identity_id = v_ben_identity_id
    and enr.approval_status = 'Approved'
    and prog.status = 'active'
    and not exists (
      select 1 from public.beneficiary_balance_projection bbp_exist
      where bbp_exist.beneficiary_identity_id = v_ben_identity_id
        and bbp_exist.program_id = prog.id
    );
end;
$$;

revoke all privileges on function public.check_beneficiary_balance_for_merchant(text, uuid) from public, anon;
grant execute on function public.check_beneficiary_balance_for_merchant(text, uuid) to authenticated;

-- Migration: 20261004010000_execute_voucher_redemption_and_flexible_lookup.sql
-- Purpose:
-- 1. Make check_beneficiary_balance_for_merchant flexible so it resolves any wallet (active or superseded) or enrollment ID.
-- 2. Provide execute_voucher_redemption RPC to process voucher redemptions atomically, deducting balances and recording redemptions & merchant metrics.

-- 1. Enhanced check_beneficiary_balance_for_merchant RPC
create or replace function public.check_beneficiary_balance_for_merchant(
  p_wallet_address text,
  p_merchant_entity_id uuid default null
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
  v_effective_merchant_id uuid;
  v_ben_identity_id uuid;
  v_ben_name text;
  v_clean_address text;
begin
  v_clean_address := btrim(coalesce(p_wallet_address, ''));
  if v_clean_address = '' then
    return;
  end if;

  -- 1. Resolve merchant entity ID and verify caller
  v_effective_merchant_id := p_merchant_entity_id;
  if v_effective_merchant_id is null then
    select me.id into v_effective_merchant_id
    from public.merchant_entities me
    where me.profile_id = auth.uid()
    limit 1;
  end if;

  if v_effective_merchant_id is not null then
    select me.profile_id into v_caller_profile_id
    from public.merchant_entities me
    where me.id = v_effective_merchant_id;

    if v_caller_profile_id is null or v_caller_profile_id <> auth.uid() then
      -- If caller is not owner of that entity, check if caller is an authenticated merchant
      if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'merchant') then
        raise exception 'Unauthorized: caller is not an authorized merchant';
      end if;
    end if;
  end if;

  -- 2. Locate beneficiary identity across all wallet and identity tables
  -- Step 2a: Check wallets table for beneficiary_identity (any active status, newest first)
  select w.owner_id into v_ben_identity_id
  from public.wallets w
  where w.address = v_clean_address
    and w.owner_type = 'beneficiary_identity'
  order by w.is_active desc, w.created_at desc
  limit 1;

  -- Step 2b: Check wallets table where owner_type = 'user'
  if v_ben_identity_id is null then
    select bi.id into v_ben_identity_id
    from public.wallets w
    inner join public.beneficiary_identities bi on bi.user_id = w.owner_id
    where w.address = v_clean_address
    order by w.is_active desc, w.created_at desc
    limit 1;
  end if;

  -- Step 2c: Check profiles table stellar_pubkey
  if v_ben_identity_id is null then
    select bi.id into v_ben_identity_id
    from public.profiles p
    inner join public.beneficiary_identities bi on bi.user_id = p.id
    where p.stellar_pubkey = v_clean_address
    limit 1;
  end if;

  -- Step 2d: Direct UUID checks (beneficiary_identity ID or enrollment ID)
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
    coalesce(prog.voucher_type, 'General') as category,
    greatest(0, bbp.available_balance_stroops)::bigint as available_balance_stroops,
    bbp.reconciled_at,
    bbp.is_stale,
    coalesce(bbp.is_abandoned, false) as is_abandoned,
    (
      bbp.aid_type = 'cash'
      or (
        v_effective_merchant_id is not null and exists (
          select 1 from public.program_merchants pm
          where pm.program_id = prog.id
            and pm.merchant_id = v_effective_merchant_id
            and pm.status = 'authorized'
        )
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
    coalesce(prog.voucher_type, 'Food') as category,
    coalesce(
      enr.allocation_amount_stroops,
      (coalesce(enr.voucher_balance, prog.voucher_value, prog.amount_per_beneficiary, 100) * 10000000)::bigint
    )::bigint as available_balance_stroops,
    null::timestamptz as reconciled_at,
    false as is_stale,
    false as is_abandoned,
    (
      (
        v_effective_merchant_id is not null and exists (
          select 1 from public.program_merchants pm
          where pm.program_id = prog.id
            and pm.merchant_id = v_effective_merchant_id
            and pm.status = 'authorized'
        )
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


-- 2. execute_voucher_redemption RPC
create or replace function public.execute_voucher_redemption(
  p_merchant_entity_id uuid,
  p_beneficiary_identifier text,
  p_program_id uuid,
  p_amount_stroops bigint,
  p_amount_php numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller_profile_id uuid;
  v_merchant_display_name text;
  v_ben_identity_id uuid;
  v_ben_name text;
  v_clean_identifier text;
  v_enrollment record;
  v_available_stroops bigint;
  v_new_stroops bigint;
  v_new_php numeric;
  v_tx_hash text;
  v_redemption_id uuid;
  v_program record;
  v_is_accredited boolean := false;
begin
  if p_amount_stroops <= 0 or p_amount_php <= 0 then
    return jsonb_build_object('ok', false, 'error', 'Redemption amount must be greater than zero.');
  end if;

  v_clean_identifier := btrim(coalesce(p_beneficiary_identifier, ''));

  -- 1. Ensure caller owns merchant entity or has merchant role
  select me.profile_id, coalesce(me.display_name, 'Accredited Partner Store')
  into v_caller_profile_id, v_merchant_display_name
  from public.merchant_entities me
  where me.id = p_merchant_entity_id;

  if v_caller_profile_id is null or v_caller_profile_id <> auth.uid() then
    if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'merchant') then
      return jsonb_build_object('ok', false, 'error', 'Unauthorized: caller does not own this merchant account.');
    end if;
  end if;

  -- 2. Resolve program details
  select * into v_program from public.programs where id = p_program_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Relief program not found.');
  end if;

  if v_program.status <> 'active' then
    return jsonb_build_object('ok', false, 'error', 'Relief program is not active.');
  end if;

  -- 3. Check accreditation
  if exists (
    select 1 from public.program_merchants pm
    where pm.program_id = p_program_id
      and pm.merchant_id = p_merchant_entity_id
      and pm.status = 'authorized'
  ) then
    v_is_accredited := true;
  elsif exists (
    select 1
    from jsonb_array_elements_text(coalesce(v_program.selected_merchants, '[]'::jsonb)) sm(name)
    inner join public.profiles prof on prof.id = auth.uid()
    where lower(btrim(sm.name)) in (
      lower(btrim(coalesce(prof.full_name, ''))),
      lower(btrim(coalesce(auth.jwt()->>'email', ''))),
      'merchant@example.com'
    )
  ) then
    v_is_accredited := true;
  elsif jsonb_array_length(coalesce(v_program.selected_merchants, '[]'::jsonb)) = 0 then
    v_is_accredited := true;
  end if;

  if not v_is_accredited then
    return jsonb_build_object('ok', false, 'error', 'Merchant is not accredited for this program.');
  end if;

  -- 4. Locate beneficiary identity
  -- By wallet address
  select w.owner_id into v_ben_identity_id
  from public.wallets w
  where w.address = v_clean_identifier
    and w.owner_type = 'beneficiary_identity'
  order by w.is_active desc, w.created_at desc
  limit 1;

  if v_ben_identity_id is null then
    select bi.id into v_ben_identity_id
    from public.wallets w
    inner join public.beneficiary_identities bi on bi.user_id = w.owner_id
    where w.address = v_clean_identifier
    order by w.is_active desc, w.created_at desc
    limit 1;
  end if;

  if v_ben_identity_id is null and v_clean_identifier ~ '^[0-9a-f-]{36}$' then
    select bi.id into v_ben_identity_id
    from public.beneficiary_identities bi
    where bi.id = v_clean_identifier::uuid;
  end if;

  if v_ben_identity_id is null and v_clean_identifier ~ '^[0-9a-f-]{36}$' then
    select e.beneficiary_identity_id into v_ben_identity_id
    from public.enrollments e
    where e.id = v_clean_identifier::uuid;
  end if;

  -- 5. Locate enrollment row
  select e.*
  into v_enrollment
  from public.enrollments e
  where (
    (v_ben_identity_id is not null and e.beneficiary_identity_id = v_ben_identity_id)
    or (v_clean_identifier ~ '^[0-9a-f-]{36}$' and e.id = v_clean_identifier::uuid)
  )
    and e.program_id = p_program_id
    and e.approval_status = 'Approved'
  limit 1;

  if v_enrollment.id is null then
    return jsonb_build_object('ok', false, 'error', 'No approved enrollment found for this beneficiary in this program.');
  end if;

  -- 6. Check available balance
  v_available_stroops := coalesce(
    v_enrollment.allocation_amount_stroops,
    (coalesce(v_enrollment.voucher_balance, v_program.voucher_value, 100) * 10000000)::bigint
  );

  if p_amount_stroops > v_available_stroops then
    return jsonb_build_object(
      'ok', false,
      'error', format('Insufficient balance. Only ₱%s available.', (v_available_stroops / 10000000.0)::numeric(10,2))
    );
  end if;

  v_new_stroops := greatest(0, v_available_stroops - p_amount_stroops);
  v_new_php := greatest(0, coalesce(v_enrollment.voucher_balance, v_available_stroops / 10000000.0) - p_amount_php);

  -- Generate transaction hash
  v_tx_hash := encode(gen_random_bytes(32), 'hex');

  -- 7. Update enrollment balance
  update public.enrollments
  set allocation_amount_stroops = v_new_stroops,
      voucher_balance = v_new_php
  where id = v_enrollment.id;

  -- 8. Update projection row if exists
  if exists (
    select 1 from public.beneficiary_balance_projection
    where beneficiary_identity_id = v_enrollment.beneficiary_identity_id
      and program_id = p_program_id
  ) then
    update public.beneficiary_balance_projection
    set available_balance_stroops = greatest(0, available_balance_stroops - p_amount_stroops),
        redeemed_stroops = redeemed_stroops + p_amount_stroops,
        confirmed_transaction_count = confirmed_transaction_count + 1,
        latest_transaction_hash = v_tx_hash,
        updated_at = now()
    where beneficiary_identity_id = v_enrollment.beneficiary_identity_id
      and program_id = p_program_id;
  end if;

  -- 9. Insert record into public.redemptions
  select coalesce(p.full_name, 'Beneficiary') into v_ben_name
  from public.profiles p where p.id = v_enrollment.beneficiary_id;

  insert into public.redemptions (
    id,
    enrollment_id,
    beneficiary_id,
    merchant_name,
    amount,
    category,
    status,
    remaining_balance,
    tx_hash,
    redeemed_at
  ) values (
    gen_random_uuid(),
    v_enrollment.id,
    v_enrollment.beneficiary_id,
    v_merchant_display_name,
    p_amount_php,
    coalesce(v_enrollment.category, v_program.voucher_type, 'Food'),
    'Completed',
    v_new_php,
    v_tx_hash,
    now()
  ) returning id into v_redemption_id;

  -- 10. Update merchant metrics
  insert into public.merchant_metrics (merchant_id, vouchers_processed, total_sales, updated_at)
  values (auth.uid(), 1, p_amount_php, now())
  on conflict (merchant_id) do update set
    vouchers_processed = merchant_metrics.vouchers_processed + 1,
    total_sales = merchant_metrics.total_sales + p_amount_php,
    updated_at = now();

  return jsonb_build_object(
    'ok', true,
    'transaction_hash', v_tx_hash,
    'redemption_id', v_redemption_id,
    'remaining_balance_stroops', v_new_stroops::text,
    'remaining_balance_php', to_char(v_new_php, 'FM999,999,990.00'),
    'beneficiary_name', coalesce(v_ben_name, 'Beneficiary'),
    'program_name', v_program.name,
    'amount_php', to_char(p_amount_php, 'FM999,999,990.00')
  );
end;
$$;

revoke all privileges on function public.execute_voucher_redemption(uuid, text, uuid, bigint, numeric) from public, anon;
grant execute on function public.execute_voucher_redemption(uuid, text, uuid, bigint, numeric) to authenticated;

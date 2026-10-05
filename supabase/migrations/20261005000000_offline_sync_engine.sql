-- Migration: 20261005000000_offline_sync_engine.sql
-- Purpose:
-- 1. Extend public.redemptions with offline metadata: nonce, is_offline_sync, and rejection_reason.
-- 2. Extend public.notifications type constraint to support offline sync notices.
-- 3. Provide sync_offline_redemption_batch RPC for atomic, idempotent offline sync with overspend rejection.

-- 1. Alter public.redemptions table
alter table public.redemptions
  add column if not exists nonce text,
  add column if not exists is_offline_sync boolean default false,
  add column if not exists rejection_reason text;

create index if not exists idx_redemptions_merchant_nonce on public.redemptions(merchant_id, nonce)
  where nonce is not null;

-- 2. Extend notifications type check constraint if exists
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'notifications_type_check'
  ) then
    alter table public.notifications drop constraint notifications_type_check;
    alter table public.notifications add constraint notifications_type_check check (
      type in (
        'application_submitted',
        'application_approved',
        'application_rejected',
        'new_applicant',
        'merchant_payment_received',
        'aid_released',
        'offline_sync_rejection'
      )
    );
  end if;
end $$;

-- 3. Batch offline sync RPC
create or replace function public.sync_offline_redemption_batch(
  p_merchant_entity_id uuid,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_caller_profile_id uuid;
  v_merchant_user_id uuid;
  v_merchant_display_name text;
  v_item jsonb;
  v_nonce text;
  v_program_id uuid;
  v_beneficiary_identifier text;
  v_amount_stroops bigint;
  v_amount_php numeric;
  v_client_timestamp timestamptz;
  v_existing_tx record;
  v_enrollment record;
  v_ben_identity_id uuid;
  v_ben_name text;
  v_available_stroops bigint;
  v_new_stroops bigint;
  v_new_php numeric;
  v_tx_hash text;
  v_redemption_id uuid;
  v_program record;
  v_settled_count int := 0;
  v_rejected_count int := 0;
  v_results jsonb := '[]'::jsonb;
  v_item_result jsonb;
begin
  -- 1. Ensure caller owns merchant entity or has merchant role
  select me.profile_id, coalesce(me.display_name, 'Accredited Partner Store')
  into v_caller_profile_id, v_merchant_display_name
  from public.merchant_entities me
  where me.id = p_merchant_entity_id;

  if v_caller_profile_id is null or v_caller_profile_id <> auth.uid() then
    if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'merchant') then
      return jsonb_build_object(
        'ok', false,
        'error', 'Unauthorized: caller does not own this merchant account.'
      );
    end if;
  end if;

  v_merchant_user_id := coalesce(v_caller_profile_id, auth.uid());

  if p_items is null or jsonb_array_length(p_items) = 0 then
    return jsonb_build_object(
      'ok', true,
      'totalReceived', 0,
      'settledCount', 0,
      'rejectedCount', 0,
      'results', '[]'::jsonb
    );
  end if;

  -- 2. Process each offline redemption sequentially
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_nonce := btrim(coalesce(v_item->>'nonce', ''));
    v_program_id := (v_item->>'programId')::uuid;
    v_beneficiary_identifier := btrim(coalesce(v_item->>'beneficiaryWallet', v_item->>'beneficiaryId', ''));
    v_amount_stroops := coalesce((v_item->>'amountStroops')::bigint, 0);
    v_amount_php := coalesce((v_item->>'amountPhp')::numeric, (v_amount_stroops / 10000000.0)::numeric(10,2));
    v_client_timestamp := coalesce((v_item->>'clientTimestamp')::timestamptz, now());

    if v_nonce = '' or v_program_id is null or v_amount_stroops <= 0 then
      v_item_result := jsonb_build_object(
        'nonce', v_nonce,
        'status', 'rejected',
        'errorReason', 'INVALID_PAYLOAD',
        'message', 'Malformed redemption item.'
      );
      v_results := v_results || jsonb_build_array(v_item_result);
      v_rejected_count := v_rejected_count + 1;
      continue;
    end if;

    -- Idempotency check: Has this nonce already been settled?
    select r.id, r.tx_hash, r.status into v_existing_tx
    from public.redemptions r
    where r.merchant_id = p_merchant_entity_id
      and r.nonce = v_nonce
    limit 1;

    if found then
      if v_existing_tx.status = 'Completed' then
        v_item_result := jsonb_build_object(
          'nonce', v_nonce,
          'status', 'already_settled',
          'transactionHash', v_existing_tx.tx_hash,
          'redemptionId', v_existing_tx.id
        );
        v_results := v_results || jsonb_build_array(v_item_result);
        v_settled_count := v_settled_count + 1;
        continue;
      elsif v_existing_tx.status = 'Failed' then
        v_item_result := jsonb_build_object(
          'nonce', v_nonce,
          'status', 'rejected',
          'errorReason', 'BENEFICIARY_OVERSPENT_REJECTED',
          'message', 'Transaction previously rejected due to overspend.'
        );
        v_results := v_results || jsonb_build_array(v_item_result);
        v_rejected_count := v_rejected_count + 1;
        continue;
      end if;
    end if;

    -- Resolve program details
    select * into v_program from public.programs where id = v_program_id;
    if not found or v_program.status <> 'active' then
      v_item_result := jsonb_build_object(
        'nonce', v_nonce,
        'status', 'rejected',
        'errorReason', 'PROGRAM_NOT_ACTIVE',
        'message', 'Relief program is no longer active.'
      );
      v_results := v_results || jsonb_build_array(v_item_result);
      v_rejected_count := v_rejected_count + 1;
      continue;
    end if;

    -- Resolve beneficiary identity
    v_ben_identity_id := null;
    select w.owner_id into v_ben_identity_id
    from public.wallets w
    where w.address = v_beneficiary_identifier
      and w.owner_type = 'beneficiary_identity'
    order by w.is_active desc, w.created_at desc
    limit 1;

    if v_ben_identity_id is null then
      select bi.id into v_ben_identity_id
      from public.wallets w
      inner join public.beneficiary_identities bi on bi.user_id = w.owner_id
      where w.address = v_beneficiary_identifier
      order by w.is_active desc, w.created_at desc
      limit 1;
    end if;

    if v_ben_identity_id is null and v_beneficiary_identifier ~ '^[0-9a-f-]{36}$' then
      select bi.id into v_ben_identity_id
      from public.beneficiary_identities bi
      where bi.id = v_beneficiary_identifier::uuid;
    end if;

    if v_ben_identity_id is null and v_beneficiary_identifier ~ '^[0-9a-f-]{36}$' then
      select e.beneficiary_identity_id into v_ben_identity_id
      from public.enrollments e
      where e.id = v_beneficiary_identifier::uuid;
    end if;

    -- Locate enrollment
    select * into v_enrollment
    from public.enrollments e
    where (
      (v_ben_identity_id is not null and e.beneficiary_identity_id = v_ben_identity_id)
      or (v_beneficiary_identifier ~ '^[0-9a-f-]{36}$' and (
        e.id = v_beneficiary_identifier::uuid
        or e.beneficiary_id = v_beneficiary_identifier::uuid
        or e.beneficiary_identity_id = v_beneficiary_identifier::uuid
      ))
    )
      and e.program_id = v_program_id
      and e.approval_status = 'Approved'
    limit 1;

    if not found then
      v_item_result := jsonb_build_object(
        'nonce', v_nonce,
        'status', 'rejected',
        'errorReason', 'NOT_ENROLLED',
        'message', 'Beneficiary is not enrolled in this program.'
      );
      v_results := v_results || jsonb_build_array(v_item_result);
      v_rejected_count := v_rejected_count + 1;
      continue;
    end if;

    -- Resolve available balance
    if exists (
      select 1 from public.beneficiary_balance_projection
      where beneficiary_identity_id = v_enrollment.beneficiary_identity_id
        and program_id = v_program_id
    ) then
      select available_balance_stroops into v_available_stroops
      from public.beneficiary_balance_projection
      where beneficiary_identity_id = v_enrollment.beneficiary_identity_id
        and program_id = v_program_id;
    else
      v_available_stroops := greatest(
        0,
        (coalesce(v_enrollment.voucher_balance, v_enrollment.allocation_amount_stroops / 10000000.0, v_program.voucher_value, 100) * 10000000)
      )::bigint;
    end if;

    select coalesce(p.full_name, 'Beneficiary') into v_ben_name
    from public.profiles p where p.id = v_enrollment.beneficiary_id;

    -- CHECK OVERSPEND: If balance is insufficient, reject with notification
    if v_amount_stroops > v_available_stroops then
      -- Record failed redemption
      insert into public.redemptions (
        id,
        merchant_id,
        program_id,
        enrollment_id,
        beneficiary_id,
        merchant_name,
        amount,
        category,
        status,
        remaining_balance,
        nonce,
        is_offline_sync,
        rejection_reason,
        redeemed_at
      ) values (
        gen_random_uuid(),
        p_merchant_entity_id,
        v_program_id,
        v_enrollment.id,
        v_enrollment.beneficiary_id,
        v_merchant_display_name,
        v_amount_php,
        coalesce(v_enrollment.category, v_program.voucher_type, 'Food'),
        'Failed',
        (v_available_stroops / 10000000.0)::numeric(10,2),
        v_nonce,
        true,
        'BENEFICIARY_OVERSPENT_REJECTED',
        v_client_timestamp
      );

      -- Notify merchant
      insert into public.notifications (
        recipient_id,
        type,
        title,
        body,
        data,
        is_read,
        created_at
      ) values (
        v_merchant_user_id,
        'offline_sync_rejection',
        'Offline Redemption Rejected: Beneficiary Overspent',
        format('Voucher redemption of ₱%s for %s was rejected: beneficiary balance was already spent elsewhere.', to_char(v_amount_php, 'FM999,990.00'), v_ben_name),
        jsonb_build_object('nonce', v_nonce, 'programId', v_program_id, 'beneficiaryName', v_ben_name),
        false,
        now()
      );

      v_item_result := jsonb_build_object(
        'nonce', v_nonce,
        'status', 'rejected',
        'errorReason', 'BENEFICIARY_OVERSPENT_REJECTED',
        'message', format('Beneficiary %s has already overspent their voucher balance elsewhere.', v_ben_name)
      );
      v_results := v_results || jsonb_build_array(v_item_result);
      v_rejected_count := v_rejected_count + 1;
      continue;
    end if;

    -- BALANCE SUFFICIENT: Settle cleanly
    v_new_stroops := greatest(0, v_available_stroops - v_amount_stroops);
    v_new_php := greatest(0, coalesce(v_enrollment.voucher_balance, v_available_stroops / 10000000.0) - v_amount_php);
    v_tx_hash := encode(extensions.gen_random_bytes(32), 'hex');

    -- Update enrollment voucher balance
    update public.enrollments
    set voucher_balance = v_new_php
    where id = v_enrollment.id;

    -- Update projection row if exists
    if exists (
      select 1 from public.beneficiary_balance_projection
      where beneficiary_identity_id = v_enrollment.beneficiary_identity_id
        and program_id = v_program_id
    ) then
      update public.beneficiary_balance_projection
      set available_balance_stroops = greatest(0, available_balance_stroops - v_amount_stroops),
          redeemed_stroops = redeemed_stroops + v_amount_stroops,
          confirmed_transaction_count = confirmed_transaction_count + 1,
          projection_version = projection_version + 1,
          updated_at = now()
      where beneficiary_identity_id = v_enrollment.beneficiary_identity_id
        and program_id = v_program_id;
    end if;

    -- Insert completed redemption
    insert into public.redemptions (
      id,
      merchant_id,
      program_id,
      enrollment_id,
      beneficiary_id,
      merchant_name,
      amount,
      category,
      status,
      remaining_balance,
      tx_hash,
      nonce,
      is_offline_sync,
      redeemed_at
    ) values (
      gen_random_uuid(),
      p_merchant_entity_id,
      v_program_id,
      v_enrollment.id,
      v_enrollment.beneficiary_id,
      v_merchant_display_name,
      v_amount_php,
      coalesce(v_enrollment.category, v_program.voucher_type, 'Food'),
      'Completed',
      v_new_php,
      v_tx_hash,
      v_nonce,
      true,
      v_client_timestamp
    ) returning id into v_redemption_id;

    -- Update merchant metrics
    insert into public.merchant_metrics (merchant_id, vouchers_processed, total_sales, updated_at)
    values (v_merchant_user_id, 1, v_amount_php, now())
    on conflict (merchant_id) do update set
      vouchers_processed = merchant_metrics.vouchers_processed + 1,
      total_sales = merchant_metrics.total_sales + v_amount_php,
      updated_at = now();

    v_item_result := jsonb_build_object(
      'nonce', v_nonce,
      'status', 'settled',
      'transactionHash', v_tx_hash,
      'redemptionId', v_redemption_id,
      'remainingBalancePhp', to_char(v_new_php, 'FM999,999,990.00'),
      'remainingBalanceStroops', v_new_stroops::text
    );
    v_results := v_results || jsonb_build_array(v_item_result);
    v_settled_count := v_settled_count + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'totalReceived', jsonb_array_length(p_items),
    'settledCount', v_settled_count,
    'rejectedCount', v_rejected_count,
    'results', v_results
  );
end;
$$;

revoke all privileges on function public.sync_offline_redemption_batch(uuid, jsonb) from public, anon;
grant execute on function public.sync_offline_redemption_batch(uuid, jsonb) to authenticated;

-- Migration: 20261004040000_voucher_scan_and_lifecycle_sync.sql
-- Purpose:
-- 1. Add scanned_at column to public.enrollments to track when a merchant scans a voucher.
-- 2. Add public.record_voucher_scan RPC for merchants to record when a voucher QR is scanned.
-- 3. Add tables to supabase_realtime publication to enable live reactive subscription in beneficiary app.

alter table public.enrollments
  add column if not exists scanned_at timestamptz;

do $$
begin
  begin
    alter publication supabase_realtime add table public.enrollments;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.redemptions;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.beneficiary_balance_projection;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.payment_intents;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.notifications;
  exception when duplicate_object then null;
  end;
end $$;

create or replace function public.record_voucher_scan(
  p_merchant_entity_id uuid default null,
  p_beneficiary_identifier text default null,
  p_program_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_ben_identity_id uuid;
  v_enrollment record;
  v_clean_identifier text;
  v_scan_time timestamptz := now();
begin
  v_clean_identifier := btrim(coalesce(p_beneficiary_identifier, ''));

  -- Locate beneficiary identity by wallet address or id
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

  -- Locate approved enrollment
  select e.*
  into v_enrollment
  from public.enrollments e
  where (
    (v_ben_identity_id is not null and e.beneficiary_identity_id = v_ben_identity_id)
    or (v_clean_identifier ~ '^[0-9a-f-]{36}$' and e.id = v_clean_identifier::uuid)
  )
    and (p_program_id is null or e.program_id = p_program_id)
    and e.approval_status = 'Approved'
  order by e.created_at desc
  limit 1;

  if v_enrollment.id is not null then
    update public.enrollments
    set scanned_at = coalesce(v_enrollment.scanned_at, v_scan_time)
    where id = v_enrollment.id;

    return jsonb_build_object(
      'ok', true,
      'enrollment_id', v_enrollment.id,
      'scanned_at', coalesce(v_enrollment.scanned_at, v_scan_time)
    );
  end if;

  return jsonb_build_object('ok', false, 'error', 'No active approved enrollment found to mark scanned.');
end;
$$;

revoke all privileges on function public.record_voucher_scan(uuid, text, uuid) from public, anon;
grant execute on function public.record_voucher_scan(uuid, text, uuid) to authenticated;

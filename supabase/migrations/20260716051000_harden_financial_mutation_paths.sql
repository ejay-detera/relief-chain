-- Remove direct client mutation of financial truth and sensitive bindings.
-- Trusted Edge Functions use service credentials; authenticated users retain
-- only RLS-scoped reads plus the narrow program-geography RPC below.

create or replace function private.protect_confirmed_financial_history()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  previous_status text := lower(coalesce(
    to_jsonb(old) ->> 'status',
    to_jsonb(old) ->> 'confirmation_status',
    ''
  ));
begin
  if tg_table_name in ('disbursements', 'ledger_transactions', 'contract_events')
    or previous_status in ('confirmed', 'completed') then
    raise exception 'confirmed financial history is immutable'
      using errcode = '23514';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all privileges on function private.protect_confirmed_financial_history()
  from public, anon, authenticated;

do $$
declare
  table_name text;
  policy_record record;
  sensitive_tables constant text[] := array[
    'redemptions', 'disbursements', 'wallets', 'merchant_entities',
    'merchant_accreditations', 'program_merchants', 'financial_intents',
    'transaction_attempts', 'voucher_redemptions', 'settlements', 'refunds',
    'ledger_transactions', 'contract_events',
    'beneficiary_balance_projection', 'merchant_balance_projection',
    'program_financial_projection', 'distribution_job_projection'
  ];
begin
  foreach table_name in array sensitive_tables loop
    if to_regclass(format('public.%I', table_name)) is null then
      continue;
    end if;

    execute format('alter table public.%I enable row level security', table_name);
    execute format(
      'revoke insert, update, delete, truncate on table public.%I from public, anon, authenticated',
      table_name
    );

    for policy_record in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = table_name
        and cmd in ('ALL', 'INSERT', 'UPDATE', 'DELETE')
    loop
      execute format(
        'drop policy if exists %I on public.%I',
        policy_record.policyname,
        table_name
      );
    end loop;
  end loop;
end
$$;

-- Defense in depth for records that trusted reconciliation has confirmed.
do $$
declare
  table_name text;
  history_tables constant text[] := array[
    'redemptions', 'disbursements', 'voucher_redemptions', 'settlements',
    'refunds', 'ledger_transactions', 'contract_events'
  ];
begin
  foreach table_name in array history_tables loop
    if to_regclass(format('public.%I', table_name)) is null then
      continue;
    end if;

    execute format(
      'drop trigger if exists protect_confirmed_financial_history on public.%I',
      table_name
    );
    execute format(
      'create trigger protect_confirmed_financial_history '
      || 'before update or delete on public.%I for each row '
      || 'execute function private.protect_confirmed_financial_history()',
      table_name
    );
  end loop;
end
$$;

-- Remove both the historical global policies and the later direct-management
-- replacements. Reads remain organization-scoped under Task 3.1 policies.
drop policy if exists "LGU can delete redemptions" on public.redemptions;
drop policy if exists "Organization administrators can delete redemptions"
  on public.redemptions;
drop policy if exists "Allow read/write access to authenticated users on program_areas"
  on public.program_areas;
drop policy if exists "Allow read/write access to authenticated users on program_barangays"
  on public.program_barangays;
drop policy if exists "Program managers can manage program areas"
  on public.program_areas;
drop policy if exists "Program managers can manage program barangays"
  on public.program_barangays;

revoke all privileges on table public.program_areas from anon;
revoke all privileges on table public.program_barangays from anon;
revoke insert, update, delete, truncate on table public.program_areas
  from authenticated;
revoke insert, update, delete, truncate on table public.program_barangays
  from authenticated;
grant select on table public.program_areas to authenticated;
grant select on table public.program_barangays to authenticated;

create or replace function public.replace_program_geography(
  p_program_id uuid,
  p_area_ids integer[] default '{}'::integer[],
  p_barangay_ids integer[] default '{}'::integer[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  area_ids integer[] := coalesce(p_area_ids, '{}'::integer[]);
  barangay_ids integer[] := coalesce(p_barangay_ids, '{}'::integer[]);
begin
  if (select auth.uid()) is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if not private.has_program_organization_role(
    p_program_id,
    array[
      'organization_administrator',
      'program_manager'
    ]::public.organization_membership_role[]
  ) then
    raise exception 'not authorized to manage program geography'
      using errcode = '42501';
  end if;

  perform 1
  from public.programs
  where id = p_program_id
  for update;

  if not found then
    raise exception 'program not found' using errcode = 'P0002';
  end if;

  if array_position(area_ids, null) is not null
    or array_position(barangay_ids, null) is not null then
    raise exception 'program geography identifiers cannot be null'
      using errcode = '22004';
  end if;

  if exists (
    select unnest(area_ids)
    except
    select id from public.areas
  ) then
    raise exception 'program geography contains an unknown area'
      using errcode = '23503';
  end if;

  if exists (
    select unnest(barangay_ids)
    except
    select barangay.id
    from public.barangays barangay
    where barangay.area_id = any (area_ids)
  ) then
    raise exception 'program barangay must belong to a selected area'
      using errcode = '23514';
  end if;

  delete from public.program_barangays where program_id = p_program_id;
  delete from public.program_areas where program_id = p_program_id;

  insert into public.program_areas (program_id, area_id)
  select p_program_id, area_id
  from unnest(area_ids) as area_id
  group by area_id;

  insert into public.program_barangays (program_id, barangay_id)
  select p_program_id, barangay_id
  from unnest(barangay_ids) as barangay_id
  group by barangay_id;
end;
$$;

revoke all privileges on function public.replace_program_geography(
  uuid, integer[], integer[]
) from public, anon, authenticated;
grant execute on function public.replace_program_geography(
  uuid, integer[], integer[]
) to authenticated;

comment on function public.replace_program_geography(uuid, integer[], integer[])
is 'Atomically replaces program geography after organization-role authorization; direct table mutation is denied.';

-- Migration: 20261004100000_merchant_program_applications.sql
-- Purpose: Support fair merchant aid program discovery, voluntary application, and admin approval.
-- Merchants can discover draft or active programs, apply to accept vouchers, and admins can approve or reject applications.
-- Only accepted merchants can be selected for programs on the admin side.

-- 1. Create merchant_program_applications table
create table if not exists public.merchant_program_applications (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  merchant_id uuid not null references public.merchant_entities(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
  notes text check (notes is null or length(notes) <= 500),
  rejection_reason text check (rejection_reason is null or length(rejection_reason) <= 500),
  applied_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint merchant_program_applications_unique unique (program_id, merchant_id)
);

create index if not exists merchant_prog_apps_program_idx
  on public.merchant_program_applications (program_id, status);

create index if not exists merchant_prog_apps_merchant_idx
  on public.merchant_program_applications (merchant_id, status);

-- 2. Row Level Security on merchant_program_applications
alter table public.merchant_program_applications enable row level security;

-- Select: merchants view their own applications; org members view applications for their org's programs
drop policy if exists "Merchants can view own program applications" on public.merchant_program_applications;
create policy "Merchants can view own program applications"
on public.merchant_program_applications
for select
to authenticated
using (
  merchant_id in (
    select me.id from public.merchant_entities me where me.profile_id = auth.uid()
  )
  or program_id in (
    select p.id from public.programs p
    where exists (
      select 1 from public.organization_memberships om
      where om.organization_id = p.organization_id
        and om.user_id = auth.uid()
        and om.is_active = true
    ) or exists (
      select 1 from public.organizations o
      where o.id = p.organization_id
        and o.created_by = auth.uid()
    )
  )
);

-- Insert: merchants can insert their own application
drop policy if exists "Merchants can submit application for own entity" on public.merchant_program_applications;
create policy "Merchants can submit application for own entity"
on public.merchant_program_applications
for insert
to authenticated
with check (
  merchant_id in (
    select me.id from public.merchant_entities me where me.profile_id = auth.uid()
  )
);

-- Update: merchants can withdraw own application, or org admins can review applications
drop policy if exists "Merchants or org admins can update applications" on public.merchant_program_applications;
create policy "Merchants or org admins can update applications"
on public.merchant_program_applications
for update
to authenticated
using (
  merchant_id in (
    select me.id from public.merchant_entities me where me.profile_id = auth.uid()
  )
  or program_id in (
    select p.id from public.programs p
    where exists (
      select 1 from public.organization_memberships om
      where om.organization_id = p.organization_id
        and om.user_id = auth.uid()
        and om.is_active = true
    ) or exists (
      select 1 from public.organizations o
      where o.id = p.organization_id
        and o.created_by = auth.uid()
    )
  )
);

grant select, insert, update on public.merchant_program_applications to authenticated;
grant all privileges on public.merchant_program_applications to service_role;

-- 3. RPC: Get available aid programs for merchants (Draft and Active) with application status
create or replace function public.get_merchant_available_programs()
returns table (
  id uuid,
  name text,
  purpose text,
  organization_id uuid,
  organization_name text,
  voucher_value numeric,
  voucher_types text[],
  voucher_quantity integer,
  voucher_expiration timestamptz,
  distribution_method text,
  start_date timestamptz,
  expires_at timestamptz,
  distribution_start timestamptz,
  distribution_end timestamptz,
  status text,
  created_at timestamptz,
  application_id uuid,
  application_status text,
  applied_at timestamptz,
  rejection_reason text,
  notes text
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller_id uuid := auth.uid();
  v_merchant_id uuid;
begin
  if v_caller_id is null then
    raise exception 'Unauthorized: caller must be authenticated' using errcode = '42501';
  end if;

  select me.id into v_merchant_id
  from public.merchant_entities me
  where me.profile_id = v_caller_id
  limit 1;

  return query
  select
    p.id,
    p.name,
    coalesce(p.purpose, 'Relief aid assistance program.') as purpose,
    p.organization_id,
    coalesce(o.name, 'Aid Organization') as organization_name,
    coalesce(p.voucher_value, 0)::numeric as voucher_value,
    coalesce(p.voucher_types, array[]::text[]) as voucher_types,
    coalesce(p.voucher_quantity, 1)::integer as voucher_quantity,
    p.voucher_expiration::timestamptz,
    coalesce(p.distribution_method, 'Standard') as distribution_method,
    p.start_date::timestamptz,
    p.expires_at::timestamptz,
    p.distribution_start::timestamptz,
    p.distribution_end::timestamptz,
    coalesce(p.status, 'active') as status,
    p.created_at::timestamptz,
    mpa.id as application_id,
    coalesce(mpa.status, 'none') as application_status,
    mpa.applied_at,
    mpa.rejection_reason,
    mpa.notes
  from public.programs p
  left join public.organizations o on o.id = p.organization_id
  left join public.merchant_program_applications mpa
    on mpa.program_id = p.id
    and mpa.merchant_id = v_merchant_id
  where p.status in ('draft', 'active', 'scheduled', 'funding')
  order by p.created_at desc;
end;
$$;

revoke all on function public.get_merchant_available_programs() from public, anon;
grant execute on function public.get_merchant_available_programs() to authenticated, service_role;

-- 4. RPC: Apply for aid program as a merchant
create or replace function public.apply_for_merchant_program(
  p_program_id uuid,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller_id uuid := auth.uid();
  v_merchant_id uuid;
  v_app_id uuid;
  v_prog_status text;
  v_trimmed_notes text := btrim(coalesce(p_notes, ''));
begin
  if v_caller_id is null then
    raise exception 'Unauthorized: caller must be authenticated' using errcode = '42501';
  end if;

  select me.id into v_merchant_id
  from public.merchant_entities me
  where me.profile_id = v_caller_id
  limit 1;

  if v_merchant_id is null then
    -- Attempt auto-provisioning merchant entity if profile is merchant
    if exists (select 1 from public.profiles where id = v_caller_id and role = 'merchant') then
      insert into public.merchant_entities (profile_id, display_name)
      select v_caller_id, coalesce(nullif(btrim(full_name), ''), 'Merchant')
      from public.profiles
      where id = v_caller_id
      returning id into v_merchant_id;
    else
      raise exception 'Caller does not possess a merchant profile' using errcode = '42501';
    end if;
  end if;

  select status into v_prog_status
  from public.programs
  where id = p_program_id;

  if v_prog_status is null then
    raise exception 'Program not found' using errcode = 'P0002';
  end if;

  if v_prog_status not in ('draft', 'active', 'scheduled', 'funding') then
    raise exception 'Program is not open for applications (status: %)', v_prog_status using errcode = '23514';
  end if;

  insert into public.merchant_program_applications (
    program_id,
    merchant_id,
    status,
    notes,
    applied_at,
    updated_at
  ) values (
    p_program_id,
    v_merchant_id,
    'pending',
    nullif(v_trimmed_notes, ''),
    now(),
    now()
  )
  on conflict (program_id, merchant_id) do update set
    status = 'pending',
    notes = coalesce(nullif(v_trimmed_notes, ''), merchant_program_applications.notes),
    rejection_reason = null,
    applied_at = now(),
    updated_at = now()
  returning id into v_app_id;

  return v_app_id;
end;
$$;

revoke all on function public.apply_for_merchant_program(uuid, text) from public, anon;
grant execute on function public.apply_for_merchant_program(uuid, text) to authenticated, service_role;

-- 5. RPC: Withdraw application by merchant
create or replace function public.withdraw_merchant_program_application(
  p_program_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller_id uuid := auth.uid();
  v_merchant_id uuid;
begin
  if v_caller_id is null then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  select me.id into v_merchant_id
  from public.merchant_entities me
  where me.profile_id = v_caller_id
  limit 1;

  if v_merchant_id is null then
    return false;
  end if;

  update public.merchant_program_applications
  set status = 'withdrawn', updated_at = now()
  where program_id = p_program_id
    and merchant_id = v_merchant_id
    and status = 'pending';

  return found;
end;
$$;

revoke all on function public.withdraw_merchant_program_application(uuid) from public, anon;
grant execute on function public.withdraw_merchant_program_application(uuid) to authenticated, service_role;

-- 6. RPC: Fetch merchant applications for a specific program (LGU / Org Admin)
create or replace function public.get_program_merchant_applications(
  p_program_id uuid
)
returns table (
  application_id uuid,
  program_id uuid,
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
  v_prog_org_id uuid;
begin
  if v_caller_id is null then
    raise exception 'Unauthorized: caller must be authenticated' using errcode = '42501';
  end if;

  select p.organization_id into v_prog_org_id
  from public.programs p
  where p.id = p_program_id;

  if v_prog_org_id is null then
    raise exception 'Program not found' using errcode = 'P0002';
  end if;

  -- Ensure caller belongs to program organization
  if not exists (
    select 1 from public.organization_memberships om
    where om.organization_id = v_prog_org_id
      and om.user_id = v_caller_id
      and om.is_active = true
  ) and not exists (
    select 1 from public.organizations o
    where o.id = v_prog_org_id
      and o.created_by = v_caller_id
  ) then
    raise exception 'Forbidden: caller does not manage this program' using errcode = '42501';
  end if;

  return query
  select
    mpa.id as application_id,
    mpa.program_id,
    mpa.merchant_id,
    coalesce(me.display_name, p.full_name, 'Merchant Store') as display_name,
    p.full_name as owner_name,
    p.mobile_number,
    p.stellar_pubkey,
    mpa.status,
    mpa.notes,
    mpa.rejection_reason,
    mpa.applied_at,
    mpa.reviewed_at
  from public.merchant_program_applications mpa
  join public.merchant_entities me on me.id = mpa.merchant_id
  left join public.profiles p on p.id = me.profile_id
  where mpa.program_id = p_program_id
  order by mpa.applied_at desc;
end;
$$;

revoke all on function public.get_program_merchant_applications(uuid) from public, anon;
grant execute on function public.get_program_merchant_applications(uuid) to authenticated, service_role;

-- 7. RPC: Review merchant program application (Accept / Reject)
create or replace function public.review_merchant_program_application(
  p_application_id uuid,
  p_status text,
  p_rejection_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller_id uuid := auth.uid();
  v_app record;
  v_prog record;
  v_merchant_name text;
  v_normalized_status text := lower(btrim(p_status));
  v_reason text := btrim(coalesce(p_rejection_reason, ''));
  v_current_merchants jsonb;
  v_new_merchants jsonb;
begin
  if v_caller_id is null then
    raise exception 'Unauthorized: caller must be authenticated' using errcode = '42501';
  end if;

  if v_normalized_status not in ('approved', 'rejected') then
    raise exception 'Invalid status: must be approved or rejected' using errcode = '22P02';
  end if;

  if v_normalized_status = 'rejected' and v_reason = '' then
    raise exception 'A rejection reason is required' using errcode = '23514';
  end if;

  -- Load application
  select * into v_app
  from public.merchant_program_applications
  where id = p_application_id;

  if v_app.id is null then
    raise exception 'Application % not found', p_application_id using errcode = 'P0002';
  end if;

  -- Load program
  select * into v_prog
  from public.programs
  where id = v_app.program_id;

  if v_prog.id is null then
    raise exception 'Associated program not found' using errcode = 'P0002';
  end if;

  -- Verify caller manages the program's organization
  if not exists (
    select 1 from public.organization_memberships om
    where om.organization_id = v_prog.organization_id
      and om.user_id = v_caller_id
      and om.is_active = true
  ) and not exists (
    select 1 from public.organizations o
    where o.id = v_prog.organization_id
      and o.created_by = v_caller_id
  ) then
    raise exception 'Forbidden: caller does not manage this program' using errcode = '42501';
  end if;

  -- Resolve merchant display name
  select coalesce(me.display_name, p.full_name, 'Merchant Store') into v_merchant_name
  from public.merchant_entities me
  left join public.profiles p on p.id = me.profile_id
  where me.id = v_app.merchant_id;

  -- Update application record
  update public.merchant_program_applications
  set
    status = v_normalized_status,
    rejection_reason = case when v_normalized_status = 'rejected' then v_reason else null end,
    reviewed_by = v_caller_id,
    reviewed_at = now(),
    updated_at = now()
  where id = p_application_id;

  -- Synchronize programs.selected_merchants
  v_current_merchants := coalesce(v_prog.selected_merchants, '[]'::jsonb);
  if jsonb_typeof(v_current_merchants) <> 'array' then
    v_current_merchants := '[]'::jsonb;
  end if;

  if v_normalized_status = 'approved' then
    -- Add to selected_merchants if not already there
    if not exists (
      select 1 from jsonb_array_elements_text(v_current_merchants) elem
      where lower(btrim(elem)) = lower(btrim(v_merchant_name))
    ) then
      v_new_merchants := v_current_merchants || jsonb_build_array(v_merchant_name);
      update public.programs
      set selected_merchants = v_new_merchants
      where id = v_prog.id;
    end if;

    -- Also guarantee merchant_accreditations record exists for this organization
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
      v_prog.organization_id,
      v_app.merchant_id,
      coalesce((v_prog.voucher_types)[1], 'General'),
      'active',
      now(),
      coalesce(v_prog.expires_at, now() + interval '1 year'),
      v_caller_id,
      now(),
      now(),
      now()
    )
    on conflict (organization_id, merchant_id, category) do update set
      status = 'active',
      valid_until = greatest(merchant_accreditations.valid_until, excluded.valid_until),
      updated_at = now();

  elsif v_normalized_status = 'rejected' then
    -- Remove from selected_merchants if present
    select coalesce(jsonb_agg(elem), '[]'::jsonb) into v_new_merchants
    from jsonb_array_elements_text(v_current_merchants) elem
    where lower(btrim(elem)) <> lower(btrim(v_merchant_name));

    update public.programs
    set selected_merchants = v_new_merchants
    where id = v_prog.id;
  end if;

  return true;
end;
$$;

revoke all on function public.review_merchant_program_application(uuid, text, text) from public, anon;
grant execute on function public.review_merchant_program_application(uuid, text, text) to authenticated, service_role;

-- 8. RPC: Get accepted merchants for program selection on admin side
create or replace function public.get_program_accepted_merchants(
  p_program_id uuid default null,
  p_org_id uuid default null
)
returns table (
  merchant_id uuid,
  display_name text
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_effective_org_id uuid;
begin
  v_effective_org_id := private.resolve_caller_organization_id(p_org_id);

  if p_program_id is not null then
    -- Return merchants who have an approved application for this program
    return query
    select distinct
      me.id as merchant_id,
      coalesce(me.display_name, p.full_name, 'Merchant Store') as display_name
    from public.merchant_program_applications mpa
    join public.merchant_entities me on me.id = mpa.merchant_id
    left join public.profiles p on p.id = me.profile_id
    where mpa.program_id = p_program_id
      and mpa.status = 'approved'
    order by display_name asc;

    if found then
      return;
    end if;
  end if;

  -- Otherwise, or if no program-specific applications exist yet,
  -- return merchants who have active accreditation with this organization
  return query
  select distinct
    me.id as merchant_id,
    coalesce(me.display_name, p.full_name, 'Merchant Store') as display_name
  from public.merchant_accreditations ma
  join public.merchant_entities me on me.id = ma.merchant_id
  left join public.profiles p on p.id = me.profile_id
  where ma.organization_id = v_effective_org_id
    and ma.status = 'active'
    and now() between ma.valid_from and ma.valid_until
  order by display_name asc;
end;
$$;

revoke all on function public.get_program_accepted_merchants(uuid, uuid) from public, anon;
grant execute on function public.get_program_accepted_merchants(uuid, uuid) to authenticated, service_role;

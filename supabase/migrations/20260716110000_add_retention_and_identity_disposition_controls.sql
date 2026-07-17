-- Add configurable evidence retention and auditable identity disposition workflows.
-- The pilot default is provisional until qualified Philippine counsel approves production use.

do $$
begin
  create type public.retention_record_type as enum (
    'financial_approval', 'receipt', 'dispute', 'audit_evidence'
  );
exception when duplicate_object then null;
end
$$;

do $$
begin
  create type public.retention_policy_review_status as enum (
    'provisional', 'pending_counsel', 'approved', 'rejected'
  );
exception when duplicate_object then null;
end
$$;

do $$
begin
  create type public.retention_disposition_status as enum (
    'retained', 'eligible', 'disposed'
  );
exception when duplicate_object then null;
end
$$;

do $$
begin
  create type public.identity_disposition_method as enum ('anonymize', 'delete');
exception when duplicate_object then null;
end
$$;

do $$
begin
  create type public.identity_disposition_status as enum (
    'requested', 'reviewing', 'approved',
    'awaiting_external_deletion', 'completed', 'rejected', 'cancelled'
  );
exception when duplicate_object then null;
end
$$;

do $$
begin
  create type public.identity_data_status as enum (
    'active', 'anonymized', 'deletion_pending', 'deleted'
  );
exception when duplicate_object then null;
end
$$;
alter table public.programs
  add column if not exists closed_at timestamptz;

-- `public.programs` has no `updated_at` column in the recovered baseline;
-- fall back to the creation time, then the current time.
update public.programs
set closed_at = coalesce(created_at, now())
where status = 'closed' and closed_at is null;

create or replace function private.set_program_closed_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'closed' then
      new.closed_at := coalesce(new.closed_at, now());
    elsif new.closed_at is not null then
      raise exception 'only closed programs may have a closure time'
        using errcode = '23514';
    end if;
  elsif new.status = 'closed' and old.status is distinct from 'closed' then
    new.closed_at := coalesce(new.closed_at, now());
  elsif old.status = 'closed' and new.closed_at is distinct from old.closed_at then
    raise exception 'program closure time is immutable'
      using errcode = '23514';
  elsif new.status <> 'closed' and new.closed_at is not null then
    raise exception 'only closed programs may have a closure time'
      using errcode = '23514';
  end if;

  if new.closed_at is not null and new.closed_at > now() then
    raise exception 'program closure time cannot be in the future'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger programs_a_set_closed_at
before insert or update of status, closed_at on public.programs
for each row execute function private.set_program_closed_at();

create table public.retention_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  record_type public.retention_record_type not null,
  policy_version integer not null check (policy_version > 0),
  retention_period interval not null default interval '7 years'
    check (retention_period >= interval '1 day'
      and retention_period <= interval '100 years'),
  review_status public.retention_policy_review_status not null default 'provisional',
  counsel_reference text check (
    counsel_reference is null or length(btrim(counsel_reference)) between 3 and 500
  ),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  correlation_id uuid not null,
  effective_at timestamptz not null default now(),
  superseded_at timestamptz,
  created_at timestamptz not null default now(),
  constraint retention_policies_organization_type_version_key
    unique (organization_id, record_type, policy_version),
  constraint retention_policies_counsel_review_check check (
    review_status <> 'approved'
    or (counsel_reference is not null and reviewed_by is not null and reviewed_at is not null)
  ),
  constraint retention_policies_superseded_order_check check (
    superseded_at is null or superseded_at >= effective_at
  )
);

create unique index retention_policies_current_idx
  on public.retention_policies (organization_id, record_type)
  where superseded_at is null;
create index retention_policies_history_idx
  on public.retention_policies (organization_id, record_type, policy_version desc);

create table public.retention_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  program_id uuid not null references public.programs(id) on delete restrict,
  record_type public.retention_record_type not null,
  subject_table text not null check (
    subject_table ~ '^[a-z][a-z0-9_]{1,62}$'
  ),
  subject_id uuid not null,
  policy_id uuid not null references public.retention_policies(id) on delete restrict,
  policy_version integer not null check (policy_version > 0),
  retention_started_at timestamptz not null,
  retention_period interval not null check (retention_period >= interval '1 day'),
  retain_until timestamptz not null,
  legal_hold_until timestamptz,
  legal_hold_reason text check (
    legal_hold_reason is null or length(btrim(legal_hold_reason)) between 3 and 1000
  ),
  disposition_status public.retention_disposition_status not null default 'retained',
  disposed_at timestamptz,
  disposed_by uuid references auth.users(id) on delete set null,
  disposition_reference text check (
    disposition_reference is null
    or length(btrim(disposition_reference)) between 3 and 500
  ),
  correlation_id uuid not null,
  created_at timestamptz not null default now(),
  constraint retention_records_subject_key
    unique (record_type, subject_table, subject_id),
  constraint retention_records_window_check check (
    retain_until = retention_started_at + retention_period
  ),
  constraint retention_records_legal_hold_check check (
    (legal_hold_until is null and legal_hold_reason is null)
    or (legal_hold_until is not null and legal_hold_reason is not null)
  ),
  constraint retention_records_disposition_check check (
    (disposition_status <> 'disposed'
      and disposed_at is null and disposed_by is null and disposition_reference is null)
    or (disposition_status = 'disposed'
      and disposed_at is not null and disposed_by is not null
      and disposition_reference is not null)
  )
);

create index retention_records_due_idx
  on public.retention_records (organization_id, disposition_status, retain_until)
  where disposition_status <> 'disposed';
create index retention_records_program_type_idx
  on public.retention_records (program_id, record_type, retain_until);
alter table public.beneficiary_identities
  add column if not exists data_status public.identity_data_status not null default 'active',
  add column if not exists anonymized_at timestamptz,
  add column if not exists disposition_request_id uuid;

create table public.identity_disposition_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  beneficiary_identity_id uuid not null
    references public.beneficiary_identities(id) on delete restrict,
  subject_user_id uuid,
  method public.identity_disposition_method not null,
  status public.identity_disposition_status not null default 'requested',
  eligible_after timestamptz,
  requested_by uuid not null references auth.users(id) on delete restrict,
  requested_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id) on delete restrict,
  reviewed_at timestamptz,
  completed_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  legal_hold_until timestamptz,
  legal_hold_reason text check (
    legal_hold_reason is null or length(btrim(legal_hold_reason)) between 3 and 1000
  ),
  decision_reason text check (
    decision_reason is null or length(btrim(decision_reason)) between 3 and 1000
  ),
  external_deletion_reference text check (
    external_deletion_reference is null
    or length(btrim(external_deletion_reference)) between 3 and 500
  ),
  correlation_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint identity_disposition_hold_check check (
    (legal_hold_until is null and legal_hold_reason is null)
    or (legal_hold_until is not null and legal_hold_reason is not null)
  ),
  constraint identity_disposition_completion_check check (
    (status <> 'completed' and completed_at is null)
    or (status = 'completed' and completed_at is not null)
  )
);

alter table public.beneficiary_identities
  add constraint beneficiary_identities_disposition_request_fkey
  foreign key (disposition_request_id)
  references public.identity_disposition_requests(id) on delete restrict;

create unique index identity_disposition_requests_open_idx
  on public.identity_disposition_requests (beneficiary_identity_id)
  where status not in ('completed', 'rejected', 'cancelled');
create index identity_disposition_requests_work_queue_idx
  on public.identity_disposition_requests (organization_id, status, eligible_after);

create trigger identity_disposition_requests_set_updated_at
before update on public.identity_disposition_requests
for each row execute function private.set_updated_at();

create or replace function private.seed_retention_policies_for_organization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.retention_policies (
    organization_id, record_type, policy_version, retention_period,
    review_status, created_by, correlation_id
  )
  select
    new.id, record_type, 1, interval '7 years',
    'provisional'::public.retention_policy_review_status,
    new.created_by, gen_random_uuid()
  from unnest(enum_range(null::public.retention_record_type)) as record_type;
  return new;
end;
$$;

create trigger organizations_seed_retention_policies
after insert on public.organizations
for each row execute function private.seed_retention_policies_for_organization();

insert into public.retention_policies (
  organization_id, record_type, policy_version, retention_period,
  review_status, created_by, correlation_id
)
select
  organization.id, record_type, 1, interval '7 years',
  'provisional'::public.retention_policy_review_status,
  organization.created_by, gen_random_uuid()
from public.organizations organization
cross join unnest(enum_range(null::public.retention_record_type)) as record_type
on conflict (organization_id, record_type, policy_version) do nothing;
create or replace function public.replace_retention_policy(
  p_organization_id uuid,
  p_record_type public.retention_record_type,
  p_retention_period interval,
  p_review_status public.retention_policy_review_status,
  p_counsel_reference text,
  p_actor_id uuid,
  p_correlation_id uuid
)
returns public.retention_policies
language plpgsql
security definer
set search_path = ''
as $$
declare
  prior_policy public.retention_policies;
  result public.retention_policies;
begin
  if p_correlation_id is null or p_actor_id is null then
    raise exception 'retention policy changes require actor and correlation evidence'
      using errcode = '22004';
  end if;
  if p_retention_period < interval '1 day'
    or p_retention_period > interval '100 years' then
    raise exception 'retention period must be between one day and one hundred years'
      using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.organization_memberships membership
    where membership.organization_id = p_organization_id
      and membership.user_id = p_actor_id
      and membership.is_active
      and membership.role = 'organization_administrator'
  ) then
    raise exception 'active organization administrator is required'
      using errcode = '42501';
  end if;
  if p_review_status = 'approved'
    and (nullif(btrim(p_counsel_reference), '') is null) then
    raise exception 'approved production policy requires counsel reference'
      using errcode = '23514';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_organization_id::text || ':' || p_record_type::text, 0
  ));

  select * into strict prior_policy
  from public.retention_policies
  where organization_id = p_organization_id
    and record_type = p_record_type
    and superseded_at is null
  for update;

  update public.retention_policies
  set superseded_at = now()
  where id = prior_policy.id;

  insert into public.retention_policies (
    organization_id, record_type, policy_version, retention_period,
    review_status, counsel_reference, reviewed_by, reviewed_at,
    created_by, correlation_id
  ) values (
    p_organization_id, p_record_type, prior_policy.policy_version + 1,
    p_retention_period, p_review_status, nullif(btrim(p_counsel_reference), ''),
    case when p_review_status = 'approved' then p_actor_id else null end,
    case when p_review_status = 'approved' then now() else null end,
    p_actor_id, p_correlation_id
  ) returning * into result;

  perform public.append_audit_event(
    p_organization_id, p_actor_id, 'retention.policy.replaced',
    p_correlation_id, true,
    jsonb_build_object(
      'record_type', p_record_type,
      'prior_policy_id', prior_policy.id,
      'new_policy_id', result.id,
      'policy_version', result.policy_version,
      'review_status', p_review_status
    )
  );

  return result;
end;
$$;

create or replace function public.schedule_retention_record(
  p_organization_id uuid,
  p_program_id uuid,
  p_record_type public.retention_record_type,
  p_subject_table text,
  p_subject_id uuid,
  p_correlation_id uuid
)
returns public.retention_records
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_program public.programs;
  active_policy public.retention_policies;
  result public.retention_records;
begin
  if p_correlation_id is null or p_subject_id is null then
    raise exception 'retention scheduling requires subject and correlation evidence'
      using errcode = '22004';
  end if;

  select * into strict target_program
  from public.programs
  where id = p_program_id;

  if target_program.organization_id <> p_organization_id
    or target_program.status <> 'closed'
    or target_program.closed_at is null then
    raise exception 'retention scheduling requires a closed program in the organization'
      using errcode = '23514';
  end if;

  select * into strict active_policy
  from public.retention_policies
  where organization_id = p_organization_id
    and record_type = p_record_type
    and superseded_at is null;

  insert into public.retention_records (
    organization_id, program_id, record_type, subject_table, subject_id,
    policy_id, policy_version, retention_started_at, retention_period,
    retain_until, correlation_id
  ) values (
    p_organization_id, p_program_id, p_record_type,
    lower(btrim(p_subject_table)), p_subject_id,
    active_policy.id, active_policy.policy_version, target_program.closed_at,
    active_policy.retention_period,
    target_program.closed_at + active_policy.retention_period,
    p_correlation_id
  ) returning * into result;

  perform public.append_audit_event(
    p_organization_id, null, 'retention.record.scheduled',
    p_correlation_id, true,
    jsonb_build_object(
      'retention_record_id', result.id,
      'program_id', p_program_id,
      'record_type', p_record_type,
      'subject_table', result.subject_table,
      'subject_id', p_subject_id,
      'retain_until', result.retain_until
    )
  );

  return result;
end;
$$;
create or replace function public.set_retention_legal_hold(
  p_retention_record_id uuid,
  p_hold_until timestamptz,
  p_reason text,
  p_actor_id uuid,
  p_correlation_id uuid
)
returns public.retention_records
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.retention_records;
begin
  if p_actor_id is null or p_correlation_id is null then
    raise exception 'legal hold changes require actor and correlation evidence'
      using errcode = '22004';
  end if;
  if (p_hold_until is null) <> (nullif(btrim(p_reason), '') is null) then
    raise exception 'legal hold time and reason must be set or cleared together'
      using errcode = '22023';
  end if;
  if p_hold_until is not null and p_hold_until <= now() then
    raise exception 'legal hold must end in the future'
      using errcode = '22023';
  end if;

  update public.retention_records record
  set legal_hold_until = p_hold_until,
      legal_hold_reason = nullif(btrim(p_reason), '')
  where record.id = p_retention_record_id
    and record.disposition_status <> 'disposed'
    and exists (
      select 1 from public.organization_memberships membership
      where membership.organization_id = record.organization_id
        and membership.user_id = p_actor_id
        and membership.is_active
        and membership.role in ('organization_administrator', 'auditor')
    )
  returning * into result;

  if result.id is null then
    raise exception 'retained record not found or actor is unauthorized'
      using errcode = '42501';
  end if;

  perform public.append_audit_event(
    result.organization_id, p_actor_id, 'retention.legal_hold.changed',
    p_correlation_id, true,
    jsonb_build_object(
      'retention_record_id', result.id,
      'legal_hold_until', p_hold_until,
      'hold_reason_recorded', p_reason is not null
    )
  );
  return result;
end;
$$;

create or replace function public.dispose_retention_record(
  p_retention_record_id uuid,
  p_actor_id uuid,
  p_disposition_reference text,
  p_correlation_id uuid
)
returns public.retention_records
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.retention_records;
  result public.retention_records;
begin
  select * into strict target
  from public.retention_records
  where id = p_retention_record_id
  for update;

  if p_actor_id is null or p_correlation_id is null
    or nullif(btrim(p_disposition_reference), '') is null then
    raise exception 'disposition requires actor, reference, and correlation evidence'
      using errcode = '22004';
  end if;
  if target.disposition_status = 'disposed' then
    raise exception 'retention record is already disposed'
      using errcode = '23514';
  end if;
  if now() < target.retain_until
    or (target.legal_hold_until is not null and target.legal_hold_until > now()) then
    raise exception 'retention or legal-hold obligation is still active'
      using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.organization_memberships membership
    where membership.organization_id = target.organization_id
      and membership.user_id = p_actor_id
      and membership.is_active
      and membership.role = 'organization_administrator'
  ) then
    raise exception 'active organization administrator is required'
      using errcode = '42501';
  end if;

  update public.retention_records
  set disposition_status = 'disposed', disposed_at = now(),
      disposed_by = p_actor_id,
      disposition_reference = btrim(p_disposition_reference),
      correlation_id = p_correlation_id
  where id = target.id
  returning * into result;

  perform public.append_audit_event(
    result.organization_id, p_actor_id, 'retention.record.disposed',
    p_correlation_id, true,
    jsonb_build_object(
      'retention_record_id', result.id,
      'record_type', result.record_type,
      'subject_table', result.subject_table,
      'subject_id', result.subject_id,
      'disposition_reference_recorded', true
    )
  );
  return result;
end;
$$;

create or replace function private.identity_disposition_eligible_after(
  p_beneficiary_identity_id uuid
)
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result timestamptz;
begin
  if exists (
    select 1
    from public.enrollments enrollment
    join public.programs program on program.id = enrollment.program_id
    where enrollment.beneficiary_identity_id = p_beneficiary_identity_id
      and (program.status <> 'closed' or program.closed_at is null)
  ) then
    return null;
  end if;

  select max(program.closed_at + policy.retention_period)
  into result
  from public.enrollments enrollment
  join public.programs program on program.id = enrollment.program_id
  join public.retention_policies policy
    on policy.organization_id = program.organization_id
   and policy.record_type = 'financial_approval'
   and policy.superseded_at is null
  where enrollment.beneficiary_identity_id = p_beneficiary_identity_id;

  return coalesce(result, now());
end;
$$;
create or replace function public.request_identity_disposition(
  p_organization_id uuid,
  p_beneficiary_identity_id uuid,
  p_method public.identity_disposition_method,
  p_actor_id uuid,
  p_correlation_id uuid
)
returns public.identity_disposition_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_identity public.beneficiary_identities;
  result public.identity_disposition_requests;
begin
  if p_actor_id is null or p_correlation_id is null then
    raise exception 'identity disposition requires actor and correlation evidence'
      using errcode = '22004';
  end if;
  if not exists (
    select 1
    from public.enrollments enrollment
    join public.programs program on program.id = enrollment.program_id
    where enrollment.beneficiary_identity_id = p_beneficiary_identity_id
      and program.organization_id = p_organization_id
  ) then
    raise exception 'identity is not scoped to the requesting organization'
      using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.organization_memberships membership
    where membership.organization_id = p_organization_id
      and membership.user_id = p_actor_id
      and membership.is_active
      and membership.role in ('organization_administrator', 'beneficiary_verifier')
  ) then
    raise exception 'active administrator or beneficiary verifier is required'
      using errcode = '42501';
  end if;

  select * into strict target_identity
  from public.beneficiary_identities
  where id = p_beneficiary_identity_id
    and data_status = 'active'
  for update;

  insert into public.identity_disposition_requests (
    organization_id, beneficiary_identity_id, subject_user_id,
    method, status, eligible_after, requested_by, correlation_id
  ) values (
    p_organization_id, p_beneficiary_identity_id, target_identity.user_id,
    p_method, 'requested',
    private.identity_disposition_eligible_after(p_beneficiary_identity_id),
    p_actor_id, p_correlation_id
  ) returning * into result;

  perform public.append_audit_event(
    p_organization_id, p_actor_id, 'identity.disposition.requested',
    p_correlation_id, true,
    jsonb_build_object(
      'request_id', result.id,
      'beneficiary_identity_id', p_beneficiary_identity_id,
      'method', p_method,
      'eligible_after', result.eligible_after
    )
  );
  return result;
end;
$$;

create or replace function public.set_identity_disposition_hold(
  p_request_id uuid,
  p_hold_until timestamptz,
  p_reason text,
  p_actor_id uuid,
  p_correlation_id uuid
)
returns public.identity_disposition_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.identity_disposition_requests;
begin
  if p_actor_id is null or p_correlation_id is null then
    raise exception 'identity hold changes require actor and correlation evidence'
      using errcode = '22004';
  end if;
  if (p_hold_until is null) <> (nullif(btrim(p_reason), '') is null) then
    raise exception 'hold time and reason must be set or cleared together'
      using errcode = '22023';
  end if;
  if p_hold_until is not null and p_hold_until <= now() then
    raise exception 'identity hold must end in the future'
      using errcode = '22023';
  end if;

  update public.identity_disposition_requests request
  set legal_hold_until = p_hold_until,
      legal_hold_reason = nullif(btrim(p_reason), ''),
      status = case when request.status = 'requested' then 'reviewing' else request.status end,
      correlation_id = p_correlation_id
  where request.id = p_request_id
    and request.status in ('requested', 'reviewing', 'approved')
    and exists (
      select 1 from public.organization_memberships membership
      where membership.organization_id = request.organization_id
        and membership.user_id = p_actor_id
        and membership.is_active
        and membership.role in ('organization_administrator', 'auditor')
    )
  returning * into result;

  if result.id is null then
    raise exception 'open identity request not found or actor is unauthorized'
      using errcode = '42501';
  end if;

  perform public.append_audit_event(
    result.organization_id, p_actor_id, 'identity.disposition.hold_changed',
    p_correlation_id, true,
    jsonb_build_object(
      'request_id', result.id,
      'beneficiary_identity_id', result.beneficiary_identity_id,
      'legal_hold_until', p_hold_until,
      'hold_reason_recorded', p_reason is not null
    )
  );
  return result;
end;
$$;

create or replace function public.review_identity_disposition(
  p_request_id uuid,
  p_approve boolean,
  p_actor_id uuid,
  p_reason text,
  p_correlation_id uuid
)
returns public.identity_disposition_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.identity_disposition_requests;
  current_eligible_after timestamptz;
  result public.identity_disposition_requests;
begin
  if p_actor_id is null or p_correlation_id is null
    or nullif(btrim(p_reason), '') is null then
    raise exception 'identity review requires actor, reason, and correlation evidence'
      using errcode = '22004';
  end if;

  select * into strict target
  from public.identity_disposition_requests
  where id = p_request_id and status in ('requested', 'reviewing')
  for update;

  if not exists (
    select 1 from public.organization_memberships membership
    where membership.organization_id = target.organization_id
      and membership.user_id = p_actor_id
      and membership.is_active
      and membership.role = 'organization_administrator'
  ) then
    raise exception 'active organization administrator is required'
      using errcode = '42501';
  end if;

  current_eligible_after := private.identity_disposition_eligible_after(
    target.beneficiary_identity_id
  );
  if p_approve and (
    current_eligible_after is null
    or current_eligible_after > now()
    or (target.legal_hold_until is not null and target.legal_hold_until > now())
  ) then
    raise exception 'verification, retention, or legal-hold obligation is still active'
      using errcode = '23514';
  end if;

  update public.identity_disposition_requests
  set status = case when p_approve then 'approved' else 'rejected' end,
      eligible_after = current_eligible_after,
      reviewed_by = p_actor_id,
      reviewed_at = now(),
      decision_reason = btrim(p_reason),
      correlation_id = p_correlation_id
  where id = target.id
  returning * into result;

  perform public.append_audit_event(
    result.organization_id, p_actor_id,
    case when p_approve then 'identity.disposition.approved'
      else 'identity.disposition.rejected' end,
    p_correlation_id, true,
    jsonb_build_object(
      'request_id', result.id,
      'beneficiary_identity_id', result.beneficiary_identity_id,
      'method', result.method,
      'eligible_after', result.eligible_after,
      'decision_reason_recorded', true
    )
  );
  return result;
end;
$$;
alter table public.profiles
  add column if not exists identity_data_locked boolean not null default false;

create policy "Anonymized profile data cannot be reintroduced"
on public.profiles as restrictive for update to authenticated
using (not identity_data_locked)
with check (not identity_data_locked);

create or replace function public.execute_identity_disposition(
  p_request_id uuid,
  p_actor_id uuid,
  p_correlation_id uuid
)
returns public.identity_disposition_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.identity_disposition_requests;
  current_eligible_after timestamptz;
  result public.identity_disposition_requests;
  document_path text;
begin
  if p_actor_id is null or p_correlation_id is null then
    raise exception 'identity disposition execution requires actor and correlation evidence'
      using errcode = '22004';
  end if;

  select * into strict target
  from public.identity_disposition_requests
  where id = p_request_id and status = 'approved'
  for update;

  if not exists (
    select 1 from public.organization_memberships membership
    where membership.organization_id = target.organization_id
      and membership.user_id = p_actor_id
      and membership.is_active
      and membership.role = 'organization_administrator'
  ) then
    raise exception 'active organization administrator is required'
      using errcode = '42501';
  end if;

  current_eligible_after := private.identity_disposition_eligible_after(
    target.beneficiary_identity_id
  );
  if current_eligible_after is null or current_eligible_after > now()
    or (target.legal_hold_until is not null and target.legal_hold_until > now()) then
    raise exception 'verification, retention, or legal-hold obligation is still active'
      using errcode = '23514';
  end if;

  select profile.gov_id_url into document_path
  from public.profiles profile
  where profile.id = target.subject_user_id;

  if document_path is not null and exists (
    select 1 from storage.objects object
    where object.bucket_id = 'valid_ids' and object.name = document_path
  ) then
    raise exception 'identity document must be deleted through the Storage API first'
      using errcode = '23514';
  end if;

  update public.enrollments
  set beneficiary_id = null
  where beneficiary_identity_id = target.beneficiary_identity_id;

  update public.profiles
  set full_name = null,
      gov_id = null,
      location = null,
      stellar_pubkey = null,
      first_name = null,
      last_name = null,
      middle_initial = null,
      mobile_number = null,
      sex = null,
      civil_status = null,
      birthdate = null,
      gov_id_url = null,
      complete_address = null,
      municipality_city = null,
      city_id = null,
      area_id = null,
      barangay_id = null,
      identity_data_locked = true
  where id = target.subject_user_id;

  update public.beneficiary_identities
  set user_id = null,
      verified_by = null,
      data_status = case target.method
        when 'anonymize' then 'anonymized'::public.identity_data_status
        else 'deletion_pending'::public.identity_data_status
      end,
      anonymized_at = now(),
      disposition_request_id = target.id
  where id = target.beneficiary_identity_id;

  update public.identity_disposition_requests
  set status = case target.method
        when 'anonymize' then 'completed'::public.identity_disposition_status
        else 'awaiting_external_deletion'::public.identity_disposition_status
      end,
      subject_user_id = case when target.method = 'anonymize' then null
        else target.subject_user_id end,
      completed_by = case when target.method = 'anonymize' then p_actor_id else null end,
      completed_at = case when target.method = 'anonymize' then now() else null end,
      eligible_after = current_eligible_after,
      correlation_id = p_correlation_id
  where id = target.id
  returning * into result;

  perform public.append_audit_event(
    result.organization_id, p_actor_id,
    case when target.method = 'anonymize'
      then 'identity.disposition.completed'
      else 'identity.deletion.external_required' end,
    p_correlation_id, true,
    jsonb_build_object(
      'request_id', result.id,
      'beneficiary_identity_id', result.beneficiary_identity_id,
      'method', result.method,
      'status', result.status
    )
  );
  return result;
end;
$$;

create or replace function public.finalize_identity_deletion(
  p_request_id uuid,
  p_actor_id uuid,
  p_external_deletion_reference text,
  p_correlation_id uuid
)
returns public.identity_disposition_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.identity_disposition_requests;
  result public.identity_disposition_requests;
begin
  if p_actor_id is null or p_correlation_id is null
    or nullif(btrim(p_external_deletion_reference), '') is null then
    raise exception 'deletion finalization requires actor, reference, and correlation evidence'
      using errcode = '22004';
  end if;

  select * into strict target
  from public.identity_disposition_requests
  where id = p_request_id
    and method = 'delete'
    and status = 'awaiting_external_deletion'
  for update;

  if not exists (
    select 1 from public.organization_memberships membership
    where membership.organization_id = target.organization_id
      and membership.user_id = p_actor_id
      and membership.is_active
      and membership.role = 'organization_administrator'
  ) then
    raise exception 'active organization administrator is required'
      using errcode = '42501';
  end if;
  if exists (select 1 from auth.users where id = target.subject_user_id)
    or exists (select 1 from public.profiles where id = target.subject_user_id) then
    raise exception 'authentication subject and profile must be deleted externally first'
      using errcode = '23514';
  end if;

  update public.beneficiary_identities
  set data_status = 'deleted'
  where id = target.beneficiary_identity_id
    and data_status = 'deletion_pending';

  update public.identity_disposition_requests
  set status = 'completed', subject_user_id = null,
      completed_by = p_actor_id, completed_at = now(),
      external_deletion_reference = btrim(p_external_deletion_reference),
      correlation_id = p_correlation_id
  where id = target.id
  returning * into result;

  perform public.append_audit_event(
    result.organization_id, p_actor_id, 'identity.deletion.completed',
    p_correlation_id, true,
    jsonb_build_object(
      'request_id', result.id,
      'beneficiary_identity_id', result.beneficiary_identity_id,
      'external_deletion_reference_recorded', true
    )
  );
  return result;
end;
$$;
alter table public.retention_policies enable row level security;
alter table public.retention_records enable row level security;
alter table public.identity_disposition_requests enable row level security;

create policy "Compliance roles can view retention policies"
on public.retention_policies for select to authenticated
using (
  private.has_organization_role(
    organization_id,
    array['organization_administrator', 'auditor']::public.organization_membership_role[]
  )
);

create policy "Compliance roles can view retention records"
on public.retention_records for select to authenticated
using (
  private.has_organization_role(
    organization_id,
    array['organization_administrator', 'auditor']::public.organization_membership_role[]
  )
);

create policy "Identity teams can view disposition workflows"
on public.identity_disposition_requests for select to authenticated
using (
  private.has_organization_role(
    organization_id,
    array[
      'organization_administrator', 'beneficiary_verifier', 'auditor'
    ]::public.organization_membership_role[]
  )
  or exists (
    select 1 from public.beneficiary_identities identity
    where identity.id = beneficiary_identity_id
      and identity.user_id = (select auth.uid())
  )
);

revoke all privileges on table public.retention_policies
  from public, anon, authenticated, service_role;
revoke all privileges on table public.retention_records
  from public, anon, authenticated, service_role;
revoke all privileges on table public.identity_disposition_requests
  from public, anon, authenticated, service_role;
grant select on table public.retention_policies to authenticated, service_role;
grant select on table public.retention_records to authenticated, service_role;
grant select on table public.identity_disposition_requests to authenticated, service_role;

revoke all privileges on function public.replace_retention_policy(
  uuid, public.retention_record_type, interval,
  public.retention_policy_review_status, text, uuid, uuid
) from public, anon, authenticated;
revoke all privileges on function public.schedule_retention_record(
  uuid, uuid, public.retention_record_type, text, uuid, uuid
) from public, anon, authenticated;
revoke all privileges on function public.set_retention_legal_hold(
  uuid, timestamptz, text, uuid, uuid
) from public, anon, authenticated;
revoke all privileges on function public.dispose_retention_record(
  uuid, uuid, text, uuid
) from public, anon, authenticated;
revoke all privileges on function public.request_identity_disposition(
  uuid, uuid, public.identity_disposition_method, uuid, uuid
) from public, anon, authenticated;
revoke all privileges on function public.set_identity_disposition_hold(
  uuid, timestamptz, text, uuid, uuid
) from public, anon, authenticated;
revoke all privileges on function public.review_identity_disposition(
  uuid, boolean, uuid, text, uuid
) from public, anon, authenticated;
revoke all privileges on function public.execute_identity_disposition(
  uuid, uuid, uuid
) from public, anon, authenticated;
revoke all privileges on function public.finalize_identity_deletion(
  uuid, uuid, text, uuid
) from public, anon, authenticated;

grant execute on function public.replace_retention_policy(
  uuid, public.retention_record_type, interval,
  public.retention_policy_review_status, text, uuid, uuid
) to service_role;
grant execute on function public.schedule_retention_record(
  uuid, uuid, public.retention_record_type, text, uuid, uuid
) to service_role;
grant execute on function public.set_retention_legal_hold(
  uuid, timestamptz, text, uuid, uuid
) to service_role;
grant execute on function public.dispose_retention_record(
  uuid, uuid, text, uuid
) to service_role;
grant execute on function public.request_identity_disposition(
  uuid, uuid, public.identity_disposition_method, uuid, uuid
) to service_role;
grant execute on function public.set_identity_disposition_hold(
  uuid, timestamptz, text, uuid, uuid
) to service_role;
grant execute on function public.review_identity_disposition(
  uuid, boolean, uuid, text, uuid
) to service_role;
grant execute on function public.execute_identity_disposition(
  uuid, uuid, uuid
) to service_role;
grant execute on function public.finalize_identity_deletion(
  uuid, uuid, text, uuid
) to service_role;

revoke all privileges on function private.seed_retention_policies_for_organization()
  from public, anon, authenticated;
revoke all privileges on function private.set_program_closed_at()
  from public, anon, authenticated;
revoke all privileges on function private.identity_disposition_eligible_after(uuid)
  from public, anon, authenticated;

comment on table public.retention_policies is
  'Versioned organization retention configuration. Seven years after closure is provisional until qualified Philippine counsel approves production policy.';
comment on table public.retention_records is
  'Per-record retention snapshots for financial approvals, receipts, disputes, and audit evidence; generic subject links avoid migration-order coupling.';
comment on table public.identity_disposition_requests is
  'Auditable deletion or anonymization workflow gated by verification, retention, storage-document, and legal-hold obligations.';
comment on column public.programs.closed_at is
  'Immutable closure anchor used to calculate evidence-retention deadlines.';
comment on column public.profiles.identity_data_locked is
  'Prevents anonymized profile fields from being repopulated through authenticated profile updates.';
comment on function public.finalize_identity_deletion(uuid, uuid, text, uuid) is
  'Finalizes deletion only after external Auth/Profile removal is independently verified.';
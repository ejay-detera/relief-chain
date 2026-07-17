-- Add immutable organization audit evidence and defense-in-depth MFA gates.
-- Edge Functions remain responsible for calling the audit append path around
-- sensitive reads and for invoking the shared step-up assertion before service writes.

do $$
begin
  create type public.sensitive_financial_action as enum (
    'program_activation',
    'disbursement_authorization',
    'wallet_rotation',
    'merchant_wallet_change',
    'refund',
    'emergency_control',
    'cash_out'
  );
exception
  when duplicate_object then null;
end
$$;

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  actor_user_id uuid,
  actor_kind text not null
    check (actor_kind in ('user', 'service', 'system')),
  actor_identifier text not null
    check (length(btrim(actor_identifier)) between 1 and 200),
  action text not null
    check (
      length(action) between 3 and 120
      and action ~ '^[a-z0-9]+(?:[._:-][a-z0-9]+)*$'
    ),
  correlation_id uuid not null,
  sensitive_data_access boolean not null default false,
  metadata jsonb not null default '{}'::jsonb
    check (
      jsonb_typeof(metadata) = 'object'
      and pg_column_size(metadata) <= 16384
    ),
  occurred_at timestamptz not null default now()
);

create index audit_events_organization_occurred_at_idx
  on public.audit_events (organization_id, occurred_at desc);
create index audit_events_correlation_id_idx
  on public.audit_events (correlation_id);
create index audit_events_sensitive_access_idx
  on public.audit_events (organization_id, occurred_at desc)
  where sensitive_data_access;

create or replace function private.redact_audit_metadata(p_metadata jsonb)
returns jsonb
language sql
immutable
security definer
set search_path = ''
as $$
  select case jsonb_typeof(p_metadata)
    when 'object' then coalesce(
      (
        select jsonb_object_agg(
          entry.key,
          case
            when entry.key ~* '(^|_)(authorization|credential|document|email|envelope|government_?id|gov_?id|jwt|mnemonic|name|password|phone|private_?key|seed|secret|signed_?(authorization|payload)|token|xdr)($|_)'
              then to_jsonb('[REDACTED]'::text)
            else private.redact_audit_metadata(entry.value)
          end
        )
        from jsonb_each(p_metadata) as entry(key, value)
      ),
      '{}'::jsonb
    )
    when 'array' then coalesce(
      (
        select jsonb_agg(private.redact_audit_metadata(element.value))
        from jsonb_array_elements(p_metadata) as element(value)
      ),
      '[]'::jsonb
    )
    else p_metadata
  end;
$$;

create or replace function private.current_correlation_id()
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  candidate text;
begin
  begin
    candidate := nullif(
      current_setting('request.headers', true)::jsonb ->> 'x-correlation-id',
      ''
    );
  exception
    when others then candidate := null;
  end;

  if candidate is null then
    candidate := nullif((select auth.jwt() ->> 'correlation_id'), '');
  end if;

  begin
    return coalesce(candidate::uuid, gen_random_uuid());
  exception
    when invalid_text_representation then return gen_random_uuid();
  end;
end;
$$;

create or replace function private.prepare_audit_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.metadata := private.redact_audit_metadata(new.metadata);
  return new;
end;
$$;

create trigger audit_events_prepare_insert
before insert on public.audit_events
for each row execute function private.prepare_audit_event();

create or replace function private.reject_audit_event_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'audit events are append-only'
    using errcode = '55000';
end;
$$;

create trigger audit_events_reject_mutation
before update or delete on public.audit_events
for each row execute function private.reject_audit_event_mutation();

create or replace function public.append_audit_event(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_action text,
  p_correlation_id uuid,
  p_sensitive_data_access boolean default false,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_id uuid;
begin
  if p_correlation_id is null then
    raise exception 'correlation ID is required' using errcode = '22004';
  end if;

  insert into public.audit_events (
    organization_id,
    actor_user_id,
    actor_kind,
    actor_identifier,
    action,
    correlation_id,
    sensitive_data_access,
    metadata
  )
  values (
    p_organization_id,
    p_actor_user_id,
    case when p_actor_user_id is null then 'service' else 'user' end,
    coalesce(p_actor_user_id::text, current_user::text),
    p_action,
    p_correlation_id,
    p_sensitive_data_access,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into event_id;

  return event_id;
end;
$$;

create or replace function private.audit_eligibility_decision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_organization_id uuid;
  event_actor_id uuid := (select auth.uid());
begin
  if new.approval_status not in ('Approved', 'Rejected')
    or (
      tg_op = 'UPDATE'
      and new.approval_status is not distinct from old.approval_status
    ) then
    return new;
  end if;

  select program.organization_id
  into strict event_organization_id
  from public.programs program
  where program.id = new.program_id;

  insert into public.audit_events (
    organization_id,
    actor_user_id,
    actor_kind,
    actor_identifier,
    action,
    correlation_id,
    metadata
  )
  values (
    event_organization_id,
    event_actor_id,
    case when event_actor_id is null then 'system' else 'user' end,
    coalesce(event_actor_id::text, current_user::text),
    'eligibility.decision.recorded',
    private.current_correlation_id(),
    jsonb_build_object(
      'enrollment_id', new.id,
      'program_id', new.program_id,
      'decision', lower(new.approval_status)
    )
  );

  return new;
end;
$$;

create trigger enrollments_audit_eligibility_decision
after insert or update of approval_status on public.enrollments
for each row execute function private.audit_eligibility_decision();

create or replace function private.has_recent_step_up(
  p_max_age interval default interval '10 minutes'
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_max_age > interval '0 seconds'
    and p_max_age <= interval '1 hour'
    and coalesce((select auth.jwt() ->> 'aal') = 'aal2', false)
    and exists (
      select 1
      from jsonb_array_elements(
        coalesce((select auth.jwt() -> 'amr'), '[]'::jsonb)
      ) as method(value)
      where method.value ->> 'method' in ('totp', 'otp', 'webauthn')
        and coalesce(method.value ->> 'timestamp', '') ~ '^[0-9]{1,16}$'
        and to_timestamp(
          (method.value ->> 'timestamp')::double precision
        ) between now() - p_max_age and now() + interval '1 minute'
    );
$$;

create or replace function private.require_sensitive_action(
  p_action public.sensitive_financial_action,
  p_max_age interval default interval '10 minutes'
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_action is null then
    raise exception 'sensitive action is required' using errcode = '22004';
  end if;

  if coalesce((select auth.jwt() ->> 'aal') = 'aal2', false) is false then
    raise exception 'AAL2 authentication is required for %', p_action
      using errcode = '42501';
  end if;

  if not private.has_recent_step_up(p_max_age) then
    raise exception 'recent step-up authentication is required for %', p_action
      using errcode = '42501';
  end if;
end;
$$;

alter table public.audit_events enable row level security;

create policy "Authorized roles can view organization audit events"
on public.audit_events for select to authenticated
using (
  private.has_organization_role(
    organization_id,
    array[
      'organization_administrator',
      'auditor'
    ]::public.organization_membership_role[]
  )
);

-- Restrictive policies compose with the organization-role policies. A draft can
-- be edited normally, but entering or changing active financial policy requires
-- a freshly stepped-up AAL2 session.
create policy "Active program changes require recent AAL2"
on public.programs as restrictive for update to authenticated
using (
  status <> 'active'
  or private.has_recent_step_up()
)
with check (
  status <> 'active'
  or private.has_recent_step_up()
);

create policy "Disbursement authorization requires recent AAL2"
on public.disbursements as restrictive for insert to authenticated
with check (private.has_recent_step_up());

-- Authenticated wallet writes are already revoked. This restrictive policy is
-- defense in depth if a future narrow rotation policy grants row access.
create policy "Wallet changes require recent AAL2"
on public.wallets as restrictive for update to authenticated
using (private.has_recent_step_up())
with check (private.has_recent_step_up());

revoke all privileges on table public.audit_events
  from public, anon, authenticated, service_role;
grant select on table public.audit_events to authenticated, service_role;

revoke all privileges on function public.append_audit_event(
  uuid, uuid, text, uuid, boolean, jsonb
) from public, anon, authenticated;
grant execute on function public.append_audit_event(
  uuid, uuid, text, uuid, boolean, jsonb
) to service_role;

revoke all privileges on function private.redact_audit_metadata(jsonb)
  from public, anon, authenticated;
revoke all privileges on function private.current_correlation_id()
  from public, anon, authenticated;
revoke all privileges on function private.prepare_audit_event()
  from public, anon, authenticated;
revoke all privileges on function private.reject_audit_event_mutation()
  from public, anon, authenticated;
revoke all privileges on function private.audit_eligibility_decision()
  from public, anon, authenticated;
revoke all privileges on function private.has_recent_step_up(interval)
  from public, anon;
revoke all privileges on function private.require_sensitive_action(
  public.sensitive_financial_action, interval
) from public, anon;
grant execute on function private.has_recent_step_up(interval)
  to authenticated, service_role;
grant execute on function private.require_sensitive_action(
  public.sensitive_financial_action, interval
) to authenticated, service_role;

comment on table public.audit_events is
  'Append-only, organization-scoped actor and workflow evidence with redacted metadata.';
comment on column public.audit_events.sensitive_data_access is
  'True when the event records controlled access to identity, audit, approval, reconciliation, or evidence data.';
comment on function public.append_audit_event(
  uuid, uuid, text, uuid, boolean, jsonb
) is
  'Service-only audit append path. Metadata is recursively redacted before storage.';
comment on function private.require_sensitive_action(
  public.sensitive_financial_action, interval
) is
  'Shared trusted-server assertion for requirement-enumerated actions requiring AAL2 and recent MFA.';
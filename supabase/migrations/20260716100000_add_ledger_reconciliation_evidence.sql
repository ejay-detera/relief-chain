-- Add immutable blockchain evidence and diagnosable reconciliation workflow state.
-- Stellar testnet remains the only accepted network for the pilot.

do $$
begin
  create type public.reconciliation_run_status as enum (
    'running', 'completed', 'partial', 'failed'
  );
exception when duplicate_object then null;
end
$$;

do $$
begin
  create type public.reconciliation_issue_type as enum (
    'transaction_missing',
    'transaction_mismatch',
    'contract_event_missing',
    'contract_event_mismatch',
    'balance_mismatch',
    'projection_mismatch',
    'cursor_gap'
  );
exception when duplicate_object then null;
end
$$;

do $$
begin
  create type public.reconciliation_issue_status as enum (
    'open', 'investigating', 'resolved', 'dismissed'
  );
exception when duplicate_object then null;
end
$$;

do $$
begin
  create type public.reconciliation_quarantine_state as enum (
    'quarantined', 'released'
  );
exception when duplicate_object then null;
end
$$;

do $$
begin
  create type public.reconciliation_alert_state as enum (
    'pending', 'sent', 'acknowledged', 'resolved', 'suppressed'
  );
exception when duplicate_object then null;
end
$$;

do $$
begin
  create type public.reconciliation_issue_severity as enum (
    'warning', 'critical'
  );
exception when duplicate_object then null;
end
$$;

create table public.ledger_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  program_id uuid references public.programs(id) on delete restrict,
  financial_intent_id uuid,
  transaction_attempt_id uuid,
  network public.wallet_network not null default 'stellar_testnet',
  transaction_hash text not null,
  envelope_xdr text not null,
  envelope_sha256 text not null,
  ledger_sequence bigint not null,
  ledger_closed_at timestamptz not null,
  successful boolean not null,
  result_code text,
  result_xdr text,
  error_code text,
  error_message text,
  error_details jsonb not null default '{}'::jsonb,
  correlation_id uuid not null,
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint ledger_transactions_network_hash_key
    unique (network, transaction_hash),
  constraint ledger_transactions_evidence_identity_key
    unique (id, organization_id, network, transaction_hash, ledger_sequence),
  constraint ledger_transactions_hash_check check (
    transaction_hash ~ '^[0-9a-f]{64}$'
    and envelope_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint ledger_transactions_ledger_check check (ledger_sequence > 0),
  constraint ledger_transactions_envelope_check check (
    length(envelope_xdr) between 1 and 200000
  ),
  constraint ledger_transactions_result_check check (
    (successful and error_code is null and error_message is null)
    or (not successful and error_code is not null)
  ),
  constraint ledger_transactions_error_details_check check (
    jsonb_typeof(error_details) = 'object'
    and pg_column_size(error_details) <= 32768
  )
);

create table public.contract_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  program_id uuid references public.programs(id) on delete restrict,
  ledger_transaction_id uuid not null,
  network public.wallet_network not null default 'stellar_testnet',
  transaction_hash text not null,
  contract_id text not null,
  ledger_sequence bigint not null,
  event_index integer not null,
  event_type text not null,
  event_topics jsonb not null default '[]'::jsonb,
  event_payload jsonb not null default '{}'::jsonb,
  event_xdr text not null,
  event_sha256 text not null,
  correlation_id uuid not null,
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint contract_events_identity_key
    unique (network, contract_id, ledger_sequence, event_index),
  constraint contract_events_transaction_identity_key
    unique (network, transaction_hash, contract_id, event_index),
  constraint contract_events_ledger_evidence_fkey
    foreign key (
      ledger_transaction_id, organization_id, network,
      transaction_hash, ledger_sequence
    ) references public.ledger_transactions (
      id, organization_id, network, transaction_hash, ledger_sequence
    ) on delete restrict,
  constraint contract_events_hash_check check (
    transaction_hash ~ '^[0-9a-f]{64}$'
    and event_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint contract_events_contract_check check (
    contract_id ~ '^C[A-Z2-7]{55}$'
  ),
  constraint contract_events_ledger_check check (
    ledger_sequence > 0 and event_index >= 0
  ),
  constraint contract_events_type_check check (
    length(event_type) between 1 and 100
    and event_type ~ '^[a-z0-9]+(?:[._:-][a-z0-9]+)*$'
  ),
  constraint contract_events_payload_check check (
    jsonb_typeof(event_topics) = 'array'
    and jsonb_typeof(event_payload) = 'object'
    and pg_column_size(event_topics) <= 32768
    and pg_column_size(event_payload) <= 65536
    and length(event_xdr) between 1 and 200000
  )
);

create table public.reconciliation_cursors (
  id uuid primary key default gen_random_uuid(),
  network public.wallet_network not null default 'stellar_testnet',
  stream_name text not null,
  cursor_value text,
  last_ledger_sequence bigint not null default 0,
  last_ledger_closed_at timestamptz,
  correlation_id uuid not null,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reconciliation_cursors_network_stream_key
    unique (network, stream_name),
  constraint reconciliation_cursors_stream_check check (
    length(stream_name) between 1 and 100
    and stream_name ~ '^[a-z0-9]+(?:[._:-][a-z0-9]+)*$'
  ),
  constraint reconciliation_cursors_ledger_check check (
    last_ledger_sequence >= 0
  ),
  constraint reconciliation_cursors_version_check check (version > 0),
  constraint reconciliation_cursors_position_check check (
    (last_ledger_sequence = 0 and last_ledger_closed_at is null)
    or (last_ledger_sequence > 0 and last_ledger_closed_at is not null)
  )
);

create table public.reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete restrict,
  program_id uuid references public.programs(id) on delete restrict,
  network public.wallet_network not null default 'stellar_testnet',
  stream_name text not null,
  status public.reconciliation_run_status not null default 'running',
  cursor_before text,
  cursor_after text,
  start_ledger_sequence bigint,
  end_ledger_sequence bigint,
  observed_transaction_count integer not null default 0,
  observed_event_count integer not null default 0,
  confirmed_intent_count integer not null default 0,
  failed_intent_count integer not null default 0,
  mismatch_count integer not null default 0,
  quarantined_count integer not null default 0,
  reconciliation_lag_seconds integer,
  error_code text,
  error_message text,
  error_details jsonb not null default '{}'::jsonb,
  correlation_id uuid not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint reconciliation_runs_stream_check check (
    length(stream_name) between 1 and 100
    and stream_name ~ '^[a-z0-9]+(?:[._:-][a-z0-9]+)*$'
  ),
  constraint reconciliation_runs_ledger_range_check check (
    (start_ledger_sequence is null or start_ledger_sequence >= 0)
    and (end_ledger_sequence is null or end_ledger_sequence >= 0)
    and (
      start_ledger_sequence is null
      or end_ledger_sequence is null
      or end_ledger_sequence >= start_ledger_sequence
    )
  ),
  constraint reconciliation_runs_counts_check check (
    observed_transaction_count >= 0
    and observed_event_count >= 0
    and confirmed_intent_count >= 0
    and failed_intent_count >= 0
    and mismatch_count >= 0
    and quarantined_count >= 0
    and (reconciliation_lag_seconds is null or reconciliation_lag_seconds >= 0)
  ),
  constraint reconciliation_runs_error_details_check check (
    jsonb_typeof(error_details) = 'object'
    and pg_column_size(error_details) <= 32768
  ),
  constraint reconciliation_runs_state_check check (
    (status = 'running' and completed_at is null and error_code is null)
    or (status = 'completed' and completed_at is not null and error_code is null)
    or (status = 'partial' and completed_at is not null)
    or (status = 'failed' and completed_at is not null and error_code is not null)
  )
);

create table public.reconciliation_issues (
  id uuid primary key default gen_random_uuid(),
  reconciliation_run_id uuid not null
    references public.reconciliation_runs(id) on delete restrict,
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  program_id uuid references public.programs(id) on delete restrict,
  ledger_transaction_id uuid
    references public.ledger_transactions(id) on delete restrict,
  contract_event_id uuid
    references public.contract_events(id) on delete restrict,
  network public.wallet_network not null default 'stellar_testnet',
  issue_type public.reconciliation_issue_type not null,
  severity public.reconciliation_issue_severity not null default 'warning',
  status public.reconciliation_issue_status not null default 'open',
  subject_type text not null,
  subject_identifier text not null,
  projection_table text,
  projection_key jsonb not null default '{}'::jsonb,
  expected_state jsonb not null default '{}'::jsonb,
  observed_state jsonb not null default '{}'::jsonb,
  mismatch_fingerprint text not null,
  quarantine_state public.reconciliation_quarantine_state not null
    default 'quarantined',
  quarantined_at timestamptz not null default now(),
  released_at timestamptz,
  alert_state public.reconciliation_alert_state not null default 'pending',
  alert_last_attempt_at timestamptz,
  alert_sent_at timestamptz,
  alert_acknowledged_at timestamptz,
  alert_error_code text,
  occurrence_count integer not null default 1,
  first_detected_at timestamptz not null default now(),
  last_detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete restrict,
  resolution_note text,
  correlation_id uuid not null,
  constraint reconciliation_issues_subject_check check (
    length(subject_type) between 1 and 100
    and subject_type ~ '^[a-z0-9]+(?:[._:-][a-z0-9]+)*$'
    and length(subject_identifier) between 1 and 500
    and (
      projection_table is null
      or projection_table ~ '^[a-z][a-z0-9_]{0,62}$'
    )
  ),
  constraint reconciliation_issues_json_check check (
    jsonb_typeof(projection_key) = 'object'
    and jsonb_typeof(expected_state) = 'object'
    and jsonb_typeof(observed_state) = 'object'
    and pg_column_size(projection_key) <= 8192
    and pg_column_size(expected_state) <= 65536
    and pg_column_size(observed_state) <= 65536
  ),
  constraint reconciliation_issues_fingerprint_check check (
    mismatch_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  constraint reconciliation_issues_occurrence_check check (
    occurrence_count > 0 and last_detected_at >= first_detected_at
  ),
  constraint reconciliation_issues_resolution_check check (
    (
      status in ('open', 'investigating')
      and resolved_at is null
      and resolved_by is null
      and resolution_note is null
      and quarantine_state = 'quarantined'
      and released_at is null
    )
    or (
      status in ('resolved', 'dismissed')
      and resolved_at is not null
      and resolution_note is not null
      and length(btrim(resolution_note)) between 1 and 2000
      and (
        (quarantine_state = 'quarantined' and released_at is null)
        or (quarantine_state = 'released' and released_at is not null)
      )
    )
  ),
  constraint reconciliation_issues_alert_check check (
    (alert_state = 'pending'
      and alert_sent_at is null and alert_acknowledged_at is null)
    or (alert_state = 'sent'
      and alert_sent_at is not null and alert_acknowledged_at is null)
    or (alert_state = 'acknowledged'
      and alert_sent_at is not null and alert_acknowledged_at is not null)
    or (alert_state in ('resolved', 'suppressed'))
  ),
  constraint reconciliation_issues_alert_resolution_check check (
    alert_state <> 'resolved' or status in ('resolved', 'dismissed')
  )
);

create unique index reconciliation_issues_active_fingerprint_idx
  on public.reconciliation_issues (network, mismatch_fingerprint)
  where status in ('open', 'investigating');

create index ledger_transactions_organization_ledger_idx
  on public.ledger_transactions (
    organization_id, ledger_sequence desc, observed_at desc
  );
create index ledger_transactions_program_ledger_idx
  on public.ledger_transactions (program_id, ledger_sequence desc)
  where program_id is not null;
create index ledger_transactions_correlation_idx
  on public.ledger_transactions (correlation_id);
create index ledger_transactions_intent_idx
  on public.ledger_transactions (financial_intent_id)
  where financial_intent_id is not null;
create index ledger_transactions_attempt_idx
  on public.ledger_transactions (transaction_attempt_id)
  where transaction_attempt_id is not null;

create index contract_events_organization_ledger_idx
  on public.contract_events (
    organization_id, ledger_sequence desc, event_index desc
  );
create index contract_events_program_type_idx
  on public.contract_events (program_id, event_type, ledger_sequence desc)
  where program_id is not null;
create index contract_events_correlation_idx
  on public.contract_events (correlation_id);

create index reconciliation_runs_status_started_idx
  on public.reconciliation_runs (status, started_at desc);
create index reconciliation_runs_organization_started_idx
  on public.reconciliation_runs (organization_id, started_at desc)
  where organization_id is not null;
create index reconciliation_runs_correlation_idx
  on public.reconciliation_runs (correlation_id);
create index reconciliation_issues_organization_state_idx
  on public.reconciliation_issues (
    organization_id, status, quarantine_state, alert_state, last_detected_at desc
  );
create index reconciliation_issues_run_idx
  on public.reconciliation_issues (reconciliation_run_id);
create index reconciliation_issues_correlation_idx
  on public.reconciliation_issues (correlation_id);

create or replace function private.reject_blockchain_evidence_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% are append-only', replace(tg_table_name, '_', ' ')
    using errcode = '55000';
end;
$$;

create trigger ledger_transactions_append_only
before update or delete on public.ledger_transactions
for each row execute function private.reject_blockchain_evidence_mutation();

create trigger contract_events_append_only
before update or delete on public.contract_events
for each row execute function private.reject_blockchain_evidence_mutation();

create or replace function private.validate_reconciliation_cursor_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'reconciliation cursors cannot be deleted'
      using errcode = '55000';
  end if;

  if row(new.id, new.network, new.stream_name, new.created_at)
    is distinct from row(old.id, old.network, old.stream_name, old.created_at) then
    raise exception 'reconciliation cursor identity is immutable'
      using errcode = '23514';
  end if;

  if new.last_ledger_sequence < old.last_ledger_sequence then
    raise exception 'reconciliation cursor cannot move backward'
      using errcode = '23514';
  end if;

  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end;
$$;

create trigger reconciliation_cursors_validate_change
before update or delete on public.reconciliation_cursors
for each row execute function private.validate_reconciliation_cursor_change();

create or replace function private.validate_reconciliation_run_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'reconciliation runs cannot be deleted'
      using errcode = '55000';
  end if;

  if old.status <> 'running' then
    raise exception 'completed reconciliation runs are immutable'
      using errcode = '55000';
  end if;

  if row(
    new.id, new.organization_id, new.program_id, new.network,
    new.stream_name, new.cursor_before, new.correlation_id, new.started_at
  ) is distinct from row(
    old.id, old.organization_id, old.program_id, old.network,
    old.stream_name, old.cursor_before, old.correlation_id, old.started_at
  ) then
    raise exception 'reconciliation run identity is immutable'
      using errcode = '23514';
  end if;

  if new.observed_transaction_count < old.observed_transaction_count
    or new.observed_event_count < old.observed_event_count
    or new.confirmed_intent_count < old.confirmed_intent_count
    or new.failed_intent_count < old.failed_intent_count
    or new.mismatch_count < old.mismatch_count
    or new.quarantined_count < old.quarantined_count
    or (
      old.end_ledger_sequence is not null
      and new.end_ledger_sequence < old.end_ledger_sequence
    ) then
    raise exception 'reconciliation run progress cannot move backward'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger reconciliation_runs_validate_change
before update or delete on public.reconciliation_runs
for each row execute function private.validate_reconciliation_run_change();

create or replace function private.validate_reconciliation_issue_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'reconciliation issues cannot be deleted'
      using errcode = '55000';
  end if;

  if row(
    new.id, new.reconciliation_run_id, new.organization_id, new.program_id,
    new.ledger_transaction_id, new.contract_event_id, new.network,
    new.issue_type, new.severity, new.subject_type, new.subject_identifier,
    new.projection_table, new.projection_key, new.expected_state,
    new.observed_state, new.mismatch_fingerprint, new.first_detected_at,
    new.correlation_id
  ) is distinct from row(
    old.id, old.reconciliation_run_id, old.organization_id, old.program_id,
    old.ledger_transaction_id, old.contract_event_id, old.network,
    old.issue_type, old.severity, old.subject_type, old.subject_identifier,
    old.projection_table, old.projection_key, old.expected_state,
    old.observed_state, old.mismatch_fingerprint, old.first_detected_at,
    old.correlation_id
  ) then
    raise exception 'reconciliation issue evidence is immutable'
      using errcode = '23514';
  end if;

  if old.status in ('resolved', 'dismissed') then
    raise exception 'closed reconciliation issues are immutable'
      using errcode = '55000';
  end if;

  if (old.status = 'open' and new.status not in (
      'open', 'investigating', 'resolved', 'dismissed'
    ))
    or (old.status = 'investigating' and new.status not in (
      'investigating', 'resolved', 'dismissed'
    )) then
    raise exception 'invalid reconciliation issue transition'
      using errcode = '23514';
  end if;

  if new.occurrence_count < old.occurrence_count
    or new.last_detected_at < old.last_detected_at then
    raise exception 'reconciliation issue observations cannot move backward'
      using errcode = '23514';
  end if;

  if old.quarantine_state = 'released'
    and new.quarantine_state <> 'released' then
    raise exception 'released reconciliation quarantine cannot be restored'
      using errcode = '23514';
  end if;

  if new.quarantine_state = 'released'
    and new.status not in ('resolved', 'dismissed') then
    raise exception 'quarantine release requires a closed issue'
      using errcode = '23514';
  end if;

  if (old.alert_state = 'pending'
      and new.alert_state not in ('pending', 'sent', 'suppressed'))
    or (old.alert_state = 'sent'
      and new.alert_state not in ('sent', 'acknowledged', 'resolved', 'suppressed'))
    or (old.alert_state = 'acknowledged'
      and new.alert_state not in ('acknowledged', 'resolved', 'suppressed'))
    or (old.alert_state in ('resolved', 'suppressed')
      and new.alert_state <> old.alert_state) then
    raise exception 'invalid reconciliation alert transition'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger reconciliation_issues_validate_change
before update or delete on public.reconciliation_issues
for each row execute function private.validate_reconciliation_issue_change();

create or replace function public.advance_reconciliation_cursor(
  p_network public.wallet_network,
  p_stream_name text,
  p_cursor_value text,
  p_last_ledger_sequence bigint,
  p_last_ledger_closed_at timestamptz,
  p_correlation_id uuid
)
returns public.reconciliation_cursors
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.reconciliation_cursors;
begin
  if p_cursor_value is null
    or p_last_ledger_sequence <= 0
    or p_last_ledger_closed_at is null
    or p_correlation_id is null then
    raise exception 'complete reconciliation cursor evidence is required'
      using errcode = '22004';
  end if;

  insert into public.reconciliation_cursors (
    network, stream_name, cursor_value, last_ledger_sequence,
    last_ledger_closed_at, correlation_id
  ) values (
    p_network, p_stream_name, p_cursor_value, p_last_ledger_sequence,
    p_last_ledger_closed_at, p_correlation_id
  )
  on conflict (network, stream_name) do update
  set cursor_value = excluded.cursor_value,
      last_ledger_sequence = excluded.last_ledger_sequence,
      last_ledger_closed_at = excluded.last_ledger_closed_at,
      correlation_id = excluded.correlation_id
  returning * into result;

  return result;
end;
$$;

create or replace function public.record_reconciliation_issue(
  p_reconciliation_run_id uuid,
  p_organization_id uuid,
  p_program_id uuid,
  p_ledger_transaction_id uuid,
  p_contract_event_id uuid,
  p_network public.wallet_network,
  p_issue_type public.reconciliation_issue_type,
  p_severity public.reconciliation_issue_severity,
  p_subject_type text,
  p_subject_identifier text,
  p_projection_table text,
  p_projection_key jsonb,
  p_expected_state jsonb,
  p_observed_state jsonb,
  p_mismatch_fingerprint text,
  p_detected_at timestamptz,
  p_correlation_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  issue_id uuid;
begin
  if p_reconciliation_run_id is null
    or p_organization_id is null
    or p_mismatch_fingerprint is null
    or p_correlation_id is null then
    raise exception 'complete reconciliation issue evidence is required'
      using errcode = '22004';
  end if;

  insert into public.reconciliation_issues (
    reconciliation_run_id, organization_id, program_id,
    ledger_transaction_id, contract_event_id, network,
    issue_type, severity, subject_type, subject_identifier,
    projection_table, projection_key, expected_state, observed_state,
    mismatch_fingerprint, first_detected_at, last_detected_at,
    correlation_id
  ) values (
    p_reconciliation_run_id, p_organization_id, p_program_id,
    p_ledger_transaction_id, p_contract_event_id, p_network,
    p_issue_type, p_severity, p_subject_type, p_subject_identifier,
    p_projection_table, coalesce(p_projection_key, '{}'::jsonb),
    coalesce(p_expected_state, '{}'::jsonb),
    coalesce(p_observed_state, '{}'::jsonb),
    p_mismatch_fingerprint, coalesce(p_detected_at, now()),
    coalesce(p_detected_at, now()), p_correlation_id
  )
  on conflict (network, mismatch_fingerprint)
    where status in ('open', 'investigating')
  do update
  set occurrence_count = public.reconciliation_issues.occurrence_count + 1,
      last_detected_at = greatest(
        public.reconciliation_issues.last_detected_at,
        excluded.last_detected_at
      )
  where public.reconciliation_issues.organization_id = excluded.organization_id
    and public.reconciliation_issues.program_id is not distinct from excluded.program_id
    and public.reconciliation_issues.issue_type = excluded.issue_type
    and public.reconciliation_issues.subject_type = excluded.subject_type
    and public.reconciliation_issues.subject_identifier = excluded.subject_identifier
    and public.reconciliation_issues.projection_table
      is not distinct from excluded.projection_table
    and public.reconciliation_issues.projection_key = excluded.projection_key
    and public.reconciliation_issues.expected_state = excluded.expected_state
    and public.reconciliation_issues.observed_state = excluded.observed_state
  returning id into issue_id;

  if issue_id is null then
    raise exception 'mismatch fingerprint conflicts with different evidence'
      using errcode = '23505';
  end if;

  return issue_id;
end;
$$;

-- Add referential constraints when concurrent workflow migrations are present.
do $$
begin
  if to_regclass('public.financial_intents') is not null then
    alter table public.ledger_transactions
      add constraint ledger_transactions_financial_intent_fkey
      foreign key (financial_intent_id)
      references public.financial_intents(id) on delete restrict;
  end if;

  if to_regclass('public.transaction_attempts') is not null then
    alter table public.ledger_transactions
      add constraint ledger_transactions_transaction_attempt_fkey
      foreign key (transaction_attempt_id)
      references public.transaction_attempts(id) on delete restrict;
  end if;
end
$$;

alter table public.ledger_transactions enable row level security;
alter table public.contract_events enable row level security;
alter table public.reconciliation_cursors enable row level security;
alter table public.reconciliation_runs enable row level security;
alter table public.reconciliation_issues enable row level security;

create policy "Financial operators can view ledger evidence"
on public.ledger_transactions for select to authenticated
using (
  private.has_organization_role(
    organization_id,
    array[
      'organization_administrator', 'program_manager',
      'finance_approver', 'auditor'
    ]::public.organization_membership_role[]
  )
);

create policy "Financial operators can view contract events"
on public.contract_events for select to authenticated
using (
  private.has_organization_role(
    organization_id,
    array[
      'organization_administrator', 'program_manager',
      'finance_approver', 'auditor'
    ]::public.organization_membership_role[]
  )
);

create policy "Financial operators can view reconciliation runs"
on public.reconciliation_runs for select to authenticated
using (
  organization_id is not null
  and private.has_organization_role(
    organization_id,
    array[
      'organization_administrator', 'program_manager',
      'finance_approver', 'auditor'
    ]::public.organization_membership_role[]
  )
);

create policy "Financial operators can view reconciliation issues"
on public.reconciliation_issues for select to authenticated
using (
  private.has_organization_role(
    organization_id,
    array[
      'organization_administrator', 'program_manager',
      'finance_approver', 'auditor'
    ]::public.organization_membership_role[]
  )
);

revoke all privileges on table public.ledger_transactions
  from public, anon, authenticated, service_role;
revoke all privileges on table public.contract_events
  from public, anon, authenticated, service_role;
revoke all privileges on table public.reconciliation_cursors
  from public, anon, authenticated, service_role;
revoke all privileges on table public.reconciliation_runs
  from public, anon, authenticated, service_role;
revoke all privileges on table public.reconciliation_issues
  from public, anon, authenticated, service_role;

grant select on table public.ledger_transactions to authenticated;
grant select on table public.contract_events to authenticated;
grant select on table public.reconciliation_runs to authenticated;
grant select on table public.reconciliation_issues to authenticated;

grant select, insert on table public.ledger_transactions to service_role;
grant select, insert on table public.contract_events to service_role;
grant select, insert, update on table public.reconciliation_cursors to service_role;
grant select, insert, update on table public.reconciliation_runs to service_role;
grant select, insert, update on table public.reconciliation_issues to service_role;

revoke all privileges on function public.advance_reconciliation_cursor(
  public.wallet_network, text, text, bigint, timestamptz, uuid
) from public, anon, authenticated;
revoke all privileges on function public.record_reconciliation_issue(
  uuid, uuid, uuid, uuid, uuid, public.wallet_network,
  public.reconciliation_issue_type, public.reconciliation_issue_severity,
  text, text, text, jsonb, jsonb, jsonb, text, timestamptz, uuid
) from public, anon, authenticated;
grant execute on function public.advance_reconciliation_cursor(
  public.wallet_network, text, text, bigint, timestamptz, uuid
) to service_role;
grant execute on function public.record_reconciliation_issue(
  uuid, uuid, uuid, uuid, uuid, public.wallet_network,
  public.reconciliation_issue_type, public.reconciliation_issue_severity,
  text, text, text, jsonb, jsonb, jsonb, text, timestamptz, uuid
) to service_role;

revoke all privileges on function private.reject_blockchain_evidence_mutation()
  from public, anon, authenticated;
revoke all privileges on function private.validate_reconciliation_cursor_change()
  from public, anon, authenticated;
revoke all privileges on function private.validate_reconciliation_run_change()
  from public, anon, authenticated;
revoke all privileges on function private.validate_reconciliation_issue_change()
  from public, anon, authenticated;

comment on table public.ledger_transactions is
  'Append-only observed Stellar transaction envelopes, hashes, ledger results, errors, and correlation evidence.';
comment on column public.ledger_transactions.financial_intent_id is
  'Correlation to financial_intents; a foreign key is installed when that concurrent workflow table exists.';
comment on column public.ledger_transactions.transaction_attempt_id is
  'Correlation to transaction_attempts; a foreign key is installed when that concurrent workflow table exists.';
comment on table public.contract_events is
  'Append-only deduplicated Soroban contract event evidence linked to its observed ledger transaction.';
comment on table public.reconciliation_cursors is
  'Service-only monotonic checkpoints for resumable ledger and contract-event observation streams.';
comment on table public.reconciliation_runs is
  'Diagnosable reconciliation execution with cursor, ledger range, lag, counts, errors, and correlation evidence.';
comment on table public.reconciliation_issues is
  'Deduplicated projection or blockchain mismatches, quarantined by default with explicit alert and resolution state.';
comment on function public.advance_reconciliation_cursor(
  public.wallet_network, text, text, bigint, timestamptz, uuid
) is 'Service-only monotonic reconciliation cursor advancement.';
comment on function public.record_reconciliation_issue(
  uuid, uuid, uuid, uuid, uuid, public.wallet_network,
  public.reconciliation_issue_type, public.reconciliation_issue_severity,
  text, text, text, jsonb, jsonb, jsonb, text, timestamptz, uuid
) is 'Service-only mismatch quarantine and active-fingerprint deduplication path.';
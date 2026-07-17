-- Add resumable distribution workflow, immutable financial intents, attempts,
-- and deterministic idempotency claims. Beneficiary identity links remain
-- private, organization-scoped database data and are never exposed publicly.

do $$
begin
  create type public.distribution_job_status as enum (
    'draft', 'validating', 'awaiting_approval', 'queued', 'submitting',
    'reconciling', 'completed', 'partial_failed', 'cancelled'
  );
exception when duplicate_object then null;
end
$$;

do $$
begin
  create type public.distribution_recipient_status as enum (
    'pending', 'prepared', 'submitted', 'confirmed', 'failed', 'cancelled'
  );
exception when duplicate_object then null;
end
$$;

do $$
begin
  create type public.financial_operation_type as enum (
    'program_activation', 'cash_distribution', 'voucher_allocation',
    'cash_payment', 'voucher_redemption', 'refund', 'wallet_rotation',
    'fee_sponsorship'
  );
exception when duplicate_object then null;
end
$$;

do $$
begin
  create type public.transaction_attempt_status as enum (
    'accepted', 'submitted', 'observed_success', 'observed_failure', 'unknown'
  );
exception when duplicate_object then null;
end
$$;

create table public.idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  program_id uuid references public.programs(id) on delete restrict,
  scope text not null check (scope ~ '^[a-z][a-z0-9_.:-]{0,127}$'),
  idempotency_key text not null check (length(idempotency_key) between 1 and 255),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  operation_type public.financial_operation_type not null,
  correlation_id uuid not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint idempotency_keys_organization_scope_key
    unique (organization_id, scope, idempotency_key)
);
create table public.distribution_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  program_id uuid not null references public.programs(id) on delete restrict,
  idempotency_key_id uuid not null unique
    references public.idempotency_keys(id) on delete restrict,
  status public.distribution_job_status not null default 'draft',
  recipient_count integer not null default 0 check (recipient_count >= 0),
  pending_count integer not null default 0 check (pending_count >= 0),
  submitted_count integer not null default 0 check (submitted_count >= 0),
  confirmed_count integer not null default 0 check (confirmed_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  cancelled_count integer not null default 0 check (cancelled_count >= 0),
  total_amount_stroops bigint not null check (total_amount_stroops >= 0),
  batch_size integer not null default 100 check (batch_size between 1 and 100),
  next_recipient_offset integer not null default 0 check (next_recipient_offset >= 0),
  correlation_id uuid not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  approved_by uuid references auth.users(id) on delete restrict,
  approved_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint distribution_jobs_organization_correlation_key
    unique (organization_id, correlation_id),
  constraint distribution_jobs_counts_check check (
    pending_count + submitted_count + confirmed_count + failed_count
      + cancelled_count <= recipient_count
  ),
  constraint distribution_jobs_approval_check check (
    (approved_by is null and approved_at is null)
    or (approved_by is not null and approved_at is not null)
  )
);

create table public.distribution_recipients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  program_id uuid not null references public.programs(id) on delete restrict,
  distribution_job_id uuid not null references public.distribution_jobs(id) on delete restrict,
  beneficiary_identity_id uuid not null
    references public.beneficiary_identities(id) on delete restrict,
  enrollment_id uuid not null references public.enrollments(id) on delete restrict,
  destination_wallet_id uuid not null references public.wallets(id) on delete restrict,
  idempotency_key_id uuid not null unique
    references public.idempotency_keys(id) on delete restrict,
  amount_stroops bigint not null check (amount_stroops > 0),
  status public.distribution_recipient_status not null default 'pending',
  correlation_id uuid not null,
  transaction_hash text check (
    transaction_hash is null or transaction_hash ~ '^[0-9a-f]{64}$'
  ),
  confirmed_ledger bigint check (confirmed_ledger is null or confirmed_ledger > 0),
  failure_code text check (failure_code is null or length(failure_code) <= 100),
  failure_reason text check (failure_reason is null or length(failure_reason) <= 1000),
  submitted_at timestamptz,
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint distribution_recipients_job_beneficiary_key
    unique (distribution_job_id, beneficiary_identity_id),
  constraint distribution_recipients_job_correlation_key
    unique (distribution_job_id, correlation_id),
  constraint distribution_recipients_failure_check check (
    status <> 'failed' or (failure_code is not null and failure_reason is not null)
  ),
  constraint distribution_recipients_confirmation_check check (
    status <> 'confirmed'
    or (transaction_hash is not null and confirmed_ledger is not null and confirmed_at is not null)
  )
);
create table public.financial_intents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  program_id uuid references public.programs(id) on delete restrict,
  distribution_job_id uuid references public.distribution_jobs(id) on delete restrict,
  distribution_recipient_id uuid references public.distribution_recipients(id) on delete restrict,
  beneficiary_identity_id uuid
    references public.beneficiary_identities(id) on delete restrict,
  idempotency_key_id uuid not null unique
    references public.idempotency_keys(id) on delete restrict,
  operation_type public.financial_operation_type not null,
  amount_stroops bigint check (amount_stroops is null or amount_stroops > 0),
  asset_code text check (asset_code is null or asset_code ~ '^[A-Z0-9]{1,12}$'),
  asset_issuer text check (asset_issuer is null or asset_issuer ~ '^G[A-Z2-7]{55}$'),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  request_metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(request_metadata) = 'object'),
  correlation_id uuid not null,
  requested_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint financial_intents_recipient_context_check check (
    distribution_recipient_id is null
    or (program_id is not null and distribution_job_id is not null
      and beneficiary_identity_id is not null)
  ),
  constraint financial_intents_distribution_context_check check (
    operation_type not in ('cash_distribution', 'voucher_allocation')
    or (program_id is not null and distribution_job_id is not null
      and distribution_recipient_id is not null
      and beneficiary_identity_id is not null and amount_stroops is not null)
  )
);

create unique index financial_intents_distribution_recipient_key
  on public.financial_intents (distribution_recipient_id)
  where distribution_recipient_id is not null;

create table public.transaction_attempts (
  id uuid primary key default gen_random_uuid(),
  financial_intent_id uuid not null
    references public.financial_intents(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  program_id uuid references public.programs(id) on delete restrict,
  distribution_job_id uuid references public.distribution_jobs(id) on delete restrict,
  beneficiary_identity_id uuid
    references public.beneficiary_identities(id) on delete restrict,
  correlation_id uuid not null,
  attempt_number integer not null check (attempt_number > 0),
  status public.transaction_attempt_status not null default 'accepted',
  network public.wallet_network not null default 'stellar_testnet',
  intent_payload_hash text not null check (intent_payload_hash ~ '^[0-9a-f]{64}$'),
  prepared_payload_hash text not null check (prepared_payload_hash ~ '^[0-9a-f]{64}$'),
  envelope_xdr text,
  authorization_payload jsonb check (
    authorization_payload is null or jsonb_typeof(authorization_payload) = 'object'
  ),
  transaction_hash text check (
    transaction_hash is null or transaction_hash ~ '^[0-9a-f]{64}$'
  ),
  min_ledger bigint check (min_ledger is null or min_ledger > 0),
  max_ledger bigint check (max_ledger is null or max_ledger >= min_ledger),
  result_code text check (result_code is null or length(result_code) <= 100),
  error_code text check (error_code is null or length(error_code) <= 100),
  error_detail text check (error_detail is null or length(error_detail) <= 2000),
  submitted_at timestamptz,
  observed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transaction_attempts_intent_attempt_key
    unique (financial_intent_id, attempt_number),
  constraint transaction_attempts_observation_check check (
    status not in ('observed_success', 'observed_failure') or observed_at is not null
  )
);

create unique index transaction_attempts_network_transaction_hash_key
  on public.transaction_attempts (network, transaction_hash)
  where transaction_hash is not null;
create or replace function public.claim_financial_idempotency_key(
  p_organization_id uuid,
  p_program_id uuid,
  p_scope text,
  p_idempotency_key text,
  p_payload_hash text,
  p_operation_type public.financial_operation_type,
  p_correlation_id uuid
)
returns public.idempotency_keys
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed public.idempotency_keys;
begin
  insert into public.idempotency_keys (
    organization_id, program_id, scope, idempotency_key,
    payload_hash, operation_type, correlation_id
  ) values (
    p_organization_id, p_program_id, p_scope, p_idempotency_key,
    p_payload_hash, p_operation_type, p_correlation_id
  )
  on conflict (organization_id, scope, idempotency_key) do nothing
  returning * into claimed;

  if claimed.id is null then
    select * into claimed
    from public.idempotency_keys
    where organization_id = p_organization_id
      and scope = p_scope
      and idempotency_key = p_idempotency_key
    for update;

    if claimed.payload_hash is distinct from p_payload_hash
      or claimed.operation_type is distinct from p_operation_type
      or claimed.program_id is distinct from p_program_id then
      raise exception 'idempotency key payload hash conflict'
        using errcode = '23514';
    end if;

    update public.idempotency_keys
    set last_seen_at = now()
    where id = claimed.id
    returning * into claimed;
  end if;

  return claimed;
end;
$$;

create or replace function private.validate_financial_workflow_scope()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target_program public.programs;
  target_key public.idempotency_keys;
  target_job public.distribution_jobs;
  target_recipient public.distribution_recipients;
  target_enrollment public.enrollments;
  target_wallet public.wallets;
  target_intent public.financial_intents;
begin
  if new.program_id is not null then
    select * into target_program from public.programs where id = new.program_id;
    if not found or target_program.organization_id <> new.organization_id then
      raise exception 'financial workflow program organization mismatch'
        using errcode = '23514';
    end if;
  end if;

  if tg_table_name = 'idempotency_keys' then
    return new;
  end if;

  if tg_table_name in ('distribution_jobs', 'distribution_recipients', 'financial_intents') then
    select * into target_key
    from public.idempotency_keys where id = new.idempotency_key_id;
    if not found
      or target_key.organization_id <> new.organization_id
      or target_key.program_id is distinct from new.program_id then
      raise exception 'financial workflow idempotency scope mismatch'
        using errcode = '23514';
    end if;
  end if;

  if tg_table_name = 'distribution_jobs' then
    if target_key.operation_type not in ('cash_distribution', 'voucher_allocation') then
      raise exception 'distribution job idempotency operation mismatch'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if tg_table_name = 'distribution_recipients' then
    select * into target_job
    from public.distribution_jobs where id = new.distribution_job_id;
    select * into target_enrollment
    from public.enrollments where id = new.enrollment_id;
    select * into target_wallet
    from public.wallets where id = new.destination_wallet_id;

    if target_job.id is null
      or target_job.organization_id <> new.organization_id
      or target_job.program_id <> new.program_id then
      raise exception 'distribution recipient job scope mismatch'
        using errcode = '23514';
    end if;
    if target_enrollment.id is null
      or target_enrollment.program_id <> new.program_id
      or target_enrollment.beneficiary_identity_id <> new.beneficiary_identity_id then
      raise exception 'distribution recipient enrollment scope mismatch'
        using errcode = '23514';
    end if;
    if target_wallet.id is null
      or target_wallet.owner_type <> 'beneficiary_identity'
      or target_wallet.owner_id <> new.beneficiary_identity_id
      or target_wallet.purpose <> 'beneficiary'
      or target_wallet.network <> 'stellar_testnet'
      or target_wallet.verification_status <> 'verified'
      or not target_wallet.is_active then
      raise exception 'distribution recipient wallet is not the active verified beneficiary wallet'
        using errcode = '23514';
    end if;
    if target_key.operation_type not in ('cash_distribution', 'voucher_allocation') then
      raise exception 'distribution recipient idempotency operation mismatch'
        using errcode = '23514';
    end if;
    return new;
  end if;
  if tg_table_name = 'financial_intents' then
    if target_key.operation_type <> new.operation_type
      or target_key.payload_hash <> new.payload_hash then
      raise exception 'financial intent does not match its idempotency claim'
        using errcode = '23514';
    end if;

    if new.distribution_job_id is not null then
      select * into target_job
      from public.distribution_jobs where id = new.distribution_job_id;
      if target_job.id is null
        or target_job.organization_id <> new.organization_id
        or target_job.program_id is distinct from new.program_id then
        raise exception 'financial intent distribution job scope mismatch'
          using errcode = '23514';
      end if;
    end if;

    if new.distribution_recipient_id is not null then
      select * into target_recipient
      from public.distribution_recipients where id = new.distribution_recipient_id;
      if target_recipient.id is null
        or target_recipient.organization_id <> new.organization_id
        or target_recipient.program_id is distinct from new.program_id
        or target_recipient.distribution_job_id is distinct from new.distribution_job_id
        or target_recipient.beneficiary_identity_id
          is distinct from new.beneficiary_identity_id
        or target_recipient.amount_stroops is distinct from new.amount_stroops then
        raise exception 'financial intent distribution recipient scope mismatch'
          using errcode = '23514';
      end if;
    end if;
    return new;
  end if;

  if tg_table_name = 'transaction_attempts' then
    select * into target_intent
    from public.financial_intents where id = new.financial_intent_id;
    if not found then
      raise exception 'financial intent not found' using errcode = '23503';
    end if;

    if tg_op = 'INSERT' then
      new.organization_id := target_intent.organization_id;
      new.program_id := target_intent.program_id;
      new.distribution_job_id := target_intent.distribution_job_id;
      new.beneficiary_identity_id := target_intent.beneficiary_identity_id;
      new.correlation_id := target_intent.correlation_id;
      new.intent_payload_hash := target_intent.payload_hash;
    elsif new.organization_id <> target_intent.organization_id
      or new.program_id is distinct from target_intent.program_id
      or new.distribution_job_id is distinct from target_intent.distribution_job_id
      or new.beneficiary_identity_id is distinct from target_intent.beneficiary_identity_id
      or new.correlation_id <> target_intent.correlation_id
      or new.intent_payload_hash <> target_intent.payload_hash then
      raise exception 'transaction attempt intent scope mismatch'
        using errcode = '23514';
    end if;
    return new;
  end if;

  return new;
end;
$$;

create trigger idempotency_keys_validate_scope
before insert or update on public.idempotency_keys
for each row execute function private.validate_financial_workflow_scope();
create trigger distribution_jobs_validate_scope
before insert or update on public.distribution_jobs
for each row execute function private.validate_financial_workflow_scope();
create trigger distribution_recipients_validate_scope
before insert or update on public.distribution_recipients
for each row execute function private.validate_financial_workflow_scope();
create trigger financial_intents_validate_scope
before insert or update on public.financial_intents
for each row execute function private.validate_financial_workflow_scope();
create trigger transaction_attempts_validate_scope
before insert or update on public.transaction_attempts
for each row execute function private.validate_financial_workflow_scope();
create or replace function private.protect_idempotency_claim()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'idempotency claims cannot be deleted' using errcode = '23514';
  end if;
  if row(new.organization_id, new.program_id, new.scope, new.idempotency_key,
      new.payload_hash, new.operation_type, new.correlation_id, new.first_seen_at)
    is distinct from
    row(old.organization_id, old.program_id, old.scope, old.idempotency_key,
      old.payload_hash, old.operation_type, old.correlation_id, old.first_seen_at) then
    raise exception 'idempotency claim identity and payload are immutable'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger idempotency_keys_protect_claim
before update or delete on public.idempotency_keys
for each row execute function private.protect_idempotency_claim();

create or replace function private.validate_distribution_job_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'distribution jobs cannot be deleted' using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' then
    if row(new.organization_id, new.program_id, new.idempotency_key_id,
        new.total_amount_stroops, new.batch_size, new.correlation_id,
        new.created_by, new.created_at)
      is distinct from
      row(old.organization_id, old.program_id, old.idempotency_key_id,
        old.total_amount_stroops, old.batch_size, old.correlation_id,
        old.created_by, old.created_at) then
      raise exception 'distribution job identity and requested value are immutable'
        using errcode = '23514';
    end if;

    if new.status is distinct from old.status and not (
      (old.status = 'draft' and new.status in ('validating', 'cancelled'))
      or (old.status = 'validating' and new.status in (
        'awaiting_approval', 'partial_failed', 'cancelled'))
      or (old.status = 'awaiting_approval' and new.status in ('queued', 'cancelled'))
      or (old.status = 'queued' and new.status in ('submitting', 'cancelled'))
      or (old.status = 'submitting' and new.status in (
        'reconciling', 'partial_failed', 'cancelled'))
      or (old.status = 'reconciling' and new.status in (
        'completed', 'partial_failed', 'cancelled'))
      or (old.status = 'partial_failed' and new.status in (
        'queued', 'submitting', 'reconciling', 'cancelled'))
    ) then
      raise exception 'invalid distribution job status transition: % -> %',
        old.status, new.status using errcode = '23514';
    end if;
  end if;

  if new.status = 'completed' and (
    new.recipient_count = 0 or new.confirmed_count <> new.recipient_count
    or new.pending_count <> 0 or new.submitted_count <> 0 or new.failed_count <> 0
    or new.cancelled_count <> 0
  ) then
    raise exception 'completed distribution job requires every recipient confirmed'
      using errcode = '23514';
  end if;
  if new.status = 'partial_failed' and new.failed_count = 0 then
    raise exception 'partial-failed distribution job requires failed recipients'
      using errcode = '23514';
  end if;

  if new.status = 'completed' then
    new.completed_at := coalesce(new.completed_at, now());
  elsif new.status = 'cancelled' then
    new.cancelled_at := coalesce(new.cancelled_at, now());
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger distribution_jobs_validate_mutation
before update or delete on public.distribution_jobs
for each row execute function private.validate_distribution_job_mutation();
create or replace function private.validate_distribution_recipient_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'distribution recipient transfers cannot be deleted'
      using errcode = '23514';
  end if;

  if row(new.organization_id, new.program_id, new.distribution_job_id,
      new.beneficiary_identity_id, new.enrollment_id, new.destination_wallet_id,
      new.idempotency_key_id, new.amount_stroops, new.correlation_id, new.created_at)
    is distinct from
    row(old.organization_id, old.program_id, old.distribution_job_id,
      old.beneficiary_identity_id, old.enrollment_id, old.destination_wallet_id,
      old.idempotency_key_id, old.amount_stroops, old.correlation_id, old.created_at) then
    raise exception 'distribution recipient identity and requested value are immutable'
      using errcode = '23514';
  end if;

  if new.status is distinct from old.status and not (
    (old.status = 'pending' and new.status in ('prepared', 'failed', 'cancelled'))
    or (old.status = 'prepared' and new.status in ('submitted', 'failed', 'cancelled'))
    or (old.status = 'submitted' and new.status in ('confirmed', 'failed'))
    or (old.status = 'failed' and new.status in ('pending', 'prepared', 'cancelled'))
  ) then
    raise exception 'invalid distribution recipient status transition: % -> %',
      old.status, new.status using errcode = '23514';
  end if;

  if new.status = 'submitted' then
    new.submitted_at := coalesce(new.submitted_at, now());
  elsif new.status = 'confirmed' then
    new.confirmed_at := coalesce(new.confirmed_at, now());
    new.failure_code := null;
    new.failure_reason := null;
  elsif new.status = 'cancelled' then
    new.cancelled_at := coalesce(new.cancelled_at, now());
  elsif old.status = 'failed' and new.status in ('pending', 'prepared') then
    new.failure_code := null;
    new.failure_reason := null;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger distribution_recipients_validate_mutation
before update or delete on public.distribution_recipients
for each row execute function private.validate_distribution_recipient_mutation();

create or replace function private.prevent_financial_intent_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'financial intents are immutable' using errcode = '23514';
end;
$$;

create trigger financial_intents_append_only
before update or delete on public.financial_intents
for each row execute function private.prevent_financial_intent_mutation();

create or replace function private.validate_transaction_attempt_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'transaction attempts cannot be deleted' using errcode = '23514';
  end if;

  if row(new.financial_intent_id, new.organization_id, new.program_id,
      new.distribution_job_id, new.beneficiary_identity_id, new.correlation_id,
      new.attempt_number, new.network, new.intent_payload_hash,
      new.prepared_payload_hash, new.envelope_xdr, new.authorization_payload,
      new.min_ledger, new.max_ledger, new.created_at)
    is distinct from
    row(old.financial_intent_id, old.organization_id, old.program_id,
      old.distribution_job_id, old.beneficiary_identity_id, old.correlation_id,
      old.attempt_number, old.network, old.intent_payload_hash,
      old.prepared_payload_hash, old.envelope_xdr, old.authorization_payload,
      old.min_ledger, old.max_ledger, old.created_at) then
    raise exception 'transaction attempt prepared payload and intent links are immutable'
      using errcode = '23514';
  end if;

  if new.status is distinct from old.status and not (
    (old.status = 'accepted' and new.status in (
      'submitted', 'observed_failure', 'unknown'))
    or (old.status = 'submitted' and new.status in (
      'observed_success', 'observed_failure', 'unknown'))
    or (old.status = 'unknown' and new.status in (
      'observed_success', 'observed_failure'))
  ) then
    raise exception 'invalid transaction attempt status transition: % -> %',
      old.status, new.status using errcode = '23514';
  end if;

  if new.status = 'submitted' then
    new.submitted_at := coalesce(new.submitted_at, now());
  elsif new.status in ('observed_success', 'observed_failure') then
    new.observed_at := coalesce(new.observed_at, now());
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger transaction_attempts_validate_mutation
before update or delete on public.transaction_attempts
for each row execute function private.validate_transaction_attempt_mutation();
create or replace function private.make_distribution_recipient_key(
  p_program_id uuid,
  p_beneficiary_identity_id uuid,
  p_policy_version integer
)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select 'distribution:' || p_program_id::text
    || ':beneficiary:' || p_beneficiary_identity_id::text
    || ':policy:' || p_policy_version::text;
$$;

create index distribution_jobs_resume_queue_idx
  on public.distribution_jobs (organization_id, status, updated_at, id)
  where status in ('validating', 'queued', 'submitting', 'reconciling', 'partial_failed');
create index distribution_jobs_program_created_idx
  on public.distribution_jobs (program_id, created_at desc);
create index distribution_recipients_job_status_idx
  on public.distribution_recipients (distribution_job_id, status, id);
create index distribution_recipients_retry_queue_idx
  on public.distribution_recipients (distribution_job_id, updated_at, id)
  where status in ('pending', 'failed');
create index distribution_recipients_beneficiary_created_idx
  on public.distribution_recipients (beneficiary_identity_id, created_at desc);
create unique index distribution_recipients_transaction_hash_key
  on public.distribution_recipients (transaction_hash)
  where transaction_hash is not null;
create index financial_intents_organization_created_idx
  on public.financial_intents (organization_id, created_at desc);
create index financial_intents_beneficiary_created_idx
  on public.financial_intents (beneficiary_identity_id, created_at desc)
  where beneficiary_identity_id is not null;
create index transaction_attempts_reconciliation_queue_idx
  on public.transaction_attempts (status, updated_at, id)
  where status in ('submitted', 'unknown');
create index idempotency_keys_program_created_idx
  on public.idempotency_keys (program_id, first_seen_at desc)
  where program_id is not null;

alter table public.idempotency_keys enable row level security;
alter table public.distribution_jobs enable row level security;
alter table public.distribution_recipients enable row level security;
alter table public.financial_intents enable row level security;
alter table public.transaction_attempts enable row level security;

create policy "Organization members can view distribution jobs"
on public.distribution_jobs for select to authenticated
using (private.is_organization_member(organization_id));

create policy "Organization members can view distribution recipients"
on public.distribution_recipients for select to authenticated
using (private.is_organization_member(organization_id));

create policy "Organization members can view financial intents"
on public.financial_intents for select to authenticated
using (
  private.is_organization_member(organization_id)
  or exists (
    select 1 from public.beneficiary_identities identity
    where identity.id = beneficiary_identity_id
      and identity.user_id = (select auth.uid())
  )
);

create policy "Organization members can view transaction attempts"
on public.transaction_attempts for select to authenticated
using (
  private.is_organization_member(organization_id)
  or exists (
    select 1 from public.beneficiary_identities identity
    where identity.id = beneficiary_identity_id
      and identity.user_id = (select auth.uid())
  )
);

create policy "Organization members can view idempotency claims"
on public.idempotency_keys for select to authenticated
using (private.is_organization_member(organization_id));

revoke all privileges on table public.idempotency_keys from anon, authenticated;
revoke all privileges on table public.distribution_jobs from anon, authenticated;
revoke all privileges on table public.distribution_recipients from anon, authenticated;
revoke all privileges on table public.financial_intents from anon, authenticated;
revoke all privileges on table public.transaction_attempts from anon, authenticated;
grant select on table public.idempotency_keys to authenticated;
grant select on table public.distribution_jobs to authenticated;
grant select on table public.distribution_recipients to authenticated;
grant select on table public.financial_intents to authenticated;
grant select on table public.transaction_attempts to authenticated;
grant all privileges on table public.idempotency_keys to service_role;
grant all privileges on table public.distribution_jobs to service_role;
grant all privileges on table public.distribution_recipients to service_role;
grant all privileges on table public.financial_intents to service_role;
grant all privileges on table public.transaction_attempts to service_role;
revoke all privileges on function public.claim_financial_idempotency_key(
  uuid, uuid, text, text, text, public.financial_operation_type, uuid
) from public, anon, authenticated;
grant execute on function public.claim_financial_idempotency_key(
  uuid, uuid, text, text, text, public.financial_operation_type, uuid
) to service_role;
revoke all privileges on function private.make_distribution_recipient_key(
  uuid, uuid, integer
) from public, anon, authenticated;
grant execute on function private.make_distribution_recipient_key(
  uuid, uuid, integer
) to service_role;
revoke all privileges on function private.validate_financial_workflow_scope()
  from public, anon, authenticated;
revoke all privileges on function private.protect_idempotency_claim()
  from public, anon, authenticated;
revoke all privileges on function private.validate_distribution_job_mutation()
  from public, anon, authenticated;
revoke all privileges on function private.validate_distribution_recipient_mutation()
  from public, anon, authenticated;
revoke all privileges on function private.prevent_financial_intent_mutation()
  from public, anon, authenticated;
revoke all privileges on function private.validate_transaction_attempt_mutation()
  from public, anon, authenticated;

comment on table public.distribution_jobs is
  'Resumable organization-scoped bulk distribution; no beneficiary PII.';
comment on table public.distribution_recipients is
  'Private per-beneficiary transfer state linked by stable identity UUID, never public identity data.';
comment on column public.distribution_recipients.failure_reason is
  'Authorized-organization diagnostic only; must not contain beneficiary PII.';
comment on table public.financial_intents is
  'Immutable business intent and canonical payload hash with organization, program, job, beneficiary, and correlation links.';
comment on column public.financial_intents.request_metadata is
  'Non-PII operation metadata only; names, contacts, government IDs, addresses, and documents are prohibited.';
comment on table public.transaction_attempts is
  'Retry-specific prepared transaction evidence; confirmation remains reconciliation-owned.';
comment on table public.idempotency_keys is
  'Atomic deterministic-key claim; reusing a key with a different payload hash is rejected.';
comment on function public.claim_financial_idempotency_key(
  uuid, uuid, text, text, text, public.financial_operation_type, uuid
) is 'Service-role-only atomic idempotency claim with explicit payload-hash conflict detection.';
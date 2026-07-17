-- Add indexed, reconciliation-backed financial read models.
-- Projection writes are service-only; blockchain evidence remains authoritative.

create table public.beneficiary_balance_projection (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  program_id uuid not null references public.programs(id) on delete restrict,
  beneficiary_identity_id uuid not null references public.beneficiary_identities(id) on delete restrict,
  network public.wallet_network not null default 'stellar_testnet',
  aid_type public.program_aid_type not null,
  asset_code text not null default 'RCPHP' check (asset_code ~ '^[A-Z0-9]{1,12}$'),
  asset_issuer text not null check (asset_issuer ~ '^G[A-Z2-7]{55}$'),
  available_balance_stroops bigint not null default 0 check (available_balance_stroops >= 0),
  allocated_stroops bigint not null default 0 check (allocated_stroops >= 0),
  distributed_stroops bigint not null default 0 check (distributed_stroops >= 0),
  redeemed_stroops bigint not null default 0 check (redeemed_stroops >= 0),
  refunded_stroops bigint not null default 0 check (refunded_stroops >= 0),
  confirmed_transaction_count integer not null default 0 check (confirmed_transaction_count >= 0),
  latest_transaction_hash text check (latest_transaction_hash is null or latest_transaction_hash ~ '^[0-9a-f]{64}$'),
  latest_ledger_transaction_id uuid references public.ledger_transactions(id) on delete restrict,
  latest_contract_event_id uuid references public.contract_events(id) on delete restrict,
  reconciliation_run_id uuid not null references public.reconciliation_runs(id) on delete restrict,
  as_of_ledger bigint not null check (as_of_ledger > 0),
  reconciled_at timestamptz not null,
  stale_after timestamptz not null,
  is_stale boolean not null default false,
  stale_since timestamptz,
  is_quarantined boolean not null default false,
  quarantine_issue_id uuid references public.reconciliation_issues(id) on delete restrict,
  projection_version bigint not null default 1 check (projection_version > 0),
  updated_at timestamptz not null default now(),
  constraint beneficiary_balance_projection_key unique (organization_id, program_id, beneficiary_identity_id, asset_code),
  constraint beneficiary_balance_projection_recency_check check (stale_after > reconciled_at),
  constraint beneficiary_balance_projection_stale_check check ((is_stale and stale_since is not null) or (not is_stale and stale_since is null)),
  constraint beneficiary_balance_projection_quarantine_check check ((is_quarantined and quarantine_issue_id is not null) or (not is_quarantined and quarantine_issue_id is null)),
  constraint beneficiary_balance_projection_amounts_check check (redeemed_stroops <= allocated_stroops + refunded_stroops)
);
create table public.merchant_balance_projection (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  program_id uuid references public.programs(id) on delete restrict,
  merchant_id uuid not null references public.merchant_entities(id) on delete restrict,
  network public.wallet_network not null default 'stellar_testnet',
  asset_code text not null default 'RCPHP' check (asset_code ~ '^[A-Z0-9]{1,12}$'),
  asset_issuer text not null check (asset_issuer ~ '^G[A-Z2-7]{55}$'),
  settled_balance_stroops bigint not null default 0 check (settled_balance_stroops >= 0),
  gross_settled_stroops bigint not null default 0 check (gross_settled_stroops >= 0),
  refunded_stroops bigint not null default 0 check (refunded_stroops >= 0),
  pending_cashout_stroops bigint not null default 0 check (pending_cashout_stroops >= 0),
  completed_cashout_stroops bigint not null default 0 check (completed_cashout_stroops >= 0),
  confirmed_settlement_count integer not null default 0 check (confirmed_settlement_count >= 0),
  latest_transaction_hash text check (latest_transaction_hash is null or latest_transaction_hash ~ '^[0-9a-f]{64}$'),
  latest_ledger_transaction_id uuid references public.ledger_transactions(id) on delete restrict,
  latest_contract_event_id uuid references public.contract_events(id) on delete restrict,
  reconciliation_run_id uuid not null references public.reconciliation_runs(id) on delete restrict,
  as_of_ledger bigint not null check (as_of_ledger > 0),
  reconciled_at timestamptz not null,
  stale_after timestamptz not null,
  is_stale boolean not null default false,
  stale_since timestamptz,
  is_quarantined boolean not null default false,
  quarantine_issue_id uuid references public.reconciliation_issues(id) on delete restrict,
  projection_version bigint not null default 1 check (projection_version > 0),
  updated_at timestamptz not null default now(),
  constraint merchant_balance_projection_key unique nulls not distinct (organization_id, program_id, merchant_id, asset_code),
  constraint merchant_balance_projection_recency_check check (stale_after > reconciled_at),
  constraint merchant_balance_projection_stale_check check ((is_stale and stale_since is not null) or (not is_stale and stale_since is null)),
  constraint merchant_balance_projection_quarantine_check check ((is_quarantined and quarantine_issue_id is not null) or (not is_quarantined and quarantine_issue_id is null)),
  constraint merchant_balance_projection_amounts_check check (refunded_stroops <= gross_settled_stroops and settled_balance_stroops + completed_cashout_stroops <= gross_settled_stroops - refunded_stroops)
);

create table public.program_financial_projection (
  program_id uuid primary key references public.programs(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  network public.wallet_network not null default 'stellar_testnet',
  aid_type public.program_aid_type not null,
  program_status text not null check (program_status in ('draft', 'funding', 'funding_failed', 'active', 'closing', 'closed')),
  funding_status public.program_funding_status not null,
  asset_code text not null default 'RCPHP' check (asset_code ~ '^[A-Z0-9]{1,12}$'),
  asset_issuer text not null check (asset_issuer ~ '^G[A-Z2-7]{55}$'),
  contract_id text check (contract_id is null or contract_id ~ '^C[A-Z2-7]{55}$'),
  budget_stroops bigint not null default 0 check (budget_stroops >= 0),
  funded_stroops bigint not null default 0 check (funded_stroops >= 0),
  allocated_stroops bigint not null default 0 check (allocated_stroops >= 0),
  distributed_stroops bigint not null default 0 check (distributed_stroops >= 0),
  redeemed_stroops bigint not null default 0 check (redeemed_stroops >= 0),
  refunded_stroops bigint not null default 0 check (refunded_stroops >= 0),
  returned_stroops bigint not null default 0 check (returned_stroops >= 0),
  escrow_balance_stroops bigint not null default 0 check (escrow_balance_stroops >= 0),
  confirmed_transaction_count integer not null default 0 check (confirmed_transaction_count >= 0),
  latest_transaction_hash text check (latest_transaction_hash is null or latest_transaction_hash ~ '^[0-9a-f]{64}$'),
  latest_ledger_transaction_id uuid references public.ledger_transactions(id) on delete restrict,
  latest_contract_event_id uuid references public.contract_events(id) on delete restrict,
  reconciliation_run_id uuid not null references public.reconciliation_runs(id) on delete restrict,
  as_of_ledger bigint not null check (as_of_ledger > 0),
  reconciled_at timestamptz not null,
  stale_after timestamptz not null,
  is_stale boolean not null default false,
  stale_since timestamptz,
  is_quarantined boolean not null default false,
  quarantine_issue_id uuid references public.reconciliation_issues(id) on delete restrict,
  projection_version bigint not null default 1 check (projection_version > 0),
  updated_at timestamptz not null default now(),
  constraint program_financial_projection_recency_check check (stale_after > reconciled_at),
  constraint program_financial_projection_stale_check check ((is_stale and stale_since is not null) or (not is_stale and stale_since is null)),
  constraint program_financial_projection_quarantine_check check ((is_quarantined and quarantine_issue_id is not null) or (not is_quarantined and quarantine_issue_id is null)),
  constraint program_financial_projection_funding_check check (funded_stroops <= budget_stroops),
  constraint program_financial_projection_refund_check check (refunded_stroops <= redeemed_stroops),
  constraint program_financial_projection_contract_check check ((aid_type = 'cash' and contract_id is null) or aid_type = 'voucher')
);
create table public.distribution_job_projection (
  distribution_job_id uuid primary key references public.distribution_jobs(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  program_id uuid not null references public.programs(id) on delete restrict,
  status public.distribution_job_status not null,
  recipient_count integer not null default 0 check (recipient_count >= 0),
  pending_count integer not null default 0 check (pending_count >= 0),
  submitted_count integer not null default 0 check (submitted_count >= 0),
  confirmed_count integer not null default 0 check (confirmed_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  cancelled_count integer not null default 0 check (cancelled_count >= 0),
  total_amount_stroops bigint not null default 0 check (total_amount_stroops >= 0),
  confirmed_amount_stroops bigint not null default 0 check (confirmed_amount_stroops >= 0),
  failed_amount_stroops bigint not null default 0 check (failed_amount_stroops >= 0),
  confirmed_transaction_count integer not null default 0 check (confirmed_transaction_count >= 0),
  latest_transaction_hash text check (latest_transaction_hash is null or latest_transaction_hash ~ '^[0-9a-f]{64}$'),
  latest_ledger_transaction_id uuid references public.ledger_transactions(id) on delete restrict,
  reconciliation_run_id uuid not null references public.reconciliation_runs(id) on delete restrict,
  as_of_ledger bigint not null check (as_of_ledger > 0),
  reconciled_at timestamptz not null,
  stale_after timestamptz not null,
  is_stale boolean not null default false,
  stale_since timestamptz,
  is_quarantined boolean not null default false,
  quarantine_issue_id uuid references public.reconciliation_issues(id) on delete restrict,
  projection_version bigint not null default 1 check (projection_version > 0),
  updated_at timestamptz not null default now(),
  constraint distribution_job_projection_counts_check check (pending_count + submitted_count + confirmed_count + failed_count + cancelled_count = recipient_count),
  constraint distribution_job_projection_amounts_check check (confirmed_amount_stroops + failed_amount_stroops <= total_amount_stroops),
  constraint distribution_job_projection_recency_check check (stale_after > reconciled_at),
  constraint distribution_job_projection_stale_check check ((is_stale and stale_since is not null) or (not is_stale and stale_since is null)),
  constraint distribution_job_projection_quarantine_check check ((is_quarantined and quarantine_issue_id is not null) or (not is_quarantined and quarantine_issue_id is null))
);

create table public.public_program_aggregate_projection (
  program_id uuid primary key references public.programs(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  organization_name text not null check (length(btrim(organization_name)) between 1 and 200),
  program_name text not null check (length(btrim(program_name)) between 1 and 200),
  aid_type public.program_aid_type not null,
  program_status text not null check (program_status in ('funding', 'funding_failed', 'active', 'closing', 'closed')),
  network public.wallet_network not null default 'stellar_testnet',
  asset_code text not null default 'RCPHP' check (asset_code ~ '^[A-Z0-9]{1,12}$'),
  contract_id text check (contract_id is null or contract_id ~ '^C[A-Z2-7]{55}$'),
  budget_stroops bigint not null default 0 check (budget_stroops >= 0),
  funded_stroops bigint not null default 0 check (funded_stroops >= 0),
  distributed_stroops bigint not null default 0 check (distributed_stroops >= 0),
  redeemed_stroops bigint not null default 0 check (redeemed_stroops >= 0),
  refunded_stroops bigint not null default 0 check (refunded_stroops >= 0),
  returned_stroops bigint not null default 0 check (returned_stroops >= 0),
  confirmed_transaction_count integer not null default 0 check (confirmed_transaction_count >= 0),
  latest_transaction_hash text check (latest_transaction_hash is null or latest_transaction_hash ~ '^[0-9a-f]{64}$'),
  latest_ledger_transaction_id uuid references public.ledger_transactions(id) on delete restrict,
  reconciliation_run_id uuid not null references public.reconciliation_runs(id) on delete restrict,
  as_of_ledger bigint not null check (as_of_ledger > 0),
  reconciled_at timestamptz not null,
  stale_after timestamptz not null,
  is_stale boolean not null default false,
  stale_since timestamptz,
  is_quarantined boolean not null default false,
  quarantine_issue_id uuid references public.reconciliation_issues(id) on delete restrict,
  projection_version bigint not null default 1 check (projection_version > 0),
  updated_at timestamptz not null default now(),
  constraint public_program_aggregate_recency_check check (stale_after > reconciled_at),
  constraint public_program_aggregate_stale_check check ((is_stale and stale_since is not null) or (not is_stale and stale_since is null)),
  constraint public_program_aggregate_quarantine_check check ((is_quarantined and quarantine_issue_id is not null) or (not is_quarantined and quarantine_issue_id is null)),
  constraint public_program_aggregate_funding_check check (funded_stroops <= budget_stroops),
  constraint public_program_aggregate_refund_check check (refunded_stroops <= redeemed_stroops)
);

create or replace function private.validate_financial_projection()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target_program public.programs;
  target_run public.reconciliation_runs;
  target_transaction public.ledger_transactions;
  target_event public.contract_events;
  target_event_id uuid;
  target_issue public.reconciliation_issues;
  target_job public.distribution_jobs;
begin
  if new.program_id is null then
    if tg_table_name <> 'merchant_balance_projection' then
      raise exception 'projection requires a program'
        using errcode = '23514';
    end if;
  else
    select * into target_program
    from public.programs
    where id = new.program_id;

    if not found or target_program.organization_id <> new.organization_id then
      raise exception 'projection program organization mismatch'
        using errcode = '23514';
    end if;
  end if;

  if tg_table_name in ('beneficiary_balance_projection', 'program_financial_projection')
    and (new.aid_type <> target_program.aid_type or new.asset_code <> target_program.asset_code or new.asset_issuer is distinct from target_program.asset_issuer) then
    raise exception 'projection financial policy mismatch' using errcode = '23514';
  end if;

  if tg_table_name = 'beneficiary_balance_projection' and not exists (
    select 1 from public.enrollments enrollment
    where enrollment.program_id = new.program_id
      and enrollment.beneficiary_identity_id = new.beneficiary_identity_id
  ) then
    raise exception 'beneficiary projection requires program enrollment' using errcode = '23514';
  end if;

  if tg_table_name = 'merchant_balance_projection' and not exists (
    select 1 from public.merchant_accreditations accreditation
    where accreditation.organization_id = new.organization_id
      and accreditation.merchant_id = new.merchant_id
  ) then
    raise exception 'merchant projection requires organization accreditation' using errcode = '23514';
  end if;

  if tg_table_name = 'distribution_job_projection' then
    select * into target_job from public.distribution_jobs where id = new.distribution_job_id;
    if not found or target_job.organization_id <> new.organization_id or target_job.program_id <> new.program_id then
      raise exception 'distribution projection job scope mismatch' using errcode = '23514';
    end if;
  end if;

  if tg_table_name = 'public_program_aggregate_projection'
    and (new.organization_name <> (select name from public.organizations where id = new.organization_id)
      or new.program_name <> target_program.name
      or new.aid_type <> target_program.aid_type
      or new.asset_code <> target_program.asset_code) then
    raise exception 'public aggregate identity or policy mismatch' using errcode = '23514';
  end if;

  select * into target_run from public.reconciliation_runs where id = new.reconciliation_run_id;
  if not found or target_run.organization_id is distinct from new.organization_id
    or target_run.program_id is distinct from new.program_id
    or target_run.network <> new.network
    or target_run.status not in ('completed', 'partial')
    or (
      target_run.status = 'partial'
      and not (new.is_stale or new.is_quarantined)
    )
    or target_run.end_ledger_sequence is null or new.as_of_ledger > target_run.end_ledger_sequence
    or target_run.completed_at is null or new.reconciled_at <> target_run.completed_at then
    raise exception 'projection requires matching completed reconciliation evidence' using errcode = '23514';
  end if;

  if new.latest_ledger_transaction_id is not null then
    select * into target_transaction from public.ledger_transactions where id = new.latest_ledger_transaction_id;
    if not found or target_transaction.organization_id <> new.organization_id
      or target_transaction.program_id is distinct from new.program_id
      or target_transaction.network <> new.network
      or target_transaction.ledger_sequence > new.as_of_ledger
      or new.latest_transaction_hash is distinct from target_transaction.transaction_hash then
      raise exception 'projection transaction evidence mismatch' using errcode = '23514';
    end if;
  elsif new.latest_transaction_hash is not null then
    raise exception 'projection transaction hash requires ledger evidence' using errcode = '23514';
  end if;

  target_event_id := nullif(to_jsonb(new) ->> 'latest_contract_event_id', '')::uuid;
  if target_event_id is not null then
    select * into target_event from public.contract_events where id = target_event_id;
    if not found or target_event.organization_id <> new.organization_id
      or target_event.program_id is distinct from new.program_id
      or target_event.network <> new.network or target_event.ledger_sequence > new.as_of_ledger then
      raise exception 'projection contract event evidence mismatch' using errcode = '23514';
    end if;
  end if;

  if new.is_quarantined then
    select * into target_issue from public.reconciliation_issues where id = new.quarantine_issue_id;
    if not found or target_issue.organization_id <> new.organization_id
      or target_issue.program_id is distinct from new.program_id
      or target_issue.reconciliation_run_id <> new.reconciliation_run_id
      or target_issue.network <> new.network
      or target_issue.quarantine_state <> 'quarantined'
      or target_issue.projection_table <> tg_table_name then
      raise exception 'projection quarantine evidence mismatch' using errcode = '23514';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if new.projection_version <= old.projection_version or new.as_of_ledger < old.as_of_ledger
      or new.reconciled_at < old.reconciled_at then
      raise exception 'projection updates must advance version without rewinding evidence' using errcode = '23514';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger beneficiary_balance_projection_validate
before insert or update on public.beneficiary_balance_projection
for each row execute function private.validate_financial_projection();
create trigger merchant_balance_projection_validate
before insert or update on public.merchant_balance_projection
for each row execute function private.validate_financial_projection();
create trigger program_financial_projection_validate
before insert or update on public.program_financial_projection
for each row execute function private.validate_financial_projection();
create trigger distribution_job_projection_validate
before insert or update on public.distribution_job_projection
for each row execute function private.validate_financial_projection();
create trigger public_program_aggregate_projection_validate
before insert or update on public.public_program_aggregate_projection
for each row execute function private.validate_financial_projection();

create index beneficiary_projection_dashboard_idx
  on public.beneficiary_balance_projection (beneficiary_identity_id, is_stale, reconciled_at desc, program_id)
  where not is_quarantined;
create index beneficiary_projection_attention_idx
  on public.beneficiary_balance_projection (organization_id, is_quarantined, is_stale, stale_after, reconciled_at desc);
create index merchant_projection_dashboard_idx
  on public.merchant_balance_projection (merchant_id, is_stale, reconciled_at desc, program_id)
  where not is_quarantined;
create index merchant_projection_attention_idx
  on public.merchant_balance_projection (organization_id, is_quarantined, is_stale, stale_after, reconciled_at desc);
create index program_projection_dashboard_idx
  on public.program_financial_projection (organization_id, program_status, funding_status, is_quarantined, is_stale, reconciled_at desc);
create index distribution_projection_dashboard_idx
  on public.distribution_job_projection (organization_id, status, is_quarantined, is_stale, reconciled_at desc);
create index distribution_projection_program_idx
  on public.distribution_job_projection (program_id, status, reconciled_at desc)
  where not is_quarantined;
create index public_aggregate_dashboard_idx
  on public.public_program_aggregate_projection (program_status, is_stale, reconciled_at desc, organization_id)
  where not is_quarantined;

alter table public.beneficiary_balance_projection enable row level security;
alter table public.merchant_balance_projection enable row level security;
alter table public.program_financial_projection enable row level security;
alter table public.distribution_job_projection enable row level security;
alter table public.public_program_aggregate_projection enable row level security;

create policy "Beneficiaries and financial operators can view beneficiary balances"
on public.beneficiary_balance_projection for select to authenticated
using (
  exists (
    select 1 from public.beneficiary_identities identity
    where identity.id = beneficiary_identity_id and identity.user_id = (select auth.uid())
  )
  or private.has_organization_role(
    organization_id,
    array['organization_administrator', 'program_manager', 'finance_approver', 'auditor']::public.organization_membership_role[]
  )
);

create policy "Merchants and financial operators can view merchant balances"
on public.merchant_balance_projection for select to authenticated
using (
  exists (
    select 1 from public.merchant_entities merchant
    where merchant.id = merchant_id and merchant.profile_id = (select auth.uid())
  )
  or private.has_organization_role(
    organization_id,
    array['organization_administrator', 'program_manager', 'finance_approver', 'auditor']::public.organization_membership_role[]
  )
);

create policy "Organization members can view program projections"
on public.program_financial_projection for select to authenticated
using (private.is_organization_member(organization_id));

create policy "Organization members can view distribution projections"
on public.distribution_job_projection for select to authenticated
using (private.is_organization_member(organization_id));

create policy "Public can view non-quarantined aggregate projections"
on public.public_program_aggregate_projection for select to anon, authenticated
using (not is_quarantined);

create view public.public_financial_transparency
with (security_invoker = true)
as
select
  organization_id,
  organization_name,
  program_id,
  program_name,
  aid_type,
  program_status,
  network,
  asset_code,
  budget_stroops,
  funded_stroops,
  distributed_stroops,
  redeemed_stroops,
  refunded_stroops,
  returned_stroops,
  confirmed_transaction_count,
  contract_id,
  latest_transaction_hash,
  as_of_ledger,
  reconciled_at,
  (is_stale or stale_after <= now()) as is_stale,
  stale_after
from public.public_program_aggregate_projection
where not is_quarantined;

revoke all privileges on function private.validate_financial_projection() from public, anon, authenticated;

revoke all privileges on table public.beneficiary_balance_projection from public, anon, authenticated, service_role;
revoke all privileges on table public.merchant_balance_projection from public, anon, authenticated, service_role;
revoke all privileges on table public.program_financial_projection from public, anon, authenticated, service_role;
revoke all privileges on table public.distribution_job_projection from public, anon, authenticated, service_role;
revoke all privileges on table public.public_program_aggregate_projection from public, anon, authenticated, service_role;
revoke all privileges on table public.public_financial_transparency from public, anon, authenticated, service_role;

grant select on table public.beneficiary_balance_projection to authenticated;
grant select on table public.merchant_balance_projection to authenticated;
grant select on table public.program_financial_projection to authenticated;
grant select on table public.distribution_job_projection to authenticated;
grant select on table public.public_program_aggregate_projection to anon, authenticated;
grant select on table public.public_financial_transparency to anon, authenticated;

grant select, insert, update on table public.beneficiary_balance_projection to service_role;
grant select, insert, update on table public.merchant_balance_projection to service_role;
grant select, insert, update on table public.program_financial_projection to service_role;
grant select, insert, update on table public.distribution_job_projection to service_role;
grant select, insert, update on table public.public_program_aggregate_projection to service_role;
grant select on table public.public_financial_transparency to service_role;

comment on table public.beneficiary_balance_projection is 'Reconciled beneficiary cash or voucher balance by funded program; service-written and stale/quarantine aware.';
comment on table public.merchant_balance_projection is 'Reconciled merchant settlement and simulated cash-out aggregate; service-written and stale/quarantine aware.';
comment on table public.program_financial_projection is 'Organization dashboard projection of funded program financial state backed by reconciliation evidence.';
comment on table public.distribution_job_projection is 'Indexed municipal-scale distribution status projection backed by reconciliation evidence.';
comment on table public.public_program_aggregate_projection is 'PII-free public program aggregate populated only by reconciliation services.';
comment on view public.public_financial_transparency is 'Security-invoker public transparency view; quarantined aggregates and beneficiary mappings are excluded.';

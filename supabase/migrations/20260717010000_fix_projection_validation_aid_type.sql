-- Fix private.validate_financial_projection referencing NEW.aid_type on tables
-- that have no such column (distribution_job_projection).
--
-- The original guards were written as `if tg_table_name in (...) and (new.aid_type ...)`
-- and `if tg_table_name = '...' and (new.aid_type ...)`. PostgreSQL does not
-- guarantee short-circuit evaluation of the field reference, so writing a
-- distribution_job_projection row (which has no aid_type / organization_name /
-- program_name / asset_code columns) raised: record "new" has no field "aid_type".
--
-- This recreates the function with those field checks NESTED inside their
-- table-name guards, so the field references are only evaluated for the tables
-- that actually have them. Behaviour is otherwise identical.
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

  if tg_table_name in ('beneficiary_balance_projection', 'program_financial_projection') then
    if new.aid_type <> target_program.aid_type
      or new.asset_code <> target_program.asset_code
      or new.asset_issuer is distinct from target_program.asset_issuer then
      raise exception 'projection financial policy mismatch' using errcode = '23514';
    end if;
  end if;

  if tg_table_name = 'beneficiary_balance_projection' then
    if not exists (
      select 1 from public.enrollments enrollment
      where enrollment.program_id = new.program_id
        and enrollment.beneficiary_identity_id = new.beneficiary_identity_id
    ) then
      raise exception 'beneficiary projection requires program enrollment' using errcode = '23514';
    end if;
  end if;

  if tg_table_name = 'merchant_balance_projection' then
    if not exists (
      select 1 from public.merchant_accreditations accreditation
      where accreditation.organization_id = new.organization_id
        and accreditation.merchant_id = new.merchant_id
    ) then
      raise exception 'merchant projection requires organization accreditation' using errcode = '23514';
    end if;
  end if;

  if tg_table_name = 'distribution_job_projection' then
    select * into target_job from public.distribution_jobs where id = new.distribution_job_id;
    if not found or target_job.organization_id <> new.organization_id or target_job.program_id <> new.program_id then
      raise exception 'distribution projection job scope mismatch' using errcode = '23514';
    end if;
  end if;

  if tg_table_name = 'public_program_aggregate_projection' then
    if new.organization_name <> (select name from public.organizations where id = new.organization_id)
      or new.program_name <> target_program.name
      or new.aid_type <> target_program.aid_type
      or new.asset_code <> target_program.asset_code then
      raise exception 'public aggregate identity or policy mismatch' using errcode = '23514';
    end if;
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

-- distribution_job_projection was created without a `network` column, but the
-- shared projection validator (and the reconciliation-run evidence check)
-- reference new.network for every projection table. Add it with the pilot
-- default so the reconciled job projection can be written.
alter table public.distribution_job_projection
  add column if not exists network public.wallet_network not null default 'stellar_testnet';

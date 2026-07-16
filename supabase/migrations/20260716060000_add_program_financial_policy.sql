-- Model funded program policy and the narrowly mutable operations allowed after activation.
-- Legacy simulated active programs are returned to draft because they have no on-chain funding evidence.

do $$
begin
  create type public.program_aid_type as enum ('cash', 'voucher');
exception when duplicate_object then null;
end
$$;

do $$
begin
  create type public.program_funding_status as enum (
    'unreserved', 'reserving', 'funded', 'failed', 'returned'
  );
exception when duplicate_object then null;
end
$$;

do $$
begin
  create type public.program_expiry_policy as enum ('none', 'fixed');
exception when duplicate_object then null;
end
$$;

do $$
begin
  create type public.program_refund_policy as enum (
    'not_applicable', 'return_to_entitlement', 'exception_after_expiry'
  );
exception when duplicate_object then null;
end
$$;

do $$
begin
  create type public.program_merchant_status as enum ('authorized', 'revoked');
exception when duplicate_object then null;
end
$$;
do $$
begin
  create type public.merchant_accreditation_status as enum (
    'pending', 'active', 'suspended', 'expired', 'revoked'
  );
exception when duplicate_object then null;
end
$$;

do $$
begin
  create type public.program_policy_event_type as enum (
    'beneficiary_added', 'merchant_authorized', 'merchant_revoked'
  );
exception when duplicate_object then null;
end
$$;

alter table public.programs
  add column aid_type public.program_aid_type,
  add column budget_stroops bigint not null default 0,
  add column funded_budget_stroops bigint not null default 0,
  add column asset_code text not null default 'RCPHP',
  add column asset_issuer text,
  add column asset_sac_address text,
  add column treasury_wallet_id uuid references public.wallets(id) on delete restrict,
  add column voucher_contract_address text,
  add column allocation_rules jsonb not null default '{"strategy":"variable"}'::jsonb,
  add column default_allocation_stroops bigint,
  add column per_beneficiary_limit_stroops bigint,
  add column per_transaction_limit_stroops bigint,
  add column daily_limit_stroops bigint,
  add column expiry_policy public.program_expiry_policy not null default 'none',
  add column policy_expires_at timestamptz,
  add column refund_policy public.program_refund_policy not null default 'not_applicable',
  add column refund_window_ends_at timestamptz,
  add column policy_version integer not null default 1,
  add column contract_version integer,
  add column supersedes_program_id uuid references public.programs(id) on delete restrict,
  add column funding_status public.program_funding_status not null default 'unreserved',
  add column funding_transaction_hash text,
  add column funding_ledger bigint,
  add column funded_at timestamptz,
  add column activation_correlation_id uuid,
  add column activated_at timestamptz,
  add column activated_by uuid references auth.users(id) on delete restrict,
  add column policy_locked_at timestamptz;

update public.programs
set aid_type = case
  when voucher_type is not null and lower(voucher_type) <> 'cash' then 'voucher'::public.program_aid_type
  else 'cash'::public.program_aid_type
end,
budget_stroops = greatest(0, round(coalesce(total_budget, 0) * 10000000)::bigint),
default_allocation_stroops = case
  when coalesce(amount_per_beneficiary, 0) > 0
    then round(amount_per_beneficiary * 10000000)::bigint
  else null
end,
policy_expires_at = expires_at::timestamptz;

alter table public.programs
  alter column aid_type set not null,
  alter column aid_type set default 'cash',
  alter column status set default 'draft';

-- Existing active/scheduled rows predate blockchain reservation and must not remain spendable.
update public.programs set status = 'draft'
where status in ('active', 'scheduled');
update public.programs set status = 'closed'
where status = 'completed';
do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select distinct constraint_definition.conname
    from pg_constraint constraint_definition
    join pg_attribute column_definition
      on column_definition.attrelid = constraint_definition.conrelid
     and column_definition.attnum = any (constraint_definition.conkey)
    where constraint_definition.conrelid = 'public.programs'::regclass
      and constraint_definition.contype = 'c'
      and column_definition.attname = 'status'
  loop
    execute format(
      'alter table public.programs drop constraint %I',
      constraint_row.conname
    );
  end loop;
end
$$;

alter table public.programs
  add constraint programs_lifecycle_check check (
    status in ('draft', 'funding', 'funding_failed', 'active', 'closing', 'closed')
  ),
  add constraint programs_budget_stroops_check check (budget_stroops >= 0),
  add constraint programs_funded_budget_stroops_check check (funded_budget_stroops >= 0),
  add constraint programs_asset_code_check check (asset_code ~ '^[A-Z0-9]{1,12}$'),
  add constraint programs_asset_issuer_check check (
    asset_issuer is null or asset_issuer ~ '^G[A-Z2-7]{55}$'
  ),
  add constraint programs_asset_sac_address_check check (
    asset_sac_address is null or asset_sac_address ~ '^C[A-Z2-7]{55}$'
  ),
  add constraint programs_voucher_contract_address_check check (
    voucher_contract_address is null
    or voucher_contract_address ~ '^C[A-Z2-7]{55}$'
  ),
  add constraint programs_allocation_rules_check check (
    jsonb_typeof(allocation_rules) = 'object'
    and (
      not (allocation_rules ? 'strategy')
      or allocation_rules ->> 'strategy' in ('fixed', 'variable')
    )
    and (
      not (allocation_rules ? 'allowed_categories')
      or jsonb_typeof(allocation_rules -> 'allowed_categories') = 'array'
    )
  ),
  add constraint programs_default_allocation_check check (
    default_allocation_stroops is null or default_allocation_stroops > 0
  ),
  add constraint programs_per_beneficiary_limit_check check (
    per_beneficiary_limit_stroops is null or per_beneficiary_limit_stroops > 0
  ),
  add constraint programs_per_transaction_limit_check check (
    per_transaction_limit_stroops is null or per_transaction_limit_stroops > 0
  ),
  add constraint programs_daily_limit_check check (
    daily_limit_stroops is null or daily_limit_stroops > 0
  ),
  add constraint programs_limit_order_check check (
    per_transaction_limit_stroops is null
    or daily_limit_stroops is null
    or per_transaction_limit_stroops <= daily_limit_stroops
  ),
  add constraint programs_policy_version_check check (policy_version > 0),
  add constraint programs_contract_version_check check (
    contract_version is null or contract_version > 0
  ),
  add constraint programs_expiry_configuration_check check (
    (expiry_policy = 'none' and policy_expires_at is null)
    or (expiry_policy = 'fixed' and policy_expires_at is not null)
  ),
  add constraint programs_refund_window_check check (
    refund_window_ends_at is null
    or policy_expires_at is null
    or refund_window_ends_at >= policy_expires_at
  ),
  add constraint programs_funding_hash_check check (
    funding_transaction_hash is null
    or funding_transaction_hash ~ '^[0-9a-f]{64}$'
  ),
  add constraint programs_funding_ledger_check check (
    funding_ledger is null or funding_ledger > 0
  ),
  add constraint programs_not_self_superseded_check check (
    supersedes_program_id is null or supersedes_program_id <> id
  );

create unique index programs_one_successor_idx
  on public.programs (supersedes_program_id)
  where supersedes_program_id is not null;
create index programs_lifecycle_funding_idx
  on public.programs (organization_id, status, funding_status, created_at desc);

alter table public.enrollments
  add column allocation_amount_stroops bigint not null default 0,
  add column allocation_correlation_id uuid,
  add column approved_by uuid references auth.users(id) on delete restrict,
  add column approved_at timestamptz,
  add constraint enrollments_allocation_amount_check
    check (allocation_amount_stroops >= 0);

update public.enrollments
set allocation_amount_stroops = greatest(
  0, round(coalesce(voucher_balance, 0) * 10000000)::bigint
);
create table public.merchant_entities (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references auth.users(id) on delete set null,
  display_name text not null check (length(btrim(display_name)) between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.merchant_entities (profile_id, display_name)
select profile.id, coalesce(nullif(btrim(profile.full_name), ''), 'Merchant')
from public.profiles profile
where profile.role = 'merchant'
on conflict (profile_id) do nothing;

create table public.merchant_accreditations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  merchant_id uuid not null references public.merchant_entities(id) on delete restrict,
  category text not null check (length(btrim(category)) between 1 and 100),
  status public.merchant_accreditation_status not null default 'pending',
  valid_from timestamptz not null,
  valid_until timestamptz not null,
  approved_by uuid references auth.users(id) on delete restrict,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint merchant_accreditations_validity_check check (valid_until > valid_from),
  constraint merchant_accreditations_organization_merchant_category_key
    unique (organization_id, merchant_id, category)
);

create table public.program_merchants (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete restrict,
  merchant_id uuid not null references public.merchant_entities(id) on delete restrict,
  category text not null check (length(btrim(category)) between 1 and 100),
  status public.program_merchant_status not null default 'authorized',
  correlation_id uuid not null,
  authorized_by uuid not null references auth.users(id) on delete restrict,
  authorized_at timestamptz not null default now(),
  revoked_by uuid references auth.users(id) on delete restrict,
  revoked_at timestamptz,
  reason text check (reason is null or length(reason) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint program_merchants_program_merchant_key unique (program_id, merchant_id),
  constraint program_merchants_state_check check (
    (status = 'authorized' and revoked_by is null and revoked_at is null)
    or (status = 'revoked' and revoked_by is not null and revoked_at is not null)
  )
);

create table public.program_policy_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  program_id uuid not null references public.programs(id) on delete restrict,
  event_type public.program_policy_event_type not null,
  beneficiary_identity_id uuid references public.beneficiary_identities(id) on delete restrict,
  merchant_id uuid references public.merchant_entities(id) on delete restrict,
  allocation_amount_stroops bigint,
  actor_id uuid not null references auth.users(id) on delete restrict,
  correlation_id uuid not null,
  reason text check (reason is null or length(reason) <= 500),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  constraint program_policy_events_subject_check check (
    (event_type = 'beneficiary_added'
      and beneficiary_identity_id is not null and merchant_id is null
      and allocation_amount_stroops > 0)
    or (event_type in ('merchant_authorized', 'merchant_revoked')
      and merchant_id is not null and beneficiary_identity_id is null
      and allocation_amount_stroops is null)
  )
);

create index merchant_accreditations_active_lookup_idx
  on public.merchant_accreditations (
    organization_id, merchant_id, category, valid_from, valid_until
  ) where status = 'active';
create index program_merchants_program_status_idx
  on public.program_merchants (program_id, status, merchant_id);
create index program_policy_events_program_created_idx
  on public.program_policy_events (program_id, created_at desc);
create index program_policy_events_organization_created_idx
  on public.program_policy_events (organization_id, created_at desc);
create trigger merchant_entities_set_updated_at
before update on public.merchant_entities
for each row execute function private.set_updated_at();
create trigger merchant_accreditations_set_updated_at
before update on public.merchant_accreditations
for each row execute function private.set_updated_at();
create trigger program_merchants_set_updated_at
before update on public.program_merchants
for each row execute function private.set_updated_at();

create or replace function private.validate_program_financial_policy()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  prior_program public.programs;
  treasury public.wallets;
begin
  if tg_op = 'UPDATE' then
    if new.status is distinct from old.status and not (
      (old.status = 'draft' and new.status in ('funding', 'closed'))
      or (old.status = 'funding' and new.status in ('active', 'funding_failed', 'draft'))
      or (old.status = 'funding_failed' and new.status in ('funding', 'draft', 'closed'))
      or (old.status = 'active' and new.status in ('closing', 'closed'))
      or (old.status = 'closing' and new.status = 'closed')
    ) then
      raise exception 'invalid program lifecycle transition: % -> %', old.status, new.status
        using errcode = '23514';
    end if;

    if old.status in ('active', 'closing', 'closed') and row(
      new.organization_id, new.aid_type, new.budget_stroops,
      new.funded_budget_stroops, new.asset_code, new.asset_issuer,
      new.asset_sac_address, new.treasury_wallet_id,
      new.voucher_contract_address, new.allocation_rules,
      new.default_allocation_stroops, new.per_beneficiary_limit_stroops,
      new.per_transaction_limit_stroops, new.daily_limit_stroops,
      new.expiry_policy, new.policy_expires_at, new.refund_policy,
      new.refund_window_ends_at, new.policy_version, new.contract_version,
      new.supersedes_program_id, new.total_budget,
      new.amount_per_beneficiary, new.expires_at, new.voucher_type,
      new.voucher_value, new.voucher_quantity, new.voucher_expiration,
      new.redemption_type
    ) is distinct from row(
      old.organization_id, old.aid_type, old.budget_stroops,
      old.funded_budget_stroops, old.asset_code, old.asset_issuer,
      old.asset_sac_address, old.treasury_wallet_id,
      old.voucher_contract_address, old.allocation_rules,
      old.default_allocation_stroops, old.per_beneficiary_limit_stroops,
      old.per_transaction_limit_stroops, old.daily_limit_stroops,
      old.expiry_policy, old.policy_expires_at, old.refund_policy,
      old.refund_window_ends_at, old.policy_version, old.contract_version,
      old.supersedes_program_id, old.total_budget,
      old.amount_per_beneficiary, old.expires_at, old.voucher_type,
      old.voucher_value, old.voucher_quantity, old.voucher_expiration,
      old.redemption_type
    ) then
      raise exception 'active program financial policy is immutable; close it and create a new version'
        using errcode = '23514';
    end if;

    if old.status = 'active'
      and new.funding_status is distinct from old.funding_status then
      raise exception 'active program funding status is immutable'
        using errcode = '23514';
    end if;
  end if;

  if new.supersedes_program_id is not null
    and (tg_op = 'INSERT'
      or new.supersedes_program_id is distinct from old.supersedes_program_id
      or new.policy_version is distinct from old.policy_version) then
    select * into prior_program
    from public.programs
    where id = new.supersedes_program_id;

    if not found
      or prior_program.organization_id <> new.organization_id
      or prior_program.status <> 'closed'
      or new.policy_version <> prior_program.policy_version + 1 then
      raise exception 'a new policy version must supersede a closed program in the same organization'
        using errcode = '23514';
    end if;
  end if;

  if new.status = 'active' then
    if new.funding_status <> 'funded'
      or new.budget_stroops <= 0
      or new.funded_budget_stroops <> new.budget_stroops
      or new.asset_issuer is null
      or new.asset_sac_address is null
      or new.treasury_wallet_id is null
      or new.funding_transaction_hash is null
      or new.funding_ledger is null
      or new.funded_at is null
      or new.activation_correlation_id is null
      or new.activated_by is null then
      raise exception 'activation requires complete full-budget on-chain funding evidence'
        using errcode = '23514';
    end if;

    select * into treasury from public.wallets where id = new.treasury_wallet_id;
    if not found
      or treasury.owner_type <> 'organization'
      or treasury.owner_id <> new.organization_id
      or treasury.network <> 'stellar_testnet'
      or treasury.verification_status <> 'verified'
      or not treasury.is_active
      or (new.aid_type = 'cash' and treasury.purpose <> 'cash_program_treasury')
      or (new.aid_type = 'voucher' and treasury.purpose <> 'organization_treasury') then
      raise exception 'program treasury is not an active verified wallet for this organization and aid type'
        using errcode = '23514';
    end if;

    if new.aid_type = 'voucher' and (
      new.voucher_contract_address is null
      or new.contract_version is null
      or new.expiry_policy <> 'fixed'
      or new.refund_policy = 'not_applicable'
    ) then
      raise exception 'voucher activation requires contract, version, expiry, and refund policy'
        using errcode = '23514';
    elsif new.aid_type = 'cash' and (
      new.voucher_contract_address is not null
      or new.contract_version is not null
      or new.refund_policy <> 'not_applicable'
    ) then
      raise exception 'cash programs cannot carry voucher contract or refund policy'
        using errcode = '23514';
    end if;

    new.activated_at := coalesce(new.activated_at, now());
    new.policy_locked_at := coalesce(new.policy_locked_at, new.activated_at);
  end if;

  return new;
end;
$$;

create trigger programs_validate_financial_policy
before insert or update on public.programs
for each row execute function private.validate_program_financial_policy();
create or replace function private.enforce_program_enrollment_allocation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target_program public.programs;
  allocated_stroops bigint;
  approval_is_new boolean;
begin
  select * into target_program
  from public.programs
  where id = coalesce(new.program_id, old.program_id);

  if not found then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if target_program.status in ('active', 'closing', 'closed')
      and old.approval_status = 'Approved' then
      raise exception 'approved funded beneficiary allocations cannot be deleted'
        using errcode = '23514';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE'
    and target_program.status in ('active', 'closing', 'closed')
    and old.approval_status = 'Approved'
    and row(new.program_id, new.beneficiary_identity_id,
      new.allocation_amount_stroops, new.approval_status,
      new.allocation_correlation_id, new.approved_by, new.approved_at)
      is distinct from
      row(old.program_id, old.beneficiary_identity_id,
      old.allocation_amount_stroops, old.approval_status,
      old.allocation_correlation_id, old.approved_by, old.approved_at) then
    raise exception 'approved funded beneficiary allocation is immutable'
      using errcode = '23514';
  end if;

  approval_is_new := new.approval_status = 'Approved'
    and (tg_op = 'INSERT' or old.approval_status <> 'Approved');

  if target_program.status = 'active' and approval_is_new then
    perform pg_advisory_xact_lock(
      hashtextextended(target_program.id::text, 0)
    );

    new.approved_by := coalesce(new.approved_by, (select auth.uid()));
    new.approved_at := coalesce(new.approved_at, now());

    if new.approved_by is null
      or new.allocation_correlation_id is null
      or new.allocation_amount_stroops <= 0 then
      raise exception 'active-program beneficiary additions require actor, correlation, and positive allocation'
        using errcode = '23514';
    end if;

    if target_program.per_beneficiary_limit_stroops is not null
      and new.allocation_amount_stroops > target_program.per_beneficiary_limit_stroops then
      raise exception 'beneficiary allocation exceeds the funded policy limit'
        using errcode = '23514';
    end if;

    if target_program.allocation_rules ->> 'strategy' = 'fixed'
      and new.allocation_amount_stroops
        is distinct from target_program.default_allocation_stroops then
      raise exception 'beneficiary allocation does not match the fixed allocation policy'
        using errcode = '23514';
    end if;

    select coalesce(sum(enrollment.allocation_amount_stroops), 0)
    into allocated_stroops
    from public.enrollments enrollment
    where enrollment.program_id = target_program.id
      and enrollment.approval_status = 'Approved'
      and (tg_op = 'INSERT' or enrollment.id <> new.id);

    if allocated_stroops + new.allocation_amount_stroops
      > target_program.funded_budget_stroops then
      raise exception 'beneficiary allocation exceeds remaining funded budget'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create trigger enrollments_enforce_program_allocation
before insert or update or delete on public.enrollments
for each row execute function private.enforce_program_enrollment_allocation();

create or replace function private.audit_active_beneficiary_addition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_program public.programs;
begin
  if new.approval_status = 'Approved'
    and (tg_op = 'INSERT' or old.approval_status <> 'Approved') then
    select * into target_program
    from public.programs
    where id = new.program_id and status = 'active';

    if found then
      insert into public.program_policy_events (
        organization_id, program_id, event_type,
        beneficiary_identity_id, allocation_amount_stroops,
        actor_id, correlation_id
      ) values (
        target_program.organization_id, new.program_id, 'beneficiary_added',
        new.beneficiary_identity_id, new.allocation_amount_stroops,
        new.approved_by, new.allocation_correlation_id
      );

      insert into public.audit_events (
        organization_id, actor_user_id, actor_kind, actor_identifier,
        action, correlation_id, metadata
      ) values (
        target_program.organization_id, new.approved_by, 'user',
        new.approved_by::text, 'program.beneficiary.added',
        new.allocation_correlation_id,
        jsonb_build_object(
          'program_id', new.program_id,
          'beneficiary_identity_id', new.beneficiary_identity_id,
          'allocation_amount_stroops', new.allocation_amount_stroops
        )
      );
    end if;
  end if;
  return new;
end;
$$;

create trigger enrollments_audit_active_beneficiary_addition
after insert or update on public.enrollments
for each row execute function private.audit_active_beneficiary_addition();
create or replace function private.validate_program_merchant_change()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target_program public.programs;
  status_changed boolean;
begin
  if tg_op = 'DELETE' then
    raise exception 'program merchant authorization is append-audited; revoke it instead'
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' and row(new.program_id, new.merchant_id, new.category)
    is distinct from row(old.program_id, old.merchant_id, old.category) then
    raise exception 'program merchant identity and category are immutable'
      using errcode = '23514';
  end if;

  select * into target_program
  from public.programs
  where id = new.program_id;

  if not found or target_program.status not in ('draft', 'active') then
    raise exception 'merchant authorization requires a draft or active program'
      using errcode = '23514';
  end if;

  if target_program.status = 'active'
    and target_program.funding_status <> 'funded' then
    raise exception 'active-program merchant changes require funded policy'
      using errcode = '23514';
  end if;

  status_changed := tg_op = 'INSERT' or new.status is distinct from old.status;
  if not status_changed then
    return new;
  end if;

  if new.status = 'authorized' then
    if not exists (
      select 1
      from public.merchant_accreditations accreditation
      where accreditation.organization_id = target_program.organization_id
        and accreditation.merchant_id = new.merchant_id
        and accreditation.category = new.category
        and accreditation.status = 'active'
        and now() between accreditation.valid_from and accreditation.valid_until
    ) then
      raise exception 'merchant lacks current organization accreditation for this category'
        using errcode = '23514';
    end if;

    if target_program.allocation_rules ? 'allowed_categories'
      and jsonb_array_length(
        target_program.allocation_rules -> 'allowed_categories'
      ) > 0
      and not (target_program.allocation_rules -> 'allowed_categories'
        ? new.category) then
      raise exception 'merchant category is outside the funded policy'
        using errcode = '23514';
    end if;

    new.authorized_by := coalesce(new.authorized_by, (select auth.uid()));
    new.authorized_at := coalesce(new.authorized_at, now());
    new.revoked_by := null;
    new.revoked_at := null;
  else
    new.revoked_by := coalesce(new.revoked_by, (select auth.uid()));
    new.revoked_at := coalesce(new.revoked_at, now());
  end if;

  if new.correlation_id is null
    or (new.status = 'authorized' and new.authorized_by is null)
    or (new.status = 'revoked' and new.revoked_by is null) then
    raise exception 'merchant changes require actor and correlation evidence'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger program_merchants_validate_change
before insert or update or delete on public.program_merchants
for each row execute function private.validate_program_merchant_change();

create or replace function private.audit_program_merchant_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_program public.programs;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;

  select * into strict target_program
  from public.programs where id = new.program_id;

  insert into public.program_policy_events (
    organization_id, program_id, event_type, merchant_id,
    actor_id, correlation_id, reason,
    metadata
  ) values (
    target_program.organization_id,
    new.program_id,
    case new.status
      when 'authorized' then 'merchant_authorized'::public.program_policy_event_type
      else 'merchant_revoked'::public.program_policy_event_type
    end,
    new.merchant_id,
    case when new.status = 'authorized' then new.authorized_by else new.revoked_by end,
    new.correlation_id,
    new.reason,
    jsonb_build_object('category', new.category)
  );

  insert into public.audit_events (
    organization_id, actor_user_id, actor_kind, actor_identifier,
    action, correlation_id, metadata
  ) values (
    target_program.organization_id,
    case when new.status = 'authorized' then new.authorized_by else new.revoked_by end,
    'user',
    (case when new.status = 'authorized' then new.authorized_by else new.revoked_by end)::text,
    case new.status
      when 'authorized' then 'program.merchant.authorized'
      else 'program.merchant.revoked'
    end,
    new.correlation_id,
    jsonb_build_object(
      'program_id', new.program_id,
      'merchant_id', new.merchant_id,
      'category', new.category,
      'reason', new.reason
    )
  );
  return new;
end;
$$;

create trigger program_merchants_audit_change
after insert or update on public.program_merchants
for each row execute function private.audit_program_merchant_change();

create or replace function private.prevent_program_policy_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'program policy events are append-only'
    using errcode = '23514';
end;
$$;

create trigger program_policy_events_append_only
before update or delete on public.program_policy_events
for each row execute function private.prevent_program_policy_event_mutation();
alter table public.merchant_entities enable row level security;
alter table public.merchant_accreditations enable row level security;
alter table public.program_merchants enable row level security;
alter table public.program_policy_events enable row level security;

create policy "Organization members can view merchant entities"
on public.merchant_entities for select to authenticated
using (
  profile_id = (select auth.uid())
  or exists (
    select 1
    from public.merchant_accreditations accreditation
    where accreditation.merchant_id = merchant_entities.id
      and private.is_organization_member(accreditation.organization_id)
  )
);

create policy "Organization members can view merchant accreditations"
on public.merchant_accreditations for select to authenticated
using (
  private.is_organization_member(organization_id)
  or exists (
    select 1 from public.merchant_entities merchant
    where merchant.id = merchant_id
      and merchant.profile_id = (select auth.uid())
  )
);

create policy "Organization members can view program merchant authorization"
on public.program_merchants for select to authenticated
using (
  private.is_program_organization_member(program_id)
  or exists (
    select 1 from public.merchant_entities merchant
    where merchant.id = merchant_id
      and merchant.profile_id = (select auth.uid())
  )
);

create policy "Organization members can view program policy events"
on public.program_policy_events for select to authenticated
using (private.is_organization_member(organization_id));

revoke all privileges on table public.merchant_entities from anon, authenticated;
revoke all privileges on table public.merchant_accreditations from anon, authenticated;
revoke all privileges on table public.program_merchants from anon, authenticated;
revoke all privileges on table public.program_policy_events from anon, authenticated;
grant select on table public.merchant_entities to authenticated;
grant select on table public.merchant_accreditations to authenticated;
grant select on table public.program_merchants to authenticated;
grant select on table public.program_policy_events to authenticated;
grant all privileges on table public.merchant_entities to service_role;
grant all privileges on table public.merchant_accreditations to service_role;
grant all privileges on table public.program_merchants to service_role;
grant all privileges on table public.program_policy_events to service_role;

revoke all privileges on function private.validate_program_financial_policy()
  from public, anon, authenticated;
revoke all privileges on function private.enforce_program_enrollment_allocation()
  from public, anon, authenticated;
revoke all privileges on function private.audit_active_beneficiary_addition()
  from public, anon, authenticated;
revoke all privileges on function private.validate_program_merchant_change()
  from public, anon, authenticated;
revoke all privileges on function private.audit_program_merchant_change()
  from public, anon, authenticated;
revoke all privileges on function private.prevent_program_policy_event_mutation()
  from public, anon, authenticated;

comment on column public.programs.budget_stroops is
  'Immutable approved program budget in 1e-7 asset units after activation.';
comment on column public.programs.funded_budget_stroops is
  'On-chain reserved amount; activation requires equality with budget_stroops.';
comment on column public.programs.allocation_rules is
  'Versioned strategy and category rules frozen at activation.';
comment on column public.programs.supersedes_program_id is
  'Closed predecessor; material policy changes require a new sequential version.';
comment on table public.program_merchants is
  'Current program authorization keyed by stable merchant ID; revocation never edits settlements.';
comment on table public.program_policy_events is
  'Append-only evidence for post-activation beneficiary and merchant changes.';
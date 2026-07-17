-- Add payment-specific workflow storage while keeping immutable chain evidence
-- linked to distinct invoice, redemption, settlement, refund, and dispute events.

do $$ begin
  create type public.invoice_kind as enum ('cash', 'voucher');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.invoice_status as enum (
    'issued', 'presented', 'authorization_pending', 'submitted',
    'consumed', 'expired', 'cancelled'
  );
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.payment_funding_source as enum ('cash', 'voucher');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.payment_intent_status as enum (
    'requested', 'prepared', 'signed', 'submitted',
    'confirmed', 'failed', 'expired'
  );
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.redemption_status as enum ('submitted', 'confirmed', 'failed');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.settlement_kind as enum ('cash_payment', 'voucher_redemption');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.settlement_status as enum ('pending', 'confirmed', 'failed');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.refund_status as enum (
    'requested', 'approved', 'signed', 'submitted',
    'confirmed', 'failed', 'exception_required'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.dispute_status as enum (
    'open', 'under_review', 'resolved', 'rejected'
  );
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.cashout_request_status as enum (
    'requested', 'processing', 'completed', 'failed'
  );
exception when duplicate_object then null; end $$;

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  merchant_id uuid not null references public.merchant_entities(id) on delete restrict,
  program_id uuid references public.programs(id) on delete restrict,
  settlement_wallet_id uuid not null references public.wallets(id) on delete restrict,
  kind public.invoice_kind not null,
  network public.wallet_network not null default 'stellar_testnet',
  asset_code text not null check (asset_code ~ '^[A-Z0-9]{1,12}$'),
  asset_issuer text not null check (asset_issuer ~ '^G[A-Z2-7]{55}$'),
  asset_sac_address text check (
    asset_sac_address is null or asset_sac_address ~ '^C[A-Z2-7]{55}$'
  ),
  voucher_contract_address text check (
    voucher_contract_address is null or voucher_contract_address ~ '^C[A-Z2-7]{55}$'
  ),
  settlement_address text not null check (settlement_address ~ '^G[A-Z2-7]{55}$'),
  invoice_signer_address text not null check (invoice_signer_address ~ '^G[A-Z2-7]{55}$'),
  amount_stroops bigint not null check (amount_stroops > 0),
  category text check (category is null or length(btrim(category)) between 1 and 100),
  nonce text not null check (nonce ~ '^[0-9a-f]{64}$'),
  canonical_payload bytea not null check (octet_length(canonical_payload) > 0),
  payload_hash text not null unique check (payload_hash ~ '^[0-9a-f]{64}$'),
  merchant_signature bytea not null check (octet_length(merchant_signature) > 0),
  receipt_digest text check (receipt_digest is null or receipt_digest ~ '^[0-9a-f]{64}$'),
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  status public.invoice_status not null default 'issued',
  consumed_by_payment_intent_id uuid,
  consumed_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text check (
    cancellation_reason is null or length(cancellation_reason) <= 500
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoices_merchant_nonce_key unique (merchant_id, nonce),
  constraint invoices_ten_minute_expiry_check
    check (expires_at = issued_at + interval '10 minutes'),
  constraint invoices_kind_fields_check check (
    (kind = 'cash' and program_id is null and voucher_contract_address is null)
    or
    (kind = 'voucher' and program_id is not null
      and voucher_contract_address is not null and category is not null)
  ),
  constraint invoices_consumption_state_check check (
    (status = 'consumed' and consumed_by_payment_intent_id is not null
      and consumed_at is not null)
    or
    (status <> 'consumed' and consumed_by_payment_intent_id is null
      and consumed_at is null)
  ),
  constraint invoices_cancellation_state_check check (
    (status = 'cancelled' and cancelled_at is not null)
    or (status <> 'cancelled' and cancelled_at is null
      and cancellation_reason is null)
  )
);

create table public.payment_intents (
  id uuid primary key default gen_random_uuid(),
  financial_intent_id uuid not null unique
    references public.financial_intents(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  invoice_id uuid not null unique references public.invoices(id) on delete restrict,
  program_id uuid references public.programs(id) on delete restrict,
  beneficiary_identity_id uuid not null
    references public.beneficiary_identities(id) on delete restrict,
  beneficiary_wallet_id uuid not null references public.wallets(id) on delete restrict,
  merchant_id uuid not null references public.merchant_entities(id) on delete restrict,
  settlement_wallet_id uuid not null references public.wallets(id) on delete restrict,
  enrollment_id uuid references public.enrollments(id) on delete restrict,
  funding_source public.payment_funding_source not null,
  amount_stroops bigint not null check (amount_stroops > 0),
  idempotency_key text not null check (length(idempotency_key) between 1 and 200),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  status public.payment_intent_status not null default 'requested',
  transaction_hash text check (
    transaction_hash is null or transaction_hash ~ '^[0-9a-f]{64}$'
  ),
  confirmed_ledger bigint check (confirmed_ledger is null or confirmed_ledger > 0),
  contract_id text check (contract_id is null or contract_id ~ '^C[A-Z2-7]{55}$'),
  contract_event_index integer check (
    contract_event_index is null or contract_event_index >= 0
  ),
  correlation_id uuid not null,
  submitted_at timestamptz,
  confirmed_at timestamptz,
  failed_at timestamptz,
  failure_code text check (failure_code is null or length(failure_code) <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_intents_organization_idempotency_key
    unique (organization_id, idempotency_key),
  constraint payment_intents_funding_source_check check (
    (funding_source = 'cash' and program_id is null and enrollment_id is null
      and contract_id is null and contract_event_index is null)
    or
    (funding_source = 'voucher' and program_id is not null
      and enrollment_id is not null)
  ),
  constraint payment_intents_confirmation_evidence_check check (
    (status = 'confirmed' and transaction_hash is not null
      and confirmed_ledger is not null and confirmed_at is not null)
    or
    (status <> 'confirmed' and confirmed_at is null)
  ),
  constraint payment_intents_failure_state_check check (
    (status = 'failed' and failed_at is not null and failure_code is not null)
    or
    (status <> 'failed' and failed_at is null and failure_code is null)
  )
);

alter table public.invoices
  add constraint invoices_consumed_by_payment_intent_fkey
  foreign key (consumed_by_payment_intent_id)
  references public.payment_intents(id) on delete restrict;

create table public.voucher_redemptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  payment_intent_id uuid not null unique
    references public.payment_intents(id) on delete restrict,
  invoice_id uuid not null unique references public.invoices(id) on delete restrict,
  program_id uuid not null references public.programs(id) on delete restrict,
  beneficiary_identity_id uuid not null
    references public.beneficiary_identities(id) on delete restrict,
  merchant_id uuid not null references public.merchant_entities(id) on delete restrict,
  amount_stroops bigint not null check (amount_stroops > 0),
  contract_id text not null check (contract_id ~ '^C[A-Z2-7]{55}$'),
  transaction_hash text not null check (transaction_hash ~ '^[0-9a-f]{64}$'),
  ledger bigint check (ledger is null or ledger > 0),
  contract_event_index integer check (
    contract_event_index is null or contract_event_index >= 0
  ),
  status public.redemption_status not null default 'submitted',
  correlation_id uuid not null,
  submitted_at timestamptz not null default now(),
  confirmed_at timestamptz,
  failed_at timestamptz,
  failure_code text check (failure_code is null or length(failure_code) <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint voucher_redemptions_event_key
    unique (contract_id, ledger, contract_event_index),
  constraint voucher_redemptions_confirmation_check check (
    (status = 'confirmed' and ledger is not null
      and contract_event_index is not null and confirmed_at is not null)
    or (status <> 'confirmed' and confirmed_at is null)
  ),
  constraint voucher_redemptions_failure_check check (
    (status = 'failed' and failed_at is not null and failure_code is not null)
    or (status <> 'failed' and failed_at is null and failure_code is null)
  )
);

create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  payment_intent_id uuid not null unique
    references public.payment_intents(id) on delete restrict,
  voucher_redemption_id uuid unique
    references public.voucher_redemptions(id) on delete restrict,
  program_id uuid references public.programs(id) on delete restrict,
  merchant_id uuid not null references public.merchant_entities(id) on delete restrict,
  settlement_wallet_id uuid not null references public.wallets(id) on delete restrict,
  kind public.settlement_kind not null,
  amount_stroops bigint not null check (amount_stroops > 0),
  transaction_hash text not null check (transaction_hash ~ '^[0-9a-f]{64}$'),
  ledger bigint check (ledger is null or ledger > 0),
  contract_id text check (contract_id is null or contract_id ~ '^C[A-Z2-7]{55}$'),
  contract_event_index integer check (
    contract_event_index is null or contract_event_index >= 0
  ),
  status public.settlement_status not null default 'pending',
  correlation_id uuid not null,
  confirmed_at timestamptz,
  failed_at timestamptz,
  failure_code text check (failure_code is null or length(failure_code) <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint settlements_kind_link_check check (
    (kind = 'cash_payment' and voucher_redemption_id is null
      and contract_id is null and contract_event_index is null)
    or
    (kind = 'voucher_redemption' and voucher_redemption_id is not null
      and program_id is not null and contract_id is not null)
  ),
  constraint settlements_confirmation_check check (
    (status = 'confirmed' and ledger is not null and confirmed_at is not null)
    or (status <> 'confirmed' and confirmed_at is null)
  ),
  constraint settlements_failure_check check (
    (status = 'failed' and failed_at is not null and failure_code is not null)
    or (status <> 'failed' and failed_at is null and failure_code is null)
  )
);

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  original_payment_intent_id uuid not null
    references public.payment_intents(id) on delete restrict,
  original_settlement_id uuid not null
    references public.settlements(id) on delete restrict,
  voucher_redemption_id uuid
    references public.voucher_redemptions(id) on delete restrict,
  program_id uuid references public.programs(id) on delete restrict,
  beneficiary_identity_id uuid not null
    references public.beneficiary_identities(id) on delete restrict,
  merchant_id uuid not null references public.merchant_entities(id) on delete restrict,
  amount_stroops bigint not null check (amount_stroops > 0),
  returns_to_entitlement boolean not null default false,
  status public.refund_status not null default 'requested',
  merchant_authorization_hash text check (
    merchant_authorization_hash is null
    or merchant_authorization_hash ~ '^[0-9a-f]{64}$'
  ),
  refund_nonce text not null check (refund_nonce ~ '^[0-9a-f]{64}$'),
  transaction_hash text check (
    transaction_hash is null or transaction_hash ~ '^[0-9a-f]{64}$'
  ),
  ledger bigint check (ledger is null or ledger > 0),
  contract_id text check (contract_id is null or contract_id ~ '^C[A-Z2-7]{55}$'),
  contract_event_index integer check (
    contract_event_index is null or contract_event_index >= 0
  ),
  correlation_id uuid not null,
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  submitted_at timestamptz,
  confirmed_at timestamptz,
  failed_at timestamptz,
  failure_code text check (failure_code is null or length(failure_code) <= 100),
  exception_reason text check (
    exception_reason is null or length(exception_reason) between 1 and 500
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint refunds_payment_nonce_key unique (original_payment_intent_id, refund_nonce),
  constraint refunds_voucher_link_check check (
    (voucher_redemption_id is null and not returns_to_entitlement
      and contract_id is null and contract_event_index is null)
    or
    (voucher_redemption_id is not null and returns_to_entitlement
      and program_id is not null and contract_id is not null)
  ),
  constraint refunds_confirmation_check check (
    (status = 'confirmed' and merchant_authorization_hash is not null
      and transaction_hash is not null and ledger is not null
      and confirmed_at is not null)
    or (status <> 'confirmed' and confirmed_at is null)
  ),
  constraint refunds_exception_check check (
    (status = 'exception_required' and exception_reason is not null)
    or (status <> 'exception_required' and exception_reason is null)
  ),
  constraint refunds_failure_check check (
    (status = 'failed' and failed_at is not null and failure_code is not null)
    or (status <> 'failed' and failed_at is null and failure_code is null)
  )
);

create table public.disputes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  payment_intent_id uuid not null references public.payment_intents(id) on delete restrict,
  settlement_id uuid references public.settlements(id) on delete restrict,
  refund_id uuid references public.refunds(id) on delete restrict,
  opened_by uuid not null references auth.users(id) on delete restrict,
  reason text not null check (length(btrim(reason)) between 1 and 500),
  status public.dispute_status not null default 'open',
  resolution text check (resolution is null or length(resolution) <= 1000),
  correlation_id uuid not null,
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  updated_at timestamptz not null default now(),
  -- Named to avoid colliding with the auto-generated `disputes_resolution_check`
  -- that PostgreSQL derives from the inline `resolution` column check above.
  constraint disputes_resolution_state_check check (
    (status in ('resolved', 'rejected') and resolved_at is not null
      and resolution is not null)
    or (status in ('open', 'under_review') and resolved_at is null
      and resolution is null)
  )
);

create table public.dispute_evidence (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid not null references public.disputes(id) on delete restrict,
  submitted_by uuid not null references auth.users(id) on delete restrict,
  evidence_kind text not null check (length(evidence_kind) between 1 and 100),
  storage_reference text check (
    storage_reference is null or length(storage_reference) between 1 and 500
  ),
  content_digest text not null check (content_digest ~ '^[0-9a-f]{64}$'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  constraint dispute_evidence_digest_key unique (dispute_id, content_digest)
);

create table public.cashout_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  merchant_id uuid not null references public.merchant_entities(id) on delete restrict,
  settlement_wallet_id uuid not null references public.wallets(id) on delete restrict,
  amount_stroops bigint not null check (amount_stroops > 0),
  asset_code text not null default 'RCPHP' check (asset_code ~ '^[A-Z0-9]{1,12}$'),
  status public.cashout_request_status not null default 'requested',
  is_simulated boolean not null default true check (is_simulated),
  partner_request_reference text unique check (
    partner_request_reference is null
    or length(partner_request_reference) between 1 and 200
  ),
  correlation_id uuid not null,
  requested_by uuid not null references auth.users(id) on delete restrict,
  requested_at timestamptz not null default now(),
  processing_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  failure_code text check (failure_code is null or length(failure_code) <= 100),
  updated_at timestamptz not null default now(),
  constraint cashout_requests_state_check check (
    (status = 'requested' and processing_at is null and completed_at is null
      and failed_at is null and failure_code is null)
    or
    (status = 'processing' and processing_at is not null and completed_at is null
      and failed_at is null and failure_code is null)
    or
    (status = 'completed' and processing_at is not null and completed_at is not null
      and failed_at is null and failure_code is null)
    or
    (status = 'failed' and processing_at is not null and completed_at is null
      and failed_at is not null and failure_code is not null)
  )
);

create index invoices_organization_status_expiry_idx
  on public.invoices (organization_id, status, expires_at);
create index invoices_merchant_status_created_idx
  on public.invoices (merchant_id, status, created_at desc);
create index payment_intents_beneficiary_status_created_idx
  on public.payment_intents (beneficiary_identity_id, status, created_at desc);
create index payment_intents_organization_status_created_idx
  on public.payment_intents (organization_id, status, created_at desc);
create index voucher_redemptions_program_status_created_idx
  on public.voucher_redemptions (program_id, status, created_at desc);
create index settlements_merchant_status_created_idx
  on public.settlements (merchant_id, status, created_at desc);
create index refunds_original_payment_status_idx
  on public.refunds (original_payment_intent_id, status, created_at desc);
create index disputes_organization_status_updated_idx
  on public.disputes (organization_id, status, updated_at desc);
create index dispute_evidence_dispute_created_idx
  on public.dispute_evidence (dispute_id, created_at);
create index cashout_requests_merchant_status_requested_idx
  on public.cashout_requests (merchant_id, status, requested_at desc);

create or replace function private.validate_invoice_workflow()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  settlement_wallet public.wallets;
  target_program public.programs;
begin
  if tg_op = 'UPDATE' then
    if row(new.organization_id, new.merchant_id, new.program_id,
      new.settlement_wallet_id, new.kind, new.network, new.asset_code,
      new.asset_issuer, new.asset_sac_address, new.voucher_contract_address,
      new.settlement_address, new.invoice_signer_address, new.amount_stroops,
      new.category, new.nonce, new.canonical_payload, new.payload_hash,
      new.merchant_signature, new.receipt_digest, new.issued_at, new.expires_at)
      is distinct from
      row(old.organization_id, old.merchant_id, old.program_id,
      old.settlement_wallet_id, old.kind, old.network, old.asset_code,
      old.asset_issuer, old.asset_sac_address, old.voucher_contract_address,
      old.settlement_address, old.invoice_signer_address, old.amount_stroops,
      old.category, old.nonce, old.canonical_payload, old.payload_hash,
      old.merchant_signature, old.receipt_digest, old.issued_at, old.expires_at) then
      raise exception 'signed invoice fields are immutable'
        using errcode = '23514';
    end if;

    if new.status is distinct from old.status and not (
      (old.status = 'issued' and new.status in (
        'presented', 'authorization_pending', 'expired', 'cancelled'))
      or (old.status = 'presented' and new.status in (
        'authorization_pending', 'expired', 'cancelled'))
      or (old.status = 'authorization_pending' and new.status in (
        'submitted', 'expired', 'cancelled'))
      or (old.status = 'submitted' and new.status = 'consumed')
    ) then
      raise exception 'invalid invoice lifecycle transition: % -> %', old.status, new.status
        using errcode = '23514';
    end if;
  end if;

  select * into settlement_wallet
  from public.wallets where id = new.settlement_wallet_id;
  if not found
    or settlement_wallet.owner_type <> 'merchant_entity'
    or settlement_wallet.owner_id <> new.merchant_id
    or settlement_wallet.purpose <> 'merchant_settlement'
    or settlement_wallet.network <> new.network
    or settlement_wallet.verification_status <> 'verified'
    or not settlement_wallet.is_active
    or settlement_wallet.address <> new.settlement_address
    or settlement_wallet.address <> new.invoice_signer_address then
    raise exception 'invoice requires the merchant active verified settlement wallet'
      using errcode = '23514';
  end if;

  if new.kind = 'voucher' then
    select * into target_program from public.programs where id = new.program_id;
    if not found
      or target_program.organization_id <> new.organization_id
      or target_program.aid_type <> 'voucher'
      or target_program.status <> 'active'
      or target_program.asset_code <> new.asset_code
      or target_program.asset_issuer <> new.asset_issuer
      or target_program.asset_sac_address is distinct from new.asset_sac_address
      or target_program.voucher_contract_address <> new.voucher_contract_address
      or not exists (
        select 1 from public.program_merchants program_merchant
        where program_merchant.program_id = new.program_id
          and program_merchant.merchant_id = new.merchant_id
          and program_merchant.category = new.category
          and program_merchant.status = 'authorized'
      ) then
      raise exception 'voucher invoice does not match an active authorized program'
        using errcode = '23514';
    end if;
  elsif not exists (
    select 1 from public.merchant_accreditations accreditation
    where accreditation.organization_id = new.organization_id
      and accreditation.merchant_id = new.merchant_id
      and accreditation.status = 'active'
      and new.issued_at between accreditation.valid_from and accreditation.valid_until
  ) then
    raise exception 'cash invoice requires active merchant accreditation'
      using errcode = '23514';
  end if;

  if new.status = 'consumed' and not exists (
    select 1 from public.payment_intents payment
    where payment.id = new.consumed_by_payment_intent_id
      and payment.invoice_id = new.id
      and payment.status = 'confirmed'
      and payment.transaction_hash is not null
      and payment.confirmed_ledger is not null
  ) then
    raise exception 'invoice can be consumed only by a confirmed payment'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger invoices_validate_workflow
before insert or update on public.invoices
for each row execute function private.validate_invoice_workflow();

create or replace function private.validate_payment_intent()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target_invoice public.invoices;
  beneficiary_wallet public.wallets;
  target_enrollment public.enrollments;
  target_financial_intent public.financial_intents;
  target_idempotency_key public.idempotency_keys;
begin
  if tg_op = 'INSERT' and new.status <> 'requested' then
    raise exception 'payment intents must start requested'
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' then
    if row(new.financial_intent_id, new.organization_id, new.invoice_id, new.program_id,
      new.beneficiary_identity_id, new.beneficiary_wallet_id,
      new.merchant_id, new.settlement_wallet_id, new.enrollment_id,
      new.funding_source, new.amount_stroops, new.idempotency_key,
      new.payload_hash, new.correlation_id)
      is distinct from
      row(old.financial_intent_id, old.organization_id, old.invoice_id, old.program_id,
      old.beneficiary_identity_id, old.beneficiary_wallet_id,
      old.merchant_id, old.settlement_wallet_id, old.enrollment_id,
      old.funding_source, old.amount_stroops, old.idempotency_key,
      old.payload_hash, old.correlation_id) then
      raise exception 'payment intent identity and value are immutable'
        using errcode = '23514';
    end if;

    if new.status is distinct from old.status and not (
      (old.status = 'requested' and new.status in ('prepared', 'failed', 'expired'))
      or (old.status = 'prepared' and new.status in ('signed', 'failed', 'expired'))
      or (old.status = 'signed' and new.status in ('submitted', 'failed', 'expired'))
      or (old.status = 'submitted' and new.status in ('confirmed', 'failed'))
    ) then
      raise exception 'invalid payment lifecycle transition: % -> %', old.status, new.status
        using errcode = '23514';
    end if;
  end if;

  select * into target_financial_intent
  from public.financial_intents where id = new.financial_intent_id;
  if not found then
    raise exception 'payment intent requires its immutable financial intent'
      using errcode = '23503';
  end if;
  select * into target_idempotency_key
  from public.idempotency_keys
  where id = target_financial_intent.idempotency_key_id;
  if not found
    or target_financial_intent.organization_id <> new.organization_id
    or target_financial_intent.program_id is distinct from new.program_id
    or target_financial_intent.beneficiary_identity_id
      is distinct from new.beneficiary_identity_id
    or target_financial_intent.amount_stroops is distinct from new.amount_stroops
    or target_financial_intent.payload_hash <> new.payload_hash
    or target_financial_intent.correlation_id <> new.correlation_id
    or target_idempotency_key.idempotency_key <> new.idempotency_key
    or target_idempotency_key.payload_hash <> new.payload_hash
    or (
      new.funding_source = 'cash'
      and target_financial_intent.operation_type <> 'cash_payment'
    )
    or (
      new.funding_source = 'voucher'
      and target_financial_intent.operation_type <> 'voucher_redemption'
    ) then
    raise exception 'payment workflow does not match its immutable financial intent'
      using errcode = '23514';
  end if;

  select * into target_invoice from public.invoices where id = new.invoice_id;
  if not found
    or target_invoice.organization_id <> new.organization_id
    or target_invoice.merchant_id <> new.merchant_id
    or target_invoice.settlement_wallet_id <> new.settlement_wallet_id
    or target_invoice.amount_stroops <> new.amount_stroops
    or target_invoice.kind::text <> new.funding_source::text
    or target_invoice.program_id is distinct from new.program_id then
    raise exception 'payment intent does not match its signed invoice'
      using errcode = '23514';
  end if;

  if tg_op = 'INSERT' and (
    target_invoice.status in ('consumed', 'expired', 'cancelled')
    or target_invoice.expires_at <= now()
  ) then
    raise exception 'payment intent requires an unexpired unused invoice'
      using errcode = '23514';
  end if;

  select * into beneficiary_wallet
  from public.wallets where id = new.beneficiary_wallet_id;
  if not found
    or beneficiary_wallet.owner_type <> 'beneficiary_identity'
    or beneficiary_wallet.owner_id <> new.beneficiary_identity_id
    or beneficiary_wallet.purpose <> 'beneficiary'
    or beneficiary_wallet.network <> target_invoice.network
    or beneficiary_wallet.verification_status <> 'verified'
    or not beneficiary_wallet.is_active then
    raise exception 'payment requires the beneficiary active verified wallet'
      using errcode = '23514';
  end if;

  if new.funding_source = 'voucher' then
    select * into target_enrollment
    from public.enrollments where id = new.enrollment_id;
    if not found
      or target_enrollment.program_id <> new.program_id
      or target_enrollment.beneficiary_identity_id <> new.beneficiary_identity_id
      or target_enrollment.approval_status <> 'Approved' then
      raise exception 'voucher payment requires the approved beneficiary enrollment'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create trigger payment_intents_validate_workflow
before insert or update on public.payment_intents
for each row execute function private.validate_payment_intent();

create or replace function private.sync_invoice_from_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.invoices
    set status = 'authorization_pending'
    where id = new.invoice_id and status in ('issued', 'presented');
  elsif new.status = 'submitted' and old.status is distinct from new.status then
    update public.invoices
    set status = 'submitted'
    where id = new.invoice_id and status = 'authorization_pending';
  elsif new.status = 'confirmed' and old.status is distinct from new.status then
    update public.invoices
    set status = 'consumed',
        consumed_by_payment_intent_id = new.id,
        consumed_at = new.confirmed_at
    where id = new.invoice_id and status = 'submitted';

    if not found then
      raise exception 'confirmed payment could not consume its submitted invoice'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger payment_intents_sync_invoice
  after insert or update of status on public.payment_intents
  for each row execute function private.sync_invoice_from_payment();

create or replace function private.validate_redemption_or_settlement()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  payment public.payment_intents;
  redemption public.voucher_redemptions;
begin
  select * into payment from public.payment_intents
  where id = new.payment_intent_id;
  if not found
    or payment.organization_id <> new.organization_id
    or payment.program_id is distinct from new.program_id
    or payment.merchant_id <> new.merchant_id
    or payment.amount_stroops <> new.amount_stroops then
    raise exception '% does not match its payment intent', tg_table_name
      using errcode = '23514';
  end if;

  if tg_table_name = 'voucher_redemptions' then
    if payment.funding_source <> 'voucher'
      or payment.invoice_id <> new.invoice_id
      or payment.beneficiary_identity_id <> new.beneficiary_identity_id
      or payment.contract_id is distinct from new.contract_id
      or payment.transaction_hash is distinct from new.transaction_hash
      or (new.status = 'confirmed' and payment.status <> 'confirmed') then
      raise exception 'redemption does not match confirmed voucher payment evidence'
        using errcode = '23514';
    end if;
  else
    if payment.settlement_wallet_id <> new.settlement_wallet_id
      or payment.transaction_hash is distinct from new.transaction_hash
      or (new.status = 'confirmed' and payment.status <> 'confirmed') then
      raise exception 'settlement does not match confirmed payment evidence'
        using errcode = '23514';
    end if;

    if new.kind = 'voucher_redemption' then
      select * into redemption from public.voucher_redemptions
      where id = new.voucher_redemption_id;
      if not found
        or redemption.payment_intent_id <> new.payment_intent_id
        or redemption.status <> 'confirmed'
        or redemption.contract_id is distinct from new.contract_id
        or redemption.transaction_hash is distinct from new.transaction_hash
        or redemption.amount_stroops <> new.amount_stroops then
        raise exception 'voucher settlement requires its distinct confirmed redemption'
          using errcode = '23514';
      end if;
    elsif payment.funding_source <> 'cash' then
      raise exception 'cash settlement requires a cash payment intent'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create trigger voucher_redemptions_validate_link
before insert or update on public.voucher_redemptions
for each row execute function private.validate_redemption_or_settlement();
create trigger settlements_validate_link
before insert or update on public.settlements
for each row execute function private.validate_redemption_or_settlement();

create or replace function private.validate_refund_workflow()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  payment public.payment_intents;
  settlement public.settlements;
  target_program public.programs;
  reserved_stroops bigint;
  payment_found boolean;
  settlement_found boolean;
begin
  if tg_op = 'INSERT' and new.status <> 'requested' then
    raise exception 'refunds must start requested'
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' then
    if row(new.organization_id, new.original_payment_intent_id,
      new.original_settlement_id, new.voucher_redemption_id, new.program_id,
      new.beneficiary_identity_id, new.merchant_id, new.amount_stroops,
      new.returns_to_entitlement, new.refund_nonce, new.correlation_id,
      new.requested_at)
      is distinct from
      row(old.organization_id, old.original_payment_intent_id,
      old.original_settlement_id, old.voucher_redemption_id, old.program_id,
      old.beneficiary_identity_id, old.merchant_id, old.amount_stroops,
      old.returns_to_entitlement, old.refund_nonce, old.correlation_id,
      old.requested_at) then
      raise exception 'refund subject and value are immutable'
        using errcode = '23514';
    end if;

    if new.status is distinct from old.status and not (
      (old.status = 'requested' and new.status in (
        'approved', 'failed', 'exception_required'))
      or (old.status = 'approved' and new.status in ('signed', 'failed'))
      or (old.status = 'signed' and new.status in ('submitted', 'failed'))
      or (old.status = 'submitted' and new.status in ('confirmed', 'failed'))
    ) then
      raise exception 'invalid refund lifecycle transition: % -> %', old.status, new.status
        using errcode = '23514';
    end if;
  end if;

  select * into payment from public.payment_intents
  where id = new.original_payment_intent_id;
  payment_found := found;
  select * into settlement from public.settlements
  where id = new.original_settlement_id;
  settlement_found := found;
  if not payment_found or not settlement_found
    or payment.status <> 'confirmed' or settlement.status <> 'confirmed'
    or settlement.payment_intent_id <> payment.id
    or payment.organization_id <> new.organization_id
    or payment.program_id is distinct from new.program_id
    or payment.beneficiary_identity_id <> new.beneficiary_identity_id
    or payment.merchant_id <> new.merchant_id
    or settlement.merchant_id <> new.merchant_id then
    raise exception 'refund requires its confirmed payment and settlement'
      using errcode = '23514';
  end if;

  if new.voucher_redemption_id is not null and not exists (
    select 1 from public.voucher_redemptions redemption
    where redemption.id = new.voucher_redemption_id
      and redemption.payment_intent_id = payment.id
      and redemption.status = 'confirmed'
  ) then
    raise exception 'voucher refund requires its confirmed redemption'
      using errcode = '23514';
  end if;

  if tg_op = 'INSERT' and new.program_id is not null then
    select * into target_program from public.programs where id = new.program_id;
    if target_program.status in ('closing', 'closed')
      or (target_program.policy_expires_at is not null
        and new.requested_at >= target_program.policy_expires_at) then
      new.status := 'exception_required';
      new.exception_reason := coalesce(
        new.exception_reason,
        'refund requested after program expiry or closure'
      );
    end if;
  end if;

  if new.status in ('signed', 'submitted', 'confirmed')
    and new.merchant_authorization_hash is null then
    raise exception 'refund value movement requires merchant-signed authorization'
      using errcode = '23514';
  end if;

  if new.status <> 'exception_required' then
    perform pg_advisory_xact_lock(
      hashtextextended(new.original_payment_intent_id::text, 0)
    );
    select coalesce(sum(refund.amount_stroops), 0)
    into reserved_stroops
    from public.refunds refund
    where refund.original_payment_intent_id = new.original_payment_intent_id
      and refund.status in ('requested', 'approved', 'signed', 'submitted', 'confirmed')
      and (tg_op = 'INSERT' or refund.id <> new.id);

    if reserved_stroops + new.amount_stroops > payment.amount_stroops then
      raise exception 'cumulative refunds cannot exceed original payment amount'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create trigger refunds_validate_workflow
before insert or update on public.refunds
for each row execute function private.validate_refund_workflow();

create or replace function private.validate_dispute_workflow()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  payment public.payment_intents;
begin
  if tg_op = 'UPDATE' then
    if row(new.organization_id, new.payment_intent_id, new.settlement_id,
      new.refund_id, new.opened_by, new.reason, new.correlation_id, new.opened_at)
      is distinct from
      row(old.organization_id, old.payment_intent_id, old.settlement_id,
      old.refund_id, old.opened_by, old.reason, old.correlation_id, old.opened_at) then
      raise exception 'dispute financial references and original claim are immutable'
        using errcode = '23514';
    end if;

    if new.status is distinct from old.status and not (
      (old.status = 'open' and new.status in ('under_review', 'resolved', 'rejected'))
      or (old.status = 'under_review' and new.status in ('resolved', 'rejected'))
    ) then
      raise exception 'invalid dispute lifecycle transition: % -> %', old.status, new.status
        using errcode = '23514';
    end if;
  end if;

  select * into payment from public.payment_intents
  where id = new.payment_intent_id;
  if not found or payment.organization_id <> new.organization_id
    or (new.settlement_id is not null and not exists (
      select 1 from public.settlements settlement
      where settlement.id = new.settlement_id
        and settlement.payment_intent_id = payment.id
    ))
    or (new.refund_id is not null and not exists (
      select 1 from public.refunds refund
      where refund.id = new.refund_id
        and refund.original_payment_intent_id = payment.id
    )) then
    raise exception 'dispute must link to financial events from one payment'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger disputes_validate_workflow
before insert or update on public.disputes
for each row execute function private.validate_dispute_workflow();

create or replace function private.validate_cashout_workflow()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  settlement_wallet public.wallets;
begin
  if tg_op = 'INSERT' and new.status <> 'requested' then
    raise exception 'cash-out requests must start requested'
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' then
    if row(new.organization_id, new.merchant_id, new.settlement_wallet_id,
      new.amount_stroops, new.asset_code, new.is_simulated,
      new.correlation_id, new.requested_by, new.requested_at)
      is distinct from
      row(old.organization_id, old.merchant_id, old.settlement_wallet_id,
      old.amount_stroops, old.asset_code, old.is_simulated,
      old.correlation_id, old.requested_by, old.requested_at) then
      raise exception 'cash-out request identity and amount are immutable'
        using errcode = '23514';
    end if;

    if new.status is distinct from old.status and not (
      (old.status = 'requested' and new.status = 'processing')
      or (old.status = 'processing' and new.status in ('completed', 'failed'))
    ) then
      raise exception 'invalid cash-out lifecycle transition: % -> %', old.status, new.status
        using errcode = '23514';
    end if;

    if new.status = 'processing' and old.status <> 'processing' then
      new.processing_at := coalesce(new.processing_at, now());
    elsif new.status = 'completed' and old.status <> 'completed' then
      new.completed_at := coalesce(new.completed_at, now());
    elsif new.status = 'failed' and old.status <> 'failed' then
      new.failed_at := coalesce(new.failed_at, now());
    end if;
  end if;

  select * into settlement_wallet from public.wallets
  where id = new.settlement_wallet_id;
  if not found
    or settlement_wallet.owner_type <> 'merchant_entity'
    or settlement_wallet.owner_id <> new.merchant_id
    or settlement_wallet.purpose <> 'merchant_settlement'
    or settlement_wallet.verification_status <> 'verified'
    or not settlement_wallet.is_active
    or not exists (
      select 1 from public.merchant_entities merchant
      where merchant.id = new.merchant_id
        and merchant.profile_id = new.requested_by
    ) then
    raise exception 'cash-out requires the merchant active verified settlement wallet'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger cashout_requests_validate_workflow
before insert or update on public.cashout_requests
for each row execute function private.validate_cashout_workflow();

create or replace function private.protect_terminal_financial_workflow()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  previous_status text := lower(coalesce(to_jsonb(old) ->> 'status', ''));
begin
  if tg_op = 'DELETE' then
    raise exception 'financial workflow history cannot be deleted'
      using errcode = '23514';
  end if;

  if previous_status in (
    'consumed', 'expired', 'cancelled', 'confirmed', 'failed',
    'completed', 'exception_required', 'resolved', 'rejected'
  ) then
    raise exception 'terminal financial workflow history is immutable'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function private.prevent_dispute_evidence_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'dispute evidence is append-only'
    using errcode = '23514';
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'invoices', 'payment_intents', 'voucher_redemptions', 'settlements',
    'refunds', 'disputes', 'cashout_requests'
  ] loop
    execute format(
      'create trigger protect_terminal_financial_workflow '
      || 'before update or delete on public.%I for each row '
      || 'execute function private.protect_terminal_financial_workflow()',
      table_name
    );
  end loop;
end
$$;

create trigger dispute_evidence_append_only
before update or delete on public.dispute_evidence
for each row execute function private.prevent_dispute_evidence_mutation();

create trigger invoices_set_updated_at
before update on public.invoices
for each row execute function private.set_updated_at();
create trigger payment_intents_set_updated_at
before update on public.payment_intents
for each row execute function private.set_updated_at();
create trigger voucher_redemptions_set_updated_at
before update on public.voucher_redemptions
for each row execute function private.set_updated_at();
create trigger settlements_set_updated_at
before update on public.settlements
for each row execute function private.set_updated_at();
create trigger refunds_set_updated_at
before update on public.refunds
for each row execute function private.set_updated_at();
create trigger disputes_set_updated_at
before update on public.disputes
for each row execute function private.set_updated_at();
create trigger cashout_requests_set_updated_at
before update on public.cashout_requests
for each row execute function private.set_updated_at();

create or replace function private.can_view_payment_workflow(
  p_organization_id uuid,
  p_beneficiary_identity_id uuid,
  p_merchant_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and (
    private.is_organization_member(p_organization_id)
    or exists (
      select 1 from public.beneficiary_identities identity
      where identity.id = p_beneficiary_identity_id
        and identity.user_id = (select auth.uid())
    )
    or exists (
      select 1 from public.merchant_entities merchant
      where merchant.id = p_merchant_id
        and merchant.profile_id = (select auth.uid())
    )
  );
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'invoices', 'payment_intents', 'voucher_redemptions', 'settlements',
    'refunds', 'disputes', 'dispute_evidence', 'cashout_requests'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format(
      'revoke all privileges on table public.%I from public, anon, authenticated',
      table_name
    );
    execute format('grant select on table public.%I to authenticated', table_name);
    execute format('grant all privileges on table public.%I to service_role', table_name);
  end loop;
end
$$;

create policy "Participants can view invoices"
on public.invoices for select to authenticated
using (
  private.is_organization_member(organization_id)
  or exists (
    select 1 from public.merchant_entities merchant
    where merchant.id = merchant_id and merchant.profile_id = (select auth.uid())
  )
  or exists (
    select 1 from public.payment_intents payment
    where payment.invoice_id = invoices.id
      and private.can_view_payment_workflow(
        payment.organization_id,
        payment.beneficiary_identity_id,
        payment.merchant_id
      )
  )
);

create policy "Participants can view payment intents"
on public.payment_intents for select to authenticated
using (private.can_view_payment_workflow(
  organization_id, beneficiary_identity_id, merchant_id
));

create policy "Participants can view voucher redemptions"
on public.voucher_redemptions for select to authenticated
using (private.can_view_payment_workflow(
  organization_id, beneficiary_identity_id, merchant_id
));

create policy "Participants can view settlements"
on public.settlements for select to authenticated
using (
  private.is_organization_member(organization_id)
  or exists (
    select 1 from public.merchant_entities merchant
    where merchant.id = merchant_id and merchant.profile_id = (select auth.uid())
  )
  or exists (
    select 1 from public.payment_intents payment
    where payment.id = payment_intent_id
      and exists (
        select 1 from public.beneficiary_identities identity
        where identity.id = payment.beneficiary_identity_id
          and identity.user_id = (select auth.uid())
      )
  )
);

create policy "Participants can view refunds"
on public.refunds for select to authenticated
using (private.can_view_payment_workflow(
  organization_id, beneficiary_identity_id, merchant_id
));

create policy "Participants can view disputes"
on public.disputes for select to authenticated
using (
  private.is_organization_member(organization_id)
  or opened_by = (select auth.uid())
  or exists (
    select 1 from public.payment_intents payment
    where payment.id = payment_intent_id
      and private.can_view_payment_workflow(
        payment.organization_id,
        payment.beneficiary_identity_id,
        payment.merchant_id
      )
  )
);

create policy "Participants can view dispute evidence"
on public.dispute_evidence for select to authenticated
using (
  exists (
    select 1 from public.disputes dispute
    where dispute.id = dispute_id
      and (
        private.is_organization_member(dispute.organization_id)
        or dispute.opened_by = (select auth.uid())
        or exists (
          select 1 from public.payment_intents payment
          where payment.id = dispute.payment_intent_id
            and private.can_view_payment_workflow(
              payment.organization_id,
              payment.beneficiary_identity_id,
              payment.merchant_id
            )
        )
      )
  )
);

create policy "Merchant and organization can view cash-out requests"
on public.cashout_requests for select to authenticated
using (
  private.is_organization_member(organization_id)
  or exists (
    select 1 from public.merchant_entities merchant
    where merchant.id = merchant_id and merchant.profile_id = (select auth.uid())
  )
);

revoke all privileges on function private.validate_invoice_workflow()
  from public, anon, authenticated;
revoke all privileges on function private.validate_payment_intent()
  from public, anon, authenticated;
revoke all privileges on function private.sync_invoice_from_payment()
  from public, anon, authenticated;
revoke all privileges on function private.validate_redemption_or_settlement()
  from public, anon, authenticated;
revoke all privileges on function private.validate_refund_workflow()
  from public, anon, authenticated;
revoke all privileges on function private.validate_dispute_workflow()
  from public, anon, authenticated;
revoke all privileges on function private.validate_cashout_workflow()
  from public, anon, authenticated;
revoke all privileges on function private.protect_terminal_financial_workflow()
  from public, anon, authenticated;
revoke all privileges on function private.prevent_dispute_evidence_mutation()
  from public, anon, authenticated;
revoke all privileges on function private.can_view_payment_workflow(uuid, uuid, uuid)
  from public, anon, authenticated;

comment on table public.invoices is
  'Signed one-time merchant invoices; consumption is derived only from confirmed payment evidence.';
comment on table public.payment_intents is
  'Payment-specific immutable intent with one selected funding source and reconciliation evidence.';
comment on table public.voucher_redemptions is
  'Voucher redemption domain event linked to, but distinct from, merchant settlement.';
comment on table public.settlements is
  'Merchant on-chain settlement event; never conflated with fiat cash-out.';
comment on table public.refunds is
  'Signed compensating transactions referencing original confirmed payment and settlement events.';
comment on table public.disputes is
  'Off-chain dispute workflow retaining immutable links to financial events.';
comment on table public.dispute_evidence is
  'Append-only off-chain dispute evidence metadata and content digests.';
comment on table public.cashout_requests is
  'Independent simulated partner cash-out workflow; failure does not alter on-chain ownership.';
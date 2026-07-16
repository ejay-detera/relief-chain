-- Link confirmed payment business events to append-only observed chain evidence.
-- Raw hashes and ledger positions remain denormalized for diagnosis, while these
-- foreign keys prevent workflow rows from inventing or substituting evidence.

alter table public.payment_intents
  add column ledger_transaction_id uuid
    references public.ledger_transactions(id) on delete restrict,
  add column contract_event_id uuid
    references public.contract_events(id) on delete restrict;

alter table public.voucher_redemptions
  add column ledger_transaction_id uuid
    references public.ledger_transactions(id) on delete restrict,
  add column contract_event_id uuid
    references public.contract_events(id) on delete restrict;

alter table public.settlements
  add column ledger_transaction_id uuid
    references public.ledger_transactions(id) on delete restrict,
  add column contract_event_id uuid
    references public.contract_events(id) on delete restrict;

alter table public.refunds
  add column ledger_transaction_id uuid
    references public.ledger_transactions(id) on delete restrict,
  add column contract_event_id uuid
    references public.contract_events(id) on delete restrict;

-- Reconcile any pre-existing confirmed workflow rows before enforcing links.
-- The existing terminal-history guards are suspended only for this deterministic
-- evidence backfill and are restored before any new constraints are installed.
alter table public.payment_intents
  disable trigger protect_terminal_financial_workflow;
alter table public.voucher_redemptions
  disable trigger protect_terminal_financial_workflow;
alter table public.settlements
  disable trigger protect_terminal_financial_workflow;
alter table public.refunds
  disable trigger protect_terminal_financial_workflow;

update public.payment_intents payment
set ledger_transaction_id = evidence.id
from public.ledger_transactions evidence
where payment.status = 'confirmed'
  and payment.ledger_transaction_id is null
  and evidence.organization_id = payment.organization_id
  and evidence.program_id is not distinct from payment.program_id
  and evidence.financial_intent_id = payment.financial_intent_id
  and evidence.transaction_hash = payment.transaction_hash
  and evidence.ledger_sequence = payment.confirmed_ledger
  and evidence.successful;

update public.payment_intents payment
set contract_event_id = event.id
from public.contract_events event
where payment.status = 'confirmed'
  and payment.funding_source = 'voucher'
  and payment.contract_event_id is null
  and event.organization_id = payment.organization_id
  and event.program_id is not distinct from payment.program_id
  and event.transaction_hash = payment.transaction_hash
  and event.contract_id = payment.contract_id
  and event.ledger_sequence = payment.confirmed_ledger
  and event.event_index = payment.contract_event_index
  and event.event_type = 'redeemed';

update public.voucher_redemptions redemption
set ledger_transaction_id = evidence.id
from public.payment_intents payment
join public.ledger_transactions evidence
  on evidence.id = payment.ledger_transaction_id
where redemption.status = 'confirmed'
  and redemption.ledger_transaction_id is null
  and payment.id = redemption.payment_intent_id
  and evidence.transaction_hash = redemption.transaction_hash
  and evidence.ledger_sequence = redemption.ledger;

update public.voucher_redemptions redemption
set contract_event_id = event.id
from public.payment_intents payment
join public.contract_events event
  on event.id = payment.contract_event_id
where redemption.status = 'confirmed'
  and redemption.contract_event_id is null
  and payment.id = redemption.payment_intent_id
  and event.transaction_hash = redemption.transaction_hash
  and event.contract_id = redemption.contract_id
  and event.ledger_sequence = redemption.ledger
  and event.event_index = redemption.contract_event_index;

update public.settlements settlement
set ledger_transaction_id = evidence.id
from public.payment_intents payment
join public.ledger_transactions evidence
  on evidence.id = payment.ledger_transaction_id
where settlement.status = 'confirmed'
  and settlement.ledger_transaction_id is null
  and payment.id = settlement.payment_intent_id
  and evidence.transaction_hash = settlement.transaction_hash
  and evidence.ledger_sequence = settlement.ledger;

update public.settlements settlement
set contract_event_id = event.id
from public.payment_intents payment
join public.contract_events event
  on event.id = payment.contract_event_id
where settlement.status = 'confirmed'
  and settlement.kind = 'voucher_redemption'
  and settlement.contract_event_id is null
  and payment.id = settlement.payment_intent_id
  and event.transaction_hash = settlement.transaction_hash
  and event.contract_id = settlement.contract_id
  and event.ledger_sequence = settlement.ledger
  and event.event_index = settlement.contract_event_index;

update public.refunds refund
set ledger_transaction_id = evidence.id
from public.ledger_transactions evidence
join public.financial_intents intent
  on intent.id = evidence.financial_intent_id
where refund.status = 'confirmed'
  and refund.ledger_transaction_id is null
  and evidence.organization_id = refund.organization_id
  and evidence.program_id is not distinct from refund.program_id
  and evidence.transaction_hash = refund.transaction_hash
  and evidence.ledger_sequence = refund.ledger
  and evidence.successful
  and intent.operation_type = 'refund'
  and intent.beneficiary_identity_id = refund.beneficiary_identity_id
  and intent.amount_stroops = refund.amount_stroops
  and intent.correlation_id = refund.correlation_id;

update public.refunds refund
set contract_event_id = event.id
from public.contract_events event
where refund.status = 'confirmed'
  and refund.voucher_redemption_id is not null
  and refund.contract_event_id is null
  and event.ledger_transaction_id = refund.ledger_transaction_id
  and event.organization_id = refund.organization_id
  and event.program_id is not distinct from refund.program_id
  and event.transaction_hash = refund.transaction_hash
  and event.contract_id = refund.contract_id
  and event.ledger_sequence = refund.ledger
  and event.event_index = refund.contract_event_index
  and event.event_type = 'refunded';

alter table public.payment_intents
  enable trigger protect_terminal_financial_workflow;
alter table public.voucher_redemptions
  enable trigger protect_terminal_financial_workflow;
alter table public.settlements
  enable trigger protect_terminal_financial_workflow;
alter table public.refunds
  enable trigger protect_terminal_financial_workflow;

alter table public.payment_intents
  add constraint payment_intents_chain_evidence_state_check check (
    (status = 'confirmed' and ledger_transaction_id is not null and (
      (funding_source = 'cash' and contract_event_id is null)
      or (funding_source = 'voucher' and contract_event_id is not null)
    ))
    or (status <> 'confirmed' and ledger_transaction_id is null
      and contract_event_id is null)
  );

alter table public.voucher_redemptions
  add constraint voucher_redemptions_chain_evidence_state_check check (
    (status = 'confirmed' and ledger_transaction_id is not null
      and contract_event_id is not null)
    or (status <> 'confirmed' and ledger_transaction_id is null
      and contract_event_id is null)
  );

alter table public.settlements
  add constraint settlements_chain_evidence_state_check check (
    (status = 'confirmed' and ledger_transaction_id is not null and (
      (kind = 'cash_payment' and contract_event_id is null)
      or (kind = 'voucher_redemption' and contract_event_id is not null)
    ))
    or (status <> 'confirmed' and ledger_transaction_id is null
      and contract_event_id is null)
  );

alter table public.refunds
  add constraint refunds_chain_evidence_state_check check (
    (status = 'confirmed' and ledger_transaction_id is not null and (
      (voucher_redemption_id is null and contract_event_id is null)
      or (voucher_redemption_id is not null and contract_event_id is not null)
    ))
    or (status <> 'confirmed' and ledger_transaction_id is null
      and contract_event_id is null)
  );

create unique index payment_intents_ledger_evidence_key
  on public.payment_intents (ledger_transaction_id)
  where ledger_transaction_id is not null;
create unique index payment_intents_contract_event_key
  on public.payment_intents (contract_event_id)
  where contract_event_id is not null;
create unique index voucher_redemptions_ledger_evidence_key
  on public.voucher_redemptions (ledger_transaction_id)
  where ledger_transaction_id is not null;
create unique index voucher_redemptions_contract_event_key
  on public.voucher_redemptions (contract_event_id)
  where contract_event_id is not null;
create unique index settlements_ledger_evidence_key
  on public.settlements (ledger_transaction_id)
  where ledger_transaction_id is not null;
create unique index settlements_contract_event_key
  on public.settlements (contract_event_id)
  where contract_event_id is not null;
create unique index refunds_ledger_evidence_key
  on public.refunds (ledger_transaction_id)
  where ledger_transaction_id is not null;
create unique index refunds_contract_event_key
  on public.refunds (contract_event_id)
  where contract_event_id is not null;

create or replace function private.validate_payment_chain_evidence()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  payment public.payment_intents;
  evidence public.ledger_transactions;
  event public.contract_events;
  expected_financial_intent_id uuid;
  expected_event_type text;
  requires_contract_event boolean := false;
begin
  if tg_op = 'UPDATE' then
    if old.ledger_transaction_id is not null
      and new.ledger_transaction_id is distinct from old.ledger_transaction_id then
      raise exception 'linked ledger evidence is immutable' using errcode = '23514';
    end if;
    if old.contract_event_id is not null
      and new.contract_event_id is distinct from old.contract_event_id then
      raise exception 'linked contract event evidence is immutable' using errcode = '23514';
    end if;
  end if;

  if new.status::text <> 'confirmed' then
    if new.ledger_transaction_id is not null or new.contract_event_id is not null then
      raise exception 'chain evidence may be linked only after confirmation'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if tg_table_name = 'payment_intents' then
    expected_financial_intent_id := new.financial_intent_id;
    requires_contract_event := new.funding_source = 'voucher';
    expected_event_type := 'redeemed';
  elsif tg_table_name = 'voucher_redemptions' then
    select * into payment from public.payment_intents
    where id = new.payment_intent_id;
    expected_financial_intent_id := payment.financial_intent_id;
    requires_contract_event := true;
    expected_event_type := 'redeemed';
  elsif tg_table_name = 'settlements' then
    select * into payment from public.payment_intents
    where id = new.payment_intent_id;
    expected_financial_intent_id := payment.financial_intent_id;
    requires_contract_event := new.kind = 'voucher_redemption';
    expected_event_type := 'redeemed';
  else
    requires_contract_event := new.voucher_redemption_id is not null;
    expected_event_type := 'refunded';
  end if;

  select * into evidence from public.ledger_transactions
  where id = new.ledger_transaction_id;
  if not found or not evidence.successful
    or evidence.organization_id <> new.organization_id
    or evidence.program_id is distinct from new.program_id
    or evidence.transaction_hash <> new.transaction_hash
    or evidence.ledger_sequence <> coalesce(
      (to_jsonb(new) ->> 'confirmed_ledger')::bigint,
      (to_jsonb(new) ->> 'ledger')::bigint
    )
    or (expected_financial_intent_id is not null
      and evidence.financial_intent_id is distinct from expected_financial_intent_id) then
    raise exception 'confirmed % requires matching immutable ledger evidence', tg_table_name
      using errcode = '23514';
  end if;

  if tg_table_name = 'refunds' and not exists (
    select 1
    from public.financial_intents intent
    where intent.id = evidence.financial_intent_id
      and intent.operation_type = 'refund'
      and intent.organization_id = new.organization_id
      and intent.program_id is not distinct from new.program_id
      and intent.beneficiary_identity_id = new.beneficiary_identity_id
      and intent.amount_stroops = new.amount_stroops
      and intent.correlation_id = new.correlation_id
  ) then
    raise exception 'confirmed refund requires matching immutable financial intent evidence'
      using errcode = '23514';
  end if;

  if requires_contract_event then
    select * into event from public.contract_events
    where id = new.contract_event_id;
    if not found
      or event.ledger_transaction_id <> evidence.id
      or event.organization_id <> new.organization_id
      or event.program_id is distinct from new.program_id
      or event.transaction_hash <> new.transaction_hash
      or event.contract_id <> new.contract_id
      or event.ledger_sequence <> coalesce(
        (to_jsonb(new) ->> 'confirmed_ledger')::bigint,
        (to_jsonb(new) ->> 'ledger')::bigint
      )
      or event.event_index <> new.contract_event_index
      or event.event_type <> expected_event_type then
      raise exception 'confirmed % requires matching immutable contract event evidence',
        tg_table_name using errcode = '23514';
    end if;
  elsif new.contract_event_id is not null then
    raise exception 'cash workflow cannot link contract event evidence'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger payment_intents_validate_chain_evidence
before insert or update on public.payment_intents
for each row execute function private.validate_payment_chain_evidence();
create trigger voucher_redemptions_validate_chain_evidence
before insert or update on public.voucher_redemptions
for each row execute function private.validate_payment_chain_evidence();
create trigger settlements_validate_chain_evidence
before insert or update on public.settlements
for each row execute function private.validate_payment_chain_evidence();
create trigger refunds_validate_chain_evidence
before insert or update on public.refunds
for each row execute function private.validate_payment_chain_evidence();

revoke all privileges on function private.validate_payment_chain_evidence()
  from public, anon, authenticated;

comment on column public.payment_intents.ledger_transaction_id is
  'Append-only observed transaction that authoritatively confirms this payment.';
comment on column public.payment_intents.contract_event_id is
  'Append-only redeemed event for a confirmed voucher payment; null for cash.';
comment on column public.voucher_redemptions.contract_event_id is
  'Immutable redeemed event shared with, but not conflated with, settlement.';
comment on column public.settlements.contract_event_id is
  'Immutable redeemed event proving merchant settlement for voucher payments.';
comment on column public.refunds.ledger_transaction_id is
  'Append-only observed compensating transaction that confirms this refund.';
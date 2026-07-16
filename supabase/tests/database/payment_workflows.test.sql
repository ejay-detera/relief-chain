begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

select enum_has_labels(
  'public', 'cashout_request_status',
  array['requested', 'processing', 'completed', 'failed'],
  'cash-out has exactly the independent required states'
);
select enum_has_labels(
  'public', 'payment_intent_status',
  array['requested', 'prepared', 'signed', 'submitted', 'confirmed', 'failed', 'expired'],
  'payment intent distinguishes submission from confirmation'
);
select has_table('public', 'invoices', 'signed invoices are stored');
select has_table('public', 'payment_intents', 'payment-specific intents are stored');
select col_is_fk(
  'public', 'payment_intents', 'ledger_transaction_id',
  'confirmed payments link to immutable transaction evidence'
);
select col_is_fk(
  'public', 'payment_intents', 'contract_event_id',
  'confirmed voucher payments link to immutable contract evidence'
);
select has_column(
  'public', 'payment_intents', 'financial_intent_id',
  'payment workflow preserves its immutable financial-intent link'
);
select has_table('public', 'voucher_redemptions', 'voucher redemptions are stored');
select col_is_fk(
  'public', 'voucher_redemptions', 'contract_event_id',
  'redemptions preserve their immutable redeemed event link'
);
select has_table('public', 'settlements', 'settlements are stored separately');
select col_is_fk(
  'public', 'settlements', 'contract_event_id',
  'settlements preserve evidence independently from redemptions'
);
select has_table('public', 'refunds', 'compensating refunds are stored');
select col_is_fk(
  'public', 'refunds', 'ledger_transaction_id',
  'confirmed refunds link to immutable compensating transaction evidence'
);
select has_table('public', 'disputes', 'dispute workflows are stored');
select has_table('public', 'dispute_evidence', 'dispute evidence is append-only');
select has_table('public', 'cashout_requests', 'cash-out workflow is independent');
select ok(
  not has_table_privilege('authenticated', 'public.invoices', 'INSERT'),
  'authenticated clients cannot directly create financial workflow rows'
);
select ok(
  not has_table_privilege('authenticated', 'public.refunds', 'DELETE'),
  'authenticated clients cannot delete refunds'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '71000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'payment-admin@example.test', '', now(),
    '{"provider":"email","providers":["email"]}',
    '{"role":"lgu"}', now(), now()
  ),
  (
    '71000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'payment-beneficiary@example.test', '', now(),
    '{"provider":"email","providers":["email"]}',
    '{"role":"beneficiary"}', now(), now()
  ),
  (
    '71000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'payment-merchant@example.test', '', now(),
    '{"provider":"email","providers":["email"]}',
    '{"role":"merchant","full_name":"Payment Merchant"}', now(), now()
  );

insert into public.organizations (id, name, slug)
values (
  '72000000-0000-0000-0000-000000000001',
  'Payment Workflow Organization', 'payment-workflow-organization'
);
select public.upsert_organization_membership(
  '72000000-0000-0000-0000-000000000001',
  '71000000-0000-0000-0000-000000000001',
  'organization_administrator',
  '71000000-0000-0000-0000-000000000001'
);

insert into public.merchant_entities (id, profile_id, display_name)
values (
  '73000000-0000-0000-0000-000000000001',
  '71000000-0000-0000-0000-000000000003',
  'Payment Merchant'
);

insert into public.wallets (
  id, owner_type, owner_id, purpose, address,
  verification_status, proof_challenge_digest,
  proof_challenge_issued_at, proof_challenge_expires_at,
  proof_signature_digest, verified_at, verified_by, is_active
)
values
  (
    '74000000-0000-0000-0000-000000000001',
    'organization', '72000000-0000-0000-0000-000000000001',
    'organization_treasury', 'G' || repeat('A', 55),
    'verified', repeat('a', 64), now(), now() + interval '5 minutes',
    repeat('b', 64), now(), '71000000-0000-0000-0000-000000000001', true
  ),
  (
    '74000000-0000-0000-0000-000000000002',
    'beneficiary_identity',
    (select id from public.beneficiary_identities
      where user_id = '71000000-0000-0000-0000-000000000002'),
    'beneficiary', 'G' || repeat('B', 55),
    'verified', repeat('c', 64), now(), now() + interval '5 minutes',
    repeat('d', 64), now(), '71000000-0000-0000-0000-000000000001', true
  ),
  (
    '74000000-0000-0000-0000-000000000003',
    'merchant_entity', '73000000-0000-0000-0000-000000000001',
    'merchant_settlement', 'G' || repeat('C', 55),
    'verified', repeat('e', 64), now(), now() + interval '5 minutes',
    repeat('f', 64), now(), '71000000-0000-0000-0000-000000000001', true
  );

insert into public.merchant_accreditations (
  organization_id, merchant_id, category, status,
  valid_from, valid_until, approved_by, approved_at
)
values (
  '72000000-0000-0000-0000-000000000001',
  '73000000-0000-0000-0000-000000000001',
  'Food', 'active', now() - interval '1 day', now() + interval '1 year',
  '71000000-0000-0000-0000-000000000001', now()
);

insert into public.programs (
  id, organization_id, name, status, aid_type,
  budget_stroops, asset_code, asset_issuer, asset_sac_address,
  treasury_wallet_id, voucher_contract_address,
  allocation_rules, per_beneficiary_limit_stroops,
  per_transaction_limit_stroops, daily_limit_stroops,
  expiry_policy, policy_expires_at,
  refund_policy, refund_window_ends_at,
  policy_version, contract_version, created_by
)
values (
  '75000000-0000-0000-0000-000000000001',
  '72000000-0000-0000-0000-000000000001',
  'Voucher Payment Program', 'draft', 'voucher',
  1000, 'RCPHP', 'G' || repeat('D', 55), 'C' || repeat('E', 55),
  '74000000-0000-0000-0000-000000000001', 'C' || repeat('F', 55),
  '{"strategy":"variable","allowed_categories":["Food"]}'::jsonb,
  1000, 600, 800,
  'fixed', now() + interval '30 days',
  'return_to_entitlement', now() + interval '60 days',
  1, 1, '71000000-0000-0000-0000-000000000001'
);
update public.programs
set status = 'funding', funding_status = 'reserving'
where id = '75000000-0000-0000-0000-000000000001';
update public.programs
set funding_status = 'funded', funded_budget_stroops = budget_stroops,
    funding_transaction_hash = repeat('0', 64), funding_ledger = 100,
    funded_at = now(),
    activation_correlation_id = '76000000-0000-0000-0000-000000000001',
    activated_by = '71000000-0000-0000-0000-000000000001',
    status = 'active'
where id = '75000000-0000-0000-0000-000000000001';

insert into public.enrollments (
  id, beneficiary_id, beneficiary_identity_id, program_id,
  approval_status, category, allocation_amount_stroops,
  allocation_correlation_id, approved_by
)
values (
  '77000000-0000-0000-0000-000000000001',
  '71000000-0000-0000-0000-000000000002',
  (select id from public.beneficiary_identities
    where user_id = '71000000-0000-0000-0000-000000000002'),
  '75000000-0000-0000-0000-000000000001',
  'Approved', 'Food', 500,
  '78000000-0000-0000-0000-000000000001',
  '71000000-0000-0000-0000-000000000001'
);
insert into public.program_merchants (
  id, program_id, merchant_id, category, correlation_id, authorized_by
)
values (
  '79000000-0000-0000-0000-000000000001',
  '75000000-0000-0000-0000-000000000001',
  '73000000-0000-0000-0000-000000000001',
  'Food', '7a000000-0000-0000-0000-000000000001',
  '71000000-0000-0000-0000-000000000001'
);

insert into public.invoices (
  id, organization_id, merchant_id, program_id, settlement_wallet_id,
  kind, asset_code, asset_issuer, asset_sac_address,
  voucher_contract_address, settlement_address, invoice_signer_address,
  amount_stroops, category, nonce, canonical_payload, payload_hash,
  merchant_signature, issued_at, expires_at
)
select
  '7b000000-0000-0000-0000-000000000001',
  '72000000-0000-0000-0000-000000000001',
  '73000000-0000-0000-0000-000000000001',
  '75000000-0000-0000-0000-000000000001',
  '74000000-0000-0000-0000-000000000003',
  'voucher', 'RCPHP', 'G' || repeat('D', 55), 'C' || repeat('E', 55),
  'C' || repeat('F', 55), 'G' || repeat('C', 55), 'G' || repeat('C', 55),
  500, 'Food', repeat('1', 64), decode('0102', 'hex'), repeat('2', 64),
  decode('0304', 'hex'), issued_at, issued_at + interval '10 minutes'
from (select now() as issued_at) clock;

insert into public.idempotency_keys (
  id, organization_id, program_id, scope, idempotency_key,
  payload_hash, operation_type, correlation_id
)
values (
  '7b100000-0000-0000-0000-000000000001',
  '72000000-0000-0000-0000-000000000001',
  '75000000-0000-0000-0000-000000000001',
  'payment.invoice', 'voucher-payment-1', repeat('3', 64),
  'voucher_redemption', '7d000000-0000-0000-0000-000000000001'
);
insert into public.financial_intents (
  id, organization_id, program_id, beneficiary_identity_id,
  idempotency_key_id, operation_type, amount_stroops,
  asset_code, asset_issuer, payload_hash, correlation_id, requested_by
)
values (
  '7b200000-0000-0000-0000-000000000001',
  '72000000-0000-0000-0000-000000000001',
  '75000000-0000-0000-0000-000000000001',
  (select id from public.beneficiary_identities
    where user_id = '71000000-0000-0000-0000-000000000002'),
  '7b100000-0000-0000-0000-000000000001',
  'voucher_redemption', 500, 'RCPHP', 'G' || repeat('D', 55),
  repeat('3', 64), '7d000000-0000-0000-0000-000000000001',
  '71000000-0000-0000-0000-000000000002'
);

insert into public.payment_intents (
  id, financial_intent_id, organization_id, invoice_id, program_id,
  beneficiary_identity_id,
  beneficiary_wallet_id, merchant_id, settlement_wallet_id, enrollment_id,
  funding_source, amount_stroops, idempotency_key, payload_hash, correlation_id
)
values (
  '7c000000-0000-0000-0000-000000000001',
  '7b200000-0000-0000-0000-000000000001',
  '72000000-0000-0000-0000-000000000001',
  '7b000000-0000-0000-0000-000000000001',
  '75000000-0000-0000-0000-000000000001',
  (select id from public.beneficiary_identities
    where user_id = '71000000-0000-0000-0000-000000000002'),
  '74000000-0000-0000-0000-000000000002',
  '73000000-0000-0000-0000-000000000001',
  '74000000-0000-0000-0000-000000000003',
  '77000000-0000-0000-0000-000000000001',
  'voucher', 500, 'voucher-payment-1', repeat('3', 64),
  '7d000000-0000-0000-0000-000000000001'
);

select is(
  (select status::text from public.invoices
    where id = '7b000000-0000-0000-0000-000000000001'),
  'authorization_pending',
  'creating a payment intent advances but does not consume its invoice'
);
update public.payment_intents set status = 'prepared'
where id = '7c000000-0000-0000-0000-000000000001';
update public.payment_intents set status = 'signed'
where id = '7c000000-0000-0000-0000-000000000001';
update public.payment_intents set status = 'submitted', submitted_at = now()
where id = '7c000000-0000-0000-0000-000000000001';

select throws_ok(
  $$update public.invoices
    set status = 'consumed',
        consumed_by_payment_intent_id = '7c000000-0000-0000-0000-000000000001',
        consumed_at = now()
    where id = '7b000000-0000-0000-0000-000000000001'$$,
  '23514',
  'invoice can be consumed only by a confirmed payment',
  'submitted payment evidence cannot consume an invoice'
);
select is(
  (select status::text from public.invoices
    where id = '7b000000-0000-0000-0000-000000000001'),
  'submitted',
  'failed premature consumption preserves submitted invoice state'
);

select throws_ok(
  $$update public.payment_intents
    set status = 'confirmed', transaction_hash = repeat('4', 64),
        confirmed_ledger = 101, contract_id = 'C' || repeat('F', 55),
        contract_event_index = 0, confirmed_at = now()
    where id = '7c000000-0000-0000-0000-000000000001'$$,
  '23514',
  'confirmed payment_intents requires matching immutable ledger evidence',
  'raw transaction identifiers cannot confirm a payment without observed evidence'
);

insert into public.ledger_transactions (
  id, organization_id, program_id, financial_intent_id,
  transaction_hash, envelope_xdr, envelope_sha256,
  ledger_sequence, ledger_closed_at, successful, result_code,
  result_xdr, correlation_id
)
values (
  '7c100000-0000-0000-0000-000000000001',
  '72000000-0000-0000-0000-000000000001',
  '75000000-0000-0000-0000-000000000001',
  '7b200000-0000-0000-0000-000000000001',
  repeat('4', 64), 'AAAA-payment-envelope', repeat('9', 64),
  101, now(), true, 'tx_success', 'AAAA-payment-result',
  '7d000000-0000-0000-0000-000000000001'
);
insert into public.contract_events (
  id, organization_id, program_id, ledger_transaction_id,
  transaction_hash, contract_id, ledger_sequence, event_index,
  event_type, event_topics, event_payload, event_xdr, event_sha256,
  correlation_id
)
values (
  '7c200000-0000-0000-0000-000000000001',
  '72000000-0000-0000-0000-000000000001',
  '75000000-0000-0000-0000-000000000001',
  '7c100000-0000-0000-0000-000000000001',
  repeat('4', 64), 'C' || repeat('F', 55), 101, 0,
  'redeemed', '["redeemed"]'::jsonb, '{"amount_stroops":"500"}'::jsonb,
  'AAAA-redeemed-event', repeat('a', 64),
  '7d000000-0000-0000-0000-000000000001'
);

update public.payment_intents
set status = 'confirmed', transaction_hash = repeat('4', 64),
    confirmed_ledger = 101, contract_id = 'C' || repeat('F', 55),
    contract_event_index = 0,
    ledger_transaction_id = '7c100000-0000-0000-0000-000000000001',
    contract_event_id = '7c200000-0000-0000-0000-000000000001',
    confirmed_at = now()
where id = '7c000000-0000-0000-0000-000000000001';
select is(
  (select status::text from public.invoices
    where id = '7b000000-0000-0000-0000-000000000001'),
  'consumed',
  'reconciled confirmation consumes the invoice exactly once'
);
select is(
  (select consumed_by_payment_intent_id::text from public.invoices
    where id = '7b000000-0000-0000-0000-000000000001'),
  '7c000000-0000-0000-0000-000000000001',
  'consumed invoice retains its confirmed payment link'
);

insert into public.voucher_redemptions (
  id, organization_id, payment_intent_id, invoice_id, program_id,
  beneficiary_identity_id, merchant_id, amount_stroops, contract_id,
  transaction_hash, ledger, contract_event_index,
  ledger_transaction_id, contract_event_id, status,
  correlation_id, confirmed_at
)
values (
  '7e000000-0000-0000-0000-000000000001',
  '72000000-0000-0000-0000-000000000001',
  '7c000000-0000-0000-0000-000000000001',
  '7b000000-0000-0000-0000-000000000001',
  '75000000-0000-0000-0000-000000000001',
  (select id from public.beneficiary_identities
    where user_id = '71000000-0000-0000-0000-000000000002'),
  '73000000-0000-0000-0000-000000000001', 500,
  'C' || repeat('F', 55), repeat('4', 64), 101, 0,
  '7c100000-0000-0000-0000-000000000001',
  '7c200000-0000-0000-0000-000000000001', 'confirmed',
  '7f000000-0000-0000-0000-000000000001', now()
);
insert into public.settlements (
  id, organization_id, payment_intent_id, voucher_redemption_id,
  program_id, merchant_id, settlement_wallet_id, kind, amount_stroops,
  transaction_hash, ledger, contract_id, contract_event_index,
  ledger_transaction_id, contract_event_id,
  status, correlation_id, confirmed_at
)
values (
  '80000000-0000-0000-0000-000000000001',
  '72000000-0000-0000-0000-000000000001',
  '7c000000-0000-0000-0000-000000000001',
  '7e000000-0000-0000-0000-000000000001',
  '75000000-0000-0000-0000-000000000001',
  '73000000-0000-0000-0000-000000000001',
  '74000000-0000-0000-0000-000000000003',
  'voucher_redemption', 500, repeat('4', 64), 101,
  'C' || repeat('F', 55), 0,
  '7c100000-0000-0000-0000-000000000001',
  '7c200000-0000-0000-0000-000000000001', 'confirmed',
  '81000000-0000-0000-0000-000000000001', now()
);
select ok(
  exists (
    select 1 from public.voucher_redemptions redemption
    join public.settlements settlement
      on settlement.voucher_redemption_id = redemption.id
    where redemption.id = '7e000000-0000-0000-0000-000000000001'
      and settlement.id = '80000000-0000-0000-0000-000000000001'
      and redemption.payment_intent_id = settlement.payment_intent_id
      and redemption.ledger_transaction_id = settlement.ledger_transaction_id
      and redemption.contract_event_id = settlement.contract_event_id
  ),
  'redemption and settlement are distinct domain events linked to the same immutable evidence'
);

insert into public.refunds (
  id, organization_id, original_payment_intent_id, original_settlement_id,
  voucher_redemption_id, program_id, beneficiary_identity_id, merchant_id,
  amount_stroops, returns_to_entitlement, refund_nonce, contract_id, correlation_id
)
values (
  '82000000-0000-0000-0000-000000000001',
  '72000000-0000-0000-0000-000000000001',
  '7c000000-0000-0000-0000-000000000001',
  '80000000-0000-0000-0000-000000000001',
  '7e000000-0000-0000-0000-000000000001',
  '75000000-0000-0000-0000-000000000001',
  (select id from public.beneficiary_identities
    where user_id = '71000000-0000-0000-0000-000000000002'),
  '73000000-0000-0000-0000-000000000001',
  200, true, repeat('5', 64), 'C' || repeat('F', 55),
  '83000000-0000-0000-0000-000000000001'
);
select throws_ok(
  $$insert into public.refunds (
      organization_id, original_payment_intent_id, original_settlement_id,
      voucher_redemption_id, program_id, beneficiary_identity_id, merchant_id,
      amount_stroops, returns_to_entitlement, refund_nonce, contract_id,
      correlation_id
    ) values (
      '72000000-0000-0000-0000-000000000001',
      '7c000000-0000-0000-0000-000000000001',
      '80000000-0000-0000-0000-000000000001',
      '7e000000-0000-0000-0000-000000000001',
      '75000000-0000-0000-0000-000000000001',
      (select id from public.beneficiary_identities
        where user_id = '71000000-0000-0000-0000-000000000002'),
      '73000000-0000-0000-0000-000000000001',
      301, true, repeat('6', 64), 'C' || repeat('F', 55),
      '83000000-0000-0000-0000-000000000002'
    )$$,
  '23514',
  'cumulative refunds cannot exceed original payment amount',
  'cumulative refunds cannot exceed the confirmed original amount'
);
select is(
  (select sum(amount_stroops)::bigint from public.refunds
    where original_payment_intent_id = '7c000000-0000-0000-0000-000000000001'),
  200::bigint,
  'rejected excess refund preserves existing refund value'
);

update public.programs set status = 'closed'
where id = '75000000-0000-0000-0000-000000000001';
insert into public.refunds (
  id, organization_id, original_payment_intent_id, original_settlement_id,
  voucher_redemption_id, program_id, beneficiary_identity_id, merchant_id,
  amount_stroops, returns_to_entitlement, refund_nonce, contract_id, correlation_id
)
values (
  '82000000-0000-0000-0000-000000000002',
  '72000000-0000-0000-0000-000000000001',
  '7c000000-0000-0000-0000-000000000001',
  '80000000-0000-0000-0000-000000000001',
  '7e000000-0000-0000-0000-000000000001',
  '75000000-0000-0000-0000-000000000001',
  (select id from public.beneficiary_identities
    where user_id = '71000000-0000-0000-0000-000000000002'),
  '73000000-0000-0000-0000-000000000001',
  400, true, repeat('7', 64), 'C' || repeat('F', 55),
  '83000000-0000-0000-0000-000000000003'
);
select is(
  (select status::text from public.refunds
    where id = '82000000-0000-0000-0000-000000000002'),
  'exception_required',
  'refund after program closure is routed to exception workflow'
);

insert into public.disputes (
  id, organization_id, payment_intent_id, settlement_id,
  opened_by, reason, correlation_id
)
values (
  '84000000-0000-0000-0000-000000000001',
  '72000000-0000-0000-0000-000000000001',
  '7c000000-0000-0000-0000-000000000001',
  '80000000-0000-0000-0000-000000000001',
  '71000000-0000-0000-0000-000000000002',
  'Goods were not delivered',
  '85000000-0000-0000-0000-000000000001'
);
insert into public.dispute_evidence (
  id, dispute_id, submitted_by, evidence_kind, content_digest, metadata
)
values (
  '86000000-0000-0000-0000-000000000001',
  '84000000-0000-0000-0000-000000000001',
  '71000000-0000-0000-0000-000000000002',
  'receipt', repeat('8', 64), '{"content":"off-chain"}'::jsonb
);
select throws_ok(
  $$delete from public.dispute_evidence
    where id = '86000000-0000-0000-0000-000000000001'$$,
  '23514', 'dispute evidence is append-only',
  'dispute evidence cannot be deleted'
);

insert into public.cashout_requests (
  id, organization_id, merchant_id, settlement_wallet_id,
  amount_stroops, correlation_id, requested_by
)
values (
  '87000000-0000-0000-0000-000000000001',
  '72000000-0000-0000-0000-000000000001',
  '73000000-0000-0000-0000-000000000001',
  '74000000-0000-0000-0000-000000000003',
  300, '88000000-0000-0000-0000-000000000001',
  '71000000-0000-0000-0000-000000000003'
);
update public.cashout_requests set status = 'processing'
where id = '87000000-0000-0000-0000-000000000001';
update public.cashout_requests
set status = 'failed', failure_code = 'SIMULATED_PARTNER_UNAVAILABLE'
where id = '87000000-0000-0000-0000-000000000001';
select is(
  (select status::text || '|' || is_simulated::text
    from public.cashout_requests
    where id = '87000000-0000-0000-0000-000000000001'),
  'failed|true',
  'failed cash-out remains explicitly simulated and independent'
);
select is(
  (select status::text from public.settlements
    where id = '80000000-0000-0000-0000-000000000001'),
  'confirmed',
  'failed cash-out does not reverse confirmed on-chain settlement'
);
select throws_ok(
  $$delete from public.settlements
    where id = '80000000-0000-0000-0000-000000000001'$$,
  '23514', 'financial workflow history cannot be deleted',
  'confirmed settlement history cannot be deleted'
);

select * from finish();
rollback;
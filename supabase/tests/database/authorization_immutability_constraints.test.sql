-- Task 3.4 - Extend database authorization, immutability, and financial-constraint tests.
--
-- This integrative suite complements the per-migration suites by exercising the
-- complete authorization surface in a single fixture and by proving the
-- cross-cutting safety invariant demanded by Requirements 23.7 and 23.8: every
-- safety-critical denial must conserve value and must never create a duplicate
-- settlement. It is discovered and executed by the non-interactive validation
-- runner through `supabase test db` (Task 3.3).
--
-- Coverage map:
--   Fixture 1  Membership-role matrix, beneficiary/merchant access, anonymous
--              transparency access, MFA denial, legal state transitions, and
--              append-only enforcement.
--   Fixture 2  Enrollment-before-allocation and no-duplicate-settlement, built
--              on a confirmed voucher settlement.
--
-- Validates: Requirements 2.5, 4.5, 5.6, 15.1, 19.7, 20.1, 23.7, 23.8

begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

-- ============================================================================
-- Fixture 1: organization authorization, MFA, state transitions, append-only.
-- ============================================================================

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('a1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ac-admin@example.test', '', now(),
   '{"provider":"email","providers":["email"]}', '{"role":"lgu"}', now(), now()),
  ('a1000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ac-manager@example.test', '', now(),
   '{"provider":"email","providers":["email"]}', '{"role":"lgu"}', now(), now()),
  ('a1000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ac-verifier@example.test', '', now(),
   '{"provider":"email","providers":["email"]}', '{"role":"lgu"}', now(), now()),
  ('a1000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ac-finance@example.test', '', now(),
   '{"provider":"email","providers":["email"]}', '{"role":"lgu"}', now(), now()),
  ('a1000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ac-auditor@example.test', '', now(),
   '{"provider":"email","providers":["email"]}', '{"role":"lgu"}', now(), now()),
  ('a1000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ac-beneficiary@example.test', '', now(),
   '{"provider":"email","providers":["email"]}', '{"role":"beneficiary"}', now(), now()),
  ('a1000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ac-merchant@example.test', '', now(),
   '{"provider":"email","providers":["email"]}', '{"role":"merchant","full_name":"AC Merchant"}', now(), now()),
  ('a1000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ac-outsider@example.test', '', now(),
   '{"provider":"email","providers":["email"]}', '{"role":"lgu"}', now(), now());

insert into public.organizations (id, name, slug)
values
  ('a2000000-0000-0000-0000-000000000001', 'Authz Coverage Organization', 'authz-coverage'),
  ('a2000000-0000-0000-0000-000000000002', 'Authz Outsider Organization', 'authz-outsider');

-- One user per required membership role in the same organization (Req 2.3, 2.6).
select public.upsert_organization_membership(
  'a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
  'organization_administrator', 'a1000000-0000-0000-0000-000000000001');
select public.upsert_organization_membership(
  'a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002',
  'program_manager', 'a1000000-0000-0000-0000-000000000001');
select public.upsert_organization_membership(
  'a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000003',
  'beneficiary_verifier', 'a1000000-0000-0000-0000-000000000001');
select public.upsert_organization_membership(
  'a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000004',
  'finance_approver', 'a1000000-0000-0000-0000-000000000001');
select public.upsert_organization_membership(
  'a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000005',
  'auditor', 'a1000000-0000-0000-0000-000000000001');
select public.upsert_organization_membership(
  'a2000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000008',
  'organization_administrator', 'a1000000-0000-0000-0000-000000000008');

-- A draft program (reused for the MFA denial), a second program for the legal
-- state-transition checks, one approved enrollment, and one redemption.
insert into public.programs (id, organization_id, name, status, created_by)
values
  ('a3000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001',
   'Authz MFA Program', 'draft', 'a1000000-0000-0000-0000-000000000001'),
  ('a3000000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000001',
   'Authz State Program', 'draft', 'a1000000-0000-0000-0000-000000000001');

insert into public.enrollments (
  id, beneficiary_id, beneficiary_identity_id, program_id, approval_status, category
)
values (
  'a5000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000006',
  (select id from public.beneficiary_identities
    where user_id = 'a1000000-0000-0000-0000-000000000006'),
  'a3000000-0000-0000-0000-000000000001', 'Approved', 'Food'
);
insert into public.redemptions (id, enrollment_id, beneficiary_id, amount, status)
values (
  'a6000000-0000-0000-0000-000000000001',
  'a5000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000006', 100, 'Completed'
);

insert into public.wallets (
  id, owner_type, owner_id, purpose, address,
  verification_status, proof_challenge_digest,
  proof_challenge_issued_at, proof_challenge_expires_at,
  proof_signature_digest, verified_at, verified_by, is_active
)
values (
  'a4000000-0000-0000-0000-000000000001', 'beneficiary_identity',
  (select id from public.beneficiary_identities
    where user_id = 'a1000000-0000-0000-0000-000000000006'),
  'beneficiary', 'G' || repeat('A', 55),
  'verified', repeat('a', 64), now(), now() + interval '5 minutes',
  repeat('b', 64), now(), 'a1000000-0000-0000-0000-000000000001', true
);

-- Seed one audit event so audit-read authorization can be differentiated.
select public.append_audit_event(
  'a2000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001',
  'authz.coverage.seed',
  'a7000000-0000-0000-0000-000000000001',
  false, '{}'::jsonb
);

-- ---------------------------------------------------------------------------
-- Every membership role can read organization-scoped program data (Req 2.5).
-- Validates: Requirements 2.5, 23.7
-- ---------------------------------------------------------------------------
set local role authenticated;

select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000001', true);
select is((select count(*)::integer from public.programs), 2,
  'organization_administrator reads organization programs');
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000002', true);
select is((select count(*)::integer from public.programs), 2,
  'program_manager reads organization programs');
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000003', true);
select is((select count(*)::integer from public.programs), 2,
  'beneficiary_verifier reads organization programs');
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000004', true);
select is((select count(*)::integer from public.programs), 2,
  'finance_approver reads organization programs');
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000005', true);
select is((select count(*)::integer from public.programs), 2,
  'auditor reads organization programs');

-- Audit history is readable only by the administrator and auditor roles.
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000001', true);
select is((select count(*)::integer from public.audit_events), 2,
  'organization_administrator can read organization audit history');
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000005', true);
select is((select count(*)::integer from public.audit_events), 2,
  'auditor can read organization audit history');
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000002', true);
select is((select count(*)::integer from public.audit_events), 0,
  'program_manager cannot read audit history');
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000003', true);
select is((select count(*)::integer from public.audit_events), 0,
  'beneficiary_verifier cannot read audit history');
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000004', true);
select is((select count(*)::integer from public.audit_events), 0,
  'finance_approver cannot read audit history');

-- No membership role can delete confirmed financial history, and every denial
-- conserves the redemption record (Req 15.1, 23.8). The most and least
-- privileged roles both hit the revoked table privilege.
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$delete from public.redemptions
    where id = 'a6000000-0000-0000-0000-000000000001'$$,
  '42501', 'permission denied for table redemptions',
  'organization_administrator cannot delete confirmed redemption history');
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000005', true);
select throws_ok(
  $$delete from public.redemptions
    where id = 'a6000000-0000-0000-0000-000000000001'$$,
  '42501', 'permission denied for table redemptions',
  'auditor cannot delete confirmed redemption history');
reset role;
select is(
  (select count(*)::integer from public.redemptions
    where id = 'a6000000-0000-0000-0000-000000000001'),
  1,
  'denied client deletions conserve confirmed redemption history');

-- Cross-organization access is denied and cannot mutate another tenant (Req 2.5).
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000008', true);
select is((select count(*)::integer from public.programs), 0,
  'an outsider organization administrator cannot read another tenant''s programs');
select is((select count(*)::integer from public.audit_events), 0,
  'an outsider organization administrator cannot read another tenant''s audit history');
select is(
  (
    with changed as (
      update public.programs set name = 'Hijacked'
      where id = 'a3000000-0000-0000-0000-000000000001'
      returning 1
    )
    select count(*)::integer from changed
  ),
  0,
  'an outsider organization administrator cannot mutate another tenant''s program');
reset role;
select is(
  (select name from public.programs
    where id = 'a3000000-0000-0000-0000-000000000001'),
  'Authz MFA Program',
  'the denied cross-organization update conserves the program record');

-- ---------------------------------------------------------------------------
-- Beneficiary and merchant participant access is scoped (Req 2.5).
-- Validates: Requirements 2.5, 23.7
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000006', true);
select is((select count(*)::integer from public.enrollments), 1,
  'a beneficiary reads only their own enrollment');
select is((select count(*)::integer from public.redemptions), 1,
  'a beneficiary reads only their own redemption');
select is((select count(*)::integer from public.wallets), 1,
  'a beneficiary reads only their own wallet binding');
select is((select count(*)::integer from public.programs), 1,
  'a beneficiary reads only the program they participate in');
select is((select count(*)::integer from public.audit_events), 0,
  'a beneficiary cannot read organization audit history');

select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000007', true);
select is((select count(*)::integer from public.programs), 0,
  'a merchant cannot read organization program internals');
select is((select count(*)::integer from public.enrollments), 0,
  'a merchant cannot read organization enrollments');
select is((select count(*)::integer from public.audit_events), 0,
  'a merchant cannot read organization audit history');
reset role;

-- ---------------------------------------------------------------------------
-- Anonymous transparency access exposes only the redacted public aggregate.
-- Validates: Requirements 19.7, 23.7
-- ---------------------------------------------------------------------------
select ok(
  has_table_privilege('anon', 'public.public_financial_transparency', 'SELECT'),
  'anonymous readers are granted the redacted public transparency view');
select ok(
  not has_table_privilege('anon', 'public.beneficiary_balance_projection', 'SELECT'),
  'anonymous readers cannot reach private beneficiary projections');
select ok(
  not has_table_privilege('anon', 'public.program_financial_projection', 'SELECT'),
  'anonymous readers cannot reach private program projections');

set local role anon;
select is((select count(*)::integer from public.programs), 0,
  'anonymous readers cannot read private program rows');
select is((select count(*)::integer from public.public_financial_transparency), 0,
  'anonymous readers see no unreconciled public aggregates in this fixture');
reset role;

-- ---------------------------------------------------------------------------
-- MFA denial conserves state (Req 20.1). An AAL1 session cannot activate a
-- program even for the organization administrator.
-- Validates: Requirements 20.1, 23.8
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000001', true);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', 'a1000000-0000-0000-0000-000000000001',
    'role', 'authenticated', 'aal', 'aal1',
    'amr', jsonb_build_array(jsonb_build_object(
      'method', 'password', 'timestamp', extract(epoch from now())::bigint))
  )::text,
  true
);
select throws_ok(
  $$update public.programs set status = 'active'
    where id = 'a3000000-0000-0000-0000-000000000001'$$,
  '42501',
  'new row violates row-level security policy for table "programs"',
  'an AAL1 session cannot activate a program');
reset role;
select is(
  (select status::text from public.programs
    where id = 'a3000000-0000-0000-0000-000000000001'),
  'draft',
  'the denied AAL1 activation conserves the draft program state');

-- ---------------------------------------------------------------------------
-- Legal state transitions and activation-failure conservation (Req 5.6).
-- A draft may enter funding, but activation without complete on-chain funding
-- evidence is rejected and creates no spendable entitlement.
-- Validates: Requirements 5.6, 23.8
-- ---------------------------------------------------------------------------
select lives_ok(
  $$update public.programs
    set status = 'funding', funding_status = 'reserving'
    where id = 'a3000000-0000-0000-0000-000000000002'$$,
  'a draft program can legally enter funding reservation');
select throws_ok(
  $$update public.programs set status = 'active'
    where id = 'a3000000-0000-0000-0000-000000000002'$$,
  '23514',
  'activation requires complete full-budget on-chain funding evidence',
  'activation without confirmed full-budget funding is rejected');
select is(
  (select status::text from public.programs
    where id = 'a3000000-0000-0000-0000-000000000002'),
  'funding',
  'the failed activation leaves the program inactive with no spendable entitlement');

-- ---------------------------------------------------------------------------
-- Append-only enforcement of audit history (Req 15.1, 20.1).
-- Validates: Requirements 15.1, 23.8
-- ---------------------------------------------------------------------------
select throws_ok(
  $$update public.audit_events set action = 'tampered'
    where correlation_id = 'a7000000-0000-0000-0000-000000000001'$$,
  '55000', 'audit events are append-only',
  'audit history cannot be updated');
select throws_ok(
  $$delete from public.audit_events
    where correlation_id = 'a7000000-0000-0000-0000-000000000001'$$,
  '55000', 'audit events are append-only',
  'audit history cannot be deleted');
select is((select count(*)::integer from public.audit_events), 2,
  'denied audit mutations conserve the immutable audit records');

-- ============================================================================
-- Fixture 2: enrollment-before-allocation and no-duplicate-settlement.
-- Built on a confirmed voucher settlement so the safety-critical duplicate and
-- authorization denials can be exercised against real settled value.
-- ============================================================================

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('b1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'set-admin@example.test', '', now(),
   '{"provider":"email","providers":["email"]}', '{"role":"lgu"}', now(), now()),
  ('b1000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'set-beneficiary@example.test', '', now(),
   '{"provider":"email","providers":["email"]}', '{"role":"beneficiary"}', now(), now()),
  ('b1000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'set-merchant@example.test', '', now(),
   '{"provider":"email","providers":["email"]}', '{"role":"merchant","full_name":"Settlement Merchant"}', now(), now());

insert into public.organizations (id, name, slug)
values ('b2000000-0000-0000-0000-000000000001', 'Settlement Organization', 'settlement-organization');
select public.upsert_organization_membership(
  'b2000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001',
  'organization_administrator', 'b1000000-0000-0000-0000-000000000001');

insert into public.merchant_entities (id, profile_id, display_name)
values ('b3000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000003', 'Settlement Merchant');

insert into public.wallets (
  id, owner_type, owner_id, purpose, address,
  verification_status, proof_challenge_digest,
  proof_challenge_issued_at, proof_challenge_expires_at,
  proof_signature_digest, verified_at, verified_by, is_active
)
values
  ('b4000000-0000-0000-0000-000000000001', 'organization', 'b2000000-0000-0000-0000-000000000001',
   'organization_treasury', 'G' || repeat('A', 55),
   'verified', repeat('a', 64), now(), now() + interval '5 minutes',
   repeat('b', 64), now(), 'b1000000-0000-0000-0000-000000000001', true),
  ('b4000000-0000-0000-0000-000000000002', 'beneficiary_identity',
   (select id from public.beneficiary_identities where user_id = 'b1000000-0000-0000-0000-000000000002'),
   'beneficiary', 'G' || repeat('B', 55),
   'verified', repeat('c', 64), now(), now() + interval '5 minutes',
   repeat('d', 64), now(), 'b1000000-0000-0000-0000-000000000001', true),
  ('b4000000-0000-0000-0000-000000000003', 'merchant_entity', 'b3000000-0000-0000-0000-000000000001',
   'merchant_settlement', 'G' || repeat('C', 55),
   'verified', repeat('e', 64), now(), now() + interval '5 minutes',
   repeat('f', 64), now(), 'b1000000-0000-0000-0000-000000000001', true);

insert into public.merchant_accreditations (
  organization_id, merchant_id, category, status,
  valid_from, valid_until, approved_by, approved_at
)
values (
  'b2000000-0000-0000-0000-000000000001', 'b3000000-0000-0000-0000-000000000001',
  'Food', 'active', now() - interval '1 day', now() + interval '1 year',
  'b1000000-0000-0000-0000-000000000001', now()
);

insert into public.programs (
  id, organization_id, name, status, aid_type,
  budget_stroops, asset_code, asset_issuer, asset_sac_address,
  treasury_wallet_id, voucher_contract_address,
  allocation_rules, per_beneficiary_limit_stroops,
  per_transaction_limit_stroops, daily_limit_stroops,
  expiry_policy, policy_expires_at, refund_policy, refund_window_ends_at,
  policy_version, contract_version, created_by
)
values (
  'b5000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001',
  'Settlement Voucher Program', 'draft', 'voucher',
  1000, 'RCPHP', 'G' || repeat('D', 55), 'C' || repeat('E', 55),
  'b4000000-0000-0000-0000-000000000001', 'C' || repeat('F', 55),
  '{"strategy":"variable","allowed_categories":["Food"]}'::jsonb,
  1000, 600, 800,
  'fixed', now() + interval '30 days', 'return_to_entitlement', now() + interval '60 days',
  1, 1, 'b1000000-0000-0000-0000-000000000001'
);
update public.programs
set status = 'funding', funding_status = 'reserving'
where id = 'b5000000-0000-0000-0000-000000000001';
update public.programs
set funding_status = 'funded', funded_budget_stroops = budget_stroops,
    funding_transaction_hash = repeat('0', 64), funding_ledger = 100, funded_at = now(),
    activation_correlation_id = 'b6000000-0000-0000-0000-000000000001',
    activated_by = 'b1000000-0000-0000-0000-000000000001', status = 'active'
where id = 'b5000000-0000-0000-0000-000000000001';

insert into public.program_merchants (
  id, program_id, merchant_id, category, correlation_id, authorized_by
)
values (
  'b9000000-0000-0000-0000-000000000001', 'b5000000-0000-0000-0000-000000000001',
  'b3000000-0000-0000-0000-000000000001', 'Food',
  'ba000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001'
);

-- Enrollment begins Pending: no approved allocation yet exists (Req 4.5).
insert into public.enrollments (
  id, beneficiary_id, beneficiary_identity_id, program_id, approval_status, category
)
values (
  'b7000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002',
  (select id from public.beneficiary_identities where user_id = 'b1000000-0000-0000-0000-000000000002'),
  'b5000000-0000-0000-0000-000000000001', 'Pending', 'Food'
);

insert into public.invoices (
  id, organization_id, merchant_id, program_id, settlement_wallet_id,
  kind, asset_code, asset_issuer, asset_sac_address,
  voucher_contract_address, settlement_address, invoice_signer_address,
  amount_stroops, category, nonce, canonical_payload, payload_hash,
  merchant_signature, issued_at, expires_at
)
select
  'bb000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001',
  'b3000000-0000-0000-0000-000000000001', 'b5000000-0000-0000-0000-000000000001',
  'b4000000-0000-0000-0000-000000000003',
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
  'bc000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001',
  'b5000000-0000-0000-0000-000000000001', 'payment.invoice', 'settlement-payment-1',
  repeat('3', 64), 'voucher_redemption', 'bd100000-0000-0000-0000-000000000001'
);
insert into public.financial_intents (
  id, organization_id, program_id, beneficiary_identity_id,
  idempotency_key_id, operation_type, amount_stroops,
  asset_code, asset_issuer, payload_hash, correlation_id, requested_by
)
values (
  'bd000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001',
  'b5000000-0000-0000-0000-000000000001',
  (select id from public.beneficiary_identities where user_id = 'b1000000-0000-0000-0000-000000000002'),
  'bc000000-0000-0000-0000-000000000001', 'voucher_redemption', 500,
  'RCPHP', 'G' || repeat('D', 55), repeat('3', 64),
  'bd100000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002'
);

-- ---------------------------------------------------------------------------
-- Enrollment-before-allocation: a voucher payment cannot allocate value to a
-- beneficiary whose enrollment is not yet approved (Req 4.5). The denial
-- conserves value: no payment intent is created.
-- Validates: Requirements 4.5, 23.8
-- ---------------------------------------------------------------------------
select throws_ok(
  $$insert into public.payment_intents (
      id, financial_intent_id, organization_id, invoice_id, program_id,
      beneficiary_identity_id, beneficiary_wallet_id, merchant_id,
      settlement_wallet_id, enrollment_id, funding_source, amount_stroops,
      idempotency_key, payload_hash, correlation_id
    ) values (
      'be000000-0000-0000-0000-000000000001',
      'bd000000-0000-0000-0000-000000000001',
      'b2000000-0000-0000-0000-000000000001',
      'bb000000-0000-0000-0000-000000000001',
      'b5000000-0000-0000-0000-000000000001',
      (select id from public.beneficiary_identities where user_id = 'b1000000-0000-0000-0000-000000000002'),
      'b4000000-0000-0000-0000-000000000002',
      'b3000000-0000-0000-0000-000000000001',
      'b4000000-0000-0000-0000-000000000003',
      'b7000000-0000-0000-0000-000000000001',
      'voucher', 500, 'settlement-payment-1', repeat('3', 64),
      'bd100000-0000-0000-0000-000000000001'
    )$$,
  '23514',
  'voucher payment requires the approved beneficiary enrollment',
  'a voucher payment cannot allocate to an unapproved enrollment');
select is((select count(*)::integer from public.payment_intents), 0,
  'the denied unapproved allocation creates no payment intent');

-- Approve the enrollment within the funded budget, then value can flow.
update public.enrollments
set approval_status = 'Approved', allocation_amount_stroops = 500,
    allocation_correlation_id = 'b8000000-0000-0000-0000-000000000001',
    approved_by = 'b1000000-0000-0000-0000-000000000001'
where id = 'b7000000-0000-0000-0000-000000000001';

insert into public.payment_intents (
  id, financial_intent_id, organization_id, invoice_id, program_id,
  beneficiary_identity_id, beneficiary_wallet_id, merchant_id,
  settlement_wallet_id, enrollment_id, funding_source, amount_stroops,
  idempotency_key, payload_hash, correlation_id
)
values (
  'be000000-0000-0000-0000-000000000001', 'bd000000-0000-0000-0000-000000000001',
  'b2000000-0000-0000-0000-000000000001', 'bb000000-0000-0000-0000-000000000001',
  'b5000000-0000-0000-0000-000000000001',
  (select id from public.beneficiary_identities where user_id = 'b1000000-0000-0000-0000-000000000002'),
  'b4000000-0000-0000-0000-000000000002', 'b3000000-0000-0000-0000-000000000001',
  'b4000000-0000-0000-0000-000000000003', 'b7000000-0000-0000-0000-000000000001',
  'voucher', 500, 'settlement-payment-1', repeat('3', 64),
  'bd100000-0000-0000-0000-000000000001'
);
select is((select count(*)::integer from public.payment_intents), 1,
  'an approved enrollment permits exactly one payment intent');

update public.payment_intents set status = 'prepared' where id = 'be000000-0000-0000-0000-000000000001';
update public.payment_intents set status = 'signed' where id = 'be000000-0000-0000-0000-000000000001';
update public.payment_intents set status = 'submitted', submitted_at = now()
where id = 'be000000-0000-0000-0000-000000000001';

insert into public.ledger_transactions (
  id, organization_id, program_id, financial_intent_id,
  transaction_hash, envelope_xdr, envelope_sha256,
  ledger_sequence, ledger_closed_at, successful, result_code,
  result_xdr, correlation_id
)
values (
  'bf000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001',
  'b5000000-0000-0000-0000-000000000001', 'bd000000-0000-0000-0000-000000000001',
  repeat('4', 64), 'AAAA-settlement-envelope', repeat('9', 64),
  101, now(), true, 'tx_success', 'AAAA-settlement-result',
  'bd100000-0000-0000-0000-000000000001'
);
insert into public.contract_events (
  id, organization_id, program_id, ledger_transaction_id,
  transaction_hash, contract_id, ledger_sequence, event_index,
  event_type, event_topics, event_payload, event_xdr, event_sha256, correlation_id
)
values (
  'c0000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001',
  'b5000000-0000-0000-0000-000000000001', 'bf000000-0000-0000-0000-000000000001',
  repeat('4', 64), 'C' || repeat('F', 55), 101, 0,
  'redeemed', '["redeemed"]'::jsonb, '{"amount_stroops":"500"}'::jsonb,
  'AAAA-redeemed-event', repeat('a', 64), 'bd100000-0000-0000-0000-000000000001'
);

update public.payment_intents
set status = 'confirmed', transaction_hash = repeat('4', 64),
    confirmed_ledger = 101, contract_id = 'C' || repeat('F', 55),
    contract_event_index = 0,
    ledger_transaction_id = 'bf000000-0000-0000-0000-000000000001',
    contract_event_id = 'c0000000-0000-0000-0000-000000000001', confirmed_at = now()
where id = 'be000000-0000-0000-0000-000000000001';

insert into public.voucher_redemptions (
  id, organization_id, payment_intent_id, invoice_id, program_id,
  beneficiary_identity_id, merchant_id, amount_stroops, contract_id,
  transaction_hash, ledger, contract_event_index,
  ledger_transaction_id, contract_event_id, status, correlation_id, confirmed_at
)
values (
  'c1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001',
  'be000000-0000-0000-0000-000000000001', 'bb000000-0000-0000-0000-000000000001',
  'b5000000-0000-0000-0000-000000000001',
  (select id from public.beneficiary_identities where user_id = 'b1000000-0000-0000-0000-000000000002'),
  'b3000000-0000-0000-0000-000000000001', 500, 'C' || repeat('F', 55),
  repeat('4', 64), 101, 0,
  'bf000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
  'confirmed', 'c8000000-0000-0000-0000-000000000001', now()
);
insert into public.settlements (
  id, organization_id, payment_intent_id, voucher_redemption_id, program_id,
  merchant_id, settlement_wallet_id, kind, amount_stroops,
  transaction_hash, ledger, contract_id, contract_event_index,
  ledger_transaction_id, contract_event_id, status, correlation_id, confirmed_at
)
values (
  'c2000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001',
  'be000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001',
  'b5000000-0000-0000-0000-000000000001', 'b3000000-0000-0000-0000-000000000001',
  'b4000000-0000-0000-0000-000000000003', 'voucher_redemption', 500,
  repeat('4', 64), 101, 'C' || repeat('F', 55), 0,
  'bf000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
  'confirmed', 'c9000000-0000-0000-0000-000000000001', now()
);
select is((select count(*)::integer from public.settlements), 1,
  'the confirmed voucher payment produces exactly one settlement');

-- ---------------------------------------------------------------------------
-- No duplicate settlement: the database guarantees at most one value movement
-- and one confirmed projection per logical operation (Req 23.8, 15.1).
-- Validates: Requirements 15.1, 23.8
-- ---------------------------------------------------------------------------
select col_is_unique('public', 'invoices', ARRAY['merchant_id', 'nonce'],
  'a merchant invoice nonce is unique');
select col_is_unique('public', 'payment_intents', ARRAY['organization_id', 'idempotency_key'],
  'a payment intent business key is unique per organization');
select col_is_unique('public', 'payment_intents', 'financial_intent_id',
  'a financial intent maps to at most one payment intent');
select col_is_unique('public', 'voucher_redemptions', 'payment_intent_id',
  'a payment intent settles at most one voucher redemption');
select col_is_unique('public', 'settlements', 'payment_intent_id',
  'a payment intent produces at most one settlement');
select col_is_unique('public', 'refunds', ARRAY['original_payment_intent_id', 'refund_nonce'],
  'a refund nonce is unique per original payment');

-- A replayed settlement for the same confirmed payment is rejected and the
-- single existing settlement is conserved.
select throws_ok(
  $$insert into public.settlements (
      organization_id, payment_intent_id, voucher_redemption_id, program_id,
      merchant_id, settlement_wallet_id, kind, amount_stroops,
      transaction_hash, ledger, contract_id, contract_event_index,
      ledger_transaction_id, contract_event_id, status, correlation_id, confirmed_at
    ) values (
      'b2000000-0000-0000-0000-000000000001',
      'be000000-0000-0000-0000-000000000001',
      'c1000000-0000-0000-0000-000000000001',
      'b5000000-0000-0000-0000-000000000001',
      'b3000000-0000-0000-0000-000000000001',
      'b4000000-0000-0000-0000-000000000003', 'voucher_redemption', 500,
      repeat('4', 64), 101, 'C' || repeat('F', 55), 0,
      'bf000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
      'confirmed', 'ca000000-0000-0000-0000-000000000001', now()
    )$$,
  '23505', null,
  'a replayed settlement for the same payment is rejected');
select is((select count(*)::integer from public.settlements), 1,
  'the rejected duplicate settlement conserves the single confirmed settlement');

-- A replayed redemption for the same confirmed payment is rejected.
select throws_ok(
  $$insert into public.voucher_redemptions (
      organization_id, payment_intent_id, invoice_id, program_id,
      beneficiary_identity_id, merchant_id, amount_stroops, contract_id,
      transaction_hash, ledger, contract_event_index,
      ledger_transaction_id, contract_event_id, status, correlation_id, confirmed_at
    ) values (
      'b2000000-0000-0000-0000-000000000001',
      'be000000-0000-0000-0000-000000000001',
      'bb000000-0000-0000-0000-000000000001',
      'b5000000-0000-0000-0000-000000000001',
      (select id from public.beneficiary_identities where user_id = 'b1000000-0000-0000-0000-000000000002'),
      'b3000000-0000-0000-0000-000000000001', 500, 'C' || repeat('F', 55),
      repeat('4', 64), 101, 0,
      'bf000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
      'confirmed', 'cb000000-0000-0000-0000-000000000001', now()
    )$$,
  '23505', null,
  'a replayed redemption for the same payment is rejected');
select is((select count(*)::integer from public.voucher_redemptions), 1,
  'the rejected duplicate redemption conserves the single confirmed redemption');

-- A reused merchant invoice nonce is rejected and the invoice set is conserved.
select throws_ok(
  $$insert into public.invoices (
      organization_id, merchant_id, program_id, settlement_wallet_id,
      kind, asset_code, asset_issuer, asset_sac_address,
      voucher_contract_address, settlement_address, invoice_signer_address,
      amount_stroops, category, nonce, canonical_payload, payload_hash,
      merchant_signature, issued_at, expires_at
    )
    select
      'b2000000-0000-0000-0000-000000000001', 'b3000000-0000-0000-0000-000000000001',
      'b5000000-0000-0000-0000-000000000001', 'b4000000-0000-0000-0000-000000000003',
      'voucher', 'RCPHP', 'G' || repeat('D', 55), 'C' || repeat('E', 55),
      'C' || repeat('F', 55), 'G' || repeat('C', 55), 'G' || repeat('C', 55),
      500, 'Food', repeat('1', 64), decode('0506', 'hex'), repeat('e', 64),
      decode('0708', 'hex'), issued_at, issued_at + interval '10 minutes'
    from (select now() as issued_at) clock$$,
  '23505', null,
  'a reused merchant invoice nonce is rejected');
select is((select count(*)::integer from public.invoices), 1,
  'the rejected duplicate invoice conserves the single signed invoice');

select * from finish();
rollback;

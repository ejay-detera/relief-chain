begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

-- Validates: Requirements 12.3, 18.2, 19.3, 21.3, 22.3
select has_table('public', 'beneficiary_balance_projection', 'beneficiary balance projection exists');
select has_table('public', 'merchant_balance_projection', 'merchant balance projection exists');
select has_table('public', 'program_financial_projection', 'program financial projection exists');
select has_table('public', 'distribution_job_projection', 'distribution job projection exists');
select has_table('public', 'public_program_aggregate_projection', 'public aggregate projection exists');
select has_view('public', 'public_financial_transparency', 'redacted public transparency view exists');

select has_column('public', 'beneficiary_balance_projection', 'as_of_ledger', 'beneficiary balances preserve ledger position');
select has_column('public', 'merchant_balance_projection', 'reconciliation_run_id', 'merchant balances link reconciliation evidence');
select has_column('public', 'program_financial_projection', 'is_stale', 'program projections label stale state');
select has_column('public', 'distribution_job_projection', 'quarantine_issue_id', 'distribution projections link quarantine evidence');
select has_column('public', 'public_program_aggregate_projection', 'reconciled_at', 'public aggregates disclose reconciliation time');
select has_column('public', 'public_financial_transparency', 'latest_transaction_hash', 'public transparency exposes a verifiable ledger reference');
select is(
  (select count(*)::integer from information_schema.columns
   where table_schema = 'public' and table_name = 'public_financial_transparency'
     and column_name = 'beneficiary_identity_id'),
  0,
  'public transparency omits beneficiary identity mappings'
);
select is(
  (select count(*)::integer from information_schema.columns
   where table_schema = 'public' and table_name = 'public_financial_transparency'
     and column_name = 'quarantine_issue_id'),
  0,
  'public transparency omits private operational issue identifiers'
);

select has_index('public', 'beneficiary_balance_projection', 'beneficiary_projection_dashboard_idx', 'beneficiary dashboard predicate is indexed');
select has_index('public', 'merchant_balance_projection', 'merchant_projection_dashboard_idx', 'merchant dashboard predicate is indexed');
select has_index('public', 'program_financial_projection', 'program_projection_dashboard_idx', 'program status dashboard predicate is indexed');
select has_index('public', 'distribution_job_projection', 'distribution_projection_dashboard_idx', 'distribution status dashboard predicate is indexed');
select has_index('public', 'public_program_aggregate_projection', 'public_aggregate_dashboard_idx', 'public aggregate predicate is indexed');

select ok(
  not has_table_privilege('authenticated', 'public.beneficiary_balance_projection', 'INSERT')
    and not has_table_privilege('authenticated', 'public.beneficiary_balance_projection', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.beneficiary_balance_projection', 'DELETE'),
  'authenticated clients cannot mutate beneficiary projections'
);
select ok(
  has_table_privilege('service_role', 'public.program_financial_projection', 'INSERT')
    and has_table_privilege('service_role', 'public.program_financial_projection', 'UPDATE')
    and not has_table_privilege('service_role', 'public.program_financial_projection', 'DELETE'),
  'reconciliation service can upsert but not delete projections'
);
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('81000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'projection-admin@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{"role":"lgu"}', now(), now()),
  ('81000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'projection-beneficiary@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{"role":"beneficiary"}', now(), now()),
  ('81000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'projection-merchant@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{"role":"merchant"}', now(), now()),
  ('81000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'projection-outsider@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{"role":"beneficiary"}', now(), now());

insert into public.organizations (id, name, slug)
values ('82000000-0000-0000-0000-000000000001', 'Projection Test Organization', 'projection-test-organization');
select public.upsert_organization_membership(
  '82000000-0000-0000-0000-000000000001',
  '81000000-0000-0000-0000-000000000001',
  'organization_administrator',
  '81000000-0000-0000-0000-000000000001'
);

insert into public.programs (
  id, organization_id, name, status, created_by, aid_type,
  asset_code, asset_issuer, budget_stroops, funded_budget_stroops
) values (
  '83000000-0000-0000-0000-000000000001',
  '82000000-0000-0000-0000-000000000001',
  'Projection Test Program', 'funding',
  '81000000-0000-0000-0000-000000000001', 'cash',
  'RCPHP', 'G' || repeat('A', 55), 1000, 0
);

insert into public.beneficiary_identities (id, user_id, verification_status)
values ('84000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000002', 'Verified');
insert into public.enrollments (
  id, beneficiary_id, beneficiary_identity_id, program_id, approval_status, category
) values (
  '85000000-0000-0000-0000-000000000001',
  '81000000-0000-0000-0000-000000000002',
  '84000000-0000-0000-0000-000000000001',
  '83000000-0000-0000-0000-000000000001', 'Approved', 'Food'
);

insert into public.merchant_entities (id, profile_id, display_name)
values ('86000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000003', 'Projection Merchant');
insert into public.merchant_accreditations (
  organization_id, merchant_id, category, status, valid_from, valid_until
) values (
  '82000000-0000-0000-0000-000000000001',
  '86000000-0000-0000-0000-000000000001',
  'Food', 'active', now() - interval '1 day', now() + interval '1 day'
);

insert into public.idempotency_keys (
  id, organization_id, program_id, scope, idempotency_key,
  payload_hash, operation_type, correlation_id
) values (
  '87000000-0000-0000-0000-000000000001',
  '82000000-0000-0000-0000-000000000001',
  '83000000-0000-0000-0000-000000000001',
  'projection.test', 'projection-job', repeat('1', 64),
  'cash_distribution', '88000000-0000-0000-0000-000000000001'
);
insert into public.distribution_jobs (
  id, organization_id, program_id, idempotency_key_id, status,
  recipient_count, pending_count, total_amount_stroops,
  correlation_id, created_by
) values (
  '89000000-0000-0000-0000-000000000001',
  '82000000-0000-0000-0000-000000000001',
  '83000000-0000-0000-0000-000000000001',
  '87000000-0000-0000-0000-000000000001', 'draft',
  1, 1, 100, '88000000-0000-0000-0000-000000000002',
  '81000000-0000-0000-0000-000000000001'
);

insert into public.reconciliation_runs (
  id, organization_id, program_id, stream_name, status,
  start_ledger_sequence, end_ledger_sequence, correlation_id,
  started_at, completed_at
) values
  (
    '8a000000-0000-0000-0000-000000000001',
    '82000000-0000-0000-0000-000000000001',
    '83000000-0000-0000-0000-000000000001',
    'projection.financial', 'completed', 500, 555,
    '88000000-0000-0000-0000-000000000003',
    now() - interval '2 minutes', now() - interval '1 minute'
  ),
  (
    '8a000000-0000-0000-0000-000000000002',
    '82000000-0000-0000-0000-000000000001',
    null, 'projection.merchant', 'completed', 500, 555,
    '88000000-0000-0000-0000-000000000004',
    now() - interval '2 minutes', now() - interval '1 minute'
  ),
  (
    '8a000000-0000-0000-0000-000000000003',
    '82000000-0000-0000-0000-000000000001',
    '83000000-0000-0000-0000-000000000001',
    'projection.partial', 'partial', 556, 556,
    '88000000-0000-0000-0000-000000000005',
    now() - interval '1 minute', now()
  );

insert into public.reconciliation_issues (
  id, reconciliation_run_id, organization_id, program_id, issue_type,
  subject_type, subject_identifier, projection_table,
  mismatch_fingerprint, correlation_id
) values (
  '8b000000-0000-0000-0000-000000000001',
  '8a000000-0000-0000-0000-000000000001',
  '82000000-0000-0000-0000-000000000001',
  '83000000-0000-0000-0000-000000000001',
  'projection_mismatch', 'program_financial_projection',
  '83000000-0000-0000-0000-000000000001',
  'program_financial_projection', repeat('2', 64),
  '88000000-0000-0000-0000-000000000006'
);

insert into public.beneficiary_balance_projection (
  organization_id, program_id, beneficiary_identity_id, aid_type,
  asset_code, asset_issuer, available_balance_stroops, allocated_stroops,
  reconciliation_run_id, as_of_ledger, reconciled_at, stale_after
) values (
  '82000000-0000-0000-0000-000000000001', '83000000-0000-0000-0000-000000000001',
  '84000000-0000-0000-0000-000000000001', 'cash', 'RCPHP', 'G' || repeat('A', 55),
  100, 100, '8a000000-0000-0000-0000-000000000001', 555,
  (select completed_at from public.reconciliation_runs where id = '8a000000-0000-0000-0000-000000000001'),
  now() + interval '5 minutes'
);
insert into public.merchant_balance_projection (
  organization_id, program_id, merchant_id, asset_code, asset_issuer,
  settled_balance_stroops, gross_settled_stroops,
  reconciliation_run_id, as_of_ledger, reconciled_at, stale_after
) values
  (
    '82000000-0000-0000-0000-000000000001',
    '83000000-0000-0000-0000-000000000001',
    '86000000-0000-0000-0000-000000000001', 'RCPHP', 'G' || repeat('A', 55),
    50, 50, '8a000000-0000-0000-0000-000000000001', 555,
    (select completed_at from public.reconciliation_runs where id = '8a000000-0000-0000-0000-000000000001'),
    now() + interval '5 minutes'
  ),
  (
    '82000000-0000-0000-0000-000000000001', null,
    '86000000-0000-0000-0000-000000000001', 'RCPHP', 'G' || repeat('A', 55),
    50, 50, '8a000000-0000-0000-0000-000000000002', 555,
    (select completed_at from public.reconciliation_runs where id = '8a000000-0000-0000-0000-000000000002'),
    now() + interval '5 minutes'
  );
insert into public.program_financial_projection (
  program_id, organization_id, aid_type, program_status, funding_status,
  asset_code, asset_issuer, budget_stroops, funded_stroops,
  reconciliation_run_id, as_of_ledger, reconciled_at, stale_after
) values (
  '83000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000001',
  'cash', 'funding', 'unreserved', 'RCPHP', 'G' || repeat('A', 55), 1000, 0,
  '8a000000-0000-0000-0000-000000000001', 555,
  (select completed_at from public.reconciliation_runs where id = '8a000000-0000-0000-0000-000000000001'),
  now() + interval '5 minutes'
);
insert into public.distribution_job_projection (
  distribution_job_id, organization_id, program_id, status,
  recipient_count, pending_count, total_amount_stroops,
  reconciliation_run_id, as_of_ledger, reconciled_at, stale_after
) values (
  '89000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000001',
  '83000000-0000-0000-0000-000000000001', 'draft', 1, 1, 100,
  '8a000000-0000-0000-0000-000000000001', 555,
  (select completed_at from public.reconciliation_runs where id = '8a000000-0000-0000-0000-000000000001'),
  now() + interval '5 minutes'
);
insert into public.public_program_aggregate_projection (
  program_id, organization_id, organization_name, program_name,
  aid_type, program_status, asset_code, budget_stroops, funded_stroops,
  reconciliation_run_id, as_of_ledger, reconciled_at, stale_after
) values (
  '83000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000001',
  'Projection Test Organization', 'Projection Test Program', 'cash', 'funding',
  'RCPHP', 1000, 0, '8a000000-0000-0000-0000-000000000001', 555,
  (select completed_at from public.reconciliation_runs where id = '8a000000-0000-0000-0000-000000000001'),
  now() + interval '5 minutes'
);

select is((select count(*)::integer from public.beneficiary_balance_projection), 1, 'reconciled beneficiary projection can be stored');
select is((select count(*)::integer from public.merchant_balance_projection), 2, 'program and organization merchant projections can be stored');
select is((select count(*)::integer from public.program_financial_projection), 1, 'reconciled program projection can be stored');
select is((select count(*)::integer from public.distribution_job_projection), 1, 'reconciled distribution projection can be stored');
select is((select count(*)::integer from public.public_program_aggregate_projection), 1, 'reconciled public aggregate can be stored');

select throws_ok(
  $$update public.program_financial_projection
    set as_of_ledger = 554, projection_version = 2
    where program_id = '83000000-0000-0000-0000-000000000001'$$,
  '23514', 'projection updates must advance version without rewinding evidence',
  'a projection cannot rewind its ledger evidence'
);
select throws_ok(
  $$update public.program_financial_projection
    set is_stale = true, projection_version = 2
    where program_id = '83000000-0000-0000-0000-000000000001'$$,
  '23514', null,
  'stale state requires a stale timestamp'
);
select throws_ok(
  $$update public.program_financial_projection
    set reconciliation_run_id = '8a000000-0000-0000-0000-000000000003',
        as_of_ledger = 556,
        reconciled_at = (
          select completed_at
          from public.reconciliation_runs
          where id = '8a000000-0000-0000-0000-000000000003'
        ),
        projection_version = 2
    where program_id = '83000000-0000-0000-0000-000000000001'$$,
  '23514', 'projection requires matching completed reconciliation evidence',
  'partial reconciliation cannot publish a current projection'
);
select throws_ok(
  $$update public.program_financial_projection
    set reconciliation_run_id = '8a000000-0000-0000-0000-000000000003',
        as_of_ledger = 556,
        reconciled_at = (
          select completed_at
          from public.reconciliation_runs
          where id = '8a000000-0000-0000-0000-000000000003'
        ),
        is_quarantined = true,
        quarantine_issue_id = '8b000000-0000-0000-0000-000000000001',
        projection_version = 2
    where program_id = '83000000-0000-0000-0000-000000000001'$$,
  '23514', 'projection quarantine evidence mismatch',
  'quarantine evidence must belong to the projection reconciliation run'
);
select throws_ok(
  $$update public.program_financial_projection
    set is_quarantined = true, projection_version = 2
    where program_id = '83000000-0000-0000-0000-000000000001'$$,
  '23514', null,
  'quarantine state requires a reconciliation issue'
);

update public.public_program_aggregate_projection
set stale_after = reconciled_at + interval '1 second',
    projection_version = 2
where program_id = '83000000-0000-0000-0000-000000000001';

set local role anon;
select is((select count(*)::integer from public.public_financial_transparency), 1, 'anonymous users can read the PII-free transparency aggregate');
select is((select is_stale from public.public_financial_transparency), true, 'public transparency computes stale state after the freshness deadline');
select throws_ok(
  $$insert into public.public_program_aggregate_projection (
      program_id, organization_id, organization_name, program_name,
      aid_type, program_status, asset_code, budget_stroops, funded_stroops,
      reconciliation_run_id, as_of_ledger, reconciled_at, stale_after
    ) values (
      gen_random_uuid(), gen_random_uuid(), 'Nope', 'Nope', 'cash', 'funding',
      'RCPHP', 0, 0, gen_random_uuid(), 1, now(), now() + interval '1 minute'
    )$$,
  '42501', 'permission denied for table public_program_aggregate_projection',
  'anonymous users cannot forge public financial aggregates'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000002', true);
select is((select count(*)::integer from public.beneficiary_balance_projection), 1, 'beneficiary can read only their reconciled balance');
select is((select count(*)::integer from public.merchant_balance_projection), 0, 'beneficiary cannot read merchant balances');
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000004', true);
select is((select count(*)::integer from public.beneficiary_balance_projection), 0, 'unrelated user cannot read another beneficiary balance');
reset role;

select * from finish();
rollback;

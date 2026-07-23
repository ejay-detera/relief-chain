begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

-- Validates: Requirements 19.1, 19.2, 19.3, 19.4, 19.5, 19.6

-- The redacted public transparency view already exists and stays PII-free.
select has_view('public', 'public_financial_transparency', 'redacted public transparency view exists');
select is(
  (select count(*)::integer from information_schema.columns
   where table_schema = 'public' and table_name = 'public_financial_transparency'
     and column_name in ('beneficiary_identity_id', 'subject_user_id')),
  0,
  'public transparency view exposes no beneficiary identity mapping'
);

-- Controlled auditor access functions exist.
select has_function('public', 'auditor_view_identity_mappings',
  array['uuid', 'uuid', 'uuid'], 'controlled identity-mapping accessor exists');
select has_function('public', 'auditor_view_approvals',
  array['uuid', 'uuid', 'uuid'], 'controlled approvals accessor exists');
select has_function('public', 'auditor_view_reconciliation_report',
  array['uuid', 'uuid', 'uuid'], 'controlled reconciliation-report accessor exists');
select has_function('public', 'auditor_view_dispute_evidence',
  array['uuid', 'uuid', 'uuid'], 'controlled dispute-evidence accessor exists');

-- Least privilege: anonymous callers cannot execute the accessors at all.
select ok(
  not has_function_privilege('anon',
    'public.auditor_view_identity_mappings(uuid, uuid, uuid)', 'EXECUTE'),
  'anonymous callers cannot execute the identity-mapping accessor'
);
select ok(
  has_function_privilege('authenticated',
    'public.auditor_view_identity_mappings(uuid, uuid, uuid)', 'EXECUTE'),
  'authenticated callers may attempt the gated identity-mapping accessor'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('a3000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'audit-admin@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{"role":"lgu"}', now(), now()),
  ('a3000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'audit-auditor@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{"role":"lgu"}', now(), now()),
  ('a3000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'audit-beneficiary@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{"role":"beneficiary"}', now(), now()),
  ('a3000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'audit-outsider@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{"role":"beneficiary"}', now(), now());

insert into public.organizations (id, name, slug)
values ('a4000000-0000-0000-0000-000000000001', 'Auditor Access Organization', 'auditor-access-organization');
select public.upsert_organization_membership(
  'a4000000-0000-0000-0000-000000000001',
  'a3000000-0000-0000-0000-000000000001',
  'organization_administrator',
  'a3000000-0000-0000-0000-000000000001'
);
select public.upsert_organization_membership(
  'a4000000-0000-0000-0000-000000000001',
  'a3000000-0000-0000-0000-000000000002',
  'auditor',
  'a3000000-0000-0000-0000-000000000001'
);

insert into public.programs (
  id, organization_id, name, status, created_by, aid_type,
  asset_code, asset_issuer, budget_stroops, funded_budget_stroops
) values (
  'a5000000-0000-0000-0000-000000000001',
  'a4000000-0000-0000-0000-000000000001',
  'Auditor Access Program', 'funding',
  'a3000000-0000-0000-0000-000000000001', 'cash',
  'RCPHP', 'G' || repeat('A', 55), 1000, 0
);

insert into public.beneficiary_identities (id, user_id, verification_status)
values ('a6000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000003', 'Verified');

insert into public.enrollments (
  id, beneficiary_id, beneficiary_identity_id, program_id, approval_status, category
) values (
  'a7000000-0000-0000-0000-000000000001',
  'a3000000-0000-0000-0000-000000000003',
  'a6000000-0000-0000-0000-000000000001',
  'a5000000-0000-0000-0000-000000000001', 'Approved', 'Cash'
);

insert into public.wallets (
  id, owner_type, owner_id, purpose, address,
  verification_status, proof_challenge_digest,
  proof_challenge_issued_at, proof_challenge_expires_at,
  proof_signature_digest, verified_at, verified_by, is_active
) values (
  'a8000000-0000-0000-0000-000000000001',
  'beneficiary_identity', 'a6000000-0000-0000-0000-000000000001',
  'beneficiary', 'G' || repeat('B', 55), 'verified',
  repeat('a', 64), now(), now() + interval '5 minutes',
  repeat('b', 64), now(), 'a3000000-0000-0000-0000-000000000001', true
);

insert into public.disbursements (
  id, program_id, program_name, amount, recipients_count
) values (
  'a9000000-0000-0000-0000-000000000001',
  'a5000000-0000-0000-0000-000000000001',
  'Auditor Access Program', 500, 1
);

insert into public.reconciliation_runs (
  id, organization_id, program_id, stream_name, status,
  start_ledger_sequence, end_ledger_sequence, correlation_id,
  started_at, completed_at
) values (
  'aa000000-0000-0000-0000-000000000001',
  'a4000000-0000-0000-0000-000000000001',
  'a5000000-0000-0000-0000-000000000001',
  'auditor.access.financial', 'completed', 500, 555,
  'ab000000-0000-0000-0000-000000000001',
  now() - interval '2 minutes', now() - interval '1 minute'
);

-- Authorized auditor: identity mapping accessor returns the private mapping.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a3000000-0000-0000-0000-000000000002', true);

select is(
  (
    select subject_user_id
    from public.auditor_view_identity_mappings(
      'a4000000-0000-0000-0000-000000000001',
      'ac000000-0000-0000-0000-000000000001'
    )
    where beneficiary_identity_id = 'a6000000-0000-0000-0000-000000000001'
  ),
  'a3000000-0000-0000-0000-000000000003',
  'auditor receives the private beneficiary identity-to-user mapping'
);
select is(
  (
    select wallet_address
    from public.auditor_view_identity_mappings(
      'a4000000-0000-0000-0000-000000000001',
      'ac000000-0000-0000-0000-000000000002',
      'a6000000-0000-0000-0000-000000000001'
    )
  ),
  'G' || repeat('B', 55),
  'auditor receives the private identity-to-wallet mapping'
);

-- Authorized auditor: approvals accessor returns eligibility and disbursement approvals.
select ok(
  exists (
    select 1 from public.auditor_view_approvals(
      'a4000000-0000-0000-0000-000000000001',
      'ac000000-0000-0000-0000-000000000003'
    ) where approval_type = 'enrollment_eligibility' and status = 'Approved'
  ),
  'auditor sees eligibility approval decisions'
);
select ok(
  exists (
    select 1 from public.auditor_view_approvals(
      'a4000000-0000-0000-0000-000000000001',
      'ac000000-0000-0000-0000-000000000004'
    ) where approval_type = 'disbursement'
  ),
  'auditor sees disbursement authorizations'
);

-- Authorized auditor: reconciliation report accessor returns the run summary.
select is(
  (
    select status
    from public.auditor_view_reconciliation_report(
      'a4000000-0000-0000-0000-000000000001',
      'ac000000-0000-0000-0000-000000000005'
    )
    where reconciliation_run_id = 'aa000000-0000-0000-0000-000000000001'
  ),
  'completed',
  'auditor sees reconciliation run reports'
);

-- Dispute-evidence accessor is callable and logged even with no evidence rows.
select is(
  (
    select count(*)::integer
    from public.auditor_view_dispute_evidence(
      'a4000000-0000-0000-0000-000000000001',
      'ac000000-0000-0000-0000-000000000006'
    )
  ),
  0,
  'auditor evidence accessor returns no rows when none exist'
);

-- A beneficiary (no auditor role) is denied controlled access.
select set_config('request.jwt.claim.sub', 'a3000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$select * from public.auditor_view_identity_mappings(
      'a4000000-0000-0000-0000-000000000001',
      'ac000000-0000-0000-0000-000000000007'
    )$$,
  '42501',
  'controlled auditor access requires an active auditor or administrator role',
  'a beneficiary cannot reach the controlled identity-mapping accessor'
);

-- An authenticated non-member is denied controlled access.
select set_config('request.jwt.claim.sub', 'a3000000-0000-0000-0000-000000000004', true);
select throws_ok(
  $$select * from public.auditor_view_approvals(
      'a4000000-0000-0000-0000-000000000001',
      'ac000000-0000-0000-0000-000000000008'
    )$$,
  '42501',
  'controlled auditor access requires an active auditor or administrator role',
  'an unrelated user cannot reach controlled approvals'
);

reset role;

-- Every controlled access above appended a sensitive-data-access audit event.
select is(
  (
    select count(*)::integer from public.audit_events
    where organization_id = 'a4000000-0000-0000-0000-000000000001'
      and sensitive_data_access
      and action in (
        'audit.identity_mapping.accessed',
        'audit.approvals.accessed',
        'audit.reconciliation_report.accessed',
        'audit.dispute_evidence.accessed'
      )
  ),
  6,
  'each controlled auditor read is logged as a sensitive-data-access event'
);
select ok(
  (
    select bool_and(actor_user_id = 'a3000000-0000-0000-0000-000000000002')
    from public.audit_events
    where organization_id = 'a4000000-0000-0000-0000-000000000001'
      and sensitive_data_access
      and action like 'audit.%.accessed'
  ),
  'sensitive-access events attribute the accessing auditor'
);

-- Denied attempts by non-auditors log no sensitive access.
select is(
  (
    select count(*)::integer from public.audit_events
    where organization_id = 'a4000000-0000-0000-0000-000000000001'
      and actor_user_id in (
        'a3000000-0000-0000-0000-000000000003',
        'a3000000-0000-0000-0000-000000000004'
      )
  ),
  0,
  'denied controlled-access attempts create no audit noise'
);

-- A missing correlation ID is rejected before any data is read.
select throws_ok(
  $$select * from public.auditor_view_identity_mappings(
      'a4000000-0000-0000-0000-000000000001', null
    )$$,
  '22004',
  'controlled access requires a correlation ID',
  'controlled access requires correlation evidence'
);

select * from finish();
rollback;

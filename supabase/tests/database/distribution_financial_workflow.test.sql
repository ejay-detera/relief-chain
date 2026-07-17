begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

select enum_has_labels(
  'public', 'distribution_recipient_status',
  array['pending', 'prepared', 'submitted', 'confirmed', 'failed', 'cancelled'],
  'recipient transfers expose every required resumable state'
);
select enum_has_labels(
  'public', 'transaction_attempt_status',
  array['accepted', 'submitted', 'observed_success', 'observed_failure', 'unknown'],
  'transaction attempts distinguish submission from observation'
);
select has_table('public', 'distribution_jobs', 'distribution jobs table exists');
select has_table('public', 'distribution_recipients', 'recipient transfers table exists');
select has_table('public', 'financial_intents', 'financial intents table exists');
select has_table('public', 'transaction_attempts', 'transaction attempts table exists');
select has_table('public', 'idempotency_keys', 'idempotency claims table exists');
select has_index(
  'public', 'idempotency_keys', 'idempotency_keys_organization_scope_key',
  'deterministic keys are unique inside organization and operation scope'
);
select has_index(
  'public', 'distribution_recipients', 'distribution_recipients_retry_queue_idx',
  'eligible retry recipients have a bounded queue index'
);
select ok(
  not has_table_privilege('anon', 'public.distribution_recipients', 'SELECT'),
  'public callers cannot read beneficiary transfer mappings or failure reasons'
);
select ok(
  not has_table_privilege('authenticated', 'public.financial_intents', 'INSERT')
    and not has_table_privilege('authenticated', 'public.financial_intents', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.financial_intents', 'DELETE'),
  'authenticated clients cannot directly mutate financial intents'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.claim_financial_idempotency_key(uuid,uuid,text,text,text,public.financial_operation_type,uuid)',
    'EXECUTE'
  ),
  'idempotency claiming is restricted to trusted orchestration'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '71000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'workflow-admin-a@example.test', '', now(),
    '{"provider":"email","providers":["email"]}',
    '{"role":"lgu"}', now(), now()
  ),
  (
    '71000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'workflow-admin-b@example.test', '', now(),
    '{"provider":"email","providers":["email"]}',
    '{"role":"lgu"}', now(), now()
  ),
  (
    '71000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'workflow-beneficiary@example.test', '', now(),
    '{"provider":"email","providers":["email"]}',
    '{"role":"beneficiary"}', now(), now()
  );
insert into public.organizations (id, name, slug)
values
  ('72000000-0000-0000-0000-000000000001', 'Workflow Org A', 'workflow-org-a'),
  ('72000000-0000-0000-0000-000000000002', 'Workflow Org B', 'workflow-org-b');

select public.upsert_organization_membership(
  '72000000-0000-0000-0000-000000000001',
  '71000000-0000-0000-0000-000000000001',
  'organization_administrator',
  '71000000-0000-0000-0000-000000000001'
);
select public.upsert_organization_membership(
  '72000000-0000-0000-0000-000000000002',
  '71000000-0000-0000-0000-000000000002',
  'organization_administrator',
  '71000000-0000-0000-0000-000000000002'
);

insert into public.programs (
  id, organization_id, name, status, aid_type, budget_stroops, created_by
)
values
  (
    '73000000-0000-0000-0000-000000000001',
    '72000000-0000-0000-0000-000000000001',
    'Workflow Cash A', 'draft', 'cash', 100000,
    '71000000-0000-0000-0000-000000000001'
  ),
  (
    '73000000-0000-0000-0000-000000000002',
    '72000000-0000-0000-0000-000000000002',
    'Workflow Cash B', 'draft', 'cash', 100000,
    '71000000-0000-0000-0000-000000000002'
  );

insert into public.enrollments (
  id, beneficiary_id, beneficiary_identity_id, program_id,
  approval_status, category, allocation_amount_stroops
)
values (
  '74000000-0000-0000-0000-000000000001',
  '71000000-0000-0000-0000-000000000003',
  (select id from public.beneficiary_identities
    where user_id = '71000000-0000-0000-0000-000000000003'),
  '73000000-0000-0000-0000-000000000001',
  'Approved', 'Cash', 1000
);

insert into public.wallets (
  id, owner_type, owner_id, purpose, address,
  verification_status, proof_challenge_digest,
  proof_challenge_issued_at, proof_challenge_expires_at,
  proof_signature_digest, verified_at, verified_by, is_active
)
values (
  '75000000-0000-0000-0000-000000000001',
  'beneficiary_identity',
  (select id from public.beneficiary_identities
    where user_id = '71000000-0000-0000-0000-000000000003'),
  'beneficiary', 'G' || repeat('W', 55), 'verified',
  repeat('a', 64), now(), now() + interval '5 minutes',
  repeat('b', 64), now(),
  '71000000-0000-0000-0000-000000000001', true
);

create temporary table workflow_claims (
  claim_name text primary key,
  claim_id uuid not null
) on commit drop;

insert into workflow_claims
select 'job-a', id from public.claim_financial_idempotency_key(
  '72000000-0000-0000-0000-000000000001',
  '73000000-0000-0000-0000-000000000001',
  'distribution.job', 'cash-program-a-policy-1', repeat('1', 64),
  'cash_distribution', '76000000-0000-0000-0000-000000000001'
);
insert into workflow_claims
select 'job-b', id from public.claim_financial_idempotency_key(
  '72000000-0000-0000-0000-000000000002',
  '73000000-0000-0000-0000-000000000002',
  'distribution.job', 'cash-program-b-policy-1', repeat('2', 64),
  'cash_distribution', '76000000-0000-0000-0000-000000000002'
);
insert into workflow_claims
select 'recipient-a', id from public.claim_financial_idempotency_key(
  '72000000-0000-0000-0000-000000000001',
  '73000000-0000-0000-0000-000000000001',
  'distribution.recipient',
  private.make_distribution_recipient_key(
    '73000000-0000-0000-0000-000000000001',
    (select id from public.beneficiary_identities
      where user_id = '71000000-0000-0000-0000-000000000003'),
    1
  ),
  repeat('3', 64), 'cash_distribution',
  '76000000-0000-0000-0000-000000000003'
);
select is(
  (
    select id from public.claim_financial_idempotency_key(
      '72000000-0000-0000-0000-000000000001',
      '73000000-0000-0000-0000-000000000001',
      'distribution.job', 'cash-program-a-policy-1', repeat('1', 64),
      'cash_distribution', '76000000-0000-0000-0000-000000000001'
    )
  ),
  (select claim_id from workflow_claims where claim_name = 'job-a'),
  'same deterministic key and payload returns the original claim'
);
select throws_ok(
  $$select public.claim_financial_idempotency_key(
    '72000000-0000-0000-0000-000000000001',
    '73000000-0000-0000-0000-000000000001',
    'distribution.job', 'cash-program-a-policy-1', repeat('9', 64),
    'cash_distribution', '76000000-0000-0000-0000-000000000001'
  )$$,
  '23514', 'idempotency key payload hash conflict',
  'same deterministic key with a different payload hash is rejected explicitly'
);
select is(
  (
    select count(*)::integer from public.idempotency_keys
    where organization_id = '72000000-0000-0000-0000-000000000001'
      and scope = 'distribution.job'
      and idempotency_key = 'cash-program-a-policy-1'
  ),
  1,
  'idempotent retries never create a second claim'
);

-- Property-style scale check over the required municipal batch size.
-- **Validates: Requirements 8.5, 8.9**
select is(
  (
    select count(distinct private.make_distribution_recipient_key(
      '73000000-0000-0000-0000-000000000001', md5(value::text)::uuid, 1
    ))::integer
    from generate_series(1, 2000) generated(value)
  ),
  2000,
  '2,000 distinct beneficiary inputs produce 2,000 deterministic recipient keys'
);
select ok(
  private.make_distribution_recipient_key(
    '73000000-0000-0000-0000-000000000001',
    '77000000-0000-0000-0000-000000000001', 1
  ) = private.make_distribution_recipient_key(
    '73000000-0000-0000-0000-000000000001',
    '77000000-0000-0000-0000-000000000001', 1
  ),
  'identical stable inputs always produce the same recipient key'
);

insert into public.distribution_jobs (
  id, organization_id, program_id, idempotency_key_id, status,
  recipient_count, pending_count, total_amount_stroops,
  correlation_id, created_by
)
values
  (
    '78000000-0000-0000-0000-000000000001',
    '72000000-0000-0000-0000-000000000001',
    '73000000-0000-0000-0000-000000000001',
    (select claim_id from workflow_claims where claim_name = 'job-a'),
    'draft', 1, 1, 1000,
    '79000000-0000-0000-0000-000000000001',
    '71000000-0000-0000-0000-000000000001'
  ),
  (
    '78000000-0000-0000-0000-000000000002',
    '72000000-0000-0000-0000-000000000002',
    '73000000-0000-0000-0000-000000000002',
    (select claim_id from workflow_claims where claim_name = 'job-b'),
    'draft', 0, 0, 0,
    '79000000-0000-0000-0000-000000000002',
    '71000000-0000-0000-0000-000000000002'
  );

insert into public.distribution_recipients (
  id, organization_id, program_id, distribution_job_id,
  beneficiary_identity_id, enrollment_id, destination_wallet_id,
  idempotency_key_id, amount_stroops, correlation_id
)
values (
  '7a000000-0000-0000-0000-000000000001',
  '72000000-0000-0000-0000-000000000001',
  '73000000-0000-0000-0000-000000000001',
  '78000000-0000-0000-0000-000000000001',
  (select id from public.beneficiary_identities
    where user_id = '71000000-0000-0000-0000-000000000003'),
  '74000000-0000-0000-0000-000000000001',
  '75000000-0000-0000-0000-000000000001',
  (select claim_id from workflow_claims where claim_name = 'recipient-a'),
  1000, '79000000-0000-0000-0000-000000000003'
);
select throws_ok(
  $$insert into public.distribution_recipients (
    organization_id, program_id, distribution_job_id,
    beneficiary_identity_id, enrollment_id, destination_wallet_id,
    idempotency_key_id, amount_stroops, correlation_id
  ) values (
    '72000000-0000-0000-0000-000000000002',
    '73000000-0000-0000-0000-000000000002',
    '78000000-0000-0000-0000-000000000001',
    (select id from public.beneficiary_identities
      where user_id = '71000000-0000-0000-0000-000000000003'),
    '74000000-0000-0000-0000-000000000001',
    '75000000-0000-0000-0000-000000000001',
    (select claim_id from workflow_claims where claim_name = 'job-b'),
    1000, '79000000-0000-0000-0000-000000000004'
  )$$,
  '23514', 'distribution recipient job scope mismatch',
  'recipient links cannot cross organization or program boundaries'
);

insert into public.financial_intents (
  id, organization_id, program_id, distribution_job_id,
  distribution_recipient_id, beneficiary_identity_id,
  idempotency_key_id, operation_type, amount_stroops,
  asset_code, payload_hash, correlation_id, requested_by
)
values (
  '7b000000-0000-0000-0000-000000000001',
  '72000000-0000-0000-0000-000000000001',
  '73000000-0000-0000-0000-000000000001',
  '78000000-0000-0000-0000-000000000001',
  '7a000000-0000-0000-0000-000000000001',
  (select id from public.beneficiary_identities
    where user_id = '71000000-0000-0000-0000-000000000003'),
  (select claim_id from workflow_claims where claim_name = 'recipient-a'),
  'cash_distribution', 1000, 'RCPHP', repeat('3', 64),
  '79000000-0000-0000-0000-000000000003',
  '71000000-0000-0000-0000-000000000001'
);

select throws_ok(
  $$update public.financial_intents
    set payload_hash = repeat('4', 64)
    where id = '7b000000-0000-0000-0000-000000000001'$$,
  '23514', 'financial intents are immutable',
  'canonical intent payload hashes cannot be rewritten'
);

insert into public.transaction_attempts (
  id, financial_intent_id, attempt_number,
  prepared_payload_hash, envelope_xdr
)
values (
  '7c000000-0000-0000-0000-000000000001',
  '7b000000-0000-0000-0000-000000000001',
  1, repeat('5', 64), 'AAAA-test-envelope'
);
select ok(
  (
    select organization_id = '72000000-0000-0000-0000-000000000001'
      and program_id = '73000000-0000-0000-0000-000000000001'
      and distribution_job_id = '78000000-0000-0000-0000-000000000001'
      and correlation_id = '79000000-0000-0000-0000-000000000003'
      and intent_payload_hash = repeat('3', 64)
    from public.transaction_attempts
    where id = '7c000000-0000-0000-0000-000000000001'
  ),
  'attempts inherit every organization, program, job, beneficiary, correlation, and payload link'
);
select lives_ok(
  $$update public.transaction_attempts
    set status = 'submitted', transaction_hash = repeat('c', 64)
    where id = '7c000000-0000-0000-0000-000000000001'$$,
  'an accepted attempt can become submitted without becoming confirmed'
);
select lives_ok(
  $$update public.transaction_attempts
    set status = 'observed_success', result_code = 'tx_success'
    where id = '7c000000-0000-0000-0000-000000000001'$$,
  'reconciliation can mark a submitted attempt observed-success'
);
insert into public.transaction_attempts (
  id, financial_intent_id, attempt_number,
  prepared_payload_hash, envelope_xdr
)
values (
  '7c000000-0000-0000-0000-000000000002',
  '7b000000-0000-0000-0000-000000000001',
  2, repeat('6', 64), 'BBBB-fresh-retry-envelope'
);
select is(
  (select count(*)::integer from public.transaction_attempts
    where financial_intent_id = '7b000000-0000-0000-0000-000000000001'),
  2,
  'a retry creates one fresh attempt under the same immutable business intent'
);
select throws_ok(
  $$update public.transaction_attempts
    set prepared_payload_hash = repeat('7', 64)
    where id = '7c000000-0000-0000-0000-000000000001'$$,
  '23514', 'transaction attempt prepared payload and intent links are immutable',
  'submitted attempt payload evidence cannot be replaced'
);
select lives_ok(
  $$update public.distribution_recipients
    set status = 'failed', failure_code = 'trustline_missing',
        failure_reason = 'Verified wallet trustline is unavailable'
    where id = '7a000000-0000-0000-0000-000000000001'$$,
  'an individual recipient can fail without deleting the job'
);
select lives_ok(
  $$update public.distribution_recipients
    set status = 'pending'
    where id = '7a000000-0000-0000-0000-000000000001'$$,
  'a failed recipient can be reset for an eligible retry'
);
select ok(
  (
    select failure_code is null and failure_reason is null
    from public.distribution_recipients
    where id = '7a000000-0000-0000-0000-000000000001'
  ),
  'retry reset clears stale recipient failure diagnostics'
);
select lives_ok(
  $$update public.distribution_recipients set status = 'prepared'
    where id = '7a000000-0000-0000-0000-000000000001';
    update public.distribution_recipients set status = 'submitted'
    where id = '7a000000-0000-0000-0000-000000000001';
    update public.distribution_recipients
    set status = 'confirmed', transaction_hash = repeat('d', 64),
        confirmed_ledger = 12345
    where id = '7a000000-0000-0000-0000-000000000001'$$,
  'recipient retry can progress to confirmation with ledger evidence'
);
select throws_ok(
  $$update public.distribution_recipients set amount_stroops = 2000
    where id = '7a000000-0000-0000-0000-000000000001'$$,
  '23514', 'distribution recipient identity and requested value are immutable',
  'confirmed recipient amount and identity links remain immutable'
);

select lives_ok(
  $$update public.distribution_jobs set status = 'validating'
    where id = '78000000-0000-0000-0000-000000000001';
    update public.distribution_jobs set status = 'awaiting_approval'
    where id = '78000000-0000-0000-0000-000000000001';
    update public.distribution_jobs set status = 'queued'
    where id = '78000000-0000-0000-0000-000000000001';
    update public.distribution_jobs set status = 'submitting'
    where id = '78000000-0000-0000-0000-000000000001';
    update public.distribution_jobs set status = 'reconciling'
    where id = '78000000-0000-0000-0000-000000000001';
    update public.distribution_jobs
    set status = 'completed', pending_count = 0, confirmed_count = 1
    where id = '78000000-0000-0000-0000-000000000001'$$,
  'a fully reconciled job can complete only after every recipient confirms'
);
select ok(
  (select completed_at is not null from public.distribution_jobs
    where id = '78000000-0000-0000-0000-000000000001'),
  'completed jobs retain terminal timing evidence'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '71000000-0000-0000-0000-000000000001',
  true
);
select is(
  (select count(*)::integer from public.distribution_jobs), 1,
  'organization RLS hides cross-tenant jobs'
);
select is(
  (select count(*)::integer from public.distribution_recipients), 1,
  'organization RLS hides cross-tenant recipient mappings'
);
select is(
  (select count(*)::integer from public.financial_intents), 1,
  'organization RLS exposes only scoped financial intents'
);
select is(
  (select count(*)::integer from public.transaction_attempts), 2,
  'organization RLS exposes only attempts linked to scoped intents'
);
select is(
  (select count(*)::integer from public.idempotency_keys), 2,
  'organization RLS hides cross-tenant deterministic keys'
);

reset role;
select * from finish();
rollback;
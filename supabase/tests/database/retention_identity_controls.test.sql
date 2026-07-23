begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

select enum_has_labels(
  'public', 'retention_record_type',
  array['financial_approval', 'receipt', 'dispute', 'audit_evidence'],
  'retention controls cover every required evidence class'
);
select enum_has_labels(
  'public', 'identity_disposition_method', array['anonymize', 'delete'],
  'identity workflows support anonymization and deletion'
);
select has_table('public', 'retention_policies',
  'versioned retention policies exist');
select has_table('public', 'retention_records',
  'per-record retention schedules exist');
select has_table('public', 'identity_disposition_requests',
  'auditable identity disposition requests exist');
select has_column('public', 'programs', 'closed_at',
  'program closure has an immutable retention anchor');
select has_column('public', 'beneficiary_identities', 'data_status',
  'stable identities expose their data disposition state');
select has_index('public', 'retention_records', 'retention_records_due_idx',
  'retention due work is indexed');

select ok(
  not has_table_privilege('authenticated', 'public.retention_policies', 'INSERT'),
  'authenticated clients cannot forge retention policy'
);
select ok(
  not has_table_privilege('authenticated', 'public.retention_records', 'UPDATE'),
  'authenticated clients cannot bypass retention obligations'
);
select ok(
  not has_table_privilege(
    'authenticated', 'public.identity_disposition_requests', 'UPDATE'
  ),
  'authenticated clients cannot approve their own identity disposition'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.execute_identity_disposition(uuid,uuid,uuid)',
    'EXECUTE'
  ),
  'service role has the narrow identity execution path'
);
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    '71000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'retention-admin@example.test', '', now(),
    '{"provider":"email","providers":["email"]}',
    '{"role":"lgu"}', now(), now()
  ),
  (
    '71000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'retention-beneficiary@example.test', '', now(),
    '{"provider":"email","providers":["email"]}',
    '{"role":"beneficiary","full_name":"Sensitive Person","gov_id":"ID-123","mobile_number":"09170000000","complete_address":"Sensitive address"}',
    now(), now()
  );

update public.profiles
set full_name = 'Sensitive Person', gov_id = 'ID-123',
    mobile_number = '09170000000', complete_address = 'Sensitive address'
where id = '71000000-0000-0000-0000-000000000002';

insert into public.organizations (id, name, slug, created_by)
values (
  '72000000-0000-0000-0000-000000000001',
  'Retention Test Organization', 'retention-test-organization',
  '71000000-0000-0000-0000-000000000001'
);

select public.upsert_organization_membership(
  '72000000-0000-0000-0000-000000000001',
  '71000000-0000-0000-0000-000000000001',
  'organization_administrator',
  '71000000-0000-0000-0000-000000000001'
);

select is(
  (
    select count(*)::integer from public.retention_policies
    where organization_id = '72000000-0000-0000-0000-000000000001'
      and policy_version = 1
      and retention_period = interval '7 years'
      and review_status = 'provisional'
      and superseded_at is null
  ),
  4,
  'every organization receives four provisional seven-year policies'
);

select throws_ok(
  $$select public.replace_retention_policy(
    '72000000-0000-0000-0000-000000000001', 'receipt',
    interval '8 years', 'approved', null,
    '71000000-0000-0000-0000-000000000001',
    '73000000-0000-0000-0000-000000000001'
  )$$,
  '23514',
  'approved production policy requires counsel reference',
  'production approval cannot omit qualified-counsel evidence'
);

select lives_ok(
  $$select public.replace_retention_policy(
    '72000000-0000-0000-0000-000000000001', 'receipt',
    interval '8 years', 'approved', 'PH-counsel-review-2026-01',
    '71000000-0000-0000-0000-000000000001',
    '73000000-0000-0000-0000-000000000002'
  )$$,
  'counsel-reviewed policy can replace a provisional value'
);

select lives_ok(
  $$select public.replace_retention_policy(
    '72000000-0000-0000-0000-000000000001', 'financial_approval',
    interval '1 day', 'provisional', null,
    '71000000-0000-0000-0000-000000000001',
    '73000000-0000-0000-0000-000000000003'
  )$$,
  'pilot retention remains configurable through an audited version'
);
insert into public.programs (
  id, organization_id, name, status, aid_type, created_by
) values (
  '74000000-0000-0000-0000-000000000001',
  '72000000-0000-0000-0000-000000000001',
  'Retention Closure Program', 'draft', 'cash',
  '71000000-0000-0000-0000-000000000001'
);

insert into public.enrollments (
  id, beneficiary_id, beneficiary_identity_id,
  program_id, approval_status, category
) values (
  '75000000-0000-0000-0000-000000000001',
  '71000000-0000-0000-0000-000000000002',
  (select id from public.beneficiary_identities
    where user_id = '71000000-0000-0000-0000-000000000002'),
  '74000000-0000-0000-0000-000000000001', 'Approved', 'Food'
);

select lives_ok(
  $$select public.request_identity_disposition(
    '72000000-0000-0000-0000-000000000001',
    (select id from public.beneficiary_identities
      where user_id = '71000000-0000-0000-0000-000000000002'),
    'anonymize',
    '71000000-0000-0000-0000-000000000001',
    '76000000-0000-0000-0000-000000000001'
  )$$,
  'an identity disposition can be requested while obligations are assessed'
);

select throws_ok(
  $$select public.review_identity_disposition(
    (select id from public.identity_disposition_requests
      where beneficiary_identity_id = (
        select id from public.beneficiary_identities
        where user_id = '71000000-0000-0000-0000-000000000002'
      )),
    true, '71000000-0000-0000-0000-000000000001',
    'Verification no longer required',
    '76000000-0000-0000-0000-000000000002'
  )$$,
  '23514',
  'verification, retention, or legal-hold obligation is still active',
  'an open program prevents premature identity anonymization'
);

select lives_ok(
  $$update public.programs
    set status = 'closed', closed_at = now() - interval '2 days'
    where id = '74000000-0000-0000-0000-000000000001'$$,
  'program closure records the retention anchor'
);

select throws_ok(
  $$update public.programs set closed_at = now() - interval '3 days'
    where id = '74000000-0000-0000-0000-000000000001'$$,
  '23514', 'program closure time is immutable',
  'the post-closure retention anchor cannot be rewritten'
);

-- Table-driven invariant coverage over all required evidence classes.
-- **Validates: Requirements 17.3, 19.7**
select lives_ok(
  $$do $block$
  declare
    evidence_type public.retention_record_type;
    ordinal integer := 0;
  begin
    foreach evidence_type in array enum_range(null::public.retention_record_type)
    loop
      ordinal := ordinal + 1;
      perform public.schedule_retention_record(
        '72000000-0000-0000-0000-000000000001',
        '74000000-0000-0000-0000-000000000001',
        evidence_type,
        evidence_type::text || '_records',
        ('77000000-0000-0000-0000-' || lpad(ordinal::text, 12, '0'))::uuid,
        ('78000000-0000-0000-0000-' || lpad(ordinal::text, 12, '0'))::uuid
      );
    end loop;
  end
  $block$$$,
  'every required evidence class receives a policy-snapshotted schedule'
);

select ok(
  (
    select bool_and(
      record.retain_until = record.retention_started_at + record.retention_period
      and record.policy_version = policy.policy_version
      and record.retention_period = policy.retention_period
    ) and count(*) = 4
    from public.retention_records record
    join public.retention_policies policy on policy.id = record.policy_id
    where record.program_id = '74000000-0000-0000-0000-000000000001'
  ),
  'all retention deadlines are closure-based immutable policy snapshots'
);

select is(
  (
    select retention_period from public.retention_records
    where record_type = 'receipt'
      and program_id = '74000000-0000-0000-0000-000000000001'
  ),
  interval '8 years',
  'configured counsel-reviewed receipt retention is applied'
);

select throws_ok(
  $$select public.dispose_retention_record(
    (select id from public.retention_records
      where record_type = 'receipt'
        and program_id = '74000000-0000-0000-0000-000000000001'),
    '71000000-0000-0000-0000-000000000001',
    'secure-erasure-job-1',
    '79000000-0000-0000-0000-000000000001'
  )$$,
  '23514', 'retention or legal-hold obligation is still active',
  'evidence cannot be disposed before its deadline'
);
select lives_ok(
  $$select public.set_identity_disposition_hold(
    (select id from public.identity_disposition_requests),
    now() + interval '1 day', 'Pending legal inquiry',
    '71000000-0000-0000-0000-000000000001',
    '7a000000-0000-0000-0000-000000000001'
  )$$,
  'an authorized actor can place an audited identity legal hold'
);

select throws_ok(
  $$select public.review_identity_disposition(
    (select id from public.identity_disposition_requests),
    true, '71000000-0000-0000-0000-000000000001',
    'Retention period elapsed',
    '7a000000-0000-0000-0000-000000000002'
  )$$,
  '23514',
  'verification, retention, or legal-hold obligation is still active',
  'a legal hold prevents identity disposition after ordinary retention expires'
);

select lives_ok(
  $$select public.set_identity_disposition_hold(
    (select id from public.identity_disposition_requests),
    null, null,
    '71000000-0000-0000-0000-000000000001',
    '7a000000-0000-0000-0000-000000000003'
  )$$,
  'an authorized actor can clear a resolved legal hold'
);

select lives_ok(
  $$select public.review_identity_disposition(
    (select id from public.identity_disposition_requests),
    true, '71000000-0000-0000-0000-000000000001',
    'Verification and retention obligations satisfied',
    '7a000000-0000-0000-0000-000000000004'
  )$$,
  'identity anonymization can be approved only after all obligations expire'
);

-- **Validates: Requirements 19.8, 19.9**
select lives_ok(
  $$select public.execute_identity_disposition(
    (select id from public.identity_disposition_requests),
    '71000000-0000-0000-0000-000000000001',
    '7a000000-0000-0000-0000-000000000005'
  )$$,
  'approved anonymization executes through the auditable service path'
);

select ok(
  (
    select full_name is null and gov_id is null and mobile_number is null
      and complete_address is null and stellar_pubkey is null
      and identity_data_locked
    from public.profiles
    where id = '71000000-0000-0000-0000-000000000002'
  ),
  'the anonymization workflow clears and locks sensitive profile data'
);

select ok(
  (
    select user_id is null and verified_by is null
      and data_status = 'anonymized' and anonymized_at is not null
    from public.beneficiary_identities
    where disposition_request_id = (
      select id from public.identity_disposition_requests
    )
  ),
  'stable financial identity remains while the direct user mapping is removed'
);

select ok(
  (
    select status = 'completed' and subject_user_id is null
      and completed_at is not null
    from public.identity_disposition_requests
  ),
  'completed workflow drops its sensitive authentication-subject snapshot'
);

select is(
  (
    select count(*)::integer from public.audit_events
    where organization_id = '72000000-0000-0000-0000-000000000001'
      and action in (
        'retention.policy.replaced',
        'retention.record.scheduled',
        'identity.disposition.requested',
        'identity.disposition.hold_changed',
        'identity.disposition.approved',
        'identity.disposition.completed'
      )
  ),
  11,
  'policy, schedule, hold, approval, and anonymization actions are auditable'
);

select * from finish();
rollback;
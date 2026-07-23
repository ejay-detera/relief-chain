begin;

create extension if not exists pgtap with schema extensions;
select plan(35);

select has_table('public', 'audit_events', 'audit events table exists');
select has_column('public', 'audit_events', 'actor_identifier',
  'audit events record the actor');
select has_column('public', 'audit_events', 'organization_id',
  'audit events record the organization');
select has_column('public', 'audit_events', 'action',
  'audit events record the action');
select has_column('public', 'audit_events', 'correlation_id',
  'audit events record the correlation ID');
select has_column('public', 'audit_events', 'sensitive_data_access',
  'audit events identify sensitive-data access');
select has_column('public', 'audit_events', 'metadata',
  'audit events store redacted metadata');
select has_index('public', 'audit_events',
  'audit_events_organization_occurred_at_idx',
  'organization audit history is indexed');
select has_index('public', 'audit_events', 'audit_events_correlation_id_idx',
  'correlation lookup is indexed');
select ok(
  not has_table_privilege('authenticated', 'public.audit_events', 'UPDATE'),
  'authenticated users cannot update audit events'
);
select ok(
  not has_table_privilege('authenticated', 'public.audit_events', 'DELETE'),
  'authenticated users cannot delete audit events'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.append_audit_event(uuid,uuid,text,uuid,boolean,jsonb)',
    'EXECUTE'
  ),
  'service role has the narrow audit append path'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.append_audit_event(uuid,uuid,text,uuid,boolean,jsonb)',
    'EXECUTE'
  ),
  'authenticated clients cannot forge audit events'
);
select enum_has_labels(
  'public',
  'sensitive_financial_action',
  array[
    'program_activation',
    'disbursement_authorization',
    'wallet_rotation',
    'merchant_wallet_change',
    'refund',
    'emergency_control',
    'cash_out'
  ],
  'the MFA gate enumerates every requirement-sensitive action'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '61000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'audit-admin@example.test', '', now(),
    '{"provider":"email","providers":["email"]}',
    '{"role":"lgu"}', now(), now()
  ),
  (
    '61000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'audit-outsider@example.test', '', now(),
    '{"provider":"email","providers":["email"]}',
    '{"role":"lgu"}', now(), now()
  );

insert into public.organizations (id, name, slug)
values (
  '62000000-0000-0000-0000-000000000001',
  'Audit Test Organization',
  'audit-test-organization'
);

select public.upsert_organization_membership(
  '62000000-0000-0000-0000-000000000001',
  '61000000-0000-0000-0000-000000000001',
  'organization_administrator',
  '61000000-0000-0000-0000-000000000001'
);

insert into public.programs (
  id, organization_id, name, status, created_by
)
values (
  '63000000-0000-0000-0000-000000000001',
  '62000000-0000-0000-0000-000000000001',
  'MFA Test Program',
  'draft',
  '61000000-0000-0000-0000-000000000001'
);

insert into public.enrollments (
  id, beneficiary_id, program_id, approval_status, category
)
values (
  '64000000-0000-0000-0000-000000000001',
  '61000000-0000-0000-0000-000000000002',
  '63000000-0000-0000-0000-000000000001',
  'Pending',
  'Food'
);

select public.append_audit_event(
  '62000000-0000-0000-0000-000000000001',
  '61000000-0000-0000-0000-000000000001',
  'sensitive.identity.read',
  '65000000-0000-0000-0000-000000000001',
  true,
  '{"resource":"beneficiary_identity","password":"secret","nested":{"government_id":"1234","safe":"retained"}}'
);

select is(
  (select count(*)::integer from public.audit_events),
  1,
  'the service append path records one audit event'
);
select is(
  (
    select actor_user_id
    from public.audit_events
    where correlation_id = '65000000-0000-0000-0000-000000000001'
  ),
  '61000000-0000-0000-0000-000000000001'::uuid,
  'the append path records the supplied authenticated actor'
);
select is(
  (
    select organization_id
    from public.audit_events
    where correlation_id = '65000000-0000-0000-0000-000000000001'
  ),
  '62000000-0000-0000-0000-000000000001'::uuid,
  'the append path records the organization'
);
select is(
  (
    select action || ':' || sensitive_data_access::text
    from public.audit_events
    where correlation_id = '65000000-0000-0000-0000-000000000001'
  ),
  'sensitive.identity.read:true',
  'the append path records action and sensitive access'
);

select is(
  (
    select metadata ->> 'password'
    from public.audit_events
    where correlation_id = '65000000-0000-0000-0000-000000000001'
  ),
  '[REDACTED]',
  'top-level secrets are redacted from audit metadata'
);
select is(
  (
    select metadata #>> '{nested,government_id}'
    from public.audit_events
    where correlation_id = '65000000-0000-0000-0000-000000000001'
  ),
  '[REDACTED]',
  'nested identity data is redacted from audit metadata'
);
select is(
  (
    select metadata #>> '{nested,safe}'
    from public.audit_events
    where correlation_id = '65000000-0000-0000-0000-000000000001'
  ),
  'retained',
  'non-sensitive diagnostic metadata is retained'
);

select throws_ok(
  $$update public.audit_events set action = 'tampered'$$,
  '55000',
  'audit events are append-only',
  'even a privileged writer cannot update audit history'
);
select throws_ok(
  $$delete from public.audit_events$$,
  '55000',
  'audit events are append-only',
  'even a privileged writer cannot delete audit history'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '61000000-0000-0000-0000-000000000001',
  true
);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '61000000-0000-0000-0000-000000000001',
    'role', 'authenticated',
    'aal', 'aal1',
    'amr', jsonb_build_array(
      jsonb_build_object(
        'method', 'password',
        'timestamp', extract(epoch from now())::bigint
      )
    )
  )::text,
  true
);

select ok(
  not private.has_recent_step_up(),
  'AAL1 is not sufficient for a sensitive financial action'
);
select throws_ok(
  $$update public.programs
    set status = 'active'
    where id = '63000000-0000-0000-0000-000000000001'$$,
  '42501',
  'new row violates row-level security policy for table "programs"',
  'AAL1 cannot activate a program'
);
select throws_ok(
  $$insert into public.disbursements (
      program_id, program_name, amount, recipients_count
    ) values (
      '63000000-0000-0000-0000-000000000001',
      'MFA Test Program', 100, 1
    )$$,
  '42501',
  'new row violates row-level security policy for table "disbursements"',
  'AAL1 cannot authorize a disbursement'
);

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '61000000-0000-0000-0000-000000000001',
    'role', 'authenticated',
    'aal', 'aal2',
    'amr', jsonb_build_array(
      jsonb_build_object(
        'method', 'totp',
        'timestamp', extract(epoch from now() - interval '11 minutes')::bigint
      )
    )
  )::text,
  true
);
select ok(
  not private.has_recent_step_up(),
  'stale AAL2 authentication is not a recent step-up'
);

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '61000000-0000-0000-0000-000000000001',
    'role', 'authenticated',
    'aal', 'aal2',
    'amr', jsonb_build_array(
      jsonb_build_object(
        'method', 'totp',
        'timestamp', extract(epoch from now())::bigint
      )
    )
  )::text,
  true
);
select set_config(
  'request.headers',
  '{"x-correlation-id":"65000000-0000-0000-0000-000000000002"}',
  true
);
select ok(
  private.has_recent_step_up(),
  'recent AAL2 MFA satisfies the shared step-up gate'
);

-- Property-style exhaustive coverage over the finite requirement action domain.
-- Validates: Requirements 20.1, 20.2
select lives_ok(
  $$do $block$
    declare
      action public.sensitive_financial_action;
    begin
      foreach action in array enum_range(null::public.sensitive_financial_action)
      loop
        perform private.require_sensitive_action(action);
      end loop;
    end
  $block$$$,
  'every enumerated sensitive action accepts only the shared recent-AAL2 gate'
);
select lives_ok(
  $$update public.programs
    set status = 'active'
    where id = '63000000-0000-0000-0000-000000000001'$$,
  'recent AAL2 can activate an authorized organization program'
);
select lives_ok(
  $$insert into public.disbursements (
      program_id, program_name, amount, recipients_count
    ) values (
      '63000000-0000-0000-0000-000000000001',
      'MFA Test Program', 100, 1
    )$$,
  'recent AAL2 can authorize an organization disbursement'
);
select lives_ok(
  $$update public.enrollments
    set approval_status = 'Approved'
    where id = '64000000-0000-0000-0000-000000000001'$$,
  'an authorized eligibility decision is recorded'
);

select is(
  (
    select count(*)::integer
    from public.audit_events
    where action = 'eligibility.decision.recorded'
      and actor_user_id = '61000000-0000-0000-0000-000000000001'
      and correlation_id = '65000000-0000-0000-0000-000000000002'
      and metadata ->> 'decision' = 'approved'
  ),
  1,
  'eligibility decisions retain actor, organization, action, correlation, and redacted metadata'
);
select is(
  (select count(*)::integer from public.audit_events),
  2,
  'authorized organization administrators can read their audit history'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '61000000-0000-0000-0000-000000000002',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"61000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2","amr":[]}',
  true
);
select is(
  (select count(*)::integer from public.audit_events),
  0,
  'actors outside the organization cannot read its audit events'
);

reset role;
select * from finish();
rollback;
begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table(
  'public', 'beneficiary_identity_reverifications',
  'identity re-verification evidence table exists'
);
select has_table('public', 'wallet_rotation_intents', 'wallet rotation intents exist');
select has_type('public', 'wallet_rotation_status', 'wallet rotation status enum exists');
select has_column(
  'public', 'wallet_rotation_intents', 'beneficiary_identity_id',
  'rotation intent preserves the stable beneficiary identity'
);
select has_column(
  'public', 'wallet_rotation_intents', 'identity_reverification_id',
  'rotation intent references fresh identity evidence'
);
select has_column(
  'public', 'wallet_rotation_intents', 'step_up_verified_at',
  'rotation intent records recent step-up enforcement'
);
select ok(
  not has_table_privilege('authenticated', 'public.wallet_rotation_intents', 'INSERT'),
  'clients cannot insert rotation intents directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.wallet_rotation_intents', 'UPDATE'),
  'clients cannot update rotation intents directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.beneficiary_identity_reverifications', 'INSERT'),
  'clients cannot fabricate identity re-verification evidence'
);
select is(
  (
    select count(*)::integer
    from information_schema.columns
    where table_schema = 'public'
      and table_name in ('wallet_rotation_intents', 'beneficiary_identity_reverifications')
      and column_name ~ '(private|secret|seed|mnemonic|signature|challenge)'
  ),
  0,
  'rotation storage has no private-key, signature, or raw challenge columns'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.request_wallet_rotation(uuid,uuid,uuid,uuid,uuid,text,uuid)',
    'EXECUTE'
  ),
  'beneficiaries can use only the guarded rotation request path'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.issue_wallet_proof_challenge(uuid,wallet_owner_type,uuid,wallet_purpose,text,text,timestamptz)',
    'EXECUTE'
  ),
  'clients cannot fabricate challenge state'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.complete_wallet_proof(uuid,text,text,uuid)',
    'EXECUTE'
  ),
  'trusted server code can complete externally verified proof'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '81000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'rotation-beneficiary@example.test', '', now(),
    '{"provider":"email","providers":["email"]}',
    '{"role":"beneficiary"}', now(), now()
  ),
  (
    '81000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'rotation-verifier@example.test', '', now(),
    '{"provider":"email","providers":["email"]}',
    '{"role":"lgu"}', now(), now()
  );

insert into public.organizations (id, name, slug)
values (
  '82000000-0000-0000-0000-000000000001',
  'Wallet Rotation Organization', 'wallet-rotation-organization'
);
select public.upsert_organization_membership(
  '82000000-0000-0000-0000-000000000001',
  '81000000-0000-0000-0000-000000000002',
  'beneficiary_verifier',
  '81000000-0000-0000-0000-000000000002'
);

update public.beneficiary_identities
set verification_status = 'Verified',
    verified_at = now(),
    verified_by = '81000000-0000-0000-0000-000000000002'
where user_id = '81000000-0000-0000-0000-000000000001';

insert into public.programs (
  id, organization_id, name, status, created_by
)
values (
  '83000000-0000-0000-0000-000000000001',
  '82000000-0000-0000-0000-000000000001',
  'Wallet Rotation Program', 'draft',
  '81000000-0000-0000-0000-000000000002'
);
insert into public.enrollments (
  id, beneficiary_id, program_id, approval_status, category
)
values (
  '84000000-0000-0000-0000-000000000001',
  '81000000-0000-0000-0000-000000000001',
  '83000000-0000-0000-0000-000000000001',
  'Approved', 'Food'
);

select lives_ok(
  format(
    'select public.issue_wallet_proof_challenge(%L, %L, %L, %L, %L, %L, now() + interval ''5 minutes'')',
    '85000000-0000-0000-0000-000000000001'::uuid,
    'beneficiary_identity'::public.wallet_owner_type,
    (select id from public.beneficiary_identities
      where user_id = '81000000-0000-0000-0000-000000000001'),
    'beneficiary'::public.wallet_purpose,
    'G' || repeat('A', 55), repeat('a', 64)
  ),
  'trusted server code can issue a digest-only challenge for a new binding'
);
select lives_ok(
  $$select public.complete_wallet_proof(
    '85000000-0000-0000-0000-000000000001',
    repeat('a', 64), repeat('b', 64),
    '81000000-0000-0000-0000-000000000001'
  )$$,
  'a verified challenge activates the first beneficiary wallet'
);
select lives_ok(
  format(
    'select public.issue_wallet_proof_challenge(%L, %L, %L, %L, %L, %L, now() + interval ''5 minutes''); select public.complete_wallet_proof(%L, %L, %L, %L)',
    '85000000-0000-0000-0000-000000000002'::uuid,
    'beneficiary_identity'::public.wallet_owner_type,
    (select id from public.beneficiary_identities
      where user_id = '81000000-0000-0000-0000-000000000001'),
    'beneficiary'::public.wallet_purpose,
    'G' || repeat('B', 55), repeat('c', 64),
    '85000000-0000-0000-0000-000000000002'::uuid,
    repeat('c', 64), repeat('d', 64),
    '81000000-0000-0000-0000-000000000001'::uuid
  ),
  'replacement binding must independently prove possession and remains inactive'
);
select is(
  (
    select string_agg(id::text || ':' || is_active::text, ',' order by id)
    from public.wallets
    where id in (
      '85000000-0000-0000-0000-000000000001',
      '85000000-0000-0000-0000-000000000002'
    )
  ),
  '85000000-0000-0000-0000-000000000001:true,85000000-0000-0000-0000-000000000002:false',
  'proof does not silently replace an active wallet'
);

select lives_ok(
  $$select public.record_beneficiary_identity_reverification(
    '82000000-0000-0000-0000-000000000001',
    (select id from public.beneficiary_identities
      where user_id = '81000000-0000-0000-0000-000000000001'),
    'in_person', repeat('e', 64),
    '81000000-0000-0000-0000-000000000002',
    now() + interval '1 hour',
    '86000000-0000-0000-0000-000000000001'
  )$$,
  'authorized verifier can append digest-only identity re-verification evidence'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '81000000-0000-0000-0000-000000000001', true
);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '81000000-0000-0000-0000-000000000001',
    'role', 'authenticated', 'aal', 'aal1',
    'amr', jsonb_build_array(jsonb_build_object(
      'method', 'password', 'timestamp', extract(epoch from now())::bigint
    ))
  )::text,
  true
);
select throws_ok(
  $$select public.request_wallet_rotation(
    '82000000-0000-0000-0000-000000000001',
    (select id from public.beneficiary_identities
      where user_id = '81000000-0000-0000-0000-000000000001'),
    '85000000-0000-0000-0000-000000000001',
    '85000000-0000-0000-0000-000000000002',
    (select id from public.beneficiary_identity_reverifications limit 1),
    'rotation-1', '86000000-0000-0000-0000-000000000002'
  )$$,
  '42501',
  'AAL2 authentication is required for wallet_rotation',
  'AAL1 cannot request wallet rotation'
);

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '81000000-0000-0000-0000-000000000001',
    'role', 'authenticated', 'aal', 'aal2',
    'amr', jsonb_build_array(jsonb_build_object(
      'method', 'totp',
      'timestamp', extract(epoch from now() - interval '11 minutes')::bigint
    ))
  )::text,
  true
);
select throws_ok(
  $$select public.request_wallet_rotation(
    '82000000-0000-0000-0000-000000000001',
    (select id from public.beneficiary_identities
      where user_id = '81000000-0000-0000-0000-000000000001'),
    '85000000-0000-0000-0000-000000000001',
    '85000000-0000-0000-0000-000000000002',
    (select id from public.beneficiary_identity_reverifications limit 1),
    'rotation-1', '86000000-0000-0000-0000-000000000002'
  )$$,
  '42501',
  'recent step-up authentication is required for wallet_rotation',
  'stale AAL2 cannot request wallet rotation'
);

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '81000000-0000-0000-0000-000000000001',
    'role', 'authenticated', 'aal', 'aal2',
    'amr', jsonb_build_array(jsonb_build_object(
      'method', 'totp', 'timestamp', extract(epoch from now())::bigint
    ))
  )::text,
  true
);
select lives_ok(
  $$select public.request_wallet_rotation(
    '82000000-0000-0000-0000-000000000001',
    (select id from public.beneficiary_identities
      where user_id = '81000000-0000-0000-0000-000000000001'),
    '85000000-0000-0000-0000-000000000001',
    '85000000-0000-0000-0000-000000000002',
    (select id from public.beneficiary_identity_reverifications limit 1),
    'rotation-1', '86000000-0000-0000-0000-000000000002'
  )$$,
  'fresh AAL2 plus identity re-verification creates a rotation intent'
);
select lives_ok(
  $$select public.request_wallet_rotation(
    '82000000-0000-0000-0000-000000000001',
    (select id from public.beneficiary_identities
      where user_id = '81000000-0000-0000-0000-000000000001'),
    '85000000-0000-0000-0000-000000000001',
    '85000000-0000-0000-0000-000000000002',
    (select id from public.beneficiary_identity_reverifications limit 1),
    'rotation-1', '86000000-0000-0000-0000-000000000099'
  )$$,
  'rotation request retry is idempotent despite a new transport correlation ID'
);
select is(
  (select count(*)::integer from public.wallet_rotation_intents),
  1,
  'idempotent rotation retry creates exactly one intent'
);
reset role;

insert into public.idempotency_keys (
  id, organization_id, scope, idempotency_key, payload_hash,
  operation_type, correlation_id
)
values (
  '87000000-0000-0000-0000-000000000001',
  '82000000-0000-0000-0000-000000000001',
  'wallet.rotation', 'rotation-1', repeat('f', 64),
  'wallet_rotation', '86000000-0000-0000-0000-000000000002'
);
insert into public.financial_intents (
  id, organization_id, beneficiary_identity_id, idempotency_key_id,
  operation_type, payload_hash, correlation_id, requested_by
)
values (
  '88000000-0000-0000-0000-000000000001',
  '82000000-0000-0000-0000-000000000001',
  (select id from public.beneficiary_identities
    where user_id = '81000000-0000-0000-0000-000000000001'),
  '87000000-0000-0000-0000-000000000001',
  'wallet_rotation', repeat('f', 64),
  '86000000-0000-0000-0000-000000000002',
  '81000000-0000-0000-0000-000000000001'
);

select lives_ok(
  $$do $block$
  declare
    rotation_id uuid := (select id from public.wallet_rotation_intents limit 1);
  begin
    perform public.transition_wallet_rotation_intent(
      rotation_id, 'approved',
      '81000000-0000-0000-0000-000000000002',
      '88000000-0000-0000-0000-000000000001', null
    );
    perform public.transition_wallet_rotation_intent(
      rotation_id, 'submitted',
      '81000000-0000-0000-0000-000000000002', null, null
    );
    perform public.transition_wallet_rotation_intent(
      rotation_id, 'confirmed',
      '81000000-0000-0000-0000-000000000002', null, null
    );
  end
  $block$$$,
  'trusted reconciliation can advance and atomically confirm a valid rotation'
);
select is(
  (
    select old_wallet.is_active::text || '|' || new_wallet.is_active::text
      || '|' || (old_wallet.superseded_by_wallet_id = new_wallet.id)::text
      || '|' || intent.status::text
      || '|' || (old_wallet.owner_id = new_wallet.owner_id)::text
    from public.wallet_rotation_intents intent
    join public.wallets old_wallet on old_wallet.id = intent.current_wallet_id
    join public.wallets new_wallet on new_wallet.id = intent.replacement_wallet_id
  ),
  'false|true|true|confirmed|true',
  'confirmation preserves stable identity and history while changing current authority'
);
select is(
  (
    select count(*)::integer from public.audit_events
    where action in (
      'wallet.identity_reverified', 'wallet.rotation.requested',
      'wallet.rotation.approved', 'wallet.rotation.submitted',
      'wallet.rotation.confirmed'
    )
  ),
  5,
  'identity and rotation lifecycle changes are audited'
);
select throws_ok(
  $$update public.beneficiary_identity_reverifications
    set evidence_digest = repeat('0', 64)$$,
  '55000',
  'identity re-verification evidence is append-only',
  'identity re-verification evidence cannot be rewritten'
);

select * from finish();
rollback;

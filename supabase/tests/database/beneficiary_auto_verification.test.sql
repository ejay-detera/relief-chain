-- MVP-only auto-verification of new beneficiary accounts
-- (migration 20261005020000_mvp_auto_verify_new_beneficiaries.sql).
--
-- A role=beneficiary sign-up must produce Verified in BOTH
-- public.profiles.verification_status and
-- public.beneficiary_identities.verification_status; every other role must be
-- unchanged (Pending); the safeguards around the sign-up trigger and the
-- re-verification evidence path must be unchanged.
begin;

create extension if not exists pgtap with schema extensions;
select plan(16);

-- Beneficiary fixtures must carry every field required by
-- profiles_beneficiary_required_fields_check (full_name, gov_id,
-- complete_address, mobile_number, household_size), or the sign-up fails.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '91000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'autoverify-beneficiary@example.test', '', now(),
    '{"provider":"email","providers":["email"]}',
    '{"role":"beneficiary","full_name":"Auto Verify Beneficiary","gov_id":"AV-GOV-0001","complete_address":"1 Test Street","mobile_number":"+639170000001","household_size":4}',
    now(), now()
  ),
  (
    '91000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'autoverify-lgu@example.test', '', now(),
    '{"provider":"email","providers":["email"]}',
    '{"role":"lgu","organization_name":"Auto Verify Organization","organization_type":"NGO","location":"Test City","representative_first_name":"Test","representative_last_name":"Rep","representative_position":"Director","organization_document_reference":"DOC-TEST"}', now(), now()
  ),
  (
    '91000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'autoverify-merchant@example.test', '', now(),
    '{"provider":"email","providers":["email"]}',
    '{"role":"merchant","full_name":"Auto Verify Merchant"}', now(), now()
  ),
  (
    '91000000-0000-0000-0000-000000000004',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'autoverify-privileged@example.test', '', now(),
    '{"provider":"email","providers":["email"]}',
    '{"role":"super_admin"}', now(), now()
  ),
  (
    '91000000-0000-0000-0000-000000000005',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'autoverify-norole@example.test', '', now(),
    '{"provider":"email","providers":["email"]}',
    '{}', now(), now()
  );

-- ---------------------------------------------------------------------------
-- Beneficiary sign-up: Verified in both tables, no evidence columns stamped.
-- ---------------------------------------------------------------------------
select is(
  (select verification_status from public.profiles
    where id = '91000000-0000-0000-0000-000000000001'),
  'Verified',
  'a new beneficiary profile is created Verified (MVP auto-verification)'
);
select is(
  (
    select count(*)::integer from public.beneficiary_identities
    where user_id = '91000000-0000-0000-0000-000000000001'
      and verification_status = 'Verified'
  ),
  1,
  'the new beneficiary has exactly one stable identity and it is Verified'
);
select ok(
  (
    select verified_at is null and verified_by is null and data_status = 'active'
    from public.beneficiary_identities
    where user_id = '91000000-0000-0000-0000-000000000001'
  ),
  'auto-verification stamps no verifier evidence and leaves the identity active'
);

-- ---------------------------------------------------------------------------
-- Other roles are unchanged.
-- ---------------------------------------------------------------------------
select is(
  (select verification_status from public.profiles
    where id = '91000000-0000-0000-0000-000000000002'),
  'Pending',
  'a new lgu profile still starts Pending'
);
select is(
  (
    select count(*)::integer from public.beneficiary_identities
    where user_id = '91000000-0000-0000-0000-000000000002'
  ),
  0,
  'a new lgu account does not receive a beneficiary identity'
);
select is(
  (select verification_status from public.profiles
    where id = '91000000-0000-0000-0000-000000000003'),
  'Pending',
  'a new merchant profile still starts Pending'
);
select is(
  (select role || '|' || verification_status from public.profiles
    where id = '91000000-0000-0000-0000-000000000004'),
  'merchant|Pending',
  'an unknown or privileged role in sign-up metadata still falls back to a Pending merchant'
);
select is(
  (select role || '|' || verification_status from public.profiles
    where id = '91000000-0000-0000-0000-000000000005'),
  'merchant|Pending',
  'a sign-up without role metadata still falls back to a Pending merchant'
);

-- ---------------------------------------------------------------------------
-- Downstream gates behave as intended; evidence requirements are not bypassed.
-- ---------------------------------------------------------------------------
select lives_ok(
  format(
    'select public.issue_wallet_proof_challenge(%L, %L, %L, %L, %L, %L, now() + interval ''5 minutes'')',
    '92000000-0000-0000-0000-000000000001'::uuid,
    'beneficiary_identity'::public.wallet_owner_type,
    (select id from public.beneficiary_identities
      where user_id = '91000000-0000-0000-0000-000000000001'),
    'beneficiary'::public.wallet_purpose,
    'G' || repeat('A', 55), repeat('a', 64)
  ),
  'an auto-verified identity passes the verified-identity wallet challenge precondition'
);
select throws_ok(
  $$select public.record_beneficiary_identity_reverification(
    '93000000-0000-0000-0000-000000000001',
    (select id from public.beneficiary_identities
      where user_id = '91000000-0000-0000-0000-000000000001'),
    'in_person', repeat('e', 64),
    '91000000-0000-0000-0000-000000000002',
    now() + interval '1 hour',
    '94000000-0000-0000-0000-000000000001'
  )$$,
  '42501',
  'beneficiary verifier role is required',
  'auto-verification does not bypass the verifier role needed for re-verification evidence'
);

-- ---------------------------------------------------------------------------
-- Guards on the sign-up trigger itself.
-- ---------------------------------------------------------------------------
select ok(
  not has_function_privilege('authenticated', 'public.handle_new_user()', 'EXECUTE'),
  'authenticated clients still cannot execute the sign-up trigger function'
);
select ok(
  not has_function_privilege('anon', 'public.handle_new_user()', 'EXECUTE'),
  'anonymous clients still cannot execute the sign-up trigger function'
);
select has_trigger(
  'public', 'profiles', 'profiles_ensure_beneficiary_identity',
  'the identity-creating trigger on profiles is still in place'
);
select has_trigger(
  'auth', 'users', 'on_auth_user_created',
  'the sign-up trigger on auth.users is still in place'
);
select ok(
  pg_get_functiondef('public.handle_new_user()'::regprocedure)
    like '%requested_role = ''beneficiary''%',
  'auto-verification is conditioned on the server-derived beneficiary role'
);
select ok(
  split_part(
    lower(pg_get_functiondef('public.handle_new_user()'::regprocedure)),
    'on conflict',
    2
  ) not like '%verification_status%',
  'the conflict branch never rewrites verification_status of an existing profile'
);

select * from finish();
rollback;

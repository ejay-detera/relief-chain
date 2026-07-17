begin;

create extension if not exists pgtap with schema extensions;
select plan(33);

select has_table(
  'public',
  'beneficiary_identities',
  'stable beneficiary identities table exists'
);
select has_table(
  'public',
  'disaster_response_campaigns',
  'disaster response campaigns table exists'
);
select has_column(
  'public',
  'enrollments',
  'beneficiary_identity_id',
  'enrollments reference the stable beneficiary identity'
);
select has_column(
  'public',
  'enrollments',
  'campaign_id',
  'enrollments carry a derived campaign scope'
);
select has_index(
  'public',
  'enrollments',
  'enrollments_beneficiary_identity_program_key',
  'program enrollment uniqueness uses stable identity'
);
select has_index(
  'public',
  'enrollments',
  'enrollments_beneficiary_identity_campaign_key',
  'campaign enrollment uniqueness uses stable identity'
);
select ok(
  (
    select relation.relrowsecurity
    from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace
      on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'beneficiary_identities'
  ),
  'beneficiary identities have row level security enabled'
);
select ok(
  (
    select relation.relrowsecurity
    from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace
      on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'disaster_response_campaigns'
  ),
  'campaigns have row level security enabled'
);
select ok(
  not has_table_privilege('authenticated', 'public.beneficiary_identities', 'INSERT'),
  'authenticated users cannot create identity records directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.beneficiary_identities', 'UPDATE'),
  'authenticated users cannot mutate identity verification directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.beneficiary_identities', 'DELETE'),
  'authenticated users cannot delete stable identities'
);
select ok(
  not has_table_privilege('authenticated', 'public.disaster_response_campaigns', 'INSERT'),
  'authenticated users cannot create campaign scopes directly'
);
insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '31000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'identity-one@example.test',
    '',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"role":"beneficiary"}',
    now(),
    now()
  ),
  (
    '31000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'identity-two@example.test',
    '',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"role":"beneficiary"}',
    now(),
    now()
  );

select is(
  (
    select count(*)::integer
    from public.beneficiary_identities
    where user_id in (
      '31000000-0000-0000-0000-000000000001',
      '31000000-0000-0000-0000-000000000002'
    )
  ),
  2,
  'beneficiary profile creation establishes one stable identity per user'
);
select ok(
  not exists (
    select 1
    from public.beneficiary_identities
    where id = user_id
      and user_id in (
        '31000000-0000-0000-0000-000000000001',
        '31000000-0000-0000-0000-000000000002'
      )
  ),
  'stable identity identifiers are distinct from profile and user identifiers'
);

insert into public.organizations (id, name, slug)
values (
  '32000000-0000-0000-0000-000000000001',
  'Identity Test Organization',
  'identity-test-organization'
);

insert into public.disaster_response_campaigns (
  id,
  organization_id,
  code,
  name
)
values
  (
    '33000000-0000-0000-0000-000000000001',
    '32000000-0000-0000-0000-000000000001',
    'TYPHOON-A',
    'Typhoon A Response'
  ),
  (
    '33000000-0000-0000-0000-000000000002',
    '32000000-0000-0000-0000-000000000001',
    'FLOOD-B',
    'Flood B Response'
  );
insert into public.programs (
  id, name, campaign_id, created_by, organization_id
)
values
  (
    '34000000-0000-0000-0000-000000000001',
    'Typhoon Food',
    '33000000-0000-0000-0000-000000000001',
    '31000000-0000-0000-0000-000000000001',
    '32000000-0000-0000-0000-000000000001'
  ),
  (
    '34000000-0000-0000-0000-000000000002',
    'Typhoon Medicine',
    '33000000-0000-0000-0000-000000000001',
    '31000000-0000-0000-0000-000000000001',
    '32000000-0000-0000-0000-000000000001'
  ),
  (
    '34000000-0000-0000-0000-000000000003',
    'Flood Food',
    '33000000-0000-0000-0000-000000000002',
    '31000000-0000-0000-0000-000000000001',
    '32000000-0000-0000-0000-000000000001'
  ),
  (
    '34000000-0000-0000-0000-000000000004',
    'Unrelated Cash',
    null,
    '31000000-0000-0000-0000-000000000001',
    '32000000-0000-0000-0000-000000000001'
  ),
  (
    '34000000-0000-0000-0000-000000000005',
    'Unrelated School Supplies',
    null,
    '31000000-0000-0000-0000-000000000001',
    '32000000-0000-0000-0000-000000000001'
  );

select lives_ok(
  $$insert into public.enrollments (
    beneficiary_id,
    program_id,
    approval_status,
    voucher_balance,
    category
  ) values (
    '31000000-0000-0000-0000-000000000001',
    '34000000-0000-0000-0000-000000000001',
    'Approved',
    1250,
    'Food'
  )$$,
  'legacy profile-based enrollment inserts remain supported'
);
select ok(
  (
    select beneficiary_identity_id is not null
    from public.enrollments
    where beneficiary_id = '31000000-0000-0000-0000-000000000001'
      and program_id = '34000000-0000-0000-0000-000000000001'
  ),
  'legacy enrollment receives its canonical stable identity'
);
select is(
  (
    select campaign_id
    from public.enrollments
    where beneficiary_id = '31000000-0000-0000-0000-000000000001'
      and program_id = '34000000-0000-0000-0000-000000000001'
  ),
  '33000000-0000-0000-0000-000000000001'::uuid,
  'enrollment campaign scope is derived from its program'
);
select throws_ok(
  $$insert into public.enrollments (
    beneficiary_id, program_id, category
  ) values (
    '31000000-0000-0000-0000-000000000001',
    '34000000-0000-0000-0000-000000000002',
    'Medicine'
  )$$,
  '23505',
  'duplicate key value violates unique constraint "enrollments_beneficiary_identity_campaign_key"',
  'one identity cannot enroll twice in the same campaign'
);
select lives_ok(
  $$insert into public.enrollments (
    beneficiary_id, program_id, category
  ) values (
    '31000000-0000-0000-0000-000000000001',
    '34000000-0000-0000-0000-000000000003',
    'Food'
  )$$,
  'the same identity can enroll in a different campaign'
);
select lives_ok(
  $$insert into public.enrollments (
    beneficiary_id, program_id, category
  ) values (
    '31000000-0000-0000-0000-000000000001',
    '34000000-0000-0000-0000-000000000004',
    'Cash'
  )$$,
  'an identity can enroll in an unrelated program without a campaign'
);
select lives_ok(
  $$insert into public.enrollments (
    beneficiary_id, program_id, category
  ) values (
    '31000000-0000-0000-0000-000000000001',
    '34000000-0000-0000-0000-000000000005',
    'School Supplies'
  )$$,
  'an identity can enroll in another unrelated program'
);

-- Set-based invariant check across all unrelated-program enrollments.
-- Validates: Requirements 4.4
select is(
  (
    select count(*)::integer
    from public.enrollments
    where beneficiary_identity_id = (
      select id
      from public.beneficiary_identities
      where user_id = '31000000-0000-0000-0000-000000000001'
    )
      and campaign_id is null
  ),
  2,
  'every unrelated program remains independently eligible'
);

select lives_ok(
  $$insert into public.enrollments (
    beneficiary_id, program_id, category
  ) values (
    '31000000-0000-0000-0000-000000000002',
    '34000000-0000-0000-0000-000000000004',
    'Cash'
  )$$,
  'a second identity can enroll in the same program'
);
select throws_ok(
  $$insert into public.enrollments (
    beneficiary_id, program_id, category
  ) values (
    '31000000-0000-0000-0000-000000000002',
    '34000000-0000-0000-0000-000000000004',
    'Cash'
  )$$,
  '23505',
  'duplicate key value violates unique constraint "enrollments_beneficiary_identity_program_key"',
  'one identity cannot enroll twice in the same program'
);
select lives_ok(
  $$update public.profiles
    set stellar_pubkey = 'GTESTROTATEDWALLETPUBLICKEY'
    where id = '31000000-0000-0000-0000-000000000001'$$,
  'legacy wallet metadata can change without replacing identity'
);
select is(
  (
    select count(*)::integer
    from public.enrollments enrollment
    join public.beneficiary_identities identity
      on identity.id = enrollment.beneficiary_identity_id
    where identity.user_id = '31000000-0000-0000-0000-000000000001'
  ),
  4,
  'wallet metadata changes preserve identity and all enrollment history'
);
select is(
  (
    select approval_status || '|' || voucher_balance::text || '|' || category
    from public.enrollments
    where program_id = '34000000-0000-0000-0000-000000000001'
      and beneficiary_id = '31000000-0000-0000-0000-000000000001'
  ),
  'Approved|1250|Food',
  'legacy enrollment status, balance, and category are preserved'
);
select lives_ok(
  $$update public.enrollments
    set campaign_id = '33000000-0000-0000-0000-000000000002'
    where program_id = '34000000-0000-0000-0000-000000000001'
      and beneficiary_id = '31000000-0000-0000-0000-000000000001'$$,
  'direct campaign input is normalized to the program campaign'
);
select is(
  (
    select campaign_id
    from public.enrollments
    where program_id = '34000000-0000-0000-0000-000000000001'
      and beneficiary_id = '31000000-0000-0000-0000-000000000001'
  ),
  '33000000-0000-0000-0000-000000000001'::uuid,
  'clients cannot bypass campaign deduplication with a different campaign id'
);
select throws_ok(
  $$update public.programs
    set campaign_id = '33000000-0000-0000-0000-000000000001'
    where id = '34000000-0000-0000-0000-000000000004'$$,
  '23505',
  'duplicate key value violates unique constraint "enrollments_beneficiary_identity_campaign_key"',
  'campaign configuration cannot merge existing duplicate claims'
);

update public.programs
set created_by = null
where created_by = '31000000-0000-0000-0000-000000000001';

select lives_ok(
  $$delete from public.profiles
    where id = '31000000-0000-0000-0000-000000000001'$$,
  'a profile can be removed without deleting stable enrollment history'
);
select ok(
  (
    select count(*) = 4 and bool_and(beneficiary_id is null)
    from public.enrollments
    where beneficiary_identity_id = (
      select id
      from public.beneficiary_identities
      where user_id = '31000000-0000-0000-0000-000000000001'
    )
  ),
  'enrollments survive profile removal through their canonical identity'
);
select is(
  (
    select count(*)::integer
    from public.beneficiary_identities
    where user_id = '31000000-0000-0000-0000-000000000001'
  ),
  1,
  'stable identity survives profile removal'
);

select * from finish();
rollback;

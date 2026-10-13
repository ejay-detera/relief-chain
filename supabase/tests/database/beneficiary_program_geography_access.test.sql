-- Beneficiary read access to the geography of discoverable programs
-- (migration 20261006000000_beneficiary_read_discoverable_program_geography.sql).
--
-- A signed-in user may read program_barangays / program_areas rows only for
-- programs that are active AND public-or-invited. Draft programs and
-- non-invited private programs stay hidden; organization-member reads and the
-- write restrictions are unchanged. Also guards the enrollment gate that the
-- visible geography feeds (private.is_program_geo_eligible).
begin;

create extension if not exists pgtap with schema extensions;
select plan(22);

-- Fixture users:
--   ...01 organization A administrator (lgu)
--   ...02 organization B administrator (lgu)
--   ...03 beneficiary B1: registered barangay 1, invited to the private program
--   ...04 beneficiary B2: registered barangay 2, not invited
-- Beneficiary metadata carries every field required by
-- profiles_beneficiary_required_fields_check.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '95000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'geo-admin-a@example.test', '', now(),
    '{"provider":"email","providers":["email"]}',
    '{"role":"lgu","organization_name":"Geo Test Organization","organization_type":"NGO","location":"Test City","representative_first_name":"Test","representative_last_name":"Rep","representative_position":"Director","organization_document_reference":"DOC-TEST"}', now(), now()
  ),
  (
    '95000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'geo-admin-b@example.test', '', now(),
    '{"provider":"email","providers":["email"]}',
    '{"role":"lgu","organization_name":"Geo Test Organization","organization_type":"NGO","location":"Test City","representative_first_name":"Test","representative_last_name":"Rep","representative_position":"Director","organization_document_reference":"DOC-TEST"}', now(), now()
  ),
  (
    '95000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'geo-beneficiary-1@example.test', '', now(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object(
      'role', 'beneficiary',
      'full_name', 'Geo Beneficiary One',
      'gov_id', 'GEO-GOV-0001',
      'complete_address', '1 Geo Street',
      'mobile_number', '+639170000031',
      'household_size', 3,
      'area_id', (select area_id from public.barangays where id = 1),
      'barangay_id', 1
    ),
    now(), now()
  ),
  (
    '95000000-0000-0000-0000-000000000004',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'geo-beneficiary-2@example.test', '', now(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object(
      'role', 'beneficiary',
      'full_name', 'Geo Beneficiary Two',
      'gov_id', 'GEO-GOV-0002',
      'complete_address', '2 Geo Street',
      'mobile_number', '+639170000032',
      'household_size', 2,
      'area_id', (select area_id from public.barangays where id = 2),
      'barangay_id', 2
    ),
    now(), now()
  );

insert into public.organizations (id, name, slug)
values
  ('96000000-0000-0000-0000-000000000001', 'Geo Organization A', 'geo-organization-a'),
  ('96000000-0000-0000-0000-000000000002', 'Geo Organization B', 'geo-organization-b');
select public.upsert_organization_membership(
  '96000000-0000-0000-0000-000000000001',
  '95000000-0000-0000-0000-000000000001',
  'organization_administrator',
  '95000000-0000-0000-0000-000000000001'
);
select public.upsert_organization_membership(
  '96000000-0000-0000-0000-000000000002',
  '95000000-0000-0000-0000-000000000002',
  'organization_administrator',
  '95000000-0000-0000-0000-000000000002'
);

-- Verified organization A treasury wallet, required to activate a program
-- through the legitimate funding sequence (no trigger is disabled).
insert into public.wallets (
  id, owner_type, owner_id, purpose, address,
  verification_status, proof_challenge_digest,
  proof_challenge_issued_at, proof_challenge_expires_at,
  proof_signature_digest, verified_at, verified_by, is_active
)
values (
  '97000000-0000-0000-0000-000000000001',
  'organization', '96000000-0000-0000-0000-000000000001',
  'organization_treasury', 'G' || repeat('A', 55),
  'verified', repeat('a', 64), now(), now() + interval '5 minutes',
  repeat('b', 64), now(), '95000000-0000-0000-0000-000000000001', true
);

-- Program A-public (active, public), A-private (active, private), A-draft
-- (draft), all in organization A; B-draft is a draft program of organization B.
insert into public.programs (
  id, organization_id, name, status, aid_type, is_private,
  budget_stroops, asset_code, asset_issuer, asset_sac_address,
  treasury_wallet_id, voucher_contract_address,
  allocation_rules, per_beneficiary_limit_stroops,
  per_transaction_limit_stroops, daily_limit_stroops,
  expiry_policy, policy_expires_at, refund_policy, refund_window_ends_at,
  policy_version, contract_version, created_by
)
values
  (
    '98000000-0000-0000-0000-000000000001',
    '96000000-0000-0000-0000-000000000001',
    'Geo Public Program', 'draft', 'voucher', false,
    1000, 'RCPHP', 'G' || repeat('D', 55), 'C' || repeat('E', 55),
    '97000000-0000-0000-0000-000000000001', 'C' || repeat('F', 55),
    '{"strategy":"variable","allowed_categories":["Food"]}'::jsonb,
    1000, 600, 800,
    'fixed', now() + interval '30 days',
    'return_to_entitlement', now() + interval '60 days',
    1, 1, '95000000-0000-0000-0000-000000000001'
  ),
  (
    '98000000-0000-0000-0000-000000000002',
    '96000000-0000-0000-0000-000000000001',
    'Geo Private Program', 'draft', 'voucher', true,
    1000, 'RCPHP', 'G' || repeat('D', 55), 'C' || repeat('E', 55),
    '97000000-0000-0000-0000-000000000001', 'C' || repeat('G', 55),
    '{"strategy":"variable","allowed_categories":["Food"]}'::jsonb,
    1000, 600, 800,
    'fixed', now() + interval '30 days',
    'return_to_entitlement', now() + interval '60 days',
    1, 1, '95000000-0000-0000-0000-000000000001'
  );
update public.programs
set status = 'funding', funding_status = 'reserving'
where id in (
  '98000000-0000-0000-0000-000000000001',
  '98000000-0000-0000-0000-000000000002'
);
update public.programs
set funding_status = 'funded', funded_budget_stroops = budget_stroops,
    funding_transaction_hash = repeat('1', 64), funding_ledger = 100,
    funded_at = now(),
    activation_correlation_id = '99000000-0000-0000-0000-000000000001',
    activated_by = '95000000-0000-0000-0000-000000000001', status = 'active'
where id = '98000000-0000-0000-0000-000000000001';
update public.programs
set funding_status = 'funded', funded_budget_stroops = budget_stroops,
    funding_transaction_hash = repeat('2', 64), funding_ledger = 101,
    funded_at = now(),
    activation_correlation_id = '99000000-0000-0000-0000-000000000002',
    activated_by = '95000000-0000-0000-0000-000000000001', status = 'active'
where id = '98000000-0000-0000-0000-000000000002';

insert into public.programs (id, organization_id, name, created_by)
values
  (
    '98000000-0000-0000-0000-000000000003',
    '96000000-0000-0000-0000-000000000001',
    'Geo Draft Program', '95000000-0000-0000-0000-000000000001'
  ),
  (
    '98000000-0000-0000-0000-000000000004',
    '96000000-0000-0000-0000-000000000002',
    'Geo Other Organization Draft', '95000000-0000-0000-0000-000000000002'
  );

-- Every program is restricted to barangay 1 and that barangay's area.
insert into public.program_barangays (program_id, barangay_id)
select program_id, 1
from (values
  ('98000000-0000-0000-0000-000000000001'::uuid),
  ('98000000-0000-0000-0000-000000000002'::uuid),
  ('98000000-0000-0000-0000-000000000003'::uuid),
  ('98000000-0000-0000-0000-000000000004'::uuid)
) as program(program_id);
insert into public.program_areas (program_id, area_id)
select program_id, (select area_id from public.barangays where id = 1)
from (values
  ('98000000-0000-0000-0000-000000000001'::uuid),
  ('98000000-0000-0000-0000-000000000002'::uuid),
  ('98000000-0000-0000-0000-000000000003'::uuid),
  ('98000000-0000-0000-0000-000000000004'::uuid)
) as program(program_id);

-- Beneficiary B1 is on the private program's imported invite list (phone match).
insert into public.pending_sms_invites (program_id, phone_number, full_name)
values (
  '98000000-0000-0000-0000-000000000002', '+639170000031', 'Geo Beneficiary One'
);

-- ---------------------------------------------------------------------------
-- Beneficiary B1 (barangay 1, invited to the private program).
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '95000000-0000-0000-0000-000000000003', true);

select is(
  (select count(*)::integer from public.program_barangays
    where program_id = '98000000-0000-0000-0000-000000000001'),
  1,
  'a beneficiary can read the barangay coverage of an active public program'
);
select is(
  (select count(*)::integer from public.program_areas
    where program_id = '98000000-0000-0000-0000-000000000001'),
  1,
  'a beneficiary can read the area coverage of an active public program'
);
select is(
  (select count(*)::integer from public.program_barangays
    where program_id = '98000000-0000-0000-0000-000000000003'),
  0,
  'barangay coverage of a draft program stays hidden from a beneficiary'
);
select is(
  (select count(*)::integer from public.program_areas
    where program_id = '98000000-0000-0000-0000-000000000003'),
  0,
  'area coverage of a draft program stays hidden from a beneficiary'
);
select is(
  (select count(*)::integer from public.program_barangays
    where program_id = '98000000-0000-0000-0000-000000000002'),
  1,
  'an invited beneficiary can read the barangay coverage of a private program'
);
select is(
  (select count(*)::integer from public.program_areas
    where program_id = '98000000-0000-0000-0000-000000000002'),
  1,
  'an invited beneficiary can read the area coverage of a private program'
);
select lives_ok(
  $$insert into public.enrollments (beneficiary_id, program_id, approval_status, category)
    values (
      '95000000-0000-0000-0000-000000000003',
      '98000000-0000-0000-0000-000000000001',
      'Pending', 'Food'
    )$$,
  'a Verified beneficiary in the listed barangay can apply to the public program'
);
select throws_ok(
  $$insert into public.program_barangays (program_id, barangay_id)
    values ('98000000-0000-0000-0000-000000000001', 2)$$,
  '42501',
  'permission denied for table program_barangays',
  'a beneficiary still cannot write program coverage'
);

-- ---------------------------------------------------------------------------
-- Beneficiary B2 (barangay 2, not invited).
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '95000000-0000-0000-0000-000000000004', true);

select is(
  (select count(*)::integer from public.program_barangays
    where program_id = '98000000-0000-0000-0000-000000000001'),
  1,
  'coverage of a public program is visible even to a beneficiary outside it, so the app can say so'
);
select is(
  (select count(*)::integer from public.program_barangays
    where program_id = '98000000-0000-0000-0000-000000000002'),
  0,
  'barangay coverage of a private program stays hidden from a non-invited beneficiary'
);
select is(
  (select count(*)::integer from public.program_areas
    where program_id = '98000000-0000-0000-0000-000000000002'),
  0,
  'area coverage of a private program stays hidden from a non-invited beneficiary'
);
select throws_ok(
  $$insert into public.enrollments (beneficiary_id, program_id, approval_status, category)
    values (
      '95000000-0000-0000-0000-000000000004',
      '98000000-0000-0000-0000-000000000001',
      'Pending', 'Food'
    )$$,
  '42501',
  'new row violates row-level security policy for table "enrollments"',
  'a beneficiary outside the listed barangays is still refused at the database'
);
select throws_ok(
  $$insert into public.enrollments (beneficiary_id, program_id, approval_status, category)
    values (
      '95000000-0000-0000-0000-000000000004',
      '98000000-0000-0000-0000-000000000002',
      'Pending', 'Food'
    )$$,
  '42501',
  'new row violates row-level security policy for table "enrollments"',
  'a non-invited beneficiary is still refused on a private program'
);

-- ---------------------------------------------------------------------------
-- Organization members: existing policies unchanged, tenant isolation intact.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '95000000-0000-0000-0000-000000000001', true);

select is(
  (select count(*)::integer from public.program_barangays
    where program_id = '98000000-0000-0000-0000-000000000003'),
  1,
  'an organization member still reads the barangay coverage of its own draft program'
);
select is(
  (select count(*)::integer from public.program_areas
    where program_id = '98000000-0000-0000-0000-000000000003'),
  1,
  'an organization member still reads the area coverage of its own draft program'
);

select set_config('request.jwt.claim.sub', '95000000-0000-0000-0000-000000000002', true);

select is(
  (select count(*)::integer from public.program_barangays
    where program_id = '98000000-0000-0000-0000-000000000003'),
  0,
  'another organization cannot read barangay coverage of a draft program'
);
select is(
  (select count(*)::integer from public.program_areas
    where program_id = '98000000-0000-0000-0000-000000000003'),
  0,
  'another organization cannot read area coverage of a draft program'
);
select is(
  (select count(*)::integer from public.program_barangays
    where program_id = '98000000-0000-0000-0000-000000000002'),
  0,
  'another organization cannot read coverage of a private program it is not invited to'
);
select is(
  (select count(*)::integer from public.program_barangays
    where program_id = '98000000-0000-0000-0000-000000000001'),
  1,
  'coverage of an active public program is readable by any signed-in user, like the program itself'
);

reset role;

-- ---------------------------------------------------------------------------
-- Policy shape.
-- ---------------------------------------------------------------------------
select is(
  (
    select count(*)::integer from pg_policies
    where schemaname = 'public' and tablename = 'program_barangays'
      and policyname = 'Beneficiaries can view geography of discoverable programs'
      and cmd = 'SELECT' and roles = array['authenticated']::name[]
  ),
  1,
  'the barangay coverage policy is a SELECT policy limited to authenticated'
);
select is(
  (
    select count(*)::integer from pg_policies
    where schemaname = 'public' and tablename = 'program_areas'
      and policyname = 'Beneficiaries can view areas of discoverable programs'
      and cmd = 'SELECT' and roles = array['authenticated']::name[]
  ),
  1,
  'the area coverage policy is a SELECT policy limited to authenticated'
);

set local role anon;
select throws_ok(
  $$select count(*) from public.program_barangays$$,
  '42501',
  'permission denied for table program_barangays',
  'anonymous clients still cannot read program coverage'
);
reset role;

select * from finish();
rollback;

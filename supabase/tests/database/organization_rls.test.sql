begin;

create extension if not exists pgtap with schema extensions;
select plan(27);

select has_column(
  'public', 'programs', 'organization_id',
  'programs have a mandatory organization tenant anchor'
);
select col_not_null(
  'public', 'programs', 'organization_id',
  'program organization scope cannot be omitted'
);
select has_index(
  'public', 'programs', 'programs_organization_id_idx',
  'program tenant filtering is indexed'
);
select has_index(
  'public', 'enrollments', 'enrollments_program_id_idx',
  'indirect enrollment tenant filtering is indexed'
);
select has_index(
  'public', 'redemptions', 'redemptions_enrollment_id_idx',
  'indirect redemption tenant filtering is indexed'
);
select has_index(
  'public', 'disbursements', 'disbursements_program_id_idx',
  'indirect disbursement tenant filtering is indexed'
);
select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname in ('public', 'storage')
      and (
        policyname like 'LGU %'
        or policyname = 'Authenticated users can view LGU profiles'
        or policyname like 'Allow read/write access to authenticated users on program_%'
      )
  ),
  0,
  'legacy global LGU and unrestricted operational policies are removed'
);
select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename = any (array[
        'profiles', 'organizations', 'organization_memberships', 'programs',
        'program_areas', 'program_barangays', 'enrollments', 'redemptions',
        'disbursements', 'disaster_response_campaigns',
        'beneficiary_identities', 'wallets', 'merchant_metrics'
      ])
      and not (roles @> array['authenticated']::name[])
  ),
  0,
  'every private-domain policy has an explicit authenticated role clause'
);


insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '51000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'alpha-admin@example.test', '', now(),
    '{"provider":"email","providers":["email"]}',
    '{"role":"lgu"}', now(), now()
  ),
  (
    '51000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'beta-admin@example.test', '', now(),
    '{"provider":"email","providers":["email"]}',
    '{"role":"lgu"}', now(), now()
  ),
  (
    '51000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'alpha-beneficiary@example.test', '', now(),
    '{"provider":"email","providers":["email"]}',
    '{"role":"beneficiary"}', now(), now()
  ),
  (
    '51000000-0000-0000-0000-000000000004',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'beta-beneficiary@example.test', '', now(),
    '{"provider":"email","providers":["email"]}',
    '{"role":"beneficiary"}', now(), now()
  );

insert into public.organizations (id, name, slug)
values
  ('52000000-0000-0000-0000-000000000001', 'Alpha Organization', 'rls-alpha'),
  ('52000000-0000-0000-0000-000000000002', 'Beta Organization', 'rls-beta');

select public.upsert_organization_membership(
  '52000000-0000-0000-0000-000000000001',
  '51000000-0000-0000-0000-000000000001',
  'organization_administrator',
  '51000000-0000-0000-0000-000000000001'
);
select public.upsert_organization_membership(
  '52000000-0000-0000-0000-000000000002',
  '51000000-0000-0000-0000-000000000002',
  'organization_administrator',
  '51000000-0000-0000-0000-000000000002'
);

insert into public.disaster_response_campaigns (
  id, organization_id, code, name
)
values
  (
    '53000000-0000-0000-0000-000000000001',
    '52000000-0000-0000-0000-000000000001', 'ALPHA', 'Alpha Campaign'
  ),
  (
    '53000000-0000-0000-0000-000000000002',
    '52000000-0000-0000-0000-000000000002', 'BETA', 'Beta Campaign'
  );


insert into public.programs (
  id, organization_id, campaign_id, name, created_by
)
values
  (
    '54000000-0000-0000-0000-000000000001',
    '52000000-0000-0000-0000-000000000001',
    '53000000-0000-0000-0000-000000000001',
    'Alpha Program', '51000000-0000-0000-0000-000000000001'
  ),
  (
    '54000000-0000-0000-0000-000000000002',
    '52000000-0000-0000-0000-000000000002',
    '53000000-0000-0000-0000-000000000002',
    'Beta Program', '51000000-0000-0000-0000-000000000002'
  );

insert into public.program_areas (program_id, area_id)
values
  ('54000000-0000-0000-0000-000000000001', 1),
  ('54000000-0000-0000-0000-000000000002', 1);
insert into public.program_barangays (program_id, barangay_id)
values
  ('54000000-0000-0000-0000-000000000001', 1),
  ('54000000-0000-0000-0000-000000000002', 1);

insert into public.enrollments (
  id, beneficiary_id, program_id, approval_status, category
)
values
  (
    '55000000-0000-0000-0000-000000000001',
    '51000000-0000-0000-0000-000000000003',
    '54000000-0000-0000-0000-000000000001', 'Approved', 'Food'
  ),
  (
    '55000000-0000-0000-0000-000000000002',
    '51000000-0000-0000-0000-000000000004',
    '54000000-0000-0000-0000-000000000002', 'Approved', 'Medicine'
  );

insert into public.redemptions (
  id, enrollment_id, beneficiary_id, amount, status
)
values
  (
    '56000000-0000-0000-0000-000000000001',
    '55000000-0000-0000-0000-000000000001',
    '51000000-0000-0000-0000-000000000003', 100, 'Completed'
  ),
  (
    '56000000-0000-0000-0000-000000000002',
    '55000000-0000-0000-0000-000000000002',
    '51000000-0000-0000-0000-000000000004', 100, 'Completed'
  );

insert into public.disbursements (
  id, program_id, program_name, amount, recipients_count
)
values
  (
    '57000000-0000-0000-0000-000000000001',
    '54000000-0000-0000-0000-000000000001', 'Alpha Program', 100, 1
  ),
  (
    '57000000-0000-0000-0000-000000000002',
    '54000000-0000-0000-0000-000000000002', 'Beta Program', 100, 1
  );


insert into public.wallets (id, owner_type, owner_id, purpose, address)
values
  (
    '58000000-0000-0000-0000-000000000001', 'organization',
    '52000000-0000-0000-0000-000000000001', 'organization_treasury',
    'G' || repeat('A', 55)
  ),
  (
    '58000000-0000-0000-0000-000000000002', 'organization',
    '52000000-0000-0000-0000-000000000002', 'organization_treasury',
    'G' || repeat('B', 55)
  ),
  (
    '58000000-0000-0000-0000-000000000003', 'beneficiary_identity',
    (select id from public.beneficiary_identities
      where user_id = '51000000-0000-0000-0000-000000000003'),
    'beneficiary', 'G' || repeat('C', 55)
  ),
  (
    '58000000-0000-0000-0000-000000000004', 'beneficiary_identity',
    (select id from public.beneficiary_identities
      where user_id = '51000000-0000-0000-0000-000000000004'),
    'beneficiary', 'G' || repeat('D', 55)
  );

insert into public.merchant_metrics (merchant_id)
values ('51000000-0000-0000-0000-000000000002');

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '51000000-0000-0000-0000-000000000001',
  true
);

-- Exhaustive private-table read checks for one tenant actor.
-- Validates: Requirements 2.4, 2.5, 19.5, 20.5
select is((select count(*)::integer from public.organizations), 1,
  'organization rows deny cross-organization reads');
select is((select count(*)::integer from public.organization_memberships), 1,
  'membership rows deny cross-organization reads');
select is((select count(*)::integer from public.programs), 1,
  'program rows deny cross-organization reads');
select is((select count(*)::integer from public.program_areas), 1,
  'program area rows deny cross-organization reads');
select is((select count(*)::integer from public.program_barangays), 1,
  'program barangay rows deny cross-organization reads');
select is((select count(*)::integer from public.enrollments), 1,
  'enrollment rows deny cross-organization reads');
select is((select count(*)::integer from public.redemptions), 1,
  'redemption rows deny cross-organization reads');
select is((select count(*)::integer from public.disbursements), 1,
  'disbursement rows deny cross-organization reads');
select is((select count(*)::integer from public.disaster_response_campaigns), 1,
  'campaign rows deny cross-organization reads');
select is((select count(*)::integer from public.beneficiary_identities), 1,
  'beneficiary identity rows deny cross-organization reads');
select is((select count(*)::integer from public.profiles), 2,
  'profile rows expose only the actor and beneficiaries in the actor organization');
select is((select count(*)::integer from public.wallets), 2,
  'wallet rows expose only organization and enrolled-beneficiary mappings');
select is((select count(*)::integer from public.merchant_metrics), 0,
  'merchant metrics remain owner-private from organization actors');


select throws_ok(
  $$insert into public.programs (
      organization_id, name, created_by
    ) values (
      '52000000-0000-0000-0000-000000000002',
      'Forbidden Beta Program',
      '51000000-0000-0000-0000-000000000001'
    )$$,
  '42501',
  'new row violates row-level security policy for table "programs"',
  'an organization administrator cannot create a program for another organization'
);
select is(
  (
    with changed as (
      update public.programs set name = 'Forbidden change'
      where id = '54000000-0000-0000-0000-000000000002'
      returning 1
    )
    select count(*)::integer from changed
  ),
  0,
  'an organization administrator cannot update another organization program'
);
select is(
  (
    with removed as (
      delete from public.enrollments
      where id = '55000000-0000-0000-0000-000000000002'
      returning 1
    )
    select count(*)::integer from removed
  ),
  0,
  'an organization administrator cannot delete another organization enrollment'
);
select throws_ok(
  $$insert into public.disbursements (
      program_id, program_name, amount, recipients_count
    ) values (
      '54000000-0000-0000-0000-000000000002',
      'Beta Program', 50, 1
    )$$,
  '42501',
  'new row violates row-level security policy for table "disbursements"',
  'an organization administrator cannot create another organization disbursement'
);
select throws_ok(
  $$insert into public.program_areas (program_id, area_id)
    values ('54000000-0000-0000-0000-000000000002', 2)$$,
  '42501',
  'permission denied for table program_areas',
  'authenticated clients cannot bypass the narrow program-geography RPC'
);

reset role;
set local role anon;
select is((select count(*)::integer from public.programs), 0,
  'anonymous users cannot read private program rows');

reset role;
select * from finish();
rollback;
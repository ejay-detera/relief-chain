begin;

create extension if not exists pgtap with schema extensions;
select plan(25);

select has_type(
  'public',
  'organization_membership_role',
  'organization membership role enum exists'
);
select enum_has_labels(
  'public',
  'organization_membership_role',
  array[
    'organization_administrator',
    'program_manager',
    'beneficiary_verifier',
    'finance_approver',
    'auditor'
  ],
  'organization membership role enum contains exactly the required roles'
);
select has_table('public', 'organizations', 'organizations table exists');
select has_table(
  'public',
  'organization_memberships',
  'organization memberships table exists'
);
select col_type_is(
  'public',
  'organization_memberships',
  'role',
  'public.organization_membership_role',
  'membership role uses the independent organization role type'
);
select has_index(
  'public',
  'organizations',
  'organizations_slug_key',
  'organization slugs are uniquely indexed'
);
select has_index(
  'public',
  'organization_memberships',
  'organization_memberships_organization_user_key',
  'a user has one role assignment per organization'
);
select has_index(
  'public',
  'organization_memberships',
  'organization_memberships_active_user_organization_idx',
  'active memberships are indexed by user and organization'
);
select has_index(
  'public',
  'organization_memberships',
  'organization_memberships_active_organization_role_user_idx',
  'active organization roles are indexed for authorization lookups'
);
select ok(
  not has_table_privilege('authenticated', 'public.organization_memberships', 'INSERT'),
  'authenticated users cannot insert memberships directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.organization_memberships', 'UPDATE'),
  'authenticated users cannot update memberships directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.organization_memberships', 'DELETE'),
  'authenticated users cannot delete memberships directly'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.upsert_organization_membership(uuid,uuid,public.organization_membership_role,uuid,boolean)',
    'EXECUTE'
  ),
  'service role can invoke membership upsert path'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.upsert_organization_membership(uuid,uuid,public.organization_membership_role,uuid,boolean)',
    'EXECUTE'
  ),
  'authenticated users cannot invoke membership upsert path'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.deactivate_organization_membership(uuid,uuid,uuid)',
    'EXECUTE'
  ),
  'service role can invoke membership deactivation path'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.deactivate_organization_membership(uuid,uuid,uuid)',
    'EXECUTE'
  ),
  'authenticated users cannot invoke membership deactivation path'
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
    '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'org-actor@example.test',
    '',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"role":"lgu"}',
    now(),
    now()
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'org-member@example.test',
    '',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"role":"beneficiary"}',
    now(),
    now()
  ),
  (
    '10000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'org-outsider@example.test',
    '',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"role":"merchant"}',
    now(),
    now()
  );
insert into public.organizations (id, name, slug, created_by)
values
  (
    '20000000-0000-0000-0000-000000000001',
    'Alpha Relief Organization',
    'alpha-relief',
    '10000000-0000-0000-0000-000000000001'
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    'Beta Relief Organization',
    'beta-relief',
    '10000000-0000-0000-0000-000000000001'
  ),
  (
    '20000000-0000-0000-0000-000000000003',
    'Private Relief Organization',
    'private-relief',
    '10000000-0000-0000-0000-000000000003'
  );

select lives_ok(
  $$select public.upsert_organization_membership(
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'organization_administrator',
    '10000000-0000-0000-0000-000000000001'
  )$$,
  'server path grants an organization membership'
);
select public.upsert_organization_membership(
  '20000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000001',
  'auditor',
  '10000000-0000-0000-0000-000000000001'
);
select public.upsert_organization_membership(
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',
  'beneficiary_verifier',
  '10000000-0000-0000-0000-000000000001'
);
select is(
  (
    select role::text
    from public.organization_memberships
    where organization_id = '20000000-0000-0000-0000-000000000001'
      and user_id = '10000000-0000-0000-0000-000000000001'
  ),
  'organization_administrator',
  'membership stores the granted role'
);

select public.upsert_organization_membership(
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'finance_approver',
  '10000000-0000-0000-0000-000000000001'
);
select is(
  (
    select count(*)::integer
    from public.organization_memberships
    where organization_id = '20000000-0000-0000-0000-000000000001'
      and user_id = '10000000-0000-0000-0000-000000000001'
  ),
  1,
  'membership upsert changes a role without duplicating the assignment'
);
select is(
  (
    select array_agg(role::text order by organization_id)
    from public.organization_memberships
    where user_id = '10000000-0000-0000-0000-000000000001'
  ),
  array['finance_approver', 'auditor'],
  'one user can hold different roles in different organizations'
);

insert into public.organizations (name, slug, created_by)
select
  'Role coverage ' || role::text,
  'role-' || replace(role::text, '_', '-'),
  '10000000-0000-0000-0000-000000000001'
from unnest(enum_range(null::public.organization_membership_role)) as role;
-- Property-style exhaustive check over the finite role domain.
-- Validates: Requirements 2.3
select public.upsert_organization_membership(
  organization.id,
  '10000000-0000-0000-0000-000000000003',
  replace(
    replace(organization.slug, 'role-', ''),
    '-',
    '_'
  )::public.organization_membership_role,
  '10000000-0000-0000-0000-000000000001'
)
from public.organizations organization
where organization.slug like 'role-%';

select is(
  (
    select count(distinct role)::integer
    from public.organization_memberships
    where user_id = '10000000-0000-0000-0000-000000000003'
  ),
  5,
  'every required organization role can be assigned through the server path'
);

select lives_ok(
  $$select public.deactivate_organization_membership(
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001'
  )$$,
  'server path deactivates a membership without deleting it'
);
select is(
  (
    select is_active
    from public.organization_memberships
    where organization_id = '20000000-0000-0000-0000-000000000001'
      and user_id = '10000000-0000-0000-0000-000000000002'
  ),
  false,
  'deactivated membership is retained and inactive'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);
select is(
  (select count(*)::integer from public.organizations),
  2,
  'authenticated members see only organizations they belong to'
);
select is(
  (select count(*)::integer from public.organization_memberships),
  3,
  'authenticated members see memberships only in their organizations'
);

reset role;
select * from finish();
rollback;
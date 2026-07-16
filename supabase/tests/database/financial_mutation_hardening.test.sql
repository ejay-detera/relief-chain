begin;

create extension if not exists pgtap with schema extensions;
select plan(30);

-- Set-based privilege checks cover every current and design-named sensitive table.
-- Validates: Requirements 15.1, 15.9, 18.3, 20.6
select is(
  (
    select count(*)::integer
    from information_schema.role_table_grants
    where table_schema = 'public'
      and grantee in ('PUBLIC', 'anon', 'authenticated')
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
      and table_name = any (array[
        'redemptions', 'disbursements', 'wallets', 'merchant_entities',
        'merchant_accreditations', 'program_merchants', 'financial_intents',
        'transaction_attempts', 'voucher_redemptions', 'settlements', 'refunds',
        'ledger_transactions', 'contract_events',
        'beneficiary_balance_projection', 'merchant_balance_projection',
        'program_financial_projection', 'distribution_job_projection'
      ])
  ),
  0,
  'client roles have no direct DML on sensitive financial objects'
);
select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and cmd in ('ALL', 'INSERT', 'UPDATE', 'DELETE')
      and tablename = any (array[
        'redemptions', 'disbursements', 'wallets', 'merchant_entities',
        'merchant_accreditations', 'program_merchants', 'financial_intents',
        'transaction_attempts', 'voucher_redemptions', 'settlements', 'refunds',
        'ledger_transactions', 'contract_events',
        'beneficiary_balance_projection', 'merchant_balance_projection',
        'program_financial_projection', 'distribution_job_projection'
      ])
  ),
  0,
  'sensitive tables expose no mutation policy to API roles'
);
select is(
  (
    select count(*)::integer from pg_policies
    where schemaname = 'public'
      and policyname = any (array[
        'LGU can delete redemptions',
        'Organization administrators can delete redemptions',
        'Allow read/write access to authenticated users on program_areas',
        'Allow read/write access to authenticated users on program_barangays',
        'Program managers can manage program areas',
        'Program managers can manage program barangays'
      ])
  ),
  0,
  'legacy redemption-delete and direct program-geography policies are absent'
);

select ok(not has_table_privilege('authenticated', 'public.redemptions', 'INSERT'),
  'authenticated cannot insert redemption history');
select ok(not has_table_privilege('authenticated', 'public.redemptions', 'UPDATE'),
  'authenticated cannot update redemption history');
select ok(not has_table_privilege('authenticated', 'public.redemptions', 'DELETE'),
  'authenticated cannot delete redemption history');
select ok(not has_table_privilege('authenticated', 'public.disbursements', 'INSERT'),
  'authenticated cannot insert disbursement history');
select ok(not has_table_privilege('authenticated', 'public.disbursements', 'UPDATE'),
  'authenticated cannot update disbursement history');
select ok(not has_table_privilege('authenticated', 'public.disbursements', 'DELETE'),
  'authenticated cannot delete disbursement history');
select ok(
  not has_table_privilege('authenticated', 'public.wallets', 'INSERT')
    and not has_table_privilege('authenticated', 'public.wallets', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.wallets', 'DELETE'),
  'wallet bindings remain server-write-only'
);
select ok(
  not has_table_privilege('authenticated', 'public.program_areas', 'INSERT')
    and not has_table_privilege('authenticated', 'public.program_areas', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.program_areas', 'DELETE'),
  'program areas deny direct authenticated mutation'
);
select ok(
  not has_table_privilege('authenticated', 'public.program_barangays', 'INSERT')
    and not has_table_privilege('authenticated', 'public.program_barangays', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.program_barangays', 'DELETE'),
  'program barangays deny direct authenticated mutation'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.replace_program_geography(uuid,integer[],integer[])',
    'EXECUTE'
  ),
  'authenticated clients can invoke only the narrow geography RPC'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.replace_program_geography(uuid,integer[],integer[])',
    'EXECUTE'
  ),
  'anonymous clients cannot invoke the geography RPC'
);
select ok(
  (
    select procedure.prosecdef
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = 'replace_program_geography'
  ),
  'geography RPC has the controlled privileges needed after direct DML revocation'
);
select ok(
  exists (
    select 1
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = 'replace_program_geography'
      and 'search_path=""' = any (procedure.proconfig)
  ),
  'security-definer geography RPC fixes an empty search path'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '61000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'financial-admin@example.test', '', now(),
    '{"provider":"email","providers":["email"]}',
    '{"role":"lgu"}', now(), now()
  ),
  (
    '61000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'financial-outsider@example.test', '', now(),
    '{"provider":"email","providers":["email"]}',
    '{"role":"lgu"}', now(), now()
  );

insert into public.organizations (id, name, slug)
values ('62000000-0000-0000-0000-000000000001', 'Financial Test', 'financial-test');
select public.upsert_organization_membership(
  '62000000-0000-0000-0000-000000000001',
  '61000000-0000-0000-0000-000000000001',
  'organization_administrator',
  '61000000-0000-0000-0000-000000000001'
);
insert into public.programs (id, organization_id, name, status, created_by)
values (
  '63000000-0000-0000-0000-000000000001',
  '62000000-0000-0000-0000-000000000001',
  'Immutable History Program', 'draft',
  '61000000-0000-0000-0000-000000000001'
);

insert into public.enrollments (
  id, beneficiary_id, program_id, approval_status, category
)
values (
  '64000000-0000-0000-0000-000000000001',
  '61000000-0000-0000-0000-000000000002',
  '63000000-0000-0000-0000-000000000001',
  'Approved', 'Food'
);
insert into public.redemptions (
  id, enrollment_id, beneficiary_id, amount, status
)
values
  (
    '65000000-0000-0000-0000-000000000001',
    '64000000-0000-0000-0000-000000000001',
    '61000000-0000-0000-0000-000000000002', 100, 'Completed'
  ),
  (
    '65000000-0000-0000-0000-000000000002',
    '64000000-0000-0000-0000-000000000001',
    '61000000-0000-0000-0000-000000000002', 25, 'Pending'
  );
insert into public.disbursements (
  id, program_id, program_name, amount, recipients_count
)
values (
  '66000000-0000-0000-0000-000000000001',
  '63000000-0000-0000-0000-000000000001',
  'Immutable History Program', 125, 1
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '61000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$insert into public.program_areas (program_id, area_id)
    values ('63000000-0000-0000-0000-000000000001', 1)$$,
  '42501',
  'permission denied for table program_areas',
  'organization administrators cannot mutate program areas directly'
);
select lives_ok(
  $$select public.replace_program_geography(
    '63000000-0000-0000-0000-000000000001',
    array[1, 2],
    array[1]
  )$$,
  'authorized geography replacement succeeds through the narrow RPC'
);
select is(
  (select count(*)::integer from public.program_areas
   where program_id = '63000000-0000-0000-0000-000000000001'),
  2,
  'geography RPC writes exactly the selected areas'
);
select is(
  (select count(*)::integer from public.program_barangays
   where program_id = '63000000-0000-0000-0000-000000000001'),
  1,
  'geography RPC writes exactly the selected barangays'
);

select set_config('request.jwt.claim.sub', '61000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select public.replace_program_geography(
    '63000000-0000-0000-0000-000000000001', array[1], array[1]
  )$$,
  '42501',
  'not authorized to manage program geography',
  'an actor without organization membership cannot invoke the write path'
);
select is(
  (select count(*)::integer from public.program_areas
   where program_id = '63000000-0000-0000-0000-000000000001'),
  0,
  'unauthorized actors cannot read or change another organization geography'
);

select set_config('request.jwt.claim.sub', '61000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$delete from public.redemptions
    where id = '65000000-0000-0000-0000-000000000001'$$,
  '42501',
  'permission denied for table redemptions',
  'authenticated clients cannot delete confirmed redemption history'
);
reset role;
select is(
  (select count(*)::integer from public.redemptions
   where id = '65000000-0000-0000-0000-000000000001'),
  1,
  'denied client deletion conserves confirmed history'
);

select throws_ok(
  $$update public.redemptions set amount = 99
    where id = '65000000-0000-0000-0000-000000000001'$$,
  '23514',
  'confirmed financial history is immutable',
  'trusted code cannot rewrite a completed redemption'
);
select throws_ok(
  $$delete from public.redemptions
    where id = '65000000-0000-0000-0000-000000000001'$$,
  '23514',
  'confirmed financial history is immutable',
  'trusted code cannot delete a completed redemption'
);
select lives_ok(
  $$update public.redemptions set status = 'Completed'
    where id = '65000000-0000-0000-0000-000000000002'$$,
  'trusted reconciliation can transition pending history to completed'
);
select throws_ok(
  $$update public.redemptions set amount = 24
    where id = '65000000-0000-0000-0000-000000000002'$$,
  '23514',
  'confirmed financial history is immutable',
  'newly completed history becomes immutable immediately'
);
select throws_ok(
  $$delete from public.disbursements
    where id = '66000000-0000-0000-0000-000000000001'$$,
  '23514',
  'confirmed financial history is immutable',
  'legacy disbursement history is append-only for trusted code'
);
select is(
  (
    select (select count(*) from public.redemptions)
      + (select count(*) from public.disbursements)
  )::integer,
  3,
  'all denied mutations preserve the complete financial history'
);

select * from finish();
rollback;

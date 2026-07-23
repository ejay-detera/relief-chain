begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

select enum_has_labels(
  'public', 'program_aid_type', array['cash', 'voucher'],
  'program aid types keep cash and voucher rails distinct'
);
select enum_has_labels(
  'public', 'program_funding_status',
  array['unreserved', 'reserving', 'funded', 'failed', 'returned'],
  'funding status models reservation lifecycle'
);
select has_column('public', 'programs', 'budget_stroops',
  'program policy stores bigint stroop budget');
select has_column('public', 'programs', 'asset_sac_address',
  'program policy stores its Stellar Asset Contract address');
select has_column('public', 'programs', 'treasury_wallet_id',
  'program policy identifies its treasury wallet');
select has_column('public', 'programs', 'voucher_contract_address',
  'voucher policy identifies its isolated contract');
select has_column('public', 'programs', 'allocation_rules',
  'program policy stores allocation rules');
select has_column('public', 'programs', 'refund_policy',
  'program policy stores refund rules');
select has_column('public', 'programs', 'policy_version',
  'program policy is explicitly versioned');
select has_table('public', 'program_merchants',
  'program merchant authorization uses stable merchant IDs');
select has_table('public', 'program_policy_events',
  'post-activation operational changes have append-only evidence');
select ok(
  not has_table_privilege('authenticated', 'public.program_merchants', 'INSERT'),
  'authenticated clients cannot directly authorize merchants'
);
select ok(
  not has_table_privilege('authenticated', 'public.program_policy_events', 'UPDATE'),
  'authenticated clients cannot rewrite policy event evidence'
);
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '61000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'policy-admin@example.test', '', now(),
    '{"provider":"email","providers":["email"]}',
    '{"role":"lgu"}', now(), now()
  ),
  (
    '61000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'policy-beneficiary-1@example.test', '', now(),
    '{"provider":"email","providers":["email"]}',
    '{"role":"beneficiary"}', now(), now()
  ),
  (
    '61000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'policy-beneficiary-2@example.test', '', now(),
    '{"provider":"email","providers":["email"]}',
    '{"role":"beneficiary"}', now(), now()
  ),
  (
    '61000000-0000-0000-0000-000000000004',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'policy-merchant@example.test', '', now(),
    '{"provider":"email","providers":["email"]}',
    '{"role":"merchant","full_name":"Policy Merchant"}', now(), now()
  );

insert into public.organizations (id, name, slug)
values (
  '62000000-0000-0000-0000-000000000001',
  'Program Policy Organization', 'program-policy-organization'
);
select public.upsert_organization_membership(
  '62000000-0000-0000-0000-000000000001',
  '61000000-0000-0000-0000-000000000001',
  'organization_administrator',
  '61000000-0000-0000-0000-000000000001'
);

insert into public.wallets (
  id, owner_type, owner_id, purpose, address,
  verification_status, proof_challenge_digest,
  proof_challenge_issued_at, proof_challenge_expires_at,
  proof_signature_digest, verified_at, verified_by, is_active
)
values (
  '63000000-0000-0000-0000-000000000001',
  'organization', '62000000-0000-0000-0000-000000000001',
  'organization_treasury', 'G' || repeat('A', 55),
  'verified', repeat('a', 64), now(), now() + interval '5 minutes',
  repeat('b', 64), now(),
  '61000000-0000-0000-0000-000000000001', true
);

insert into public.merchant_entities (id, profile_id, display_name)
values (
  '64000000-0000-0000-0000-000000000001',
  '61000000-0000-0000-0000-000000000004',
  'Policy Merchant'
);
insert into public.merchant_accreditations (
  organization_id, merchant_id, category, status,
  valid_from, valid_until, approved_by, approved_at
)
values (
  '62000000-0000-0000-0000-000000000001',
  '64000000-0000-0000-0000-000000000001',
  'Food', 'active', now() - interval '1 day', now() + interval '1 year',
  '61000000-0000-0000-0000-000000000001', now()
);
insert into public.programs (
  id, organization_id, name, status, aid_type,
  budget_stroops, asset_code, asset_issuer, asset_sac_address,
  treasury_wallet_id, voucher_contract_address,
  allocation_rules, per_beneficiary_limit_stroops,
  per_transaction_limit_stroops, daily_limit_stroops,
  expiry_policy, policy_expires_at,
  refund_policy, refund_window_ends_at,
  policy_version, contract_version, created_by
)
values (
  '65000000-0000-0000-0000-000000000001',
  '62000000-0000-0000-0000-000000000001',
  'Immutable Voucher Policy', 'draft', 'voucher',
  1000, 'RCPHP', 'G' || repeat('B', 55), 'C' || repeat('C', 55),
  '63000000-0000-0000-0000-000000000001', 'C' || repeat('D', 55),
  '{"strategy":"variable","allowed_categories":["Food"]}'::jsonb,
  800, 400, 500,
  'fixed', now() + interval '30 days',
  'return_to_entitlement', now() + interval '60 days',
  1, 1, '61000000-0000-0000-0000-000000000001'
);

select lives_ok(
  $$update public.programs
    set daily_limit_stroops = 600
    where id = '65000000-0000-0000-0000-000000000001'$$,
  'draft financial policy remains editable without reserving funds'
);
select lives_ok(
  $$update public.programs
    set status = 'funding', funding_status = 'reserving'
    where id = '65000000-0000-0000-0000-000000000001'$$,
  'a draft can enter funding reservation'
);
select throws_ok(
  $$update public.programs
    set status = 'active'
    where id = '65000000-0000-0000-0000-000000000001'$$,
  '23514',
  'activation requires complete full-budget on-chain funding evidence',
  'partial or missing reservation cannot activate a program'
);
select is(
  (select status from public.programs
    where id = '65000000-0000-0000-0000-000000000001'),
  'funding',
  'failed activation leaves the program inactive'
);
select lives_ok(
  $$update public.programs
    set funding_status = 'funded',
        funded_budget_stroops = budget_stroops,
        funding_transaction_hash = repeat('c', 64),
        funding_ledger = 12345,
        funded_at = now(),
        activation_correlation_id = '66000000-0000-0000-0000-000000000001',
        activated_by = '61000000-0000-0000-0000-000000000001',
        status = 'active'
    where id = '65000000-0000-0000-0000-000000000001'$$,
  'full reconciled reservation activates the voucher policy'
);
select ok(
  (
    select status = 'active'
      and funding_status = 'funded'
      and activated_at is not null
      and policy_locked_at is not null
    from public.programs
    where id = '65000000-0000-0000-0000-000000000001'
  ),
  'activation records lifecycle, funding, actor, and policy lock evidence'
);
create temporary table policy_mutation_results (
  field_name text primary key,
  correctly_denied boolean not null
) on commit drop;

-- Property-style exhaustive mutation check over every activated policy field group.
-- Validates: Requirements 5.7, 5.10
-- Each generated update must be rejected by the same immutability invariant.
do $$
declare
  mutation record;
  error_state text;
  error_message text;
begin
  for mutation in
    select * from (values
      ('aid_type', '''cash''::public.program_aid_type'),
      ('budget_stroops', '1001'),
      ('funded_budget_stroops', '999'),
      ('asset_code', '''TEST'''),
      ('asset_issuer', '''G'' || repeat(''E'', 55)'),
      ('asset_sac_address', '''C'' || repeat(''E'', 55)'),
      ('treasury_wallet_id', 'null'),
      ('voucher_contract_address', '''C'' || repeat(''F'', 55)'),
      ('allocation_rules', '''{"strategy":"fixed"}''::jsonb'),
      ('per_beneficiary_limit_stroops', '700'),
      ('per_transaction_limit_stroops', '300'),
      ('daily_limit_stroops', '700'),
      ('expiry_policy', '''none''::public.program_expiry_policy'),
      ('policy_expires_at', 'now() + interval ''31 days'''),
      ('refund_policy', '''exception_after_expiry''::public.program_refund_policy'),
      ('refund_window_ends_at', 'now() + interval ''90 days'''),
      ('policy_version', '2'),
      ('contract_version', '2'),
      ('supersedes_program_id', '''65000000-0000-0000-0000-000000000001''::uuid')
    ) as generated(field_name, replacement)
  loop
    begin
      execute format(
        'update public.programs set %I = %s where id = %L',
        mutation.field_name,
        mutation.replacement,
        '65000000-0000-0000-0000-000000000001'
      );
      insert into policy_mutation_results values (mutation.field_name, false);
    exception when others then
      get stacked diagnostics
        error_state = returned_sqlstate,
        error_message = message_text;
      insert into policy_mutation_results values (
        mutation.field_name,
        error_state = '23514'
          and error_message = 'active program financial policy is immutable; close it and create a new version'
      );
    end;
  end loop;
end
$$;

select ok(
  (select bool_and(correctly_denied) and count(*) = 19
    from policy_mutation_results),
  'every active financial policy field is immutable'
);
select is(
  (select budget_stroops from public.programs
    where id = '65000000-0000-0000-0000-000000000001'),
  1000::bigint,
  'rejected policy mutations preserve the funded budget'
);
select lives_ok(
  $$insert into public.enrollments (
    id, beneficiary_id, beneficiary_identity_id, program_id,
    approval_status, category, allocation_amount_stroops,
    allocation_correlation_id, approved_by
  ) values (
    '67000000-0000-0000-0000-000000000001',
    '61000000-0000-0000-0000-000000000002',
    (select id from public.beneficiary_identities
      where user_id = '61000000-0000-0000-0000-000000000002'),
    '65000000-0000-0000-0000-000000000001',
    'Approved', 'Food', 600,
    '68000000-0000-0000-0000-000000000001',
    '61000000-0000-0000-0000-000000000001'
  )$$,
  'an approved beneficiary can be added within remaining funded budget'
);
select throws_ok(
  $$insert into public.enrollments (
    beneficiary_id, beneficiary_identity_id, program_id,
    approval_status, category, allocation_amount_stroops,
    allocation_correlation_id, approved_by
  ) values (
    '61000000-0000-0000-0000-000000000003',
    (select id from public.beneficiary_identities
      where user_id = '61000000-0000-0000-0000-000000000003'),
    '65000000-0000-0000-0000-000000000001',
    'Approved', 'Food', 500,
    '68000000-0000-0000-0000-000000000002',
    '61000000-0000-0000-0000-000000000001'
  )$$,
  '23514',
  'beneficiary allocation exceeds remaining funded budget',
  'beneficiary additions cannot exceed the reserved budget'
);
select is(
  (
    select count(*)::integer
    from public.program_policy_events
    where program_id = '65000000-0000-0000-0000-000000000001'
      and event_type = 'beneficiary_added'
  ),
  1,
  'the accepted active-program beneficiary addition is audited once'
);
select is(
  (
    select actor_id::text || '|' || allocation_amount_stroops::text
    from public.program_policy_events
    where program_id = '65000000-0000-0000-0000-000000000001'
      and event_type = 'beneficiary_added'
  ),
  '61000000-0000-0000-0000-000000000001|600',
  'beneficiary audit evidence preserves actor and funded allocation'
);
select throws_ok(
  $$update public.enrollments
    set allocation_amount_stroops = 500
    where id = '67000000-0000-0000-0000-000000000001'$$,
  '23514',
  'approved funded beneficiary allocation is immutable',
  'an approved allocation cannot be rewritten after activation'
);
select throws_ok(
  $$delete from public.enrollments
    where id = '67000000-0000-0000-0000-000000000001'$$,
  '23514',
  'approved funded beneficiary allocations cannot be deleted',
  'an approved funded beneficiary cannot be silently removed'
);
select lives_ok(
  $$insert into public.program_merchants (
    id, program_id, merchant_id, category, correlation_id, authorized_by
  ) values (
    '69000000-0000-0000-0000-000000000001',
    '65000000-0000-0000-0000-000000000001',
    '64000000-0000-0000-0000-000000000001',
    'Food', '6a000000-0000-0000-0000-000000000001',
    '61000000-0000-0000-0000-000000000001'
  )$$,
  'an accredited merchant can be authorized within active policy categories'
);
select lives_ok(
  $$update public.program_merchants
    set status = 'revoked',
        correlation_id = '6a000000-0000-0000-0000-000000000002',
        revoked_by = '61000000-0000-0000-0000-000000000001',
        reason = 'Accreditation review'
    where id = '69000000-0000-0000-0000-000000000001'$$,
  'an active-program merchant can be revoked without changing policy'
);
select is(
  (
    select array_agg(event_type::text order by created_at, event_type::text)
    from public.program_policy_events
    where merchant_id = '64000000-0000-0000-0000-000000000001'
  ),
  array['merchant_authorized', 'merchant_revoked'],
  'merchant authorization and revocation both append audit evidence'
);
select throws_ok(
  $$delete from public.program_merchants
    where id = '69000000-0000-0000-0000-000000000001'$$,
  '23514',
  'program merchant authorization is append-audited; revoke it instead',
  'merchant history cannot be deleted'
);
select throws_ok(
  $$update public.program_policy_events
    set reason = 'rewritten'
    where merchant_id = '64000000-0000-0000-0000-000000000001'$$,
  '23514',
  'program policy events are append-only',
  'operational audit evidence cannot be rewritten'
);

select throws_ok(
  $$insert into public.programs (
    organization_id, name, status, aid_type, policy_version,
    supersedes_program_id, created_by
  ) values (
    '62000000-0000-0000-0000-000000000001',
    'Premature Version', 'draft', 'voucher', 2,
    '65000000-0000-0000-0000-000000000001',
    '61000000-0000-0000-0000-000000000001'
  )$$,
  '23514',
  'a new policy version must supersede a closed program in the same organization',
  'material policy replacement cannot start before predecessor closure'
);
select lives_ok(
  $$update public.programs
    set status = 'closed'
    where id = '65000000-0000-0000-0000-000000000001'$$,
  'an active program can close without rewriting policy'
);
select lives_ok(
  $$insert into public.programs (
    id, organization_id, name, status, aid_type, policy_version,
    supersedes_program_id, created_by
  ) values (
    '65000000-0000-0000-0000-000000000002',
    '62000000-0000-0000-0000-000000000001',
    'Replacement Version', 'draft', 'voucher', 2,
    '65000000-0000-0000-0000-000000000001',
    '61000000-0000-0000-0000-000000000001'
  )$$,
  'a closed program can be replaced by one sequential draft policy version'
);
select is(
  (
    select previous.status || '|' || replacement.policy_version::text
    from public.programs previous
    join public.programs replacement
      on replacement.supersedes_program_id = previous.id
    where previous.id = '65000000-0000-0000-0000-000000000001'
  ),
  'closed|2',
  'material changes preserve the closed predecessor and create a new version'
);

select is(
  (
    select count(*)::integer
    from public.audit_events
    where organization_id = '62000000-0000-0000-0000-000000000001'
      and action in (
        'program.beneficiary.added',
        'program.merchant.authorized',
        'program.merchant.revoked'
      )
  ),
  3,
  'beneficiary and merchant changes are also recorded in canonical audit history'
);

select * from finish();
rollback;
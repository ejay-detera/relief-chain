begin;

create extension if not exists pgtap with schema extensions;
select plan(43);

select has_type('public', 'wallet_owner_type', 'wallet owner type enum exists');
select enum_has_labels(
  'public',
  'wallet_owner_type',
  array['user', 'beneficiary_identity', 'organization', 'merchant_entity', 'platform'],
  'wallet owner types cover participant and institutional owners'
);
select enum_has_labels(
  'public',
  'wallet_network',
  array['stellar_testnet'],
  'wallet records remain locked to Stellar testnet'
);
select enum_has_labels(
  'public',
  'wallet_purpose',
  array[
    'beneficiary',
    'merchant_settlement',
    'organization_treasury',
    'cash_program_treasury',
    'issuer',
    'distribution',
    'fee_sponsor',
    'contract_deployer'
  ],
  'wallet purposes distinguish every custody responsibility'
);
select enum_has_labels(
  'public',
  'wallet_verification_status',
  array['pending', 'challenge_issued', 'verified', 'rejected', 'expired'],
  'wallet verification states model proof-of-possession progress'
);
select has_table('public', 'wallets', 'wallets table exists');
select has_column('public', 'wallets', 'owner_id', 'wallet records a stable owner');
select has_column(
  'public', 'wallets', 'proof_challenge_digest',
  'wallet stores challenge state without a raw challenge'
);
select has_column(
  'public', 'wallets', 'superseded_by_wallet_id',
  'wallet records its replacement binding'
);
select has_index(
  'public', 'wallets', 'wallets_network_address_key',
  'one network cannot bind the same address twice'
);
select has_index(
  'public', 'wallets', 'wallets_one_active_owner_purpose_idx',
  'an owner has at most one active wallet per network and purpose'
);
select has_index(
  'public', 'wallets', 'wallets_owner_lookup_idx',
  'wallet owner reads are indexed'
);
select ok(
  (
    select relation.relrowsecurity
    from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace
      on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'wallets'
  ),
  'wallets have row level security enabled'
);
select ok(
  not has_table_privilege('authenticated', 'public.wallets', 'INSERT'),
  'authenticated clients cannot insert wallet bindings directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.wallets', 'UPDATE'),
  'authenticated clients cannot update wallet bindings directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.wallets', 'DELETE'),
  'authenticated clients cannot delete wallet bindings directly'
);
select ok(
  has_table_privilege('authenticated', 'public.wallets', 'SELECT'),
  'authenticated clients can read authorized wallet bindings'
);
select ok(
  has_table_privilege('service_role', 'public.wallets', 'INSERT')
    and has_table_privilege('service_role', 'public.wallets', 'UPDATE'),
  'trusted server code can administer wallet lifecycle state'
);
select is(
  (
    select count(*)::integer
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'wallets'
      and column_name ~ '(private|secret|seed|mnemonic)'
  ),
  0,
  'wallet records contain no private-key or seed columns'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '41000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'wallet-owner@example.test', '', now(),
    '{"provider":"email","providers":["email"]}',
    '{"role":"beneficiary"}', now(), now()
  ),
  (
    '41000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'wallet-outsider@example.test', '', now(),
    '{"provider":"email","providers":["email"]}',
    '{"role":"beneficiary"}', now(), now()
  );
insert into public.organizations (id, name, slug)
values (
  '42000000-0000-0000-0000-000000000001',
  'Wallet Test Organization',
  'wallet-test-organization'
);
select public.upsert_organization_membership(
  '42000000-0000-0000-0000-000000000001',
  '41000000-0000-0000-0000-000000000001',
  'finance_approver',
  '41000000-0000-0000-0000-000000000001'
);

select lives_ok(
  $$insert into public.wallets (
    id, owner_type, owner_id, purpose, address
  ) values (
    '43000000-0000-0000-0000-000000000001',
    'beneficiary_identity',
    (select id from public.beneficiary_identities
      where user_id = '41000000-0000-0000-0000-000000000001'),
    'beneficiary',
    'G' || repeat('A', 55)
  )$$,
  'a pending beneficiary wallet can be recorded'
);
select is(
  (
    select verification_status::text || '|' || is_active::text
    from public.wallets
    where id = '43000000-0000-0000-0000-000000000001'
  ),
  'pending|false',
  'new bindings are inactive until proof succeeds'
);
select throws_ok(
  $$insert into public.wallets (
    owner_type, owner_id, purpose, address, is_active
  ) values (
    'beneficiary_identity',
    (select id from public.beneficiary_identities
      where user_id = '41000000-0000-0000-0000-000000000001'),
    'beneficiary', 'G' || repeat('B', 55), true
  )$$,
  '23514',
  'new row for relation "wallets" violates check constraint "wallets_active_verified_check"',
  'an unverified wallet cannot become active'
);
select throws_ok(
  $$insert into public.wallets (
    owner_type, owner_id, purpose, address
  ) values (
    'organization', '42000000-0000-0000-0000-000000000001',
    'beneficiary', 'G' || repeat('C', 55)
  )$$,
  '23514',
  'new row for relation "wallets" violates check constraint "wallets_owner_purpose_check"',
  'owner type and wallet purpose must agree'
);
select lives_ok(
  $$update public.wallets
    set verification_status = 'challenge_issued',
        proof_challenge_digest = repeat('a', 64),
        proof_challenge_issued_at = now(),
        proof_challenge_expires_at = now() + interval '5 minutes'
    where id = '43000000-0000-0000-0000-000000000001'$$,
  'a proof challenge can be issued for a pending binding'
);
select throws_ok(
  $$update public.wallets
    set proof_challenge_expires_at = proof_challenge_issued_at
    where id = '43000000-0000-0000-0000-000000000001'$$,
  '23514',
  'new row for relation "wallets" violates check constraint "wallets_challenge_window_check"',
  'a proof challenge must expire after it is issued'
);
select lives_ok(
  $$update public.wallets
    set verification_status = 'verified',
        proof_signature_digest = repeat('b', 64),
        verified_at = now(),
        verified_by = '41000000-0000-0000-0000-000000000001',
        is_active = true
    where id = '43000000-0000-0000-0000-000000000001'$$,
  'verified proof state can activate a wallet binding'
);
select ok(
  (
    select verification_status = 'verified'
      and verified_at is not null
      and verified_by is not null
      and is_active
    from public.wallets
    where id = '43000000-0000-0000-0000-000000000001'
  ),
  'verified binding records proof actor, time, and active status'
);
select throws_ok(
  $$update public.wallets
    set address = 'G' || repeat('D', 55)
    where id = '43000000-0000-0000-0000-000000000001'$$,
  '23514',
  'verified wallet binding evidence is immutable; supersede it instead',
  'a verified address cannot be rewritten'
);
select throws_ok(
  $$delete from public.wallets
    where id = '43000000-0000-0000-0000-000000000001'$$,
  '23514',
  'verified wallet bindings cannot be deleted',
  'a verified binding cannot be deleted'
);
select lives_ok(
  $$insert into public.wallets (
    id, owner_type, owner_id, purpose, address,
    verification_status, proof_challenge_digest,
    proof_challenge_issued_at, proof_challenge_expires_at,
    proof_signature_digest, verified_at, verified_by
  ) values (
    '43000000-0000-0000-0000-000000000002',
    'beneficiary_identity',
    (select id from public.beneficiary_identities
      where user_id = '41000000-0000-0000-0000-000000000001'),
    'beneficiary', 'G' || repeat('E', 55), 'verified',
    repeat('c', 64), now(), now() + interval '5 minutes',
    repeat('d', 64), now(),
    '41000000-0000-0000-0000-000000000001'
  )$$,
  'a verified replacement binding can be recorded inactive'
);
select throws_ok(
  $$update public.wallets
    set is_active = true
    where id = '43000000-0000-0000-0000-000000000002'$$,
  '23505',
  'duplicate key value violates unique constraint "wallets_one_active_owner_purpose_idx"',
  'two active bindings cannot exist for one owner and purpose'
);
select lives_ok(
  $$update public.wallets
    set is_active = false,
        superseded_by_wallet_id = '43000000-0000-0000-0000-000000000002',
        superseded_at = now(),
        superseded_by = '41000000-0000-0000-0000-000000000001'
    where id = '43000000-0000-0000-0000-000000000001'$$,
  'a verified wallet can be retired by linking its replacement'
);
select ok(
  (
    select not is_active
      and superseded_by_wallet_id = '43000000-0000-0000-0000-000000000002'
      and verification_status = 'verified'
    from public.wallets
    where id = '43000000-0000-0000-0000-000000000001'
  ),
  'supersession preserves verified history while deactivating the old binding'
);
select lives_ok(
  $$update public.wallets
    set is_active = true
    where id = '43000000-0000-0000-0000-000000000002'$$,
  'the verified replacement activates after the old binding retires'
);

-- Set-based property over every owner/network/purpose scope.
-- Validates: Requirements 3.1, 3.6, 16.1
select ok(
  not exists (
    select 1
    from public.wallets
    where is_active
    group by owner_type, owner_id, network, purpose
    having count(*) > 1
  ),
  'every owner scope has at most one active wallet binding'
);
select throws_ok(
  $$update public.wallets
    set is_active = false,
        superseded_by_wallet_id = id,
        superseded_at = now(),
        superseded_by = '41000000-0000-0000-0000-000000000001'
    where id = '43000000-0000-0000-0000-000000000002'$$,
  '23514',
  'new row for relation "wallets" violates check constraint "wallets_not_self_superseded_check"',
  'a wallet cannot supersede itself'
);

insert into public.wallets (
  id, owner_type, owner_id, purpose, address
)
values (
  '43000000-0000-0000-0000-000000000003',
  'beneficiary_identity',
  (select id from public.beneficiary_identities
    where user_id = '41000000-0000-0000-0000-000000000002'),
  'beneficiary', 'G' || repeat('F', 55)
);
insert into public.wallets (
  id, owner_type, owner_id, purpose, address,
  verification_status, proof_challenge_digest,
  proof_challenge_issued_at, proof_challenge_expires_at,
  proof_signature_digest, verified_at, verified_by, is_active
)
values (
  '43000000-0000-0000-0000-000000000004',
  'organization', '42000000-0000-0000-0000-000000000001',
  'organization_treasury', 'G' || repeat('H', 55), 'verified',
  repeat('e', 64), now(), now() + interval '5 minutes',
  repeat('f', 64), now(),
  '41000000-0000-0000-0000-000000000001', true
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '41000000-0000-0000-0000-000000000001',
  true
);
select is(
  (select count(*)::integer from public.wallets),
  3,
  'a beneficiary sees own wallet history and organization wallets but not another identity wallet'
);
select ok(
  not exists (
    select 1 from public.wallets
    where id = '43000000-0000-0000-0000-000000000003'
  ),
  'beneficiary wallet mappings remain private from other authenticated users'
);
select throws_ok(
  $$update public.wallets
    set is_active = false
    where id = '43000000-0000-0000-0000-000000000004'$$,
  '42501',
  'permission denied for table wallets',
  'authenticated clients cannot mutate even a visible verified binding'
);

reset role;

-- Property-style state checks across all wallet records.
-- Validates: Requirements 3.6
select ok(
  not exists (
    select 1 from public.wallets
    where verification_status = 'verified'
      and (
        proof_challenge_digest is null
        or proof_signature_digest is null
        or verified_at is null
        or verified_by is null
      )
  ),
  'every verified binding has complete proof-of-possession evidence'
);
select ok(
  not exists (
    select 1 from public.wallets
    where superseded_by_wallet_id is not null and is_active
  ),
  'every superseded binding is inactive'
);
select ok(
  not exists (
    select 1 from public.wallets
    where is_active and verification_status <> 'verified'
  ),
  'every active binding is verified'
);
select is(
  (
    select count(*)::integer
    from public.wallets
    where owner_type = 'beneficiary_identity'
      and owner_id = (
        select id from public.beneficiary_identities
        where user_id = '41000000-0000-0000-0000-000000000001'
      )
  ),
  2,
  'wallet rotation preserves the stable beneficiary identity and binding history'
);

select * from finish();
rollback;
begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

-- Validates: Requirements 18.5, 18.6, 18.7
select has_table('public', 'ledger_transactions',
  'ledger transaction evidence table exists');
select has_table('public', 'contract_events',
  'contract event evidence table exists');
select has_table('public', 'reconciliation_cursors',
  'reconciliation cursor table exists');
select has_table('public', 'reconciliation_runs',
  'reconciliation run table exists');
select has_table('public', 'reconciliation_issues',
  'reconciliation issue table exists');

select has_column('public', 'ledger_transactions', 'envelope_xdr',
  'transaction evidence preserves its envelope');
select has_column('public', 'ledger_transactions', 'envelope_sha256',
  'transaction evidence preserves its envelope digest');
select has_column('public', 'ledger_transactions', 'transaction_hash',
  'transaction evidence preserves the network hash');
select has_column('public', 'ledger_transactions', 'ledger_sequence',
  'transaction evidence preserves the observed ledger');
select has_column('public', 'ledger_transactions', 'error_details',
  'transaction evidence preserves structured errors');
select has_column('public', 'ledger_transactions', 'correlation_id',
  'transaction evidence preserves correlation identifiers');
select has_column('public', 'contract_events', 'event_xdr',
  'contract event evidence preserves canonical XDR');
select has_column('public', 'contract_events', 'event_sha256',
  'contract event evidence preserves a canonical digest');
select has_column('public', 'reconciliation_runs', 'cursor_before',
  'reconciliation runs preserve their starting cursor');
select has_column('public', 'reconciliation_runs', 'cursor_after',
  'reconciliation runs preserve their ending cursor');
select has_column('public', 'reconciliation_issues', 'quarantine_state',
  'mismatches carry explicit quarantine state');
select has_column('public', 'reconciliation_issues', 'alert_state',
  'mismatches carry explicit alert state');

select has_index('public', 'ledger_transactions',
  'ledger_transactions_network_hash_key',
  'network transaction hashes are deduplicated');
select has_index('public', 'contract_events',
  'contract_events_identity_key',
  'contract events are deduplicated by contract ledger position');
select has_index('public', 'reconciliation_issues',
  'reconciliation_issues_active_fingerprint_idx',
  'active mismatches are deduplicated by fingerprint');

select ok(
  not has_table_privilege('authenticated', 'public.ledger_transactions', 'INSERT')
    and not has_table_privilege('authenticated', 'public.ledger_transactions', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.ledger_transactions', 'DELETE'),
  'authenticated clients cannot forge or mutate ledger evidence'
);
select ok(
  not has_table_privilege('service_role', 'public.ledger_transactions', 'UPDATE')
    and not has_table_privilege('service_role', 'public.ledger_transactions', 'DELETE'),
  'the reconciliation service cannot rewrite ledger evidence'
);
select ok(
  not has_table_privilege('service_role', 'public.contract_events', 'UPDATE')
    and not has_table_privilege('service_role', 'public.contract_events', 'DELETE'),
  'the reconciliation service cannot rewrite contract event evidence'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.advance_reconciliation_cursor(public.wallet_network,text,text,bigint,timestamptz,uuid)',
    'EXECUTE'
  ),
  'the reconciliation service has a narrow cursor advancement path'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.record_reconciliation_issue(uuid,uuid,uuid,uuid,uuid,public.wallet_network,public.reconciliation_issue_type,public.reconciliation_issue_severity,text,text,text,jsonb,jsonb,jsonb,text,timestamptz,uuid)',
    'EXECUTE'
  ),
  'authenticated clients cannot forge mismatch evidence'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '71000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'reconcile-admin@example.test', '', now(),
    '{"provider":"email","providers":["email"]}',
    '{"role":"lgu"}', now(), now()
  ),
  (
    '71000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'reconcile-outsider@example.test', '', now(),
    '{"provider":"email","providers":["email"]}',
    '{"role":"lgu"}', now(), now()
  );

insert into public.organizations (id, name, slug)
values (
  '72000000-0000-0000-0000-000000000001',
  'Reconciliation Test Organization',
  'reconciliation-test-organization'
);

select public.upsert_organization_membership(
  '72000000-0000-0000-0000-000000000001',
  '71000000-0000-0000-0000-000000000001',
  'organization_administrator',
  '71000000-0000-0000-0000-000000000001'
);

insert into public.programs (
  id, organization_id, name, status, created_by
) values (
  '73000000-0000-0000-0000-000000000001',
  '72000000-0000-0000-0000-000000000001',
  'Reconciliation Test Program', 'draft',
  '71000000-0000-0000-0000-000000000001'
);

insert into public.ledger_transactions (
  id, organization_id, program_id, transaction_hash,
  envelope_xdr, envelope_sha256, ledger_sequence, ledger_closed_at,
  successful, result_code, result_xdr, correlation_id
) values (
  '74000000-0000-0000-0000-000000000001',
  '72000000-0000-0000-0000-000000000001',
  '73000000-0000-0000-0000-000000000001',
  repeat('a', 64), 'AAAA', repeat('b', 64), 12345, now(),
  true, 'tx_success', 'AAAA',
  '75000000-0000-0000-0000-000000000001'
);

select throws_ok(
  $$insert into public.ledger_transactions (
      organization_id, transaction_hash, envelope_xdr, envelope_sha256,
      ledger_sequence, ledger_closed_at, successful, correlation_id
    ) values (
      '72000000-0000-0000-0000-000000000001',
      repeat('a', 64), 'BBBB', repeat('c', 64), 12346, now(), true,
      '75000000-0000-0000-0000-000000000002'
    )$$,
  '23505', null,
  'the same network transaction cannot be observed twice'
);
select throws_ok(
  $$update public.ledger_transactions set result_code = 'tampered'$$,
  '55000', 'ledger transactions are append-only',
  'trusted database access cannot rewrite observed transactions'
);
select throws_ok(
  $$delete from public.ledger_transactions$$,
  '55000', 'ledger transactions are append-only',
  'trusted database access cannot delete observed transactions'
);

insert into public.contract_events (
  id, organization_id, program_id, ledger_transaction_id,
  transaction_hash, contract_id, ledger_sequence, event_index,
  event_type, event_topics, event_payload, event_xdr, event_sha256,
  correlation_id
) values (
  '76000000-0000-0000-0000-000000000001',
  '72000000-0000-0000-0000-000000000001',
  '73000000-0000-0000-0000-000000000001',
  '74000000-0000-0000-0000-000000000001',
  repeat('a', 64), 'C' || repeat('A', 55), 12345, 0,
  'redeemed', '["redeemed"]', '{"amount_stroops":"100"}',
  'AAAA', repeat('d', 64),
  '75000000-0000-0000-0000-000000000001'
);

select throws_ok(
  $$insert into public.contract_events (
      organization_id, ledger_transaction_id, transaction_hash, contract_id,
      ledger_sequence, event_index, event_type, event_xdr, event_sha256,
      correlation_id
    ) values (
      '72000000-0000-0000-0000-000000000001',
      '74000000-0000-0000-0000-000000000001', repeat('a', 64),
      'C' || repeat('A', 55), 12345, 0, 'redeemed', 'BBBB', repeat('e', 64),
      '75000000-0000-0000-0000-000000000001'
    )$$,
  '23505', null,
  'the same contract event position cannot be observed twice'
);
select throws_ok(
  $$insert into public.contract_events (
      organization_id, ledger_transaction_id, transaction_hash, contract_id,
      ledger_sequence, event_index, event_type, event_xdr, event_sha256,
      correlation_id
    ) values (
      '72000000-0000-0000-0000-000000000001',
      '74000000-0000-0000-0000-000000000001', repeat('f', 64),
      'C' || repeat('B', 55), 12345, 1, 'redeemed', 'BBBB', repeat('e', 64),
      '75000000-0000-0000-0000-000000000001'
    )$$,
  '23503', null,
  'a contract event hash and ledger must match its parent transaction evidence'
);
select throws_ok(
  $$update public.contract_events set event_type = 'tampered'$$,
  '55000', 'contract events are append-only',
  'trusted database access cannot rewrite observed contract events'
);

select lives_ok(
  $$select public.advance_reconciliation_cursor(
    'stellar_testnet', 'soroban.events', 'cursor-12345', 12345, now(),
    '75000000-0000-0000-0000-000000000003'
  )$$,
  'the reconciler can create a durable stream cursor'
);
select lives_ok(
  $$select public.advance_reconciliation_cursor(
    'stellar_testnet', 'soroban.events', 'cursor-12346', 12346, now(),
    '75000000-0000-0000-0000-000000000004'
  )$$,
  'the reconciler can advance a stream cursor'
);
select is(
  (select last_ledger_sequence from public.reconciliation_cursors
    where stream_name = 'soroban.events'),
  12346::bigint,
  'cursor advancement stores the latest observed ledger'
);
select is(
  (select version from public.reconciliation_cursors
    where stream_name = 'soroban.events'),
  2::bigint,
  'cursor advancement increments its concurrency version'
);
select throws_ok(
  $$select public.advance_reconciliation_cursor(
    'stellar_testnet', 'soroban.events', 'cursor-12344', 12344, now(),
    '75000000-0000-0000-0000-000000000005'
  )$$,
  '23514', 'reconciliation cursor cannot move backward',
  'a stale worker cannot rewind a reconciliation cursor'
);

insert into public.reconciliation_runs (
  id, organization_id, program_id, stream_name, cursor_before,
  start_ledger_sequence, correlation_id
) values (
  '77000000-0000-0000-0000-000000000001',
  '72000000-0000-0000-0000-000000000001',
  '73000000-0000-0000-0000-000000000001',
  'soroban.events', 'cursor-12345', 12345,
  '75000000-0000-0000-0000-000000000006'
);

select lives_ok(
  $$update public.reconciliation_runs
    set status = 'completed', cursor_after = 'cursor-12346',
        end_ledger_sequence = 12346,
        observed_transaction_count = 1, observed_event_count = 1,
        confirmed_intent_count = 1,
        reconciliation_lag_seconds = 2, completed_at = now()
    where id = '77000000-0000-0000-0000-000000000001'$$,
  'a running reconciliation run can complete with result evidence'
);
select throws_ok(
  $$update public.reconciliation_runs
    set observed_event_count = 2
    where id = '77000000-0000-0000-0000-000000000001'$$,
  '55000', 'completed reconciliation runs are immutable',
  'completed reconciliation diagnostics cannot be rewritten'
);

insert into public.reconciliation_runs (
  id, organization_id, program_id, stream_name, cursor_before,
  start_ledger_sequence, correlation_id
) values (
  '77000000-0000-0000-0000-000000000002',
  '72000000-0000-0000-0000-000000000001',
  '73000000-0000-0000-0000-000000000001',
  'projection.balances', 'cursor-12346', 12346,
  '75000000-0000-0000-0000-000000000007'
);

select lives_ok(
  $$select public.record_reconciliation_issue(
    '77000000-0000-0000-0000-000000000002',
    '72000000-0000-0000-0000-000000000001',
    '73000000-0000-0000-0000-000000000001',
    '74000000-0000-0000-0000-000000000001', null,
    'stellar_testnet', 'projection_mismatch', 'critical',
    'beneficiary_balance_projection', 'beneficiary:test',
    'beneficiary_balance_projection', '{"beneficiary_id":"test"}',
    '{"balance_stroops":"100"}', '{"balance_stroops":"90"}',
    repeat('f', 64), now(),
    '75000000-0000-0000-0000-000000000008'
  )$$,
  'a mismatch is recorded through the narrow service path'
);

select public.record_reconciliation_issue(
  '77000000-0000-0000-0000-000000000002',
  '72000000-0000-0000-0000-000000000001',
  '73000000-0000-0000-0000-000000000001',
  '74000000-0000-0000-0000-000000000001', null,
  'stellar_testnet', 'projection_mismatch', 'critical',
  'beneficiary_balance_projection', 'beneficiary:test',
  'beneficiary_balance_projection', '{"beneficiary_id":"test"}',
  '{"balance_stroops":"100"}', '{"balance_stroops":"90"}',
  repeat('f', 64), now(),
  '75000000-0000-0000-0000-000000000008'
);

select is(
  (select count(*)::integer from public.reconciliation_issues
    where mismatch_fingerprint = repeat('f', 64)),
  1,
  'repeated active mismatch observations are deduplicated'
);
select is(
  (select occurrence_count from public.reconciliation_issues
    where mismatch_fingerprint = repeat('f', 64)),
  2,
  'deduplicated mismatch observations increment occurrence evidence'
);
select is(
  (select quarantine_state::text || '|' || alert_state::text
    from public.reconciliation_issues
    where mismatch_fingerprint = repeat('f', 64)),
  'quarantined|pending',
  'new mismatches are quarantined and await an operational alert'
);

select throws_ok(
  $$update public.reconciliation_issues
    set quarantine_state = 'released', released_at = now()
    where mismatch_fingerprint = repeat('f', 64)$$,
  '23514', 'quarantine release requires a closed issue',
  'an unresolved mismatch cannot leave quarantine'
);
select lives_ok(
  $$update public.reconciliation_issues
    set status = 'investigating', alert_state = 'sent',
        alert_last_attempt_at = now(), alert_sent_at = now()
    where mismatch_fingerprint = repeat('f', 64)$$,
  'operators can mark an alert sent while investigating a mismatch'
);
select lives_ok(
  $$update public.reconciliation_issues
    set status = 'resolved', quarantine_state = 'released',
        released_at = now(), alert_state = 'resolved',
        resolved_at = now(),
        resolved_by = '71000000-0000-0000-0000-000000000001',
        resolution_note = 'Projection rebuilt from ledger evidence.'
    where mismatch_fingerprint = repeat('f', 64)$$,
  'resolved mismatches can release quarantine and close their alert'
);
select throws_ok(
  $$delete from public.reconciliation_issues
    where mismatch_fingerprint = repeat('f', 64)$$,
  '55000', 'reconciliation issues cannot be deleted',
  'mismatch and resolution evidence cannot be deleted'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '71000000-0000-0000-0000-000000000001',
  true
);
select is(
  (select count(*)::integer from public.ledger_transactions),
  1,
  'authorized organization financial operators can read ledger evidence'
);
select is(
  (select count(*)::integer from public.contract_events),
  1,
  'authorized organization financial operators can read contract events'
);
select is(
  (select count(*)::integer from public.reconciliation_issues),
  1,
  'authorized organization financial operators can read mismatch state'
);
select throws_ok(
  $$insert into public.ledger_transactions (
      organization_id, transaction_hash, envelope_xdr, envelope_sha256,
      ledger_sequence, ledger_closed_at, successful, correlation_id
    ) values (
      '72000000-0000-0000-0000-000000000001', repeat('9', 64),
      'CCCC', repeat('8', 64), 12347, now(), true,
      '75000000-0000-0000-0000-000000000009'
    )$$,
  '42501', 'permission denied for table ledger_transactions',
  'authenticated operators cannot forge observed ledger evidence'
);

select set_config(
  'request.jwt.claim.sub',
  '71000000-0000-0000-0000-000000000002',
  true
);
select is(
  (select count(*)::integer from public.ledger_transactions),
  0,
  'users outside the organization cannot read ledger evidence'
);
select is(
  (select count(*)::integer from public.contract_events),
  0,
  'users outside the organization cannot read contract event evidence'
);
select is(
  (select count(*)::integer from public.reconciliation_issues),
  0,
  'users outside the organization cannot read mismatch evidence'
);

reset role;
select * from finish();
rollback;

// Property 7: Monotonic Auditability
//
// "Confirmed financial and audit records are appended or compensated, never
//  edited or deleted."
//
// Validates: Requirements 15.1, 15.2, 15.9, 19.6
//
// Property-testing library (pinned): fast-check 3.23.2 (see package.json
// devDependencies).
//
// This suite has two layers, mirroring scripts/tests/tenant-isolation.property.test.mjs:
//
//   1. MODEL LAYER (always runs): fast-check generates create / confirm /
//      compensate / update / delete / audit sequences and drives them through an
//      in-memory reference ledger. The reference ledger encodes the canonical
//      immutability rules that the SQL migrations enforce:
//        - `private.protect_confirmed_financial_history` (migration
//          20260716051000): UPDATE/DELETE is rejected on
//          disbursements/ledger_transactions/contract_events unconditionally, and
//          on redemptions/voucher_redemptions/settlements/refunds once the row is
//          confirmed/completed.
//        - `private.reject_audit_event_mutation` (migration 20260716050000):
//          audit_events reject every UPDATE/DELETE; only the service append path
//          inserts.
//        - The revoke of INSERT/UPDATE/DELETE from public/anon/authenticated on
//          the sensitive financial + projection tables (Req 15.9): client actors
//          never mutate financial or audit history directly.
//        - `private.validate_refund_workflow` (migration 20260716090000): a
//          refund is a distinct appended row that references its original
//          confirmed payment + settlement, never edits the original, and cannot
//          push cumulative refunds past the original amount (Req 15.2).
//      Because this layer never needs a database, it runs everywhere and proves
//      the invariants hold across the whole generated input space.
//
//   2. DATABASE LAYER (runs when a local Supabase stack is reachable): the real
//      Postgres triggers and grants are exercised against reset local fixtures.
//      It is skipped with a clear blocker message when the local stack is
//      unavailable (no hosted project is ever touched). Point it at a local
//      database with SUPABASE_DB_URL.
//
// Minimized counterexamples and replay seeds: fast-check shrinks failing cases
// and reports the seed. Set FC_SEED to replay a specific run.

import fc from 'fast-check';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

// ---------------------------------------------------------------------------
// Canonical immutability rule table (reference encoding of the SQL migrations).
// ---------------------------------------------------------------------------

// Confirmed/completed financial history and these table families are append-only
// for trusted code. Mirrors `private.protect_confirmed_financial_history`.
const ALWAYS_IMMUTABLE_TABLES = ['disbursements', 'ledger_transactions', 'contract_events'];
const MUTABLE_HISTORY_TABLES = ['redemptions', 'voucher_redemptions', 'settlements', 'refunds'];
const FINANCIAL_TABLES = [...ALWAYS_IMMUTABLE_TABLES, ...MUTABLE_HISTORY_TABLES];
const CONFIRMED_STATUSES = ['confirmed', 'completed'];

const isConfirmed = (status) => CONFIRMED_STATUSES.includes(String(status ?? '').toLowerCase());

// Does trusted (service-role) code retain the right to UPDATE/DELETE this row?
// Returns false exactly when the SQL trigger would raise 23514.
function trustedFinancialMutationAllowed(table, previousStatus) {
  if (ALWAYS_IMMUTABLE_TABLES.includes(table)) return false;
  if (isConfirmed(previousStatus)) return false;
  return true;
}

// Client roles (anon/authenticated) hold no DML on financial or audit history.
function clientFinancialMutationAllowed() {
  return false;
}

// ---------------------------------------------------------------------------
// In-memory reference ledger. Applies a generated command sequence while
// enforcing the canonical rules, and records every attempt for later assertion.
// ---------------------------------------------------------------------------

function newLedger() {
  return {
    records: new Map(), // key `${table}:${id}` -> record
    frozen: new Map(), // key -> JSON snapshot captured when the row became confirmed/immutable
    auditLog: [], // append-only list of { seq, action }
    attempts: [], // trace of every mutation attempt and its outcome
    auditSeq: 0,
  };
}

const keyOf = (table, id) => `${table}:${id}`;

function insertFinancial(ledger, { table, id, amount, status }) {
  const key = keyOf(table, id);
  if (ledger.records.has(key)) return { outcome: 'denied', reason: 'duplicate' };
  const record = { table, id, amount, status, links: null };
  ledger.records.set(key, record);
  // Rows on always-immutable tables are frozen the moment they are appended;
  // confirmed rows on mutable tables are frozen when confirmed.
  if (ALWAYS_IMMUTABLE_TABLES.includes(table) || isConfirmed(status)) {
    ledger.frozen.set(key, JSON.stringify(record));
  }
  ledger.attempts.push({ op: 'insert', table, id, outcome: 'inserted' });
  return { outcome: 'inserted' };
}

function confirmFinancial(ledger, { table, id, confirmedStatus }) {
  const key = keyOf(table, id);
  const record = ledger.records.get(key);
  if (!record) return { outcome: 'missing' };
  const allowed = trustedFinancialMutationAllowed(table, record.status);
  if (!allowed) {
    ledger.attempts.push({ op: 'confirm', table, id, priorStatus: record.status, outcome: 'denied' });
    return { outcome: 'denied' };
  }
  record.status = confirmedStatus;
  if (isConfirmed(confirmedStatus)) {
    ledger.frozen.set(key, JSON.stringify(record));
  }
  ledger.attempts.push({ op: 'confirm', table, id, outcome: 'applied' });
  return { outcome: 'applied' };
}

function mutateFinancial(ledger, { table, id, actor, mutation }) {
  const key = keyOf(table, id);
  const record = ledger.records.get(key);
  if (!record) return { outcome: 'missing' };
  const priorStatus = record.status;
  const allowed =
    actor === 'client'
      ? clientFinancialMutationAllowed()
      : trustedFinancialMutationAllowed(table, priorStatus);

  const attempt = { op: mutation, table, id, actor, priorStatus, wasConfirmed: isConfirmed(priorStatus) };

  if (!allowed) {
    ledger.attempts.push({ ...attempt, outcome: 'denied' });
    return { outcome: 'denied' };
  }

  // Only trusted code reaches here, and only on a non-confirmed mutable row.
  if (mutation === 'delete') {
    ledger.records.delete(key);
  } else {
    record.amount += 1; // an arbitrary edit to a still-mutable pending row
  }
  ledger.attempts.push({ ...attempt, outcome: 'applied' });
  return { outcome: 'applied' };
}

// A compensation appends a distinct refund row linked to a confirmed original.
// Mirrors `private.validate_refund_workflow`: refund references the original,
// never edits it, and cumulative refunds cannot exceed the original amount.
function compensate(ledger, { originalTable, originalId, amount }) {
  const originalKey = keyOf(originalTable, originalId);
  const original = ledger.records.get(originalKey);
  if (!original || !isConfirmed(original.status)) {
    ledger.attempts.push({ op: 'compensate', originalId, outcome: 'denied', reason: 'no-confirmed-original' });
    return { outcome: 'denied' };
  }

  const priorRefunded = [...ledger.records.values()]
    .filter((r) => r.table === 'refunds' && r.links === originalKey)
    .reduce((sum, r) => sum + r.amount, 0);

  if (priorRefunded + amount > original.amount) {
    ledger.attempts.push({ op: 'compensate', originalId, outcome: 'denied', reason: 'exceeds-original' });
    return { outcome: 'denied' };
  }

  const refundId = randomUUID();
  const refund = { table: 'refunds', id: refundId, amount, status: 'requested', links: originalKey };
  ledger.records.set(keyOf('refunds', refundId), refund);
  ledger.attempts.push({ op: 'compensate', originalId, refundId, amount, outcome: 'appended' });
  return { outcome: 'appended', refundId };
}

function appendAudit(ledger, { action }) {
  ledger.auditSeq += 1;
  const entry = { seq: ledger.auditSeq, action };
  ledger.auditLog.push(Object.freeze({ ...entry }));
  ledger.attempts.push({ op: 'audit-append', outcome: 'appended', seq: entry.seq });
  return { outcome: 'appended' };
}

function mutateAudit(ledger, { mutation }) {
  // audit_events reject every UPDATE/DELETE (append-only), for every actor.
  ledger.attempts.push({ op: `audit-${mutation}`, outcome: 'denied' });
  return { outcome: 'denied' };
}

// ---------------------------------------------------------------------------
// Command generators.
// ---------------------------------------------------------------------------

// Refunds are never inserted bare: in the real system they exist only as
// compensating records produced by the refund workflow (which mandates the link
// to the original). Every other financial table can be appended directly.
const INSERTABLE_TABLES = FINANCIAL_TABLES.filter((table) => table !== 'refunds');

const financialTableArb = fc.constantFrom(...FINANCIAL_TABLES);
const insertableTableArb = fc.constantFrom(...INSERTABLE_TABLES);
const mutableTableArb = fc.constantFrom('redemptions', 'voucher_redemptions', 'settlements');
const actorArb = fc.constantFrom('client', 'service');
const mutationArb = fc.constantFrom('update', 'delete');
const amountArb = fc.integer({ min: 1, max: 1_000_000 });

// A record id is a small integer so commands can refer back to earlier records.
const recordRefArb = fc.nat({ max: 11 });

const commandArb = fc.oneof(
  // Append a fresh financial record. Always-immutable tables are appended as
  // confirmed evidence; mutable tables start pending.
  fc.record({
    kind: fc.constant('insert'),
    table: insertableTableArb,
    id: recordRefArb,
    amount: amountArb,
    confirmedOnInsert: fc.boolean(),
  }),
  // Confirm a mutable record (pending -> confirmed/completed).
  fc.record({
    kind: fc.constant('confirm'),
    table: mutableTableArb,
    id: recordRefArb,
    confirmedStatus: fc.constantFrom('confirmed', 'completed'),
  }),
  // Attempt to edit or delete a financial record.
  fc.record({
    kind: fc.constant('mutate'),
    table: financialTableArb,
    id: recordRefArb,
    actor: actorArb,
    mutation: mutationArb,
  }),
  // Append a compensating refund linked to an existing original.
  fc.record({
    kind: fc.constant('compensate'),
    originalTable: fc.constantFrom('settlements', 'redemptions', 'voucher_redemptions'),
    originalId: recordRefArb,
    amount: amountArb,
  }),
  // Append an audit event.
  fc.record({ kind: fc.constant('audit-append'), action: fc.constantFrom('sensitive.identity.read', 'refund.requested', 'program.activated') }),
  // Attempt to edit or delete audit history.
  fc.record({ kind: fc.constant('audit-mutate'), mutation: mutationArb }),
);

const scenarioArb = fc.array(commandArb, { minLength: 1, maxLength: 60 });

function runScenario(commands) {
  const ledger = newLedger();
  for (const command of commands) {
    switch (command.kind) {
      case 'insert':
        insertFinancial(ledger, {
          table: command.table,
          id: command.id,
          amount: command.amount,
          status: command.confirmedOnInsert || ALWAYS_IMMUTABLE_TABLES.includes(command.table) ? 'confirmed' : 'pending',
        });
        break;
      case 'confirm':
        confirmFinancial(ledger, { table: command.table, id: command.id, confirmedStatus: command.confirmedStatus });
        break;
      case 'mutate':
        mutateFinancial(ledger, { table: command.table, id: command.id, actor: command.actor, mutation: command.mutation });
        break;
      case 'compensate':
        compensate(ledger, { originalTable: command.originalTable, originalId: command.originalId, amount: command.amount });
        break;
      case 'audit-append':
        appendAudit(ledger, { action: command.action });
        break;
      case 'audit-mutate':
        mutateAudit(ledger, { mutation: command.mutation });
        break;
      default:
        throw new Error(`unknown command ${command.kind}`);
    }
  }
  return ledger;
}

// ---------------------------------------------------------------------------
// Model layer property.
// ---------------------------------------------------------------------------

const seedFromEnv = Number.parseInt(process.env.FC_SEED ?? '', 10);
const fcConfig = {
  numRuns: Number.parseInt(process.env.FC_NUM_RUNS ?? '400', 10),
  endOnFailure: true,
  ...(Number.isFinite(seedFromEnv) ? { seed: seedFromEnv } : {}),
};

test('property: confirmed financial and audit history is only appended or compensated, never edited or deleted', () => {
  fc.assert(
    fc.property(scenarioArb, (commands) => {
      const ledger = runScenario(commands);

      // (1) Every attempt to edit/delete a confirmed row or an always-immutable
      //     table row is denied, for trusted and client actors alike (Req 15.1).
      for (const attempt of ledger.attempts) {
        if (attempt.op !== 'update' && attempt.op !== 'delete') continue;
        const immutable = ALWAYS_IMMUTABLE_TABLES.includes(attempt.table) || attempt.wasConfirmed;
        if (immutable) {
          assert.equal(
            attempt.outcome,
            'denied',
            `immutability breach: ${attempt.actor} ${attempt.op} ${attempt.table}:${attempt.id} (status ${attempt.priorStatus})`,
          );
        }
      }

      // (2) Client actors never mutate financial history directly (Req 15.9).
      for (const attempt of ledger.attempts) {
        if ((attempt.op === 'update' || attempt.op === 'delete') && attempt.actor === 'client') {
          assert.equal(attempt.outcome, 'denied', `client DML leak: ${attempt.op} ${attempt.table}:${attempt.id}`);
        }
      }

      // (3) Every frozen (confirmed/immutable) record is still present and byte
      //     identical to its snapshot: nothing edited it or deleted it.
      for (const [key, snapshot] of ledger.frozen) {
        const current = ledger.records.get(key);
        assert.ok(current, `frozen record vanished: ${key}`);
        assert.equal(JSON.stringify(current), snapshot, `frozen record mutated: ${key}`);
      }

      // (4) Audit history is append-only and strictly monotonic; no edit/delete
      //     ever succeeded (Req 19.6).
      for (const attempt of ledger.attempts) {
        if (attempt.op === 'audit-update' || attempt.op === 'audit-delete') {
          assert.equal(attempt.outcome, 'denied', 'audit history mutation must be denied');
        }
      }
      ledger.auditLog.forEach((entry, index) => {
        assert.equal(entry.seq, index + 1, 'audit sequence numbers are contiguous and monotonic');
      });

      // (5) Every compensation is a distinct appended refund linked to a
      //     confirmed original, and cumulative refunds never exceed the original
      //     amount (Req 15.2).
      const refunds = [...ledger.records.values()].filter((r) => r.table === 'refunds');
      const byOriginal = new Map();
      for (const refund of refunds) {
        assert.ok(refund.links, 'refund must reference an original record');
        const original = ledger.records.get(refund.links);
        assert.ok(original, `refund references a missing original: ${refund.links}`);
        assert.ok(isConfirmed(original.status), 'refund original must be confirmed');
        assert.notEqual(refund.id, original.id, 'refund is a distinct record, not an edit of the original');
        byOriginal.set(refund.links, (byOriginal.get(refund.links) ?? 0) + refund.amount);
      }
      for (const [originalKey, refunded] of byOriginal) {
        const original = ledger.records.get(originalKey);
        assert.ok(refunded <= original.amount, `cumulative refunds ${refunded} exceed original ${original.amount}`);
      }

      return true;
    }),
    fcConfig,
  );
});

// The canonical rule table, pinned to explicit expected values so the reference
// encoding cannot silently drift from the SQL triggers.
test('property: reference immutability rule table matches the SQL migration semantics', () => {
  const statuses = ['pending', 'requested', 'submitted', 'confirmed', 'completed', 'Completed', 'Confirmed'];

  for (const table of ALWAYS_IMMUTABLE_TABLES) {
    for (const status of statuses) {
      assert.equal(trustedFinancialMutationAllowed(table, status), false, `${table} must always be immutable`);
    }
  }
  for (const table of MUTABLE_HISTORY_TABLES) {
    for (const status of statuses) {
      assert.equal(
        trustedFinancialMutationAllowed(table, status),
        !isConfirmed(status),
        `${table} mutable iff not confirmed (status ${status})`,
      );
    }
  }
  // Client roles never hold financial DML.
  assert.equal(clientFinancialMutationAllowed(), false);
});

// Positive coverage guard: the property must not be vacuously true. Pending rows
// can be reconciled to confirmed, compensations within bounds append, and audit
// events accumulate.
test('property: model allows the legitimate append/compensate paths so it is not vacuous', () => {
  const ledger = newLedger();

  // A pending settlement can be reconciled to confirmed.
  assert.equal(insertFinancial(ledger, { table: 'settlements', id: 1, amount: 500, status: 'pending' }).outcome, 'inserted');
  assert.equal(confirmFinancial(ledger, { table: 'settlements', id: 1, confirmedStatus: 'confirmed' }).outcome, 'applied');
  // Once confirmed it is frozen: further edits and deletes are denied.
  assert.equal(mutateFinancial(ledger, { table: 'settlements', id: 1, actor: 'service', mutation: 'update' }).outcome, 'denied');
  assert.equal(mutateFinancial(ledger, { table: 'settlements', id: 1, actor: 'service', mutation: 'delete' }).outcome, 'denied');

  // A within-bounds compensation appends a distinct linked refund.
  const first = compensate(ledger, { originalTable: 'settlements', originalId: 1, amount: 200 });
  assert.equal(first.outcome, 'appended');
  const second = compensate(ledger, { originalTable: 'settlements', originalId: 1, amount: 200 });
  assert.equal(second.outcome, 'appended');
  // Exceeding the original amount is rejected.
  assert.equal(compensate(ledger, { originalTable: 'settlements', originalId: 1, amount: 200 }).outcome, 'denied');

  // Audit appends accumulate and cannot be edited or deleted.
  assert.equal(appendAudit(ledger, { action: 'refund.requested' }).outcome, 'appended');
  assert.equal(mutateAudit(ledger, { mutation: 'update' }).outcome, 'denied');
  assert.equal(mutateAudit(ledger, { mutation: 'delete' }).outcome, 'denied');
  assert.equal(ledger.auditLog.length, 1);
});

// ---------------------------------------------------------------------------
// Database layer property (runs against reset local fixtures when reachable).
// ---------------------------------------------------------------------------

const DB_URL = process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

async function openDatabase() {
  let pg;
  try {
    ({ default: pg } = await import('pg'));
  } catch {
    return null; // pg not installed
  }
  const client = new pg.Client({ connectionString: DB_URL, connectionTimeoutMillis: 2000 });
  try {
    await client.connect();
    return client;
  } catch {
    try { await client.end(); } catch { /* ignore */ }
    return null;
  }
}

// Seed the minimal immutable-history fixture used by
// supabase/tests/database/financial_mutation_hardening.test.sql: an organization
// admin, a draft program, one Completed and one Pending redemption, a
// disbursement, and one appended audit event. Returns the identifiers.
async function seedImmutabilityFixture(client) {
  const ids = {
    admin: randomUUID(),
    beneficiary: randomUUID(),
    org: randomUUID(),
    program: randomUUID(),
    enrollment: randomUUID(),
    completedRedemption: randomUUID(),
    pendingRedemption: randomUUID(),
    disbursement: randomUUID(),
    correlation: randomUUID(),
  };

  const insertUser = async (id, email) => {
    await client.query(
      `insert into auth.users (
         id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
         raw_app_meta_data, raw_user_meta_data, created_at, updated_at
       ) values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated',
         'authenticated', $2, '', now(),
         '{"provider":"email","providers":["email"]}', '{"role":"lgu"}', now(), now())`,
      [id, email],
    );
  };

  await insertUser(ids.admin, `audit-admin-${ids.admin}@example.test`);
  await insertUser(ids.beneficiary, `audit-ben-${ids.beneficiary}@example.test`);

  await client.query(`insert into public.organizations (id, name, slug) values ($1, 'Audit', $2)`, [
    ids.org, `audit-${ids.org}`,
  ]);
  await client.query(
    `select public.upsert_organization_membership($1, $2, 'organization_administrator', $2)`,
    [ids.org, ids.admin],
  );
  await client.query(
    `insert into public.programs (id, organization_id, name, status, created_by)
     values ($1, $2, 'Immutable History Program', 'draft', $3)`,
    [ids.program, ids.org, ids.admin],
  );
  await client.query(
    `insert into public.enrollments (id, beneficiary_id, program_id, approval_status, category)
     values ($1, $2, $3, 'Approved', 'Food')`,
    [ids.enrollment, ids.beneficiary, ids.program],
  );
  await client.query(
    `insert into public.redemptions (id, enrollment_id, beneficiary_id, amount, status)
     values ($1, $2, $3, 100, 'Completed'), ($4, $2, $3, 25, 'Pending')`,
    [ids.completedRedemption, ids.enrollment, ids.beneficiary, ids.pendingRedemption],
  );
  await client.query(
    `insert into public.disbursements (id, program_id, program_name, amount, recipients_count)
     values ($1, $2, 'Immutable History Program', 125, 1)`,
    [ids.disbursement, ids.program],
  );
  await client.query(
    `select public.append_audit_event($1, $2, 'sensitive.identity.read', $3, true, '{}'::jsonb)`,
    [ids.org, ids.admin, ids.correlation],
  );

  return ids;
}

async function countRows(client, table, id) {
  const { rows } = await client.query(`select count(*)::int as c from public.${table} where id = $1`, [id]);
  return rows[0].c;
}

test('property: confirmed financial history and audit events reject edit/delete against reset local fixtures (database)', async (t) => {
  const client = await openDatabase();
  if (!client) {
    t.skip(
      `local Supabase database unavailable at ${DB_URL}. ` +
        'Run `npx supabase start` and `npx supabase db reset`, then re-run the property suite. ' +
        'No hosted project is contacted.',
    );
    return;
  }

  try {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          // The trigger is status-driven, so exercise both edit and delete on the
          // confirmed row and vary the new amount an attacker might try to write.
          tamperAmount: fc.integer({ min: 1, max: 1_000_000 }),
          reconcilePendingFirst: fc.boolean(),
        }),
        async (scenario) => {
          await client.query('begin');
          try {
            const ids = await seedImmutabilityFixture(client);

            // Trusted code (superuser here) cannot edit or delete confirmed history.
            await assert.rejects(
              client.query(`update public.redemptions set amount = $1 where id = $2`, [
                scenario.tamperAmount,
                ids.completedRedemption,
              ]),
              /confirmed financial history is immutable/i,
              'completed redemption must not be editable',
            );
            await assert.rejects(
              client.query(`delete from public.redemptions where id = $1`, [ids.completedRedemption]),
              /confirmed financial history is immutable/i,
              'completed redemption must not be deletable',
            );
            assert.equal(
              await countRows(client, 'redemptions', ids.completedRedemption),
              1,
              'denied mutations conserve confirmed redemption history',
            );

            // Always-immutable disbursement history rejects delete unconditionally.
            await assert.rejects(
              client.query(`delete from public.disbursements where id = $1`, [ids.disbursement]),
              /confirmed financial history is immutable/i,
              'disbursement history is append-only',
            );

            // Audit events reject every update and delete (append-only).
            await assert.rejects(
              client.query(`update public.audit_events set action = 'tampered' where correlation_id = $1`, [
                ids.correlation,
              ]),
              /audit events are append-only/i,
              'audit history must not be editable',
            );
            await assert.rejects(
              client.query(`delete from public.audit_events where correlation_id = $1`, [ids.correlation]),
              /audit events are append-only/i,
              'audit history must not be deletable',
            );

            // A still-pending row can be reconciled forward, then becomes immutable.
            if (scenario.reconcilePendingFirst) {
              await client.query(`update public.redemptions set status = 'Completed' where id = $1`, [
                ids.pendingRedemption,
              ]);
              await assert.rejects(
                client.query(`update public.redemptions set amount = $1 where id = $2`, [
                  scenario.tamperAmount,
                  ids.pendingRedemption,
                ]),
                /confirmed financial history is immutable/i,
                'newly completed history is immediately immutable',
              );
            }

            // Client roles hold no DML on financial or audit history (Req 15.9).
            await client.query('set local role authenticated');
            await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [ids.admin]);
            await assert.rejects(
              client.query(`delete from public.redemptions where id = $1`, [ids.completedRedemption]),
              /permission denied|row-level security/i,
              'authenticated clients cannot delete financial history',
            );
            await assert.rejects(
              client.query(`update public.audit_events set action = 'x' where correlation_id = $1`, [ids.correlation]),
              /permission denied|row-level security|append-only/i,
              'authenticated clients cannot edit audit history',
            );
            await client.query('reset role');

            return true;
          } finally {
            await client.query('rollback');
          }
        },
      ),
      { numRuns: Number.parseInt(process.env.FC_DB_NUM_RUNS ?? '20', 10), endOnFailure: true },
    );
  } finally {
    await client.end();
  }
});

// Verifies a hosted (or local) Supabase database matches what the migration
// sequence is supposed to produce. Read-only.
//
// Usage:
//   . .\scripts\load-hosted-env.ps1
//   node .\scripts\verify-hosted-schema.mjs
//
// Or:
//   node --env-file=.env.hosted.local .\scripts\verify-hosted-schema.mjs
//
// Checks, in order of importance:
//   1. wallets_protect_verified_binding trigger EXISTS and is enabled.
//      20260717130000 drops it; 20260925090000 restores it. If this is missing,
//      a verified wallet can be silently repointed — stop and fix before use.
//   2. Applied migration count.
//   3. Table, RLS policy, trigger, enum, and function counts in public.
//   4. Presence of the financial-core tables.

import pg from 'pg';

const databaseUrl = process.env.SUPABASE_DB_URL;
if (!databaseUrl) {
  console.error('SUPABASE_DB_URL is not set. Run: . .\\scripts\\load-hosted-env.ps1');
  process.exit(1);
}

const CORE_TABLES = [
  'profiles', 'organizations', 'programs', 'wallets', 'beneficiary_identities',
  'enrollments', 'payment_intents', 'settlements', 'audit_events',
  'reconciliation_runs', 'registrations', 'merchant_metrics',
];

const client = new pg.Client({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
});

const q = async (sql, params = []) => (await client.query(sql, params)).rows;

let failures = 0;
const check = (ok, label, detail) => {
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${label}${detail ? '  — ' + detail : ''}`);
  if (!ok) failures += 1;
};

try {
  await client.connect();
  const [{ db, host }] = await q(
    'select current_database() as db, inet_server_addr()::text as host',
  );
  console.log(`\nConnected: ${db} @ ${host ?? 'managed'}\n`);

  // 1. The security-critical trigger.
  console.log('Security invariants');
  const trig = await q(
    `select tgname, tgenabled from pg_trigger
     where tgname = 'wallets_protect_verified_binding' and not tgisinternal`,
  );
  check(
    trig.length === 1 && trig[0].tgenabled === 'O',
    'wallets_protect_verified_binding present and enabled',
    trig.length === 0
      ? 'MISSING — verified wallets are silently repointable. Apply 20260925090000.'
      : `tgenabled=${trig[0].tgenabled}`,
  );

  const rlsOff = await q(
    `select c.relname from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
  );
  check(
    rlsOff.length === 0,
    'every public table has RLS enabled',
    rlsOff.length ? `without RLS: ${rlsOff.map((r) => r.relname).join(', ')}` : '',
  );

  // 2. Migrations.
  console.log('\nMigrations');
  const [{ n: applied }] = await q(
    'select count(*)::int as n from supabase_migrations.schema_migrations',
  );
  check(applied >= 52, `applied migrations >= 52`, `found ${applied}`);

  // 3. Object counts.
  console.log('\nSchema objects (public)');
  const [{ n: tables }] = await q(
    `select count(*)::int as n from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
     where ns.nspname = 'public' and c.relkind = 'r'`,
  );
  const [{ n: policies }] = await q(
    `select count(*)::int as n from pg_policies where schemaname = 'public'`,
  );
  const [{ n: triggers }] = await q(
    `select count(*)::int as n from pg_trigger t join pg_class c on c.oid = t.tgrelid
     join pg_namespace ns on ns.oid = c.relnamespace
     where ns.nspname = 'public' and not t.tgisinternal`,
  );
  const [{ n: enums }] = await q(
    `select count(*)::int as n from pg_type t join pg_namespace ns on ns.oid = t.typnamespace
     where ns.nspname = 'public' and t.typtype = 'e'`,
  );
  const [{ n: funcs }] = await q(
    `select count(*)::int as n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public'`,
  );
  // Expected values are from LIVE introspection of a database built by the full
  // 52-migration sequence (hosted project, 2026-09-24):
  //   tables=54  public policies=77  public triggers=79  enums=40  functions=35
  // Do not compare against counts derived by grepping `create policy` across the
  // migration files — that double-counts policies the repair migrations dropped
  // and recreated (see build-reliefchain.md §8 item 10).
  console.log(`  tables=${tables}  policies=${policies}  triggers=${triggers}  enums=${enums}  functions=${funcs}`);
  check(tables >= 54, 'table count matches the migration sequence', `${tables}, expected >= 54`);
  check(policies >= 77, 'public RLS policy count matches', `${policies}, expected >= 77`);
  check(triggers >= 79, 'public trigger count matches', `${triggers}, expected >= 79`);
  check(enums >= 40, 'enum type count matches', `${enums}, expected >= 40`);

  // 4. Financial core present.
  console.log('\nFinancial-core tables');
  const present = new Set(
    (await q(
      `select c.relname from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
       where ns.nspname = 'public' and c.relkind = 'r'`,
    )).map((r) => r.relname),
  );
  const absent = CORE_TABLES.filter((t) => !present.has(t));
  check(absent.length === 0, 'all probed core tables exist', absent.length ? `absent: ${absent.join(', ')}` : '');

  console.log(
    failures === 0
      ? '\nAll checks passed.\n'
      : `\n${failures} check(s) FAILED. Do not deploy functions or build until resolved.\n`,
  );
  process.exitCode = failures === 0 ? 0 : 1;
} catch (error) {
  console.error(`\nVerification error: ${error.message}\n`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}

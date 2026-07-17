import fc from 'fast-check';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const containerName = `relief-chain-registration-cycles-test-${process.pid}`;
const databaseName = 'registration_unlimited_cycles';
const migrationNames = [
  '20260716000000_super_admin_role_and_seed.sql',
  '20260716010000_create_registrations_table.sql',
  '20260716020000_registrations_denial_log.sql',
  '20260716030000_registrations_rls.sql',
  '20260716050000_registration_status_guards.sql',
];
const migrationRoot = new URL('../migrations/', import.meta.url);

const runDocker = (args, input = undefined) => new Promise((resolve, reject) => {
  const child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.on('error', reject);
  child.on('close', (code) => {
    if (code === 0) resolve(stdout.trim());
    else reject(new Error(`docker ${args.join(' ')} failed (${code}): ${stderr.trim()}`));
  });
  if (input !== undefined) child.stdin.write(input);
  child.stdin.end();
});

const hasDocker = async () => {
  try {
    await execFileAsync('docker', ['info'], { windowsHide: true });
    return true;
  } catch {
    return false;
  }
};

const waitForPostgres = async () => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      await runDocker([
        'exec', containerName, 'psql', '-U', 'postgres', '-d', databaseName,
        '-v', 'ON_ERROR_STOP=1', '-At', '-q', '-c', 'select 1',
      ]);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error('PostgreSQL container did not become ready within 30 seconds.');
};

const executeSql = (sql) => runDocker([
  'exec', '-i', containerName, 'psql', '-U', 'postgres', '-d', databaseName,
  '-v', 'ON_ERROR_STOP=1', '-At', '-q',
], sql);

const sqlLiteral = (value) => `'${value.replaceAll("'", "''")}'`;

const bootstrapSql = `
create extension if not exists pgcrypto;
create schema if not exists auth;
create role authenticated;
create role anon;
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create table auth.users (
  id uuid primary key,
  aud text,
  role text,
  email text unique,
  encrypted_password text,
  email_confirmed_at timestamptz,
  raw_app_meta_data jsonb,
  raw_user_meta_data jsonb,
  created_at timestamptz,
  updated_at timestamptz
);
create table auth.identities (
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  identity_data jsonb not null,
  primary key (user_id, provider)
);
create table public.profiles (
  id uuid primary key,
  role text not null check (role in ('lgu', 'beneficiary', 'merchant')),
  full_name text
);
`;

const loadMigrations = async () => {
  const sql = [];
  for (const migrationName of migrationNames) {
    sql.push(await readFile(new URL(migrationName, migrationRoot), 'utf8'));
  }
  return sql.join('\n');
};

const cycleCaseArbitrary = fc.record({
  registrationId: fc.uuid(),
  ownerId: fc.uuid(),
  adminId: fc.uuid(),
  seed: fc.uuid(),
  cycles: fc.integer({ min: 1, max: 20 }),
}).filter(({ registrationId, ownerId, adminId }) => (
  registrationId !== ownerId
  && registrationId !== adminId
  && ownerId !== adminId
));

const cycleSql = ({ registrationId, ownerId, adminId, seed, cycles }) => {
  const cycleStatements = Array.from({ length: cycles }, (_, index) => {
    const cycle = index + 1;
    const reason = `rejection-${seed}-${cycle}`;
    const edited = {
      organizationName: `edited-organization-${seed}-${cycle}`,
      organizationType: `edited-type-${seed}-${cycle}`,
      contactInfo: `edited-contact-${seed}-${cycle}`,
      firstName: `edited-first-${seed}-${cycle}`,
      lastName: `edited-last-${seed}-${cycle}`,
      middleInitial: `M-${cycle}`,
      position: `edited-position-${seed}-${cycle}`,
    };

    return `
select set_config('request.jwt.claim.sub', ${sqlLiteral(adminId)}, true) as claim \\gset
with changed as (
  update public.registrations
     set status = 'Rejected', rejection_reason = ${sqlLiteral(reason)}
   where id = ${sqlLiteral(registrationId)}::uuid
     and status = 'Pending'
   returning id
)
select coalesce((select id::text from changed), '<no-update>');
select status || '|' || coalesce(rejection_reason, '<null>') || '|' ||
       organization_name || '|' || organization_type || '|' || contact_info || '|' ||
       representative_first_name || '|' || representative_last_name || '|' ||
       coalesce(representative_middle_initial, '<null>') || '|' || representative_position || '|' ||
       count(*) over ()
  from public.registrations
 where id = ${sqlLiteral(registrationId)}::uuid;
select set_config('request.jwt.claim.sub', ${sqlLiteral(ownerId)}, true) as claim \\gset
with changed as (
  update public.registrations
     set organization_name = ${sqlLiteral(edited.organizationName)},
         organization_type = ${sqlLiteral(edited.organizationType)},
         contact_info = ${sqlLiteral(edited.contactInfo)},
         representative_first_name = ${sqlLiteral(edited.firstName)},
         representative_last_name = ${sqlLiteral(edited.lastName)},
         representative_middle_initial = ${sqlLiteral(edited.middleInitial)},
         representative_position = ${sqlLiteral(edited.position)},
         status = 'Pending',
         rejection_reason = null
   where id = ${sqlLiteral(registrationId)}::uuid
     and status = 'Rejected'
   returning id
)
select coalesce((select id::text from changed), '<no-update>');
select status || '|' || coalesce(rejection_reason, '<null>') || '|' ||
       organization_name || '|' || organization_type || '|' || contact_info || '|' ||
       representative_first_name || '|' || representative_last_name || '|' ||
       coalesce(representative_middle_initial, '<null>') || '|' || representative_position || '|' ||
       count(*) over ()
  from public.registrations
 where id = ${sqlLiteral(registrationId)}::uuid;`;
  }).join('\n');

  return `
begin;
insert into public.profiles (id, role, full_name)
values (${sqlLiteral(ownerId)}::uuid, 'lgu', 'Generated LGU');
insert into public.profiles (id, role, full_name)
values (${sqlLiteral(adminId)}::uuid, 'super_admin', 'Generated Super Admin');
insert into public.registrations (
  id, lgu_id, organization_name, organization_type, contact_info,
  representative_first_name, representative_last_name,
  representative_middle_initial, representative_position, document_reference,
  status, rejection_reason
) values (
  ${sqlLiteral(registrationId)}::uuid, ${sqlLiteral(ownerId)}::uuid,
  'original-organization', 'original-type', 'original-contact',
  'Original', 'Representative', 'O', 'Original Position', 'original-document',
  'Pending', null
);
select status || '|' || coalesce(rejection_reason, '<null>') || '|' ||
       organization_name || '|' || organization_type || '|' || contact_info || '|' ||
       representative_first_name || '|' || representative_last_name || '|' ||
       coalesce(representative_middle_initial, '<null>') || '|' || representative_position || '|' ||
       count(*) over ()
  from public.registrations
 where id = ${sqlLiteral(registrationId)}::uuid;
set local role authenticated;
${cycleStatements}
reset role;
select count(*)::text
  from public.registrations
 where lgu_id = ${sqlLiteral(ownerId)}::uuid;
rollback;
`;
};

const rejectedLine = ({ seed, cycle }) => {
  const previousCycle = cycle - 1;
  const fields = previousCycle === 0
    ? {
        organizationName: 'original-organization',
        organizationType: 'original-type',
        contactInfo: 'original-contact',
        firstName: 'Original',
        lastName: 'Representative',
        middleInitial: 'O',
        position: 'Original Position',
      }
    : {
        organizationName: `edited-organization-${seed}-${previousCycle}`,
        organizationType: `edited-type-${seed}-${previousCycle}`,
        contactInfo: `edited-contact-${seed}-${previousCycle}`,
        firstName: `edited-first-${seed}-${previousCycle}`,
        lastName: `edited-last-${seed}-${previousCycle}`,
        middleInitial: `M-${previousCycle}`,
        position: `edited-position-${seed}-${previousCycle}`,
      };

  return [
    'Rejected',
    `rejection-${seed}-${cycle}`,
    fields.organizationName,
    fields.organizationType,
    fields.contactInfo,
    fields.firstName,
    fields.lastName,
    fields.middleInitial,
    fields.position,
    '1',
  ].join('|');
};

const pendingLine = ({ seed, cycle }) => [
  'Pending',
  '<null>',
  `edited-organization-${seed}-${cycle}`,
  `edited-type-${seed}-${cycle}`,
  `edited-contact-${seed}-${cycle}`,
  `edited-first-${seed}-${cycle}`,
  `edited-last-${seed}-${cycle}`,
  `M-${cycle}`,
  `edited-position-${seed}-${cycle}`,
  '1',
].join('|');

// Feature: organization-registration-review, Property 21: Unlimited reject-then-resubmit cycles always succeed
// **Validates: Requirements 15.5**
test('rejected registrations support every generated reject-then-resubmit cycle', async (t) => {
  if (!(await hasDocker())) {
    t.skip('Docker Desktop is unavailable; run with a local Docker daemon to exercise the real PostgreSQL migrations and triggers.');
    return;
  }

  const migrationSql = await loadMigrations();
  await runDocker([
    'run', '--detach', '--rm', '--name', containerName,
    '--env', 'POSTGRES_PASSWORD=postgres', '--env', `POSTGRES_DB=${databaseName}`,
    'postgres:16-alpine',
  ]);

  try {
    await waitForPostgres();
    await executeSql(`${bootstrapSql}\n${migrationSql}\n
 grant usage on schema public to authenticated;
 grant select, update on public.registrations to authenticated;
`);

    await fc.assert(
      fc.asyncProperty(cycleCaseArbitrary, async (testCase) => {
        const output = await executeSql(cycleSql(testCase));
        const lines = output.split(/\r?\n/).filter(Boolean);
        const expected = [
          [
            'Pending', '<null>', 'original-organization', 'original-type', 'original-contact',
            'Original', 'Representative', 'O', 'Original Position', '1',
          ].join('|'),
        ];

        for (let cycle = 1; cycle <= testCase.cycles; cycle += 1) {
          expected.push(testCase.registrationId, rejectedLine({ ...testCase, cycle }));
          expected.push(testCase.registrationId, pendingLine({ ...testCase, cycle }));
        }
        expected.push('1');

        assert.deepEqual(
          lines,
          expected,
          `cycle sequence was refused or changed row identity/data for ${testCase.cycles} cycles`,
        );
      }),
      { numRuns: 100 },
    );
  } finally {
    await runDocker(['rm', '--force', containerName]).catch(() => undefined);
  }
});

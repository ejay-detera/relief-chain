import fc from 'fast-check';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const containerName = `relief-chain-registration-resubmission-test-${process.pid}`;
const databaseName = 'registration_resubmission_semantics';
const migrationNames = [
  '20260716000000_super_admin_role_and_seed.sql',
  '20260716010000_create_registrations_table.sql',
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

const generatedText = (label) => fc.uuid().map((value) => `${label}-${value}`);
const editedDataArbitrary = fc.record({
  organizationName: generatedText('edited-organization'),
  organizationType: generatedText('edited-type'),
  contactInfo: generatedText('edited-contact'),
  firstName: generatedText('edited-first'),
  lastName: generatedText('edited-last'),
  middleInitial: fc.option(generatedText('edited-middle'), { nil: null }),
  position: generatedText('edited-position'),
});

const resubmissionCaseArbitrary = fc.record({
  registrationId: fc.uuid(),
  ownerId: fc.uuid(),
  edited: editedDataArbitrary,
});

const resubmissionSql = ({ registrationId, ownerId, edited }) => `
begin;
insert into public.profiles (id, role, full_name)
values (${sqlLiteral(ownerId)}::uuid, 'lgu', 'Generated LGU');
insert into public.registrations (
  id, lgu_id, organization_name, organization_type, contact_info,
  representative_first_name, representative_last_name,
  representative_middle_initial, representative_position, document_reference,
  status, rejection_reason
) values (
  ${sqlLiteral(registrationId)}::uuid,
  ${sqlLiteral(ownerId)}::uuid,
  'original-organization', 'original-type', 'original-contact',
  'Original', 'Representative', 'O', 'Original Position', 'original-document',
  'Rejected', 'original rejection reason'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', ${sqlLiteral(ownerId)}, true) as claim \\gset
select id::text || '|' || status || '|' || coalesce(rejection_reason, '<null>') || '|' || count(*) over ()
  from public.registrations
 where lgu_id = ${sqlLiteral(ownerId)}::uuid;
with changed as (
  update public.registrations
     set organization_name = ${sqlLiteral(edited.organizationName)},
         organization_type = ${sqlLiteral(edited.organizationType)},
         contact_info = ${sqlLiteral(edited.contactInfo)},
         representative_first_name = ${sqlLiteral(edited.firstName)},
         representative_last_name = ${sqlLiteral(edited.lastName)},
         representative_middle_initial = ${edited.middleInitial === null ? 'null' : sqlLiteral(edited.middleInitial)},
         representative_position = ${sqlLiteral(edited.position)},
         status = 'Pending',
         rejection_reason = null
   where id = ${sqlLiteral(registrationId)}::uuid
     and status = 'Rejected'
   returning id
)
select coalesce((select id::text from changed), '<no-update>');
select id::text || '|' || status || '|' || coalesce(rejection_reason, '<null>') || '|' ||
       organization_name || '|' || organization_type || '|' || contact_info || '|' ||
       representative_first_name || '|' || representative_last_name || '|' ||
       coalesce(representative_middle_initial, '<null>') || '|' || representative_position || '|' ||
       document_reference
  from public.registrations
 where lgu_id = ${sqlLiteral(ownerId)}::uuid;
select count(*)::text
  from public.registrations
 where lgu_id = ${sqlLiteral(ownerId)}::uuid;
reset role;
rollback;
`;

// Feature: organization-registration-review, Property 20: Resubmission updates the same Registration, resets status, and clears the reason
// **Validates: Requirements 15.3, 15.4**
test('resubmitting a rejected registration updates the same row and persists edited data', async (t) => {
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
      fc.asyncProperty(resubmissionCaseArbitrary, async (testCase) => {
        const output = await executeSql(resubmissionSql(testCase));
        const lines = output.split(/\r?\n/).filter(Boolean);
        const { edited, registrationId } = testCase;
        const expected = [
          registrationId,
          'Pending',
          '<null>',
          edited.organizationName,
          edited.organizationType,
          edited.contactInfo,
          edited.firstName,
          edited.lastName,
          edited.middleInitial ?? '<null>',
          edited.position,
          'original-document',
        ].join('|');

        assert.equal(lines.length, 4, 'resubmission did not return the expected fixture observations');
        assert.equal(lines[0], `${registrationId}|Rejected|original rejection reason|1`, 'fixture did not start as one rejected registration');
        assert.equal(lines[1], registrationId, 'resubmission did not update the existing registration id');
        assert.equal(lines[2], expected, 'resubmission did not reset status, clear reason, or persist edited fields');
        assert.equal(lines[3], '1', 'resubmission changed the registration row count for the LGU');
      }),
      { numRuns: 100 },
    );
  } finally {
    await runDocker(['rm', '--force', containerName]).catch(() => undefined);
  }
});

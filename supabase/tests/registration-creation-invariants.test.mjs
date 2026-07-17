import fc from 'fast-check';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const containerName = `relief-chain-registration-creation-test-${process.pid}`;
const databaseName = 'registration_creation_invariants';
const migrationNames = [
  '20260714080000_create_profile_on_signup.sql',
  '20260714121043_use_registration_role_metadata_for_profiles.sql',
  '20260714121136_restrict_profile_signup_trigger_execution.sql',
  '20260716000000_super_admin_role_and_seed.sql',
  '20260716010000_create_registrations_table.sql',
  '20260716040000_registration_on_lgu_signup.sql',
];
const migrationRoot = new URL('../migrations/', import.meta.url);
const directOwnerId = '00000000-0000-4000-8000-000000000001';

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
  full_name text,
  gov_id text,
  location text,
  stellar_pubkey text
);
-- This fixture exists before the signup trigger migration, so the direct
-- registration path can insert a row for an already-created LGU profile.
insert into public.profiles (id, role, full_name)
values ('${directOwnerId}', 'lgu', 'Direct Insert Owner');
`;

const loadMigrations = async () => {
  const sql = [];
  for (const migrationName of migrationNames) {
    sql.push(await readFile(new URL(migrationName, migrationRoot), 'utf8'));
  }
  return sql.join('\n');
};

const generatedText = (label) => fc.uuid().map((value) => `${label}-${value}`);
const payloadArbitrary = fc.record({
  organizationName: generatedText('organization'),
  organizationType: generatedText('type'),
  contactInfo: generatedText('contact'),
  firstName: generatedText('first'),
  lastName: generatedText('last'),
  middleInitial: fc.option(generatedText('middle'), { nil: null }),
  position: generatedText('position'),
  documentReference: generatedText('document'),
  fullName: generatedText('representative'),
});

const creationCaseArbitrary = fc.record({
  path: fc.constantFrom('profile_signup', 'direct_insert'),
  attemptedStatus: fc.constantFrom('Pending', 'Approved', 'Rejected'),
  payload: payloadArbitrary,
  signupId: fc.uuid(),
});

const creationSql = ({ path, attemptedStatus, payload, signupId }) => {
  const metadata = {
    role: 'lgu',
    full_name: payload.fullName,
    location: payload.contactInfo,
    organization_name: payload.organizationName,
    organization_type: payload.organizationType,
    representative_first_name: payload.firstName,
    representative_last_name: payload.lastName,
    representative_middle_initial: payload.middleInitial,
    representative_position: payload.position,
    organization_document_name: payload.documentReference,
  };
  const ownerId = path === 'profile_signup' ? signupId : directOwnerId;
  const attemptedReason = attemptedStatus === 'Rejected' ? 'attempted rejection' : null;

  return `
begin;
${path === 'profile_signup' ? `
insert into auth.users (id, email, raw_user_meta_data)
values (
  ${sqlLiteral(signupId)}::uuid,
  ${sqlLiteral(`${signupId}@example.test`)},
  ${sqlLiteral(JSON.stringify(metadata))}::jsonb
);` : `
insert into public.registrations (
  lgu_id, organization_name, organization_type, contact_info,
  representative_first_name, representative_last_name,
  representative_middle_initial, representative_position, document_reference,
  status, rejection_reason
) values (
  ${sqlLiteral(ownerId)}::uuid,
  ${sqlLiteral(payload.organizationName)},
  ${sqlLiteral(payload.organizationType)},
  ${sqlLiteral(payload.contactInfo)},
  ${sqlLiteral(payload.firstName)},
  ${sqlLiteral(payload.lastName)},
  ${payload.middleInitial === null ? 'null' : sqlLiteral(payload.middleInitial)},
  ${sqlLiteral(payload.position)},
  ${sqlLiteral(payload.documentReference)},
  ${sqlLiteral(attemptedStatus)},
  ${attemptedReason === null ? 'null' : sqlLiteral(attemptedReason)}
);`}
select status || '|' || organization_name || '|' || organization_type || '|' ||
       contact_info || '|' || representative_first_name || '|' ||
       representative_last_name || '|' || coalesce(representative_middle_initial, '<null>') || '|' ||
       representative_position || '|' || document_reference
  from public.registrations
 where lgu_id = ${sqlLiteral(ownerId)}::uuid;
select count(*)::text
  from public.registrations
 where lgu_id = ${sqlLiteral(ownerId)}::uuid
   and status = 'Approved';
rollback;
`;
};

// Feature: organization-registration-review, Property 14: Every newly created Registration starts Pending with the submitted data, and can never start Approved
// **Validates: Requirements 10.1, 10.2, 10.3**
test('new registrations are Pending and preserve submitted LGU data on every creation path', async (t) => {
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
    await executeSql(`${bootstrapSql}\n${migrationSql}`);

    await fc.assert(
      fc.asyncProperty(creationCaseArbitrary, async (testCase) => {
        const output = await executeSql(creationSql(testCase));
        const lines = output.split(/\r?\n/).filter(Boolean);
        const { payload } = testCase;
        const expected = [
          'Pending',
          payload.organizationName,
          payload.organizationType,
          payload.contactInfo,
          payload.firstName,
          payload.lastName,
          payload.middleInitial ?? '<null>',
          payload.position,
          payload.documentReference,
        ].join('|');

        assert.equal(lines.length, 2, 'creation path did not produce exactly one registration');
        assert.equal(lines[0], expected, 'registration did not preserve submitted data or Pending status');
        assert.equal(lines[1], '0', 'a creation path produced an Approved registration');
      }),
      { numRuns: 100 },
    );
  } finally {
    await runDocker(['rm', '--force', containerName]).catch(() => undefined);
  }
});

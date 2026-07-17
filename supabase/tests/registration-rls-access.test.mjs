import fc from 'fast-check';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const containerName = `relief-chain-registration-rls-test-${process.pid}`;
const databaseName = 'registration_rls_access';
const migrations = [
  '20260716000000_super_admin_role_and_seed.sql',
  '20260716010000_create_registrations_table.sql',
  '20260716020000_registrations_denial_log.sql',
  '20260716030000_registrations_rls.sql',
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
  for (const migration of migrations) {
    sql.push(await readFile(new URL(migration, migrationRoot), 'utf8'));
  }
  return sql.join('\n');
};

const expectedAccess = ({ role, ownsRegistration, status }) => ({
  canRead: role === 'super_admin' || (role === 'lgu' && ownsRegistration),
  canUpdate: role === 'super_admin'
    || (role === 'lgu' && ownsRegistration && status === 'Rejected'),
});

const caseSql = ({ actorId, actorRole, ownerId, registrationId, registration, ownsRegistration }) => {
  const expected = expectedAccess({
    role: actorRole,
    ownsRegistration,
    status: registration.status,
  });
  const ownerResubmission = actorRole === 'lgu' && ownsRegistration && registration.status === 'Rejected';
  const nextStatus = ownerResubmission ? sqlLiteral('Pending') : 'status';
  const nextReason = ownerResubmission ? 'null' : 'rejection_reason';

  return `
begin;
insert into public.profiles (id, role, full_name)
values (${sqlLiteral(ownerId)}::uuid, 'lgu', 'Generated Owner');
insert into public.profiles (id, role, full_name)
values (${sqlLiteral(actorId)}::uuid, ${sqlLiteral(actorRole)}, 'Generated Actor')
on conflict (id) do nothing;
insert into public.registrations (
  id, lgu_id, organization_name, organization_type, contact_info,
  representative_first_name, representative_last_name,
  representative_middle_initial, representative_position, document_reference,
  status, rejection_reason
) values (
  ${sqlLiteral(registrationId)}::uuid,
  ${sqlLiteral(ownerId)}::uuid,
  ${sqlLiteral(registration.organizationName)},
  ${sqlLiteral(registration.organizationType)},
  ${sqlLiteral(registration.contactInfo)},
  ${sqlLiteral(registration.firstName)},
  ${sqlLiteral(registration.lastName)},
  ${registration.middleInitial === null ? 'null' : sqlLiteral(registration.middleInitial)},
  ${sqlLiteral(registration.position)},
  ${sqlLiteral(registration.documentReference)},
  ${sqlLiteral(registration.status)},
  ${registration.rejectionReason === null ? 'null' : sqlLiteral(registration.rejectionReason)}
);
set local role authenticated;
select set_config('request.jwt.claim.sub', ${sqlLiteral(actorId)}, true) as claim \\gset
select count(*) from public.registrations where id = ${sqlLiteral(registrationId)}::uuid;
with changed as (
  update public.registrations
     set organization_name = organization_name || '-changed',
         status = ${nextStatus},
         rejection_reason = ${nextReason}
   where id = ${sqlLiteral(registrationId)}::uuid
   returning id
)
select case when exists (select 1 from changed) then 'allowed' else 'denied' end;
reset role;
select status || '|' || coalesce(rejection_reason, '<null>') || '|' || organization_name
  from public.registrations
 where id = ${sqlLiteral(registrationId)}::uuid;
rollback;
-- Expected by the property assertion: read=${expected.canRead ? '1' : '0'}, update=${expected.canUpdate ? 'allowed' : 'denied'}.
`;
};

const generatedText = (label) => fc.uuid().map((value) => `${label}-${value}`);
const registrationArbitrary = fc.record({
  status: fc.constantFrom('Pending', 'Rejected'),
  organizationName: generatedText('org'),
  organizationType: generatedText('type'),
  contactInfo: generatedText('contact'),
  firstName: generatedText('first'),
  lastName: generatedText('last'),
  middleInitial: fc.option(generatedText('middle'), { nil: null }),
  position: generatedText('position'),
  documentReference: generatedText('document'),
  rejectionReason: fc.option(generatedText('reason'), { nil: null }),
}).filter(({ status, rejectionReason }) => status === 'Rejected' || rejectionReason === null);

const actorCaseArbitrary = fc.record({
  actorRole: fc.constantFrom('super_admin', 'lgu', 'beneficiary', 'merchant'),
  ownsRegistration: fc.boolean(),
  registration: registrationArbitrary,
  registrationId: fc.uuid(),
}).map(({ actorRole, ownsRegistration, registration, registrationId }) => {
  // A valid registration always belongs to an LGU profile. The ownership flag
  // therefore makes the actor the owner only for an actor with the lgu role.
  const ownerId = registrationId;
  const actorId = actorRole === 'lgu' && ownsRegistration
    ? ownerId
    : `${registrationId.slice(0, -1)}${registrationId.endsWith('f') ? 'e' : 'f'}`;
  return {
    actorId,
    actorRole,
    ownerId,
    ownsRegistration: actorRole === 'lgu' && ownsRegistration,
    registrationId,
    registration,
  };
});

// Feature: organization-registration-review, Property 10: RLS denies Registration read/write to non-Super_Admin actors
// **Validates: Requirements 8.1, 8.2, 8.3**
test('registration RLS permits only Super_Admin access or owning-lgu resubmission', async (t) => {
  if (!(await hasDocker())) {
    t.skip('Docker Desktop is unavailable; run with a local Docker daemon to exercise PostgreSQL RLS.');
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
      fc.asyncProperty(actorCaseArbitrary, async (testCase) => {
        const output = await executeSql(caseSql(testCase));
        const lines = output.split(/\r?\n/).filter(Boolean);
        const expected = expectedAccess({
          role: testCase.actorRole,
          ownsRegistration: testCase.ownsRegistration,
          status: testCase.registration.status,
        });
        assert.equal(lines[0], expected.canRead ? '1' : '0', 'unexpected registration read visibility');
        assert.equal(lines[1], expected.canUpdate ? 'allowed' : 'denied', 'unexpected registration update visibility');

        const registrationChanged = lines[2].endsWith('-changed');
        assert.equal(registrationChanged, expected.canUpdate, 'RLS update result changed unexpectedly');
        if (testCase.ownsRegistration && testCase.registration.status === 'Rejected') {
          assert.equal(lines[2].startsWith('Pending|<null>|'), true, 'owner resubmission did not clear rejection state');
        }
      }),
      { numRuns: 100 },
    );
  } finally {
    await runDocker(['rm', '--force', containerName]).catch(() => undefined);
  }
});

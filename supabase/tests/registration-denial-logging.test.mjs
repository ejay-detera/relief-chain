import fc from 'fast-check';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const containerName = `relief-chain-registration-denial-test-${process.pid}`;
const databaseName = 'registration_denial_logging';
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

const generatedText = (label) => fc.uuid().map((value) => `${label}-${value}`);
const deniedAttemptArbitrary = fc.record({
  actorRole: fc.constantFrom('lgu', 'beneficiary', 'merchant'),
  operation: fc.constantFrom('select', 'update'),
  registrationId: fc.uuid(),
  actorId: fc.uuid(),
  ownerId: fc.uuid(),
  organizationName: generatedText('org'),
}).filter(({ actorId, ownerId }) => actorId !== ownerId);

const attemptSql = ({ actorId, actorRole, ownerId, registrationId, organizationName, operation }) => `
begin;
insert into public.profiles (id, role, full_name)
values (${sqlLiteral(ownerId)}::uuid, 'lgu', 'Generated Owner');
insert into public.profiles (id, role, full_name)
values (${sqlLiteral(actorId)}::uuid, ${sqlLiteral(actorRole)}, 'Generated Actor');
insert into public.registrations (
  id, lgu_id, organization_name, organization_type, contact_info,
  representative_first_name, representative_last_name,
  representative_position, document_reference
) values (
  ${sqlLiteral(registrationId)}::uuid,
  ${sqlLiteral(ownerId)}::uuid,
  ${sqlLiteral(organizationName)}, 'Generated Type', 'Generated Contact',
  'Generated First', 'Generated Last', 'Generated Position', 'generated/document'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', ${sqlLiteral(actorId)}, true);
${operation === 'select'
    ? `select count(*) from public.registrations where id = ${sqlLiteral(registrationId)}::uuid;`
    : `with changed as (
  update public.registrations
     set organization_name = organization_name || '-changed'
   where id = ${sqlLiteral(registrationId)}::uuid
   returning id
)
select count(*) from changed;`}
select public.log_registration_access_denial(${sqlLiteral(operation)});
reset role;
select requester_id::text || '|' || operation || '|' || attempted_at::text
  from public.registration_access_denials
 where requester_id = ${sqlLiteral(actorId)}::uuid
   and operation = ${sqlLiteral(operation)}
 order by attempted_at desc
 limit 1;
rollback;
`;

// Feature: organization-registration-review, Property 11: Denied Registration access attempts are logged with identity and timestamp
// **Validates: Requirements 8.3**
test('denied registration reads and updates are logged with actor, operation, and timestamp', async (t) => {
  if (!(await hasDocker())) {
    t.skip('Docker Desktop is unavailable; run with a local Docker daemon to exercise PostgreSQL and the real denial logger.');
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
grant execute on function public.log_registration_access_denial(text) to authenticated;
`);

    await fc.assert(
      fc.asyncProperty(deniedAttemptArbitrary, async (attempt) => {
        const output = await executeSql(attemptSql(attempt));
        const lines = output.split(/\r?\n/).filter(Boolean);
        const deniedReadOrUpdate = lines[1] === '0';
        assert.equal(deniedReadOrUpdate, true, 'generated actor unexpectedly accessed the registration');
        const [requesterId, loggedOperation, attemptedAt] = lines[2].split('|');
        assert.equal(requesterId, attempt.actorId, 'denial log did not preserve requester identity');
        assert.equal(loggedOperation, attempt.operation, 'denial log did not preserve operation');
        assert.equal(Number.isNaN(Date.parse(attemptedAt)), false, 'denial log did not contain a parseable timestamp');
      }),
      { numRuns: 100 },
    );
  } finally {
    await runDocker(['rm', '--force', containerName]).catch(() => undefined);
  }
});

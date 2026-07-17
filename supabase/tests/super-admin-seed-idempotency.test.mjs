import fc from 'fast-check';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const containerName = `relief-chain-seed-test-${process.pid}`;
const databaseName = 'seed_idempotency';
const seedEmail = 'superadmin@reliefchain.app';
const migrationPath = new URL('../migrations/20260716000000_super_admin_role_and_seed.sql', import.meta.url);

const runDocker = (args, input = undefined) =>
  new Promise((resolve, reject) => {
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

const bootstrapSql = `
create extension if not exists pgcrypto;
create schema if not exists auth;
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
  role text not null,
  full_name text
);
`;

const resetAndAssertSql = (migrationSql, iterations) => `
truncate table public.profiles, auth.identities, auth.users cascade;
${migrationSql.repeat(iterations)}
select
  (select count(*) from auth.users where lower(email) = lower('${seedEmail}')) || '|' ||
  (select count(*) from auth.identities i join auth.users u on u.id = i.user_id
    where lower(u.email) = lower('${seedEmail}') and i.provider = 'email') || '|' ||
  (select count(*) from public.profiles p join auth.users u on u.id = p.id
    where lower(u.email) = lower('${seedEmail}') and p.role = 'super_admin') || '|' ||
  (select count(*) from public.profiles where role = 'super_admin');
`;

// Feature: organization-registration-review, Property 22: Seed migration is idempotent
// **Validates: Requirements 3.3, 3.4**
test('reapplying the Super Admin seed migration N times creates one identity', async (t) => {
  if (!(await hasDocker())) {
    t.skip('Docker Desktop is unavailable; run with a local Docker daemon to exercise PostgreSQL.');
    return;
  }

  const migrationSql = await readFile(migrationPath, 'utf8');
  await runDocker([
    'run', '--detach', '--rm', '--name', containerName,
    '--env', 'POSTGRES_PASSWORD=postgres', '--env', `POSTGRES_DB=${databaseName}`,
    'postgres:16-alpine',
  ]);

  try {
    await waitForPostgres();
    await executeSql(bootstrapSql);

    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 20 }), async (iterations) => {
        const result = await executeSql(resetAndAssertSql(migrationSql, iterations));
        assert.equal(result, '1|1|1|1', `expected one seeded user, identity, and profile after N=${iterations}`);
      }),
      { numRuns: 100 },
    );
  } finally {
    await runDocker(['rm', '--force', containerName]).catch(() => undefined);
  }
});

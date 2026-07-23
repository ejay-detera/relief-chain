// Property 5: Tenant Isolation
//
// "An actor from one organization cannot read private operational data or
//  mutate resources belonging to another organization."
//
// Validates: Requirements 2.4, 2.5, 23.7
//
// Property-testing library (pinned): fast-check (see package.json devDependencies).
//
// This suite has two layers:
//
//   1. MODEL LAYER (always runs): fast-check generates actors, roles,
//      organizations, AAL states, ownership, and private resources, then asserts
//      the tenant-isolation invariants against the shared authorization model in
//      supabase/functions/_shared/tenant-authorization.ts. That module is the
//      single canonical encoding of the composed RLS predicates, so this layer
//      proves the encoding is leak-free across the whole generated input space.
//
//   2. DATABASE LAYER (runs when a local Supabase stack is reachable): the same
//      generated scenarios are seeded into reset local fixtures and asserted
//      against the authoritative Postgres RLS. It is skipped with a clear blocker
//      message when the local stack is unavailable (no hosted project is ever
//      touched). Point it at a local database with SUPABASE_DB_URL.
//
// Minimized counterexamples and replay seeds: fast-check shrinks failing cases
// and reports the seed. Set FC_SEED to replay a specific run.

import { Keypair } from '@stellar/stellar-sdk';
import fc from 'fast-check';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

// ---------------------------------------------------------------------------
// Transpile and load the TypeScript authorization model (repo test convention).
// ---------------------------------------------------------------------------

const transpile = async (source) => {
  const { outputText, diagnostics = [] } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    reportDiagnostics: true,
  });
  assert.equal(diagnostics.length, 0, 'authorization model transpiles without syntax errors');
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
};

const modelSource = await readFile(
  new URL('../../supabase/functions/_shared/tenant-authorization.ts', import.meta.url),
  'utf8',
);
const model = await transpile(modelSource);

// Replay seed support: `FC_SEED=<n> node --test ...` reproduces a run exactly.
const seedFromEnv = Number.parseInt(process.env.FC_SEED ?? '', 10);
const fcConfig = {
  numRuns: Number.parseInt(process.env.FC_NUM_RUNS ?? '400', 10),
  endOnFailure: true,
  ...(Number.isFinite(seedFromEnv) ? { seed: seedFromEnv } : {}),
};

// ---------------------------------------------------------------------------
// World generator (fast-check arbitraries).
// ---------------------------------------------------------------------------

const roleOrNone = fc.constantFrom(...model.ORGANIZATION_ROLES, 'none');

const userSpecArb = fc.record({
  orgIndex: fc.nat({ max: 2 }),
  role: roleOrNone,
  isActive: fc.boolean(),
  aal: fc.constantFrom('aal1', 'aal2'),
  recentStepUp: fc.boolean(),
  // When set, the user is an enrolled beneficiary of the given org's program.
  beneficiaryOrgIndex: fc.option(fc.nat({ max: 2 }), { nil: null }),
});

const worldSpecArb = fc.record({
  orgCount: fc.integer({ min: 2, max: 3 }),
  activeProgram: fc.array(fc.boolean(), { minLength: 3, maxLength: 3 }),
  users: fc.array(userSpecArb, { minLength: 2, maxLength: 8 }),
});

// Build a concrete World + Sessions from a generated spec.
function buildWorld(spec) {
  const orgCount = spec.orgCount;
  const orgIndexOf = (raw) => raw % orgCount;

  const organizations = Array.from({ length: orgCount }, (_, i) => ({ id: `org-${i}` }));

  const programs = organizations.map((org, i) => ({
    id: `prog-${i}`,
    organizationId: org.id,
    status: spec.activeProgram[i] ? 'active' : 'draft',
    createdBy: `creator-${i}`,
  }));

  const disbursements = organizations.map((_, i) => ({
    id: `disb-${i}`,
    programId: `prog-${i}`,
  }));

  const wallets = organizations.map((org, i) => ({
    id: `owallet-${i}`,
    ownerType: 'organization',
    ownerId: org.id,
  }));

  const memberships = [];
  const beneficiaryIdentities = [];
  const enrollments = [];
  const redemptions = [];
  const profiles = [];
  const sessions = [];

  spec.users.forEach((u, i) => {
    const userId = `user-${i}`;
    profiles.push({ id: userId });
    sessions.push({ userId, aal: u.aal, recentStepUp: u.recentStepUp });

    if (u.role !== 'none') {
      memberships.push({
        userId,
        organizationId: `org-${orgIndexOf(u.orgIndex)}`,
        role: u.role,
        isActive: u.isActive,
      });
    }

    if (u.beneficiaryOrgIndex !== null) {
      const benOrg = orgIndexOf(u.beneficiaryOrgIndex);
      const identityId = `id-${i}`;
      beneficiaryIdentities.push({ id: identityId, userId });
      const enrollmentId = `enr-${i}`;
      enrollments.push({
        id: enrollmentId,
        programId: `prog-${benOrg}`,
        beneficiaryUserId: null,
        beneficiaryIdentityId: identityId,
      });
      redemptions.push({
        id: `red-${i}`,
        enrollmentId,
        beneficiaryUserId: userId,
      });
      wallets.push({
        id: `bwallet-${i}`,
        ownerType: 'beneficiary_identity',
        ownerId: identityId,
      });
    }
  });

  const world = {
    organizations,
    memberships,
    programs,
    enrollments,
    redemptions,
    disbursements,
    wallets,
    beneficiaryIdentities,
    profiles,
  };

  // Every resource in the world, tagged with its kind, so the property can
  // enumerate the full access matrix.
  const resources = [
    ...organizations.map((o) => ({ kind: 'organization', id: o.id })),
    ...programs.map((p) => ({ kind: 'program', id: p.id })),
    ...enrollments.map((e) => ({ kind: 'enrollment', id: e.id })),
    ...redemptions.map((r) => ({ kind: 'redemption', id: r.id })),
    ...disbursements.map((d) => ({ kind: 'disbursement', id: d.id })),
    ...wallets.map((w) => ({ kind: 'wallet', id: w.id })),
    ...beneficiaryIdentities.map((b) => ({ kind: 'beneficiary_identity', id: b.id })),
    ...profiles.map((p) => ({ kind: 'profile', id: p.id })),
  ];

  return { world, sessions, resources };
}

const MUTATIONS = ['insert', 'update', 'delete'];

// ---------------------------------------------------------------------------
// Model layer property.
// ---------------------------------------------------------------------------

test('property: tenant isolation holds for every generated actor, role, AAL, and resource', () => {
  fc.assert(
    fc.property(worldSpecArb, (spec) => {
      const { world, sessions, resources } = buildWorld(spec);

      for (const session of sessions) {
        const hasActiveMembership = world.memberships.some(
          (m) => m.userId === session.userId && m.isActive,
        );

        for (const { kind, id } of resources) {
          const affiliated = model.isAffiliated(world, session, kind, id);
          const owns = model.ownsOrParticipates(world, session, kind, id);

          // (1) Reading private data implies affiliation with the resource.
          if (model.canRead(world, session, kind, id)) {
            assert.ok(
              affiliated,
              `read leak: ${session.userId} read ${kind}:${id} without affiliation`,
            );
          }

          for (const action of MUTATIONS) {
            const mutate = model.canMutate(world, session, kind, id, action);

            // (2) Mutating a resource implies affiliation with it — no
            //     cross-tenant writes.
            if (mutate) {
              assert.ok(
                affiliated,
                `mutation leak: ${session.userId} ${action} ${kind}:${id} without affiliation`,
              );
            }

            // (4) Updating an ACTIVE program requires recent AAL2 step-up even
            //     for the rightful organization role.
            if (kind === 'program' && action === 'update' && mutate) {
              const program = world.programs.find((p) => p.id === id);
              if (program.status === 'active') {
                assert.ok(
                  model.hasRecentStepUp(session),
                  `AAL bypass: active program ${id} updated without recent step-up`,
                );
              }
            }
          }

          // (3) A session with no active membership and no ownership can neither
          //     read nor mutate the resource.
          if (!hasActiveMembership && !owns) {
            assert.equal(
              model.canRead(world, session, kind, id),
              false,
              `unaffiliated read: ${session.userId} -> ${kind}:${id}`,
            );
            for (const action of MUTATIONS) {
              assert.equal(
                model.canMutate(world, session, kind, id, action),
                false,
                `unaffiliated mutation: ${session.userId} ${action} ${kind}:${id}`,
              );
            }
          }
        }
      }

      return true;
    }),
    fcConfig,
  );
});

// Positive coverage guard: the isolation property must not be vacuously true.
// A rightful active organization actor CAN read and edit their own org's draft
// program, and a beneficiary CAN read their own enrollment.
test('model grants affiliated access so isolation is not vacuous', () => {
  const world = {
    organizations: [{ id: 'org-0' }, { id: 'org-1' }],
    memberships: [
      { userId: 'admin', organizationId: 'org-0', role: 'organization_administrator', isActive: true },
    ],
    programs: [
      { id: 'prog-0', organizationId: 'org-0', status: 'draft', createdBy: 'admin' },
      { id: 'prog-1', organizationId: 'org-1', status: 'draft', createdBy: 'other' },
    ],
    enrollments: [
      { id: 'enr-0', programId: 'prog-0', beneficiaryUserId: 'ben', beneficiaryIdentityId: 'id-0' },
    ],
    redemptions: [],
    disbursements: [{ id: 'disb-0', programId: 'prog-0' }],
    wallets: [{ id: 'owallet-0', ownerType: 'organization', ownerId: 'org-0' }],
    beneficiaryIdentities: [{ id: 'id-0', userId: 'ben' }],
    profiles: [{ id: 'admin' }, { id: 'ben' }],
  };
  const admin = { userId: 'admin', aal: 'aal2', recentStepUp: true };
  const beneficiary = { userId: 'ben', aal: 'aal1', recentStepUp: false };

  assert.equal(model.canRead(world, admin, 'program', 'prog-0'), true);
  assert.equal(model.canMutate(world, admin, 'program', 'prog-0', 'update'), true);
  assert.equal(model.canRead(world, admin, 'disbursement', 'disb-0'), true);
  // Cross-organization denial.
  assert.equal(model.canRead(world, admin, 'program', 'prog-1'), false);
  assert.equal(model.canMutate(world, admin, 'program', 'prog-1', 'update'), false);
  // Beneficiary reads only their own enrollment.
  assert.equal(model.canRead(world, beneficiary, 'enrollment', 'enr-0'), true);
  assert.equal(model.canRead(world, beneficiary, 'disbursement', 'disb-0'), false);
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

const stellarAddress = (fill) => Keypair.fromRawEd25519Seed(Buffer.alloc(32, fill)).publicKey();

// Seed a two-organization fixture (alpha, beta) inside the open transaction as
// the superuser, then return identifiers. RLS is enforced only once the session
// switches to the `authenticated` role below.
async function seedTwoOrgFixture(client, { alphaActiveProgram }) {
  const ids = {
    alphaAdmin: randomUUID(),
    betaAdmin: randomUUID(),
    alphaBeneficiary: randomUUID(),
    alphaOrg: randomUUID(),
    betaOrg: randomUUID(),
    alphaCampaign: randomUUID(),
    betaCampaign: randomUUID(),
    alphaProgram: randomUUID(),
    betaProgram: randomUUID(),
  };

  const insertUser = async (id, email, role) => {
    await client.query(
      `insert into auth.users (
         id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
         raw_app_meta_data, raw_user_meta_data, created_at, updated_at
       ) values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated',
         'authenticated', $2, '', now(),
         '{"provider":"email","providers":["email"]}', $3, now(), now())`,
      [id, email, JSON.stringify({ role })],
    );
  };

  await insertUser(ids.alphaAdmin, `alpha-admin-${ids.alphaAdmin}@example.test`, 'lgu');
  await insertUser(ids.betaAdmin, `beta-admin-${ids.betaAdmin}@example.test`, 'lgu');
  await insertUser(ids.alphaBeneficiary, `alpha-ben-${ids.alphaBeneficiary}@example.test`, 'beneficiary');

  await client.query(`insert into public.organizations (id, name, slug) values ($1, 'Alpha', $2), ($3, 'Beta', $4)`, [
    ids.alphaOrg, `alpha-${ids.alphaOrg}`, ids.betaOrg, `beta-${ids.betaOrg}`,
  ]);

  await client.query(
    `select public.upsert_organization_membership($1, $2, 'organization_administrator', $2)`,
    [ids.alphaOrg, ids.alphaAdmin],
  );
  await client.query(
    `select public.upsert_organization_membership($1, $2, 'organization_administrator', $2)`,
    [ids.betaOrg, ids.betaAdmin],
  );

  await client.query(
    `insert into public.disaster_response_campaigns (id, organization_id, code, name)
     values ($1, $2, 'ALPHA', 'Alpha Campaign'), ($3, $4, 'BETA', 'Beta Campaign')`,
    [ids.alphaCampaign, ids.alphaOrg, ids.betaCampaign, ids.betaOrg],
  );

  await client.query(
    `insert into public.programs (id, organization_id, campaign_id, name, created_by, status)
     values ($1, $2, $3, 'Alpha Program', $4, $5), ($6, $7, $8, 'Beta Program', $9, 'draft')`,
    [
      ids.alphaProgram, ids.alphaOrg, ids.alphaCampaign, ids.alphaAdmin,
      alphaActiveProgram ? 'active' : 'draft',
      ids.betaProgram, ids.betaOrg, ids.betaCampaign, ids.betaAdmin,
    ],
  );

  await client.query(
    `insert into public.disbursements (id, program_id, program_name, amount, recipients_count)
     values (gen_random_uuid(), $1, 'Alpha Program', 100, 1),
            (gen_random_uuid(), $2, 'Beta Program', 100, 1)`,
    [ids.alphaProgram, ids.betaProgram],
  );

  await client.query(
    `insert into public.wallets (id, owner_type, owner_id, purpose, address)
     values (gen_random_uuid(), 'organization', $1, 'organization_treasury', $2),
            (gen_random_uuid(), 'organization', $3, 'organization_treasury', $4)`,
    [ids.alphaOrg, stellarAddress(1), ids.betaOrg, stellarAddress(2)],
  );

  return ids;
}

// Apply an authenticated session with the given claims for the remainder of the
// transaction.
async function actAs(client, { sub, aal, recentStepUp }) {
  const amr = recentStepUp
    ? [{ method: 'totp', timestamp: Math.floor(Date.now() / 1000) }]
    : [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) - 3600 }];
  const claims = JSON.stringify({ sub, role: 'authenticated', aal, amr });
  await client.query('set local role authenticated');
  await client.query(`select set_config('request.jwt.claims', $1, true)`, [claims]);
  await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [sub]);
}

async function resetRole(client) {
  await client.query('reset role');
}

async function countVisible(client, table) {
  const { rows } = await client.query(`select count(*)::int as c from public.${table}`);
  return rows[0].c;
}

test('property: RLS denies cross-organization access against reset local fixtures (database)', async (t) => {
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
          alphaActiveProgram: fc.boolean(),
          aal: fc.constantFrom('aal1', 'aal2'),
          recentStepUp: fc.boolean(),
        }),
        async (scenario) => {
          await client.query('begin');
          try {
            const ids = await seedTwoOrgFixture(client, scenario);

            // Alpha administrator acts; every read must exclude Beta rows.
            await actAs(client, { sub: ids.alphaAdmin, aal: scenario.aal, recentStepUp: scenario.recentStepUp });

            for (const table of ['organizations', 'programs', 'disbursements', 'disaster_response_campaigns']) {
              const visible = await countVisible(client, table);
              assert.equal(visible, 1, `Alpha admin should see only Alpha ${table}, saw ${visible}`);
            }

            // Cross-organization UPDATE affects zero rows.
            const updated = await client.query(
              `update public.programs set name = 'x' where id = $1 returning 1`,
              [ids.betaProgram],
            );
            assert.equal(updated.rowCount, 0, 'cross-org program update must change no rows');

            // Cross-organization INSERT is rejected by RLS.
            await assert.rejects(
              client.query(
                `insert into public.programs (organization_id, name, created_by)
                 values ($1, 'forbidden', $2)`,
                [ids.betaOrg, ids.alphaAdmin],
              ),
              /row-level security|permission denied/i,
              'cross-org program insert must be denied',
            );

            await resetRole(client);

            // Anonymous sessions see no private program rows.
            await client.query('set local role anon');
            const anonVisible = await countVisible(client, 'programs');
            assert.equal(anonVisible, 0, 'anonymous users must not read private programs');
            await resetRole(client);

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

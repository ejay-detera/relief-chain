# Build and Setup Guide: ReliefChain

**Project:** ReliefChain — Blockchain-Powered Disaster Relief Distribution Platform  
**Date:** 2026-09-24  
**Version:** 1.0  
**Owner:** MINDMESH  
**Status:** Active  
**Source of truth:** [`relief-chain.md`](relief-chain.md)  
**Related:** [BRD](brd-reliefchain.md) · [BPD](bpd-reliefchain.md) · [PRD](prd-reliefchain.md) · [SAD](sad-reliefchain.md) · [SDD](sdd-reliefchain.md) · [DSD](dsd-reliefchain.md) · [Flow](flow-reliefchain.md)

---

> **Source-of-truth rule.** [`relief-chain.md`](relief-chain.md) is the canonical foundation document. Resolve conflicts there first, then propagate. Agents and developers should read `relief-chain.md`, then the rest of `docs/`, before reading code.
>
> **Scope.** This is the developer operating manual: read order, environment setup, pinned stack, commands, code patterns, guardrails, demo accounts, and the Definition of Done. Canonical step-by-step environment instructions live in [`SETUP.md`](SETUP.md); this guide references it rather than duplicating it.
>
> **Boundary.** Local development plus a **hosted Supabase testnet demo environment** (§15). RCPHP has no monetary value. Mainnet is hard-disabled. There is still no *production* deployment: no release signing, monitoring, alerting, or incident response (SETUP.md §13).

---

## 1. Read Order

1. [`relief-chain.md`](relief-chain.md) — foundation and source of truth
2. [`prd-reliefchain.md`](prd-reliefchain.md) — requirements with as-built status
3. [`sad-reliefchain.md`](sad-reliefchain.md) — architecture and stack
4. [`sdd-reliefchain.md`](sdd-reliefchain.md) — subsystems, API contract, schema
5. [`dsd-reliefchain.md`](dsd-reliefchain.md) — design system and tokens
6. [`flow-reliefchain.md`](flow-reliefchain.md) — what is built, gated, or planned
7. This guide — setup and conventions
8. [`SETUP.md`](SETUP.md) — full environment procedure

Before any frontend work, project rules additionally require `.agents/skills/expo-expert/SKILL.md` and `context/frontend-skills/frontend-rule.md`.

---

## 2. Prerequisites

| Requirement | Notes |
|---|---|
| Node.js **20+** | `preflight` rejects Node 18 |
| npm | Ships with Node |
| Git | — |
| Docker Desktop | Linux container engine, running. No project Dockerfile — the Supabase CLI starts containers |
| Android Studio + SDK Platform Tools | `adb` required |
| JDK | Android Studio's bundled JDK preferred on Windows |
| Physical Android device (or emulator) | Android is the verified target |
| Rust + `wasm32` target, Stellar CLI | Only for contract work and the full `validate` suite |

```powershell
node --version
npm --version
git --version
docker --version
docker info
adb version
java -version
```

---

## 3. Install and Configure

```powershell
git clone <repository-url>
Set-Location .\relief-chain
npm install
Copy-Item .env.example .env
```

Populate `.env` for local Supabase with ADB reverse forwarding:

```ini
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=<local anon key from npx supabase status -o env>
EXPO_PUBLIC_STELLAR_NETWORK=testnet
EXPO_PUBLIC_STELLAR_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
EXPO_PUBLIC_STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
EXPO_PUBLIC_STELLAR_RPC_URL=https://soroban-testnet.stellar.org
EXPO_PUBLIC_STELLAR_MAINNET_ENABLED=false
```

Leave `EXPO_PUBLIC_STELLAR_RCPHP_ISSUER` and `EXPO_PUBLIC_STELLAR_RCPHP_SAC_ID` blank until asset bootstrap reports them. **Never** place a secret in an `EXPO_PUBLIC_*` variable — those values are bundled into the app. Restart Expo after every `.env` change.

---

## 4. Local Supabase

```powershell
npx supabase --version
npx supabase start
npx supabase status -o env
npx supabase db reset --local
```

| Service | Address |
|---|---|
| API / Auth / Storage / Functions | `http://127.0.0.1:54321` |
| PostgreSQL | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |
| Studio | `http://127.0.0.1:54323` |
| Inbucket (email) | `http://127.0.0.1:54324` |

`db reset --local` is **destructive to local data** and must never be pointed at a hosted project. It applies migrations plus the intentionally empty `supabase/seed.sql`; JavaScript seed scripts are the real fixture layer.

---

## 5. Device Connection

```powershell
adb devices
adb reverse tcp:8081 tcp:8081
adb reverse tcp:54321 tcp:54321
adb reverse --list
```

LAN fallback: use the Windows IPv4 address in `EXPO_PUBLIC_SUPABASE_URL`, keep both machines on one network, and allow the ports through Windows Firewall.

---

## 6. Two Setup Paths

### Path A — app and database only

```powershell
npx supabase db reset --local
npm run preflight
npx expo start
```

### Path B — full testnet merchant demo

```powershell
Copy-Item .env.bootstrap.example .env.bootstrap.local
node .\scripts\bootstrap-topology.mjs --execute
node .\scripts\bootstrap-asset.mjs --execute
node .\scripts\make-functions-env.mjs
npx supabase db reset --local
node .\scripts\seed-merchant-demo.mjs
```

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_DB_URL` must be set in the session first. The service-role key comes from `npx supabase status -o env` and must never enter the mobile `.env`.

Then serve Edge Functions in a dedicated terminal:

```powershell
npx supabase functions serve --env-file supabase/functions/.env
```

Functions resolve at `http://127.0.0.1:54321/functions/v1/<function-name>`.

Run the app:

```powershell
npx expo run:android      # first native build
npx expo start --dev-client
npx expo start            # Expo Go
npm run web
```

---

## 7. Commands

### 7.1 Validation ladder

```powershell
npm run preflight   # node scripts/preflight.mjs
npm run lint        # eslint . --no-cache --max-warnings=0
npm run type-check  # tsc --noEmit --pretty false
npm run test:unit   # node --test scripts/tests/**/*.test.mjs
npm run validate    # everything, incl. property, db integration, schema drift, mobile smoke
```

| Target | Underlying command |
|---|---|
| `test:property` | `node --test --test-name-pattern=property scripts/tests/**/*.test.mjs` |
| `test:integration` | `supabase test db --workdir <root>` |
| `test:mobile-smoke` | `expo export --platform android --output-dir .validation-mobile-smoke --clear` |
| `schema-types` (via `validate`) | `node scripts/schema-types-drift.mjs` |

Artifacts land in `.validation-artifacts` and must not be committed.

### 7.2 Test tooling reality

**There is no jest and no vitest.** Tests are:

- `node --test` for unit and integration scripts
- `node --experimental-strip-types --test` for TypeScript-adjacent tests under `src/`
- `fast-check` property tests: authorization integrity, confirmation integrity, monotonic auditability, no-duplicate-settlement, policy immutability, tenant isolation
- `supabase test db` for SQL tests under `supabase/tests/database/`

Do not add jest or vitest without an explicit decision — it would fragment the suite.

### 7.3 Useful scripts

| Command | Purpose |
|---|---|
| `node .\scripts\seed-merchant-demo.mjs` | Default fixture with fixed accounts |
| `node .\scripts\seed-ui-demo.mjs` | Broad UI fixture (timestamped accounts) |
| `node .\scripts\seed-cash-demo.mjs` | Cash-disbursement fixture |
| `node .\scripts\seed-extra-beneficiaries.mjs` | Five extra beneficiaries for list volume |
| `node .\scripts\fund-demo-treasury.mjs --amount 1000` | Move testnet RCPHP to the org treasury |
| `node .\scripts\invoke-payment.mjs` | End-to-end payment: sign, prepare, submit, reconcile |
| `node .\scripts\invoke-disbursement.mjs` | End-to-end disbursement |
| `node .\scripts\invoke-provision.mjs` | Wallet provisioning |
| `node .\scripts\invoke-reconcile.mjs` / `trigger-reconciliation.mjs` | Reconciliation |
| `node .\scripts\test-cashout.mjs` | **Simulates** external cash-out transitions — not a real integration |
| `node .\scripts\verify-db-state.mjs` | Inspect state without a reset |

---

## 8. Known Issues and Documentation Drift

Verify these before trusting any surrounding document or config.

| # | Issue | Impact | Action |
|---:|---|---|---|
| 1 | ✅ **Resolved.** `20260717130000_dev_disable_wallet_binding_trigger.sql` dropped `wallets_protect_verified_binding` | Applying it to a shared environment left verified wallet-binding protection **off** | `20260925090000_restore_wallet_binding_trigger.sql` re-creates it, so the sequence ends with protection on. Verify after every `db push` — see §15.3 |
| 2 | `20260717122817_hotfix_wallets.sql` is a **0-line** migration | Dead artifact in a security-sensitive sequence | Remove or document why it is empty |
| 3 | ✅ **Resolved.** `app.json` and `app.config.js` both existed | `app.config.js` won; `app.json` was silent drift and lacked `extra.eas.projectId` | `app.json` deleted. `app.config.js` is now the single Expo config |
| 4 | ✅ **Resolved.** SETUP.md described a committed native `android/` project and Gradle wrapper, but neither `android/` nor `ios/` exists — both are gitignored generated output | Readers expected a committed native build; `expo run:android` actually prebuilds | `docs/SETUP.md` §1 and §9 now state that prebuild runs first, that native config belongs in `app.config.js`, and that `expo prebuild --clean` is the recovery step |
| 5 | ✅ **Resolved.** README referenced `ReliefChain_Project_Direction.md` and `.kiro/specs/` — neither exists | Broken onboarding trail | Replaced with links to `docs/index.md`, `docs/relief-chain.md`, `docs/SETUP.md`, `docs/build-reliefchain.md`, and `docs/flow-reliefchain.md` |
| 6 | 🟡 **Partly resolved.** `production` emitted an APK, not an AAB | Not Play-Store-capable | `production` now emits `app-bundle`; a new `demo` profile emits the sideloadable APK. Signing is still EAS-managed and unexercised — see §15.8 |
| 7 | `jsonwebtoken` is a runtime dependency in an RN bundle | Likely script-only; bloats or breaks the bundle | Move to `devDependencies` if it is script-only |
| 8 | No `src/app/index.tsx`; entry route resolves via a redirect effect | Cold-start routing depends on an effect, guarded by `hasRedirectedRef` | Keep the integration test `src/app/_layout.integration.test.mjs` green |
| 9 | ✅ **Resolved.** `STELLAR_CONTRACT_ADMIN_SECRET` is expected by Edge code but is **not** provisioned by `bootstrap-topology.mjs` | Voucher/contract work failed until the secret was set by hand | `scripts/provision-contract-admin.mjs` creates, funds, and persists it idempotently into `.env.bootstrap.local`. Admin public key `GCUUB7OZYAABX4ONLBIQRLTY2RD6LC3D4XWI5R6FNQBO4I7LW3ZILDPE`. `bootstrap-topology.mjs` itself is still unchanged — run the second script after it |
| 10 | RLS was iterated through repair migrations (`fix_authenticated_read_grants`, `grant_lgu_crud`, `grant_service_role_privileges`, `fix_infinite_recursion`, `fix_profiles_anon_access`) | The first scoping migration is **not** the effective policy set. Counting `create policy` statements across the migration files overstates the live total — it double-counts policies that were later dropped and recreated | Derive counts from **live introspection only**: `node .\scripts\verify-hosted-schema.mjs`. Verified live on 2026-09-24: **54 tables, 77 public policies, 79 triggers, 40 enums, 35 functions.** Earlier docs said "113 policies" from a static count; corrected |
| 11 | Contract daily limits bucket on **UTC** days (`SECONDS_PER_DAY`) | Limit windows do not match Philippine local days | Decide whether this is acceptable product behavior |
| 12 | Merchant cash-out is simulated | Cannot claim a working fiat off-ramp | Keep `SimulatedCashOutNotice` visible in the UI |
| 13 | ✅ **Resolved.** `lgu-signup` was missing from the repo but was **ACTIVE on the hosted project** (version 3, deployed 2026-07-17) as an orphan with no source | Unauditable and unreproducible: a redeploy to a new project would have lost it, and organization registration would 404 there | Source recovered with `supabase functions download lgu-signup` into `supabase/functions/lgu-signup/index.ts`. It forces `role: 'lgu'` rather than trusting the request body, and calls `auth.admin.createUser` with `email_confirm: true` |
| 13a | ⚠️ **`lgu-signup` was deployed with `verify_jwt` disabled** — an unauthenticated endpoint that creates pre-confirmed `lgu` organization accounts | Anyone on the internet could mint privileged auth accounts and inflate the user count | Hardened: `[functions.lgu-signup] verify_jwt = true` added to `supabase/config.toml` and redeployed. Verified 401 without a key, 400 with the anon key. **The anon key ships in the APK, so this is not a strong control** — the real gate is the organization registration review state machine |
| 14 | `resetPasswordForEmail` is called with no `redirectTo` in `src/app/(auth)/sign-in.tsx:99` and `forgot-password.tsx:79` | Recovery emails link to the project Site URL and never reopen the app on a device | Add a `reliefchain://` redirect and allow-list it, or avoid the flow on device |
| 15 | ✅ **Resolved.** The signer secrets were absent, so the old RCPHP asset (issuer `GBC6HZTI…`, SAC `CAB57LDD…`) was unrecoverable | Nothing could sign as issuer, distribution, or treasury | Re-bootstrapped 2026-09-24: 8 accounts created and funded, plus `STELLAR_CONTRACT_ADMIN_SECRET` via the new `scripts/provision-contract-admin.mjs`. Seeds are in `.env.bootstrap.local`. **New identifiers: issuer `GAIKYUNHR734V5CKHXYE6PJOTIVIGT5B6W23TOFLMDKF525W3HASPO5I`, SAC `CCDE3J63TTF6W3LPDUOLPSEZYRJ675CTT2FTLWVZKMZIGJIQHUXEUTJA`.** The old pair must never be reused |
| 16 | `reconciliation_cursors` and `registration_access_denials` have RLS **enabled with zero policies** | Deny-all to every non-service-role caller | Intentional — Edge Functions reach them through the service-role binding, which bypasses RLS. Do not "fix" by adding a policy |
| 17 | `scripts/seed-test-users.mjs` and `seed-full-demo.mjs` use `beneficary@example.com` (missing `i`) and `admin@merchant.com`, which conflict with `seed-merchant-demo.mjs` | Two seed runs produce overlapping fixtures with different credentials; a demo script can reference an account that does not exist | Reconcile the addresses across the three scripts, or use exactly one per fixture |
| 18 | ⚠️ **A migration hardcodes a Super Admin credential.** `20260716000100_super_admin_role_and_seed.sql` inserts `superadmin@reliefchain.app` with the password `ReliefChainSuperAdmin!2026` written in a comment and in the insert | The account is created in **every** database the migrations touch, including the hosted project. Super Admin approves organization registrations and reads every registration through `is_super_admin()`. The credential is in git history, so rotating the migration does not un-publish it | Acceptable for a testnet demo; **must not survive a pilot**. Before any environment holding real data: change the password out-of-band, or replace the seed with an invite/first-run flow. Do not treat "it is only a migration" as containment |

---

## 9. Code Patterns

### 9.1 Edge Function shape

Follow `supabase/functions/prepare-payment/index.ts`:

```ts
import { handleEdgeRequest, parseJsonBody, createEdgeServiceBinding, type EdgeRequestScope } from '../_shared/edge.ts';
import { FinancialErrorException } from '../_shared/errors.ts';
import { jsonResponse } from '../_shared/response.ts';
import { serveEdge } from '../_shared/runtime.ts';

const handler = async (scope: EdgeRequestScope): Promise<Response> => {
  const { request, context, session, correlationId } = scope;
  const body = await parseJsonBody<MyBody>(request);

  // 1. Validate input; throw structured errors with the correlationId.
  if (!body.something) {
    throw FinancialErrorException.of('validation_failed', 'something is required.', { correlationId });
  }

  // 2. Fetch dependencies in parallel via the service binding.
  const binding = createEdgeServiceBinding(context, correlationId);
  const service = binding.serviceClient;

  // 3. Fail closed on any numeric that could lose precision.
  // 4. Write explicit status transitions.
  // 5. Return an unsigned signing package — never sign for the user.

  return jsonResponse({ /* ... */ }, 200, correlationId);
};

serveEdge((request) => handleEdgeRequest(request, handler));
```

**Non-negotiables:** structured `FinancialErrorException` with `validation_failed` / `authorization_failed` / `dependency_unavailable`; a `correlationId` on every response; idempotency keyed on stable business identity; fail closed rather than silently coerce.

### 9.2 Client service and hook

```ts
// src/services/exampleService.ts — data access only, typed, no UI concerns
import { supabase } from '@/lib/supabase';
import type { Example } from '@/types/example';

export const listExamples = async (organizationId: string): Promise<Example[]> => {
  const { data, error } = await supabase
    .from('examples')
    .select('id, name, status')
    .eq('organization_id', organizationId);

  if (error) throw error;
  return data ?? [];
};
```

```tsx
// src/hooks/use-examples.ts — state, loading, and error for one concern
import { useCallback, useEffect, useState } from 'react';
import { listExamples } from '@/services/exampleService';
import type { Example } from '@/types/example';

export const useExamples = (organizationId: string) => {
  const [examples, setExamples] = useState<Example[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setExamples(await listExamples(organizationId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load examples.');
    } finally {
      setIsLoading(false);
    }
  }, [organizationId]);

  useEffect(() => { void refresh(); }, [refresh]);

  return { examples, isLoading, error, refresh };
};
```

### 9.3 Screen composition

```tsx
// src/app/(lgu)/examples.tsx — thin shell: owns state, composes children
import { useExamples } from '@/hooks/use-examples';
import { ExampleList } from '@/components/Examples/ExampleList';
import { ExampleEmptyState } from '@/components/Examples/ExampleEmptyState';

export default function ExamplesScreen() {
  const { examples, isLoading, error, refresh } = useExamples(organizationId);

  if (!isLoading && examples.length === 0) {
    return <ExampleEmptyState onRetry={refresh} message={error} />;
  }

  return <ExampleList examples={examples} isLoading={isLoading} onRefresh={refresh} />;
}
```

Lists use `FlatList` with an explicit `keyExtractor`. Styling uses `StyleSheet.create` with tokens from `@/constants/theme`.

---

## 10. Development Guardrails

- **Source of truth.** [`relief-chain.md`](relief-chain.md) governs product facts; `docs/` is the first place to look for anything before reading code or asking.
- **Never enable mainnet.** `shared/stellar-config.ts` must keep failing closed. RCPHP has no monetary value and every value-bearing surface must be able to say so.
- **Never put a secret in `EXPO_PUBLIC_*`,** source, logs, or docs. Signer secrets belong only in git-ignored `.env.bootstrap.local` and the generated `supabase/functions/.env`.
- **Never sign for a user server-side.** Edge returns an unsigned signing package; the device signs with its SecureStore key.
- **Never bypass the database control plane.** Authorization, state transitions, immutability, and financial invariants live in RLS, triggers, and the contract. Do not reimplement them client-side as the only check.
- **Never weaken an append-only or workflow trigger** to make a test pass.
- **Fail closed on numerics.** Reject unsafe integers rather than coerce.
- **Preserve idempotency.** Reuse `claim_financial_idempotency_key()` and stable business keys; a retry must not double-spend.
- **Respect the ~150-line component rule** and the folder-based split.
- **Reuse before adding.** Check `src/components/shared/`, `src/hooks/`, `src/services/`, `src/types/`, and `_shared/` before writing a new abstraction; extend an existing Edge Function or service rather than duplicating one.
- **Types are shared, never re-declared.** `src/types/<domain>.ts`; cross-boundary contracts live in `shared/`.
- **No `any`.** `--max-warnings=0` is the lint contract.
- **Install with `npx expo install <package>`** for SDK compatibility.
- **Explicit error handling at boundaries** — Supabase calls, Edge invocations, chain submission, camera and biometric APIs, filesystem. Never swallow an exception silently; log actionable context and rethrow or map to a structured error.
- **Plan before executing.** State files to touch, changes per file, and gotchas; then execute.
- **Ask when context is missing.** Use `/grill-me` rather than guessing a product decision.
- **Git is read-only by default for agents.** Inspect freely (`git status`, `git log`, `git diff`); never commit, amend, or push without explicit permission.
- **Update the docs in the same change.** A feature-status change must update [`flow-reliefchain.md`](flow-reliefchain.md) and, if it changes a product fact, [`relief-chain.md`](relief-chain.md).

---

## 11. Seeded Demo Accounts

Created by `node .\scripts\seed-merchant-demo.mjs`; IDs are written to `scripts/seed-info.json`.

| Role | Email | Password |
|---|---|---|
| LGU / organization admin | `admin@example.com` | `password` |
| Beneficiary | `beneficiary@example.com` | `password` |
| Merchant | `merchant@example.com` | `password` |
| Super admin | `superadmin@reliefchain.app` | `ReliefChainSuperAdmin!2026` |

The first three use the literal string `password`, set at `scripts/seed-merchant-demo.mjs:70`. **The super admin comes from a migration, not the seed** — `20260716000100_super_admin_role_and_seed.sql` inserts it with its own hardcoded password, so it exists wherever the migrations have run (§8 item 18). The seed's `superadmin@example.com` fallback only fires when no `super_admin` profile exists, which the migration guarantees is never the case. All four verified working against the hosted project on 2026-09-24.

**Demo fixtures, not production credentials.** These now also exist on the hosted project (§15.0), where after seeding the row counts were `users=4 profiles=4 organizations=1 programs=1 wallets=3 registrations=1`. The merchant seed does not delete older timestamped demo accounts — run `npx supabase db reset --local` for a clean local fixture, and confirm the app points at the same Supabase instance where the seed ran.

**Caution — drift in the other seed scripts.** `scripts/seed-test-users.mjs` and `scripts/seed-full-demo.mjs` use `beneficary@example.com` (missing the `i`) and `admin@merchant.com`, which do not match the table above. Running them alongside `seed-merchant-demo.mjs` produces duplicate-looking accounts with different credentials. Use one seed script per fixture until this is reconciled.

---

## 12. Troubleshooting

| Symptom | First moves |
|---|---|
| Supabase will not start | `docker info`, then `npx supabase stop` and `npx supabase start` |
| App reports Supabase not configured | Check `.env` URL and anon key, confirm it matches the seeded instance, restart Expo (env is bundled, not hot-reloaded) |
| Phone cannot reach localhost | Re-run both `adb reverse` commands, or switch to the LAN IPv4 address |
| `adb` shows `unauthorized`/`offline` | Unlock the phone, accept the prompt, try another cable, `adb kill-server` then `adb start-server` |
| Login fails after seeding | `npx supabase db reset --local`, re-run the merchant seed, verify the app's target instance |
| Edge Functions fail at startup | `node .\scripts\make-functions-env.mjs`, restart `functions serve`, verify `.env.bootstrap.local` |
| Stellar operations fail | Confirm topology and asset bootstrap completed, RCPHP trustlines authorized, treasury funded, public issuer/SAC in `.env`. Never switch to mainnet |

---

## 13. Definition of Done

- [ ] `npm run lint` passes with zero warnings
- [ ] `npm run type-check` passes; no new `any`
- [ ] `npm run test:unit` passes; new financial logic has a property test where invariants apply
- [ ] `npm run test:integration` passes when schema or RLS changed
- [ ] Every value-moving path keeps the prepare/submit split and device-side signing
- [ ] Idempotency preserved; a retry cannot double-spend
- [ ] No append-only, workflow, or chain-evidence trigger weakened
- [ ] No secret added to `EXPO_PUBLIC_*`, source, logs, or docs
- [ ] Testnet guards intact; mainnet still fails closed
- [ ] Components respect the ~150-line split; reusable code reused, not duplicated
- [ ] Styling uses `@/constants/theme` tokens; light mode verified
- [ ] Status UI pairs a label with a shape or icon, never color alone
- [ ] [`flow-reliefchain.md`](flow-reliefchain.md) updated if feature status changed
- [ ] [`relief-chain.md`](relief-chain.md) updated if a product fact changed
- [ ] Simulated or gated behavior still labeled as such in the UI

---

## 14. Production Boundary

Still not defined anywhere in this repository: app-store submission, monitoring, alerting, backup, and incident response. Android release signing is EAS-managed on first build and has not been exercised.

§15 covers hosted Supabase migrations, hosted Edge deployment, and demo-build distribution — enough for a **testnet demo on real devices**, not for production. ReliefChain remains a Stellar testnet pilot with no real monetary value.

---

## 15. Hosted Deployment Runbook (Demo on Real Devices)

Goal: an installable Android APK that works on any device, on any network, against a hosted Supabase project. Still testnet, still RCPHP with no monetary value.

### 15.0 Current deployment state — executed 2026-09-24

The backend half of this runbook has been **run against a real project**. Steps 15.4 through 15.6 and 15.10 are done; 15.8 and 15.9 are not.

| Item | State | Detail |
|---|---|---|
| Supabase project | ✅ live | ref `hmbraapdnkoxpepdqgaa`, region Northeast Asia (Seoul) |
| Schema | ✅ applied | `db reset --linked` replayed all **52** migrations; verified **54 tables, 77 public RLS policies (+2 storage), 79 triggers, 40 enums, 35 SQL functions** |
| Wallet-binding protection | ✅ on | `wallets_protect_verified_binding` and `profiles_protect_role_escalation` both `tgenabled = 'O'` |
| Edge Functions | ✅ deployed | **13** functions, JWT verification left on |
| Function secrets | ✅ set | 16 keys via `supabase secrets set` |
| Stellar topology | ✅ re-bootstrapped | new issuer/SAC (§8 item 15); 8 funded accounts, `AUTH_REQUIRED`, 5 authorized trustlines, 100,000 RCPHP to distribution |
| Demo accounts | ✅ seeded | four logins, all password `password` (§11) |
| End-to-end reachability | ✅ proven | auth → PostgREST → `prepare-payment` returned a domain `validation_failed`, i.e. past auth and into business logic |
| EAS environment variables | ⬜ not done | 15.8 — required before any **cloud** build |
| Demo APK | ⬜ not built | 15.9 |
| Full disbursement + redemption on the hosted project | ⬜ not run | 15.11 |

**Docker is no longer required to run the app** against this project. It is still required for `supabase test db` and `npm run test:integration`, which spin up the local stack.

The connection host matters: `db.<ref>.supabase.co` does **not** resolve from this network (IPv6-only). Use the session pooler instead — `aws-1-ap-northeast-2.pooler.supabase.com:5432` with user `postgres.<ref>`. `.env.hosted.local` already carries the working `SUPABASE_DB_URL`.

### 15.1 Why this is needed at all

`src/lib/supabase.ts` reads `process.env.EXPO_PUBLIC_SUPABASE_URL` directly, and Metro **inlines that value at bundle time**. The URL is baked into the binary. Three consequences:

1. Editing `.env` after a build changes nothing in an installed APK.
2. A build made against `http://<LAN-IP>:54321` works only on your Wi-Fi — and not even there in a release build, because Android blocks cleartext HTTP on API 28+.
3. If the variable is missing, the client falls back to `https://placeholder.supabase.co` with only a `console.warn`. **The app installs, launches, and silently cannot sign in.** This is the failure that ruins a live demo. `npm run check:release-env` exists to catch it before the build.

All 13 Edge Functions are called through `supabase.functions.invoke(...)` on that single client, so pointing the URL at a hosted project moves every function call remotely with **no application code change**.

### 15.2 Prerequisites — resolve these first

| # | Requirement | How to check | State |
|---:|---|---|---|
| 1 | A Supabase project, and its **project ref** and **anon key** | Dashboard → Project Settings → API | ✅ `hmbraapdnkoxpepdqgaa` |
| 2 | **`.env.bootstrap.local`** containing the seven `STELLAR_*_SECRET` signer keys | `Test-Path .env.bootstrap.local` | ✅ regenerated 2026-09-24 |
| 3 | RCPHP issuer and SAC ID matching those secrets | Compare against `scripts/make-functions-env.mjs` lines 37–38 | ✅ updated to the new pair |
| 4 | Expo/EAS account logged in | `npx eas whoami` | ✅ |

**On requirement 2.** The signer secrets are gitignored and are not in the repo. If `.env.bootstrap.local` is gone, the accounts behind the RCPHP asset currently referenced in `make-functions-env.mjs` are unrecoverable — nothing can sign as issuer, distribution, or treasury. **This already happened once.** The file was lost, so the topology was re-bootstrapped on 2026-09-24, permanently orphaning the previous asset (§8 item 15). The current `.env.bootstrap.local` is the only copy of the live signer seeds; losing it again costs another re-bootstrap. The recovery path produces **new** accounts and therefore **new** issuer and SAC IDs:

```powershell
node .\scripts\bootstrap-topology.mjs      # writes STELLAR_*_SECRET to .env.bootstrap.local
node .\scripts\bootstrap-asset.mjs         # creates the RCPHP asset; note the new issuer + SAC ID
```

Then update `scripts/make-functions-env.mjs` lines 37–38, `.env`, and the EAS environment variables with the new identifiers. `STELLAR_CONTRACT_ADMIN_SECRET` is **not** produced by the bootstrap (§8 item 9); `scripts/provision-contract-admin.mjs` generates, funds, and appends it to `.env.bootstrap.local`:

```powershell
node .\scripts\provision-contract-admin.mjs
```

### 15.3 Operator credentials

Hosted credentials go in `.env.hosted.local` — gitignored via `.env*.local` — never in `.env`, never with an `EXPO_PUBLIC_` prefix, never on a command line where they land in shell history.

```powershell
Copy-Item .env.hosted.example .env.hosted.local   # then fill it in
. .\scripts\load-hosted-env.ps1                   # dot-source; prints key names only
# ... run CLI and seed commands ...
. .\scripts\load-hosted-env.ps1 -Clear            # drop them from the session
```

Two distinct credentials, for two distinct protocols. They are not interchangeable:

| Credential | Protocol | Used by |
|---|---|---|
| `SUPABASE_DB_PASSWORD` / `SUPABASE_DB_URL` | Postgres wire protocol, port 5432/6543 (libpq) | `supabase db push`, `db reset --linked`, `verify-db-state.mjs`, `*.sql` helpers |
| `SUPABASE_SERVICE_ROLE_KEY` | HTTPS, `Authorization` header (JWT) | PostgREST, Auth, Storage — i.e. the seed scripts |

A service-role JWT **cannot** authenticate a Postgres connection, so it is not a substitute for the database password. And the service-role key bypasses every RLS policy, so it must never reach the client bundle — `npm run check:release-env` fails the build if anything `EXPO_PUBLIC_*` looks like a secret.

### 15.4 Link and push the schema

```powershell
npx supabase login
npx supabase link --project-ref <project-ref>

# ALWAYS review the divergence before pushing.
npx supabase migration list --linked
```

Read that output carefully. Three cases:

- **Local column filled, remote blank** — will be applied by `db push`. Expected.
- **Both filled** — already in sync.
- **Remote filled, local blank** — a migration was applied to that project from a source you do not have. `db push` will collide with whatever it created.

If there are remote-only entries, `db push` is unsafe. Either `migration repair --status reverted <version>` each phantom record and resolve the schema conflicts by hand, or — if the remote data is expendable — rebuild it from the repo:

```powershell
npx supabase db reset --linked      # DESTRUCTIVE: drops the remote schema and data,
                                    # then replays all local migrations
npm run deploy:db                   # supabase db push (no-op right after a reset)
```

`db reset --linked` is irreversible and there is no free-tier backup. Confirm what is in the remote database first — `scripts/verify-db-state.mjs` with `SUPABASE_DB_URL` set, or the dashboard Table Editor.

**Migration caveat, resolved.** `20260717130000_dev_disable_wallet_binding_trigger.sql` drops `wallets_protect_verified_binding` for local convenience. `20260925090000_restore_wallet_binding_trigger.sql` re-creates it, so the sequence now ends with the protection **on**. Confirm after pushing:

```sql
select tgname, tgenabled from pg_trigger
where tgname = 'wallets_protect_verified_binding';
```

If that returns no row, stop — verified wallets are silently repointable.

### 15.5 Set the Edge Function secrets

These are **server-side only**. Never as `EXPO_PUBLIC_*`, never in the app bundle. `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are injected by the Supabase runtime and must **not** be set manually.

```powershell
# Public RCPHP config (non-EXPO names — this is what the Edge config module reads)
npx supabase secrets set `
  STELLAR_NETWORK=testnet `
  "STELLAR_NETWORK_PASSPHRASE=Test SDF Network ; September 2015" `
  STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org `
  STELLAR_RPC_URL=https://soroban-testnet.stellar.org `
  STELLAR_MAINNET_ENABLED=false `
  STELLAR_RCPHP_ISSUER=<issuer G...> `
  STELLAR_RCPHP_SAC_ID=<sac C...>

# The seven institutional signer secrets, individually so nothing extra leaks in
npx supabase secrets set STELLAR_ISSUER_SECRET=<S...>
npx supabase secrets set STELLAR_DISTRIBUTION_SECRET=<S...>
npx supabase secrets set STELLAR_SPONSOR_SECRET=<S...>
npx supabase secrets set STELLAR_ORGANIZATION_TREASURY_SECRET=<S...>
npx supabase secrets set STELLAR_CASH_PROGRAM_TREASURY_SECRET=<S...>
npx supabase secrets set STELLAR_CONTRACT_DEPLOYER_SECRET=<S...>
npx supabase secrets set STELLAR_CONTRACT_ADMIN_SECRET=<S...>

npx supabase secrets list                  # names only; values are never shown
```

`npx supabase secrets set --env-file .env.bootstrap.local` is faster but sets **every** key in that file, including `STELLAR_BENEFICIARY_SECRET`, `STELLAR_MERCHANT_SECRET`, and `STELLAR_BOOTSTRAP_SECRET_OUT`, which the functions do not need. Prefer the explicit form.

### 15.6 Deploy the functions

```powershell
npm run deploy:functions                   # no argument = all 13 functions
npx supabase functions list
```

**Do not pass `--no-verify-jwt`.** JWT verification must stay in front of the checks in `supabase/functions/_shared/auth.ts`.

`supabase/functions/_shared/` is bundled into each function, not deployed as its own function. `scripts/make-functions-env.mjs` writes `supabase/functions/.env` for `functions serve` **only** — it has no role in a hosted deployment.

**Formerly a gap, now resolved.** `src/components/OrganizationRegistration/OrganizationRegistrationFlow.tsx` invokes **`lgu-signup`**, which had no source under `supabase/functions/` — it existed only as a deployed orphan on the project. The source was recovered with `supabase functions download lgu-signup` and committed, so it is now part of the 13 and is redeployable. It was also running with `verify_jwt` **off**; `supabase/config.toml` now pins `[functions.lgu-signup] verify_jwt = true`. Note the anon key ships in the APK, so JWT verification is a weak control here — the real gate is the organization registration review state machine (§8 item 13).

The 13 deployed functions:

```
lgu-signup
prepare-cash-activation      submit-cash-activation
prepare-disbursement         submit-disbursement
prepare-merchant-provision   submit-merchant-provision
prepare-payment              submit-payment
prepare-wallet-provision     submit-wallet-provision
reconcile-stellar            request-cashout
```

### 15.7 Point the app at the project

```dotenv
# .env — must be correct BEFORE the build; values are inlined at bundle time
EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key>
EXPO_PUBLIC_STELLAR_NETWORK=testnet
EXPO_PUBLIC_STELLAR_NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
EXPO_PUBLIC_STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
EXPO_PUBLIC_STELLAR_RPC_URL=https://soroban-testnet.stellar.org
EXPO_PUBLIC_STELLAR_MAINNET_ENABLED=false
EXPO_PUBLIC_STELLAR_RCPHP_ISSUER=<issuer G...>
EXPO_PUBLIC_STELLAR_RCPHP_SAC_ID=<sac C...>
```

The anon key is **designed** to ship in the client; it is constrained by the 77 RLS policies. The service-role key never goes near the app.

Validate, then verify against the hosted project over Metro before building anything:

```powershell
npm run check:release-env
npx expo start --clear
```

### 15.8 Supply the same values to EAS

`.env` is gitignored, and **EAS Build does not upload gitignored files**. A cloud build gets `undefined` and falls back to the placeholder. `eas.json` carries the fixed Stellar public config in a shared `base` profile, but the project-specific values must come from EAS environment variables:

```powershell
npx eas env:create --name EXPO_PUBLIC_SUPABASE_URL --value https://<ref>.supabase.co --environment preview,production
npx eas env:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <anon key> --environment preview,production
npx eas env:create --name EXPO_PUBLIC_STELLAR_RCPHP_ISSUER --value <issuer G...> --environment preview,production
npx eas env:create --name EXPO_PUBLIC_STELLAR_RCPHP_SAC_ID --value <sac C...> --environment preview,production
npx eas env:list
```

### 15.9 Build the demo APK

The `demo` profile emits a sideloadable APK. `production` now emits an AAB for the Play Store — that is **not** what you install by hand.

```powershell
npx eas build --platform android --profile demo        # cloud build, returns a download link
```

Local alternative, which reads `.env` directly and sidesteps §15.7 entirely:

```powershell
npx expo run:android --variant release
```

**iOS.** `eas.json` now has `ios.simulator: true` on `development`, `preview`, and `demo`, which builds a free simulator binary. Installing on a **physical iPhone** additionally requires a paid Apple Developer account for ad-hoc or TestFlight distribution, plus provisioning. The code is iOS-compatible; the obstacle is distribution, not code. Plan Android as the demo target.

### 15.10 Seed the hosted project

Every script defaults to the local stack. Load the hosted credentials from the gitignored file rather than typing them into the shell:

```powershell
. .\scripts\load-hosted-env.ps1        # sets SUPABASE_URL / SERVICE_ROLE_KEY / DB_URL

node .\scripts\seed-merchant-demo.mjs
node .\scripts\seed-test-users.mjs
node .\scripts\fund-demo-treasury.mjs --amount 1000
node .\scripts\verify-db-state.mjs

. .\scripts\load-hosted-env.ps1 -Clear # drop them again
```

Equivalent per-script form, without touching the session:

```powershell
node --env-file=.env.hosted.local .\scripts\seed-test-users.mjs
```

**This is opt-in, not automatic.** Every script defaults to `http://127.0.0.1:54321` and `postgresql://postgres:postgres@127.0.0.1:54322/postgres`. Run one without loading the hosted credentials and it writes to your local Docker stack **silently and successfully** — no error, just data in the wrong database. Confirm the target before trusting a seed run:

```powershell
node .\scripts\verify-hosted-schema.mjs   # prints the host it connected to
```

The `invoke-*` end-to-end drivers additionally sign in as a real user and therefore need **`SUPABASE_ANON_KEY`** (the non-prefixed name) in `.env.hosted.local`. Without it they fall back to the local demo anon key and fail against a hosted project. `scripts/load-hosted-env.ps1` loads all five keys.

### 15.11 Pre-demo checklist

Run on the actual demo device, on mobile data, not office Wi-Fi.

- [ ] `npm run check:release-env` passes
- [ ] `wallets_protect_verified_binding` trigger exists on the hosted database
- [ ] `npx supabase secrets list` shows all 16 expected keys
- [ ] Sign in works as LGU, beneficiary, and merchant
- [ ] One batch disbursement completes and reconciles
- [ ] One merchant QR redemption completes end to end
- [ ] Edge Function logs in the dashboard show no 401s or missing-secret errors
- [ ] Airplane-mode behaviour checked — there is **no offline support**, so confirm the failure is graceful rather than a crash
- [ ] Avoid the password-reset flow: `resetPasswordForEmail` is called with no `redirectTo`, so the email links to the project Site URL and will not reopen the app
- [ ] Organization self-registration works — `lgu-signup` is deployed, but the flow has not been exercised against the hosted project

### 15.12 Two scheduled risks

**Free-tier projects pause after roughly a week of inactivity.** Open the dashboard and run a real transaction the morning of the presentation, not the night before.

**Stellar testnet is reset periodically**, which wipes accounts, balances, and deployed contracts. If a reset lands before the demo you must re-run §15.2's bootstrap and update the RCPHP identifiers in three places: `make-functions-env.mjs`, `.env`, and the EAS environment variables. Check SDF's announcements as the date approaches — I have not verified the current schedule.

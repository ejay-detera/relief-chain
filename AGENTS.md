# Relief Chain — Agent Rules

## Source of Truth and Reference Order

**`docs/relief-chain.md` is the canonical source of truth for this project.** Confirm any product fact there first. If another document or this file conflicts with it, resolve the conflict in `docs/relief-chain.md`, then propagate.

**`docs/` is the first place to look for information** — before reading code and before asking. Read in this order:

1. `docs/relief-chain.md` — foundation and source of truth
2. `docs/brd-reliefchain.md` — business requirements with as-built status
3. `docs/bpd-reliefchain.md` — commercial readiness, business model, what is still open
4. `docs/prd-reliefchain.md` — requirements with as-built status
5. `docs/sad-reliefchain.md` — architecture and pinned stack
6. `docs/sdd-reliefchain.md` — subsystems, Edge contracts, schema
7. `docs/dsd-reliefchain.md` — design system and tokens
8. `docs/flow-reliefchain.md` — what is built, gated, or planned
9. `docs/build-reliefchain.md` — setup, commands, guardrails, known issues
10. `docs/sprint-reliefchain.md` — sprint backlog: user stories, acceptance criteria, priorities
11. `SETUP.md` — full environment procedure

`docs/index.md` maps the whole suite.

## Required References

**Always consult these two files before writing any frontend code:**

- **React Native Expo expert skill** — `.agents/skills/expo-expert/SKILL.md`
- **Frontend rules** — `context/frontend-skills/frontend-rule.md`

These override any default behavior. Read them at the start of every frontend task.

## Component Architecture

**Always break large view files into sub-components.** Any screen or component that grows beyond ~150 lines must be split into a folder-based structure:

```
src/app/(tabs)/
  index.tsx          ← thin shell: owns all state, logic, and data
src/components/SomeFeature/
  SomeList.tsx      ← receives props, emits events via callbacks
  SomeModal.tsx     ← self-contained with internal state
  ...
```

Rules:
- Screen files (`src/app/**/*.tsx`) hold the primary state, effects, and data. Their return is a short composition of sub-components.
- Sub-components receive data via props and communicate up via callbacks (e.g., `onUpdate`, `onSubmit`).
- Modals own their internal form state (touched, validation, reset). They call a submit callback with the final data; the parent mutates the list or backend.
- Shared types go in `src/types/<domain>.ts` and are imported everywhere — never re-declare interfaces across files.
- Shared UI patterns (toggle switches, setting cards, etc.) go in `src/components/shared/`.

## React Native / Expo Rules

- Always use functional components with Hooks. No class components.
- Use `useState()` and `useReducer()` for state, `useEffect()` for side effects.
- Use `useColorScheme` and `StyleSheet` for styling.
- No `any` casts unless unavoidable; prefer explicit TypeScript types.
- **Expo HAS CHANGED**: Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

## Design System

`src/constants/theme.ts` is the token authority. Full specification: `docs/dsd-reliefchain.md`.

- Brand colors:
  - Green: `#6FCA4B` — primary action and identity
  - Navy: `#112E58` — active/selected state and emphasis
  - Yellow: `#E4CF10` — accent, sparingly
  - Light Gray: `#EEEDED` — neutral fills
  - Grey: `#979797` — muted text and disabled states
  - Budget gradient end: `#6595DA`
- Use `Spacing`, `BorderRadius`, `FloatingTabBarHeight`, `BottomTabInset`, and `MaxContentWidth` from `@/constants/theme` — never hardcode these values.
- Fonts: `Plus Jakarta Sans` (400/500/600/700) for all UI. `Sarina` is display-only — never body copy, numerals, or amounts.
- **Light mode is the supported appearance. Dark mode is TBD** — do not add dark-only styling.
- Shared UI patterns: use components from `src/components/shared/` to ensure consistency.

## Dependencies

Install new packages via Expo CLI to ensure compatibility:
```bash
npx expo install <package>
```

## Data Layer

Screens read real data through `src/services/` and `src/hooks/`, backed by Supabase and Supabase Edge Functions. Do not introduce placeholder arrays for data that a service already provides.

- **Reuse first.** Check `src/services/`, `src/hooks/`, `src/types/`, `src/components/shared/`, and `supabase/functions/_shared/` before writing anything new. Extend an existing service or Edge Function rather than duplicating one.
- Services do data access only; hooks own loading and error state; screens compose.
- Shared types live in `src/types/<domain>.ts`. Contracts shared with Edge Functions live in `shared/`.

## Hosted Environment

A hosted Supabase **testnet demo** project exists as of 2026-09-24. The full runbook and the record of what has actually been executed are in `docs/build-reliefchain.md` §15; §15.0 is the state table. Read it before touching anything deployment-related.

- Project ref **`hmbraapdnkoxpepdqgaa`**, region Northeast Asia (Seoul). 52 migrations, **54 tables, 77 RLS policies, 79 triggers, 40 enums, 35 SQL functions**, **13 Edge Functions**, demo accounts seeded.
- Derive object counts from **live introspection** (`node .\scripts\verify-hosted-schema.mjs`), never from grepping migration files. A static grep finds 113 `create policy` statements; only 77 policies exist, because repair migrations drop and re-create.
- Hosted credentials live in the gitignored **`.env.hosted.local`**. Load with `. .\scripts\load-hosted-env.ps1`, clear with `-Clear`. Never paste them into a command line, a commit, or a chat message.
- `SUPABASE_DB_PASSWORD` (Postgres wire protocol) and `SUPABASE_SERVICE_ROLE_KEY` (HTTPS JWT) are **not interchangeable**. A service-role key cannot authenticate `supabase db push`.
- `db.<ref>.supabase.co` does not resolve from this network. Use the session pooler: `aws-1-ap-northeast-2.pooler.supabase.com:5432`, user `postgres.<ref>`.
- **Every script defaults to the local stack.** Run a seed or verification script without loading the hosted env and it writes to local Docker silently and successfully. Confirm the target first.
- `.env.bootstrap.local` holds the only copy of the live Stellar signer seeds. Losing it orphans the RCPHP asset permanently — it already happened once. Never reuse the old pair (issuer `GBC6HZTI…`, SAC `CAB57LDD…`).
- `npx supabase db reset --linked` is irreversible on a free-tier project with no backups. Ask before running it.
- This is a demo environment, not production: no release signing, monitoring, alerting, or incident response. Never describe it as "live" or "in production."
- **Docker is not required to run the app** against this project. It is still required for `supabase test db` and `npm run test:integration`.

## Financial and Security Rules

Non-negotiable — these protect real invariants. Detail in `docs/build-reliefchain.md` §10.

- **Stellar testnet only.** The asset is RCPHP and has no monetary value. Mainnet is hard-disabled in `shared/stellar-config.ts` and must stay failing closed.
- **Never put a secret in `EXPO_PUBLIC_*`,** source, logs, or documentation.
- **Never sign for a user server-side.** Edge Functions return an unsigned signing package; the device signs with its SecureStore key.
- **Keep the two-phase prepare/submit split** on every value-moving path, and preserve idempotency so a retry cannot double-spend.
- **Never weaken** an append-only, workflow, or chain-evidence trigger to make a test pass.
- **Fail closed on numerics** rather than coercing an unsafe value.
- Keep simulated or gated behavior labeled as such in the UI (for example merchant cash-out).

## Git

Inspect freely in read-only mode (`git status`, `git log`, `git diff`). Never commit, amend, or push without explicit permission.

## Validation

```bash
npm run lint         # zero warnings tolerated
npm run type-check   # no new `any`
npm run test:unit
```

Tests use the Node test runner plus `fast-check`, and `supabase test db` for SQL. There is no jest and no vitest — do not add one without an explicit decision.

Before any release build, run `npm run check:release-env`. Without it a build whose environment is missing falls back to `https://placeholder.supabase.co` with only a `console.warn`, installs cleanly, and silently cannot sign in.

## Task Workflow

**For every task the user gives, always come up with a plan first before executing.**

1. State what files will be created or modified.
2. List the specific changes per file (types, props, template additions, etc.).
3. Call out any potential gotchas (TypeScript constraints, flex layout, shared component impact, etc.).
4. Wait for implicit or explicit user confirmation, then execute.

Do not write any code until the plan is laid out.

If a task lacks the context or decisions needed to proceed, ask via `/grill-me` rather than guessing a product fact.

## Sprint Work

**`docs/sprint-reliefchain.md` is the reference for anything sprint-related.** Read it before starting, estimating, splitting, assigning, closing, or reporting on any sprint item — including "what's in scope", "what are the acceptance criteria", "what's the priority", "who owns this", "what's left", and any standup, planning, or review summary.

- A story is **Done** only when every acceptance criterion in its block is satisfied, not when the happy path renders.
- Update the story block in the same change as the code. Behaviour that drifted from its criteria is a defect, not a reason to edit the criteria.
- Adding, removing, or re-prioritising a story is a scope change: record it in the change log (§8) with a reason.
- The backlog describes intended work. It is not evidence that anything is built — status comes from `docs/flow-reliefchain.md`, product facts from `docs/relief-chain.md`.
- §7 lists roles and capabilities the backlog assumes but the code does not have (Platform Admin, Verification Officer, Bluetooth offline sync, SMS). Read it before estimating.

## Keeping Documentation True

- A change to feature status must update `docs/flow-reliefchain.md` in the same change.
- A change to a product fact must update `docs/relief-chain.md` in the same change.
- Never document a capability as working when it is gated, simulated, or planned.
- Never introduce a market size, price, projection, savings figure, or performance number without a named, dated source. Mark it **Not validated** or **TBD** instead. The only decided commercial fact is the ~1% transaction fee (`docs/bpd-reliefchain.md` §4).
- Never describe a government agency, NGO, merchant, or VASP as a partner. Nothing is signed; they are prospective targets.

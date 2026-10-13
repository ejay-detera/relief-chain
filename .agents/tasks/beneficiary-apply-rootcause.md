# Beneficiary cannot apply to an aid program: root-cause report

- Investigated: 2026-10-14
- Repo state: `main` at `fb75ec6`, working tree clean when the investigation started
- Code changed: none. This file is the only artifact in the repo. Scratch files lived in `%TEMP%` (outside the repo) and were removed; two empty scratch folders (`rc-patch-check`, `rc-patch-check-orig`) were still locked by a shell process and can be deleted manually.
- Reported symptom: a brand-new beneficiary account cannot apply to an organization's aid program, even though the program looks open to all locations and has light requirements.
- **Fix applied (iteration 1, uncommitted): Phase 1 only. See the "Verification" section at the end of this file for exact commands and results.**

---

## 0. Verdict

**Primary root cause (confirmed, affects every new account).**
Find Organization hard-disables every Apply button unless `profiles.verification_status === 'Verified'`. A new account is always created `'Pending'`, and nothing in the app can ever move it to `'Verified'`:

- the organization's Verify action is a direct `profiles` UPDATE that RLS turns into a silent 0-row no-op while the UI still says "Success";
- an organization cannot even see a new beneficiary's profile until that beneficiary has applied, and the gate forbids applying. The two rules form a closed loop.

The database does **not** require verification to apply. Replaying the real migrations, a `Pending` account inserts its enrollment successfully. The block is purely client-side.

**Co-cause (mechanism confirmed; effect on your exact program depends on data I cannot read).**
Beneficiaries cannot read `program_barangays` / `program_areas`, so the app labels every program "Open to all locations". The database enforces the real barangay list when the enrollment is inserted. The create-program wizard cannot produce an "all locations" program at all (district and at least one barangay are mandatory). So once the gate is removed, a new account can apply only if its registered barangay is among the program's selected barangays. Otherwise it gets a raw RLS error instead of an explanation.

**Ruled out with evidence:** location rule for programs with no geography, registration window, requirements form, upload policy, missing identity row, enrollment triggers, grants, Edge Functions (not involved), onboarding routing.

**Fix summary (details in section 6):**

1. Phase 1, client only, no migration: stop deriving `disabled` from verification status (3 small edits plus banner copy).
2. Phase 2, one additive migration (two SELECT policies): let beneficiaries read the geography of programs they can already discover, so the card is truthful and out-of-area programs are not offered.
3. Follow-ups that need product decisions (organization verification path, profile column lockdown, private-program leak): listed in section 7, deliberately not part of the minimal fix.

---

## 1. What fails

On `Find Organization Programs` a new account sees a grey info banner, "Complete identity verification to apply for assistance programs." Every Apply pill is inert. Its label is white text on `#EEEDED`, so it is nearly invisible. Tapping does nothing and no error appears. The "Open to Apply (N)" tab still counts the programs, because that count ignores the gate.

React Native documents `disabled` on touchables as "disable all interactions" ([TouchableWithoutFeedback props](https://reactnative.dev/docs/touchablewithoutfeedback#disabled)), so `onPress` never runs.

How to confirm in 30 seconds on the device: the grey banner is visible on Find Organization, and `select verification_status from profiles where id = '<your user id>'` returns `Pending`. I did not run this against the hosted project (see section 9).

Differential diagnosis, so a different symptom is not mistaken for this bug:

| What the user sees | Cause |
|---|---|
| Grey banner plus inert grey Apply pill | Verification gate (this bug) |
| Pill "Registration Closed" or "Registration: Not Yet Open" | Registration window |
| Pill "Not available in your area (limited to ...)" | Client location mismatch. Currently unreachable because geography is invisible (co-cause) |
| Alert "Application Failed: new row violates row-level security policy for table "enrollments"" | Database gate: geography, or a private program the user is not invited to |
| Alert "Program information could not be resolved." | Race in `apply-program.tsx` (section 5, P12) |

---

## 2. Root cause in detail

### 2.1 The code chain (primary)

| Step | File:line | What happens |
|---|---|---|
| 1 | `supabase/migrations/20260714140000_reconcile_hosted_baseline.sql:218` | `profiles.verification_status` defaults to `'Pending'` |
| 2 | `supabase/migrations/20261002190000_add_household_size_to_profiles.sql` (latest `handle_new_user`) | Sign-up trigger never sets `verification_status`, so a new profile is `Pending` |
| 3 | `src/context/AuthContext.tsx:47,72-76` | Profile loads with `verification_status: 'Pending'` |
| 4 | `src/app/(beneficiary)/find-organization.tsx:32` | `const isVerified = profile?.verification_status === 'Verified'` |
| 5 | `src/app/(beneficiary)/find-organization.tsx:265` | `applyDisabled={!isVerified}` |
| 6 | `src/components/beneficiary/FindOrganization/organization-program-list.tsx:16,30,66` | Prop accepted and forwarded as `disabled={applyDisabled}` |
| 7 | `src/components/beneficiary/FindOrganization/organization-program-card.tsx:10,22,24` | `const isApplyDisabled = disabled \|\| !program.canApply` |
| 8 | `src/components/beneficiary/FindOrganization/organization-program-card.tsx:122-124` | `<TouchableOpacity disabled={isApplyDisabled} ...>` |
| 9 | `src/components/beneficiary/FindOrganization/verification-required-banner.tsx:8-17` | Banner says verification is needed "to apply" and cites "Requirement 3.2" |

The spec the banner cites (`.kiro/specs/beneficiary-verification/requirements.md`) was never committed (the only `.kiro` file ever in git history is `settings/mcp.json`), so Requirement 3.2 cannot be read from the repo. The gate was introduced on 2026-07-15 in `07721d3`.

### 2.2 Why the gate can never clear

1. **Only the organization can set Verified, and it is a bare table update.** `src/app/(lgu)/beneficiaries.tsx:146-170` runs `supabase.from('profiles').update({ verification_status }).eq('id', id)` and shows "Success" if `error` is null (lines 156-162).
2. **RLS blocks that update silently.** The only UPDATE policies on `profiles` are "Users can update own profile" (`20260716040100_scope_private_data_by_organization.sql:494`, own row only) and the restrictive "Anonymized profile data cannot be reintroduced" (`20260716110000...:813`). An organization member updating another user's row matches zero rows, with no error. PostgREST maintainers describe the same behaviour ([PostgREST discussion #1844](https://github.com/PostgREST/postgrest/discussions/1844): RLS limits which rows you can see, so no rows are updated and no error is returned).
3. **A new beneficiary is invisible to every organization.** The organization list does `select('*').eq('role','beneficiary')` (`beneficiaries.tsx:83`). The only SELECT policy that lets organization staff see other profiles is "Organization members can view scoped profiles" (`20260716040100...:498`), which calls `private.is_profile_organization_member` (`:191`). That is true only for staff of the same organization, or for beneficiaries with an enrollment in one of the organization's programs. The older "LGU can view all profiles" policy was dropped in the same migration (`:317`). A brand-new account has no enrollment, so it appears nowhere.
4. **No other path exists.** No function in `public` or `private` sets a beneficiary to Verified. The only SQL functions that write `profiles` or `beneficiary_identities` after creation are the identity deletion and anonymization ones (`execute_identity_disposition`, `finalize_identity_deletion`), and neither sets a verification status. `record_beneficiary_identity_reverification` (`20260716130000...:301`) requires the identity to already be Verified and is granted to `service_role` only. Every Verified beneficiary in the repo comes from seed scripts that write directly over a DB connection: `scripts/seed-ui-demo.mjs:105`, `seed-merchant-demo.mjs:149`, `seed-cash-demo.mjs:103`, `seed-full-demo.mjs:65`. That is why demo accounts work and brand-new accounts do not.

### 2.3 Co-cause: geography is hidden from the people it applies to

- `program_areas` and `program_barangays` have only organization-member SELECT policies (`20260716040100...:366,384`). Nothing grants beneficiaries read access.
- `src/services/organizationService.ts:57-62` embeds `program_barangays(...)` and `program_areas(...)`. For a beneficiary these embeds are always empty, so `isLocationEligible` receives empty arrays and returns true (`src/utils/program-applicability.ts`), and the card prints "Open to all locations" (`organization-program-card.tsx`, `locationText`).
- The database does check geography on insert: `private.is_program_geo_eligible` (`20261002120000_enforce_private_program_access.sql:109`), wired into the INSERT policy "Beneficiaries can apply to programs" (`:182`).
- The wizard makes "all locations" impossible: `src/app/(lgu)/create-program/index.tsx:47-57` disables Next unless a district and at least one barangay are chosen, the district becomes `affectedAreaIds: [item.id]` (~line 314), and the barangay modal lists only that district's barangays (no select-all). Programs with zero geography exist only as legacy or seeded data.
- Beneficiary registration requires city, district and barangay (`src/utils/registration-validation.ts:42`), so a new account always has a barangay. Whether it is among the program's barangays is unknown to me.

### 2.4 Why the gate contradicts the rest of the system

- The database allows a Pending applicant to apply (replay D1).
- The app's own status timeline treats application first, verification second: `src/services/application-status-service.ts:102-111` orders `registered → pending_verification → verified → approved`, and line 196 maps an enrollment with `approval_status = 'Pending'` to `pending_verification` ("Documents and eligibility criteria undergoing verification review").
- Sprint ORG-13 has the verification officer review beneficiary applications and add "verification remarks".
- Organizations can see a beneficiary profile only after an application exists (2.2 item 3).

Counter-evidence, so the decision is made with eyes open: `docs/prd-reliefchain.md` §5 says "Beneficiary registers; LGU verifies; enrollment is identity- and campaign-scoped", and the gate's own comment says verify before applying. The docs contradict each other. See decision D1 in section 6.1.

History (from git): the gate and the organization Verify UI arrived on 2026-07-15 (`07721d3`, `f46e601`). The organization-scoped RLS rewrite (`20260716040100`, entered the repo 2026-07-19 in `1239f1e`) removed account-wide profile visibility. No migration in the current tree allows an organization to UPDATE another user's profile.

---

## 3. Hypotheses considered

| # | Hypothesis | Verdict | Evidence |
|---|---|---|---|
| H1 | New account has no beneficiary identity row, trigger raises `beneficiary identity not found` | Rejected | Replay A0: `profiles_ensure_beneficiary_identity` creates the identity; D1 insert binds it |
| H2 | "All locations" handled wrongly (null vs empty vs enum) | Rejected for the logic; see co-cause for visibility | Property tests pass on current source; `is_program_geo_eligible` returns true when there are no rows |
| H3 | Eligibility evaluated on null profile fields and fails closed | Rejected | No per-field eligibility in the apply path; registration makes city, district, barangay, household size mandatory |
| H4 | Program status or visibility (draft, published, open) | Rejected | Beneficiary sees `active` programs (B1); client `.in('status',['active','draft'])` is harmless |
| H5 | RLS on enrollments INSERT or programs SELECT blocks the new account | Rejected for the reported program; confirmed for out-of-area (F1) | D1, D2, F2 succeed; F1 returns 42501 |
| H6 | A trigger rejects the insert | Rejected | All six `enrollments` triggers pass for a Pending applicant; notifications created (D3) |
| H7 | Client-side disabled logic | **Confirmed, primary** | Section 2.1 and client repro (4.1) |
| H8 | Onboarding or routing gate | Rejected | `(beneficiary)/_layout.tsx` has no gate; the user reaches Find Organization |
| H9 | Edge Function error swallowed | Rejected | Apply is a plain PostgREST insert (`organizationService.ts:152`); no Edge Function involved |
| H10 | Verification pipeline broken | **Confirmed, why the gate never clears** | C1, C2, E1, E2, G1 and section 2.2 |

Distilled to the two most likely sources, then validated with executed evidence (section 4) rather than logging added to the app: H7+H10 (primary) and geography visibility (co-cause).

---

## 4. Evidence

### 4.1 Real client modules, user's scenario

Evaluated with the repo's own `program-applicability.ts` and `registration-window.ts` for an all-locations program with no registration dates and a brand-new profile (`Pending`, no overrides):

```
isEligibleByLocation: true   registrationStatus: 'Open'   canApply: true   isApplicable: true
Apply button disabled?  brand-new account (Pending): true | same account once Verified: false | Rejected: true
```

The source lines that repro mirrors were asserted to still exist at the cited lines (`find-organization.tsx:32,265`, `organization-program-card.tsx:24`, `organizationService.ts:127`).

The existing suite passes on the current source (`npm run test:program-applicability`: 8/8), so the program-level rules are not the defect.

### 4.2 SQL replay of the real migrations

Docker is not installed on this machine, so `supabase test db` and a local stack were unavailable. Instead the repo's migrations were replayed, in order, on an in-memory PostgreSQL (PGlite) with minimal stubs for roles, `auth.*` and `storage.*`. RLS was exercised by `set role authenticated` plus `request.jwt.claim.sub`, the same mechanism PostgREST uses.

**Fidelity check.** Replaying the first 52 migrations (the documented hosted baseline) produced tables=54, policies=77, triggers=79, enums=40, functions=35 (37 minus my two `crypt`/`gen_salt` stubs). These equal the live hosted introspection recorded in `scripts/verify-hosted-schema.mjs` and `AGENTS.md`. The full set of 89 migrations produces 63 tables, 102 policies, 90 triggers, 40 enums, 59 functions. 87 migrations apply cleanly, one is an empty file, one fails on any empty database (P9).

**Results** (full 89-migration set unless noted; the ids are only for cross-reference inside this report, and the statements are listed in the appendix):

| Id | Actor | What the app sends | Result |
|---|---|---|---|
| A0 | system | Sign-up with the beneficiary metadata | `profiles.verification_status = Pending`; `beneficiary_identities` row created, also `Pending` |
| B1 | new beneficiary | `select` programs | Both `active` public programs visible |
| B2 | new beneficiary | read creator profile (the `organization:profiles!programs_created_by_fkey` embed) | 0 rows, so every card says "Unknown Organization" |
| B3, B4 | new beneficiary | `program_barangays`, `program_areas` | 0 rows although a restriction exists |
| B5 | new beneficiary | `program_requirements` | Visible |
| C1 | organization admin | `select profiles where role='beneficiary'` | 0 rows: new account invisible |
| C2 | organization admin | `update profiles set verification_status='Verified'` | 0 rows, no error |
| D1 | new Pending beneficiary | `insert into enrollments (...)` | **Succeeds**, identity bound, all triggers pass |
| D2 | new Pending beneficiary | upsert requirement response | Succeeds |
| D3 | trigger output | notifications | `application_submitted` and `new_applicant` created |
| E1, E2 | organization admin after the application | select / update | Profile now visible; update still 0 rows |
| F1 | verified beneficiary with no matching barangay | insert into a barangay-restricted program | `42501 new row violates row-level security policy for table "enrollments"` |
| F2 | same beneficiary | insert into an unrestricted program | Succeeds |
| G1 | beneficiary | `update` own `verification_status` | Succeeds (self-verification) |
| G2 | beneficiary | `update` own `role` to `super_admin` | Succeeds |
| Geo | pending beneficiaries | matching barangay / other barangay / no barangay / private non-invited | OK / 42501 / 42501 / 42501 |
| Storage | new beneficiary | requirement upload at `{uid}/requirements/...` | OK; another user's prefix returns 42501 |
| 52-baseline | all of the above that apply | C1, C2, D1, E1, E2, G1 re-run on the first 52 migrations | Identical outcomes; B1 returns 0 programs (the discovery policy is migration 53) |

D1 together with section 4.1 is the decisive pair: the database accepts the application and the client refuses to send it.

### 4.3 References used

- Supabase RLS: an UPDATE policy's `using` clause chooses which existing rows can change; a row-only policy lets the owner change every column ([Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security), [Column Level Security](https://supabase.com/docs/guides/database/postgres/column-level-security)).
- PostgREST behaviour on RLS-filtered updates ([discussion #1844](https://github.com/PostgREST/postgrest/discussions/1844)).
- React Native touchable `disabled` ([docs](https://reactnative.dev/docs/touchablewithoutfeedback#disabled)).
- Context7 was consulted for the Supabase and React Native points above. The fix touches no Expo API, so no Expo v57 doc change applies.

Content was rephrased for compliance with licensing restrictions.

---

## 5. Patterns and anomalies

| # | Finding | Scope |
|---|---|---|
| P1 | Seed scripts force `Verified` (four scripts, section 2.2), hiding the defect for every demo account | Explains "works for demo, fails for new" |
| P2 | Organization Verify reports "Success" on a 0-row update (`beneficiaries.tsx:156-162`) | Follow-up S1 |
| P3 | Two independent "verified" flags: `profiles.verification_status` (UI, Distribute Aid list) and `beneficiary_identities.verification_status` (RPC `issue_wallet_proof_challenge`, `20260716130000...:224`). Nothing syncs them after creation. The app's `submit-wallet-provision` Edge Function bypasses that RPC and only checks that an identity row exists | Follow-up S1 |
| P4 | Geography invisible to beneficiaries, so "Open to all locations" is printed for every program | Phase 2 |
| P5 | Wizard cannot create an "all locations" program, although the data model and client treat empty geography as open | Product decision D2 |
| P6 | Beneficiaries cannot read `organizations` or the creator profile, so every card shows "Unknown Organization" (`organizationService.ts:121`) | Follow-up S4 |
| P7 | `20261003220000_allow_merchant_program_read_and_enrollment_lookup.sql` re-created "Merchants can view available programs" with `status = 'active' OR merchant`. The first term applies to everyone, so every authenticated user sees all active programs including private ones, which cancels the privacy filter added in `20261002120000`. Non-invited users then see Apply on a private program and get a 42501 | Follow-up S3 |
| P8 | **Security:** "Users can update own profile" has no column limits (authenticated may UPDATE 23 of 23 columns, no BEFORE trigger on `profiles`). Any user can set their own `role` (to `super_admin`) or `verification_status` through the API | Out of scope, urgent review S2 |
| P9 | `20261004030000_accredit_demo_merchant_food_aid.sql` hard-codes UUIDs from one developer's database and fails on any empty database ("merchant authorization requires a draft or active program"). A fresh `supabase start`, `db reset` or `supabase test db` will stop at it | Blocks SQL tests on clean DBs |
| P10 | Client query asks for `draft` programs (`organizationService.ts:66`) but RLS only exposes `active` to beneficiaries | Harmless |
| P11 | Disabled Apply pill: white label on `#EEEDED` (`organization-program-card.tsx:220-227`) | Cosmetic |
| P12 | `apply-program.tsx` can show the submit button before its own program list has loaded (hook `isLoading` is ignored, lines 26 and 163), producing "Program information could not be resolved." | Phase 1 hardening |
| P13 | Docs mark "Identity verification / re-verification ✅" (`flow-reliefchain.md:90,216`, `prd-reliefchain.md` row 4) although initial verification has no working path. They also disagree on whether verification precedes application (section 2.4) | Docs |
| P14 | `use-organization-programs.ts:34` already fails lint (`react-hooks/set-state-in-effect`). Do not touch or worsen it | Baseline |

---

## 6. Proposed minimal fix

### 6.1 Decisions to confirm (assumptions I would proceed on)

- **D1. Verification is a prerequisite for approval and disbursement, not for submitting an application.** Evidence for: sections 2.2 and 2.4, the database already allows it, and an application alone moves no money (6.4). Evidence against: the PRD flow wording and the gate's comment. The reporter's request implies D1. `AGENTS.md` asks for confirmation of product facts; if the owner disagrees, the only coherent alternative is Option B in 6.5.
- **D2. Should the wizard offer an explicit "All locations" option?** The data model and `replace_program_geography` (`20260716051000...:123`, accepts empty arrays) already support it, so it would be a UI-only change in `create-program/index.tsx`. It is a feature, not a bug fix, and is not included. If the reporter expected to create such a program, this is the gap.

### 6.2 Phase 1: client only, no migration

Files use CRLF line endings; preserve them.

1. `src/app/(beneficiary)/find-organization.tsx`
   - Delete line 265 `applyDisabled={!isVerified}`.
   - Keep `isVerified` (line 32) and the banner block (138-143), now informational.
2. `src/components/beneficiary/FindOrganization/organization-program-list.tsx`
   - Remove `applyDisabled: boolean;` (16), `applyDisabled,` (30), `disabled={applyDisabled}` (66).
3. `src/components/beneficiary/FindOrganization/organization-program-card.tsx`
   - Remove `disabled: boolean;` (10); change the signature (22) to `({ program, onApply, onViewStatus }: ...)`.
   - Line 24 becomes `const isApplyDisabled = !program.canApply;`.
4. `src/components/beneficiary/FindOrganization/verification-required-banner.tsx`
   - Replace the doc comment (7-11) and the copy (17). Suggested copy: "Your identity isn't verified yet. You can still apply. The organization reviews your details and documents with your application." Do not promise that the organization will "verify" you, because that path is not reachable yet (S1). Renaming the component is optional.
5. Hardening (recommended, one line each) `src/app/(beneficiary)/apply-program.tsx`
   - Line 26: `const { organizations, applyToProgram, isLoading: isProgramListLoading } = useOrganizationPrograms();`
   - Line 163: `{isLoading || isProgramListLoading ? (`

Alternative if the owner wants to keep one protection: keep `applyDisabled`, set it to `profile?.verification_status === 'Rejected'`, and branch the banner copy. I do not recommend inventing that policy unasked.

**Validated in an isolated copy of `src` (never the repo):** with edits 1 to 3 plus the hardening, `tsc --noEmit` reports 0 errors (baseline is also 0) and ESLint is clean on the touched files.

### 6.3 Phase 2: additive migration for geography visibility

Required if the "all locations" premise is to be truthful and out-of-area programs are not offered. Suggested name `20261006000000_beneficiary_read_discoverable_program_geography.sql`. It adds read access only, with the same predicate family as the existing discovery policy, and exposes no draft, closed, or non-invited private program geography. Prototyped on the replay: before the policy a public program showed 0 geography rows; after it, the barangay names resolve (`barangays` is readable) and the private non-invited and draft programs stay hidden.

```sql
create policy "Beneficiaries can view geography of discoverable programs"
on public.program_barangays for select to authenticated
using (
  private.is_active_program(program_id)
  and private.is_program_privacy_eligible(program_id, (select auth.uid()))
);

create policy "Beneficiaries can view areas of discoverable programs"
on public.program_areas for select to authenticated
using (
  private.is_active_program(program_id)
  and private.is_program_privacy_eligible(program_id, (select auth.uid()))
);
```

`grant select` on both tables to `authenticated` already exists (`20260716051000_harden_financial_mutation_paths.sql:119-120`), so no grant is needed. The lookup tables behind the embedded names are already readable by a beneficiary (`areas` 36 rows, `barangays` 93 rows on the replay). That matters because `organizationService.ts` drops a restriction whose embedded name is null, which would silently turn a restricted program back into an open one. No client code change is needed: the existing query already embeds both tables and the card already renders "Not available in your area (limited to ...)". After this, a program outside the user's barangay moves out of "Open to Apply" and shows that pill instead of failing at insert.

Interim behaviour if only Phase 1 ships: programs restricted to other barangays still look open and fail with the raw RLS alert. Say so in the release notes.

### 6.4 Blast radius

| Area | Phase 1 | Phase 2 |
|---|---|---|
| Beneficiary | Find Organization only (`OrganizationProgramList`, `OrganizationProgramCard` and `VerificationRequiredBanner` are used nowhere else). Apply screen unchanged apart from hardening | Same screen shows true locations and filters |
| Organization (LGU) | No code touched. Will start receiving Pending applicants through the existing applicants view and `new_applicant` notifications, exactly as for verified applicants | None. Their read policies are untouched |
| Merchant | None | None |
| Donor | Not implemented in this app (`docs/index.md`) | None |
| Edge Functions, Stellar | None | None |
| Money movement | Unchanged. An application is `Pending` with allocation 0 (`enrollments_enforce_program_allocation` acts only on Approved). Funds still need an organization to approve the enrollment and to pick the beneficiary in Distribute Aid, whose list shows only Verified profiles (`beneficiaryService.ts:30,51`, used by `DistributeAid/Step3BeneficiaryList.tsx`). Caveat found while checking: that Verified filter is client-side. The backend does not enforce it (`submit-wallet-provision` binds a wallet for any identity row, `prepare-disbursement` needs only an active verified wallet). This gap exists today and is independent of the Apply gate | Unchanged |
| Security posture | Adds no capability the API did not already grant (D1 shows the insert is allowed) | Additive SELECT on non-sensitive targeting data. Draft and non-invited private program geography stay hidden |

### 6.5 Migration needed? Rules respected

- Phase 1: **no migration.**
- Phase 2: **one new additive migration.** No applied migration is edited, no append-only, workflow or chain-evidence trigger is touched, and no existing policy is weakened.
- Option B (keep the gate and make verification reachable) would need a new SECURITY DEFINER RPC, new organization visibility into un-applied beneficiary profiles (cross-tenant PII exposure the org-scoping migration removed on purpose), a role for the verifier (sprint §7 says it does not exist), and sync of the two verified flags. It is large, needs product decisions, and is not minimal.
- Pushing Phase 2 to the hosted project is a deployment action and must wait for explicit approval, following `docs/build-reliefchain.md` §15 (load `.env.hosted.local`, confirm the target, compare `supabase migration list --linked` first).

### 6.6 Docs to update in the same change (`AGENTS.md`: keep documentation true)

- `docs/flow-reliefchain.md`: Find Organization row note that Apply is open to any signed-in beneficiary and review happens after submission; correct "Identity verification / re-verification ✅" to say the in-app initial verification path is not functional (S1).
- `docs/prd-reliefchain.md` §5 step 2 wording (see D1).
- `docs/build-reliefchain.md` §8: add known issues for P2/P3, P7, P8 and P9.

---

## 7. Follow-ups (separate changes, flagged for review, not in the minimal fix)

- **S1 (next blocker in the same journey).** After Phase 1 a new account can apply and be approved, but the organization's Distribute Aid list (Step 3) shows only `Verified` profiles and no working path sets it, so the account will not appear there. Server-side, `Verified` is not enforced at wallet binding or disbursement (see the caveat in 6.4), so decide whether S1 should also add that enforcement. Needs an organization-scoped SECURITY DEFINER RPC that updates both `profiles.verification_status` and `beneficiary_identities.verification_status`, restricted to `organization_administrator` / `beneficiary_verifier` members for beneficiaries who have an enrollment in their programs, with an audit event; plus a client that checks the affected row count instead of only `error`. Needs product decisions on who verifies.
- **S2 (security, urgent).** Lock down `profiles` columns: revoke table-level UPDATE from `authenticated`, grant column-level UPDATE only for the fields the app edits, and protect `role` and `verification_status`. Merchant and beneficiary edit-profile flows write to `profiles`, so enumerate their columns first.
- **S3.** Narrow the `status = 'active'` term in "Merchants can view available programs" so private programs stop leaking to non-invited users.
- **S4.** Let beneficiaries read the organization name of programs they can discover.
- **S5.** Make `20261004030000` safe on an empty database (needs a team decision because it is already applied).

---

## 8. Test plan

Rules: Node test runner plus `fast-check` for unit tests, `supabase test db` (pgTAP) for SQL, no jest or vitest.

### 8.1 Unit and wiring tests (validated in the isolated copy)

Run against the current source, the wiring file fails 3 of 3 and the property file passes 4 of 4. After Phase 1 (applied to an isolated copy) all 7 pass. The property tests passing today is the evidence that the program-level logic is correct and the defect is the gate.

Registration: tests under `src/` are not part of `npm run test:unit` (that stage runs `scripts/tests/**/*.test.mjs`). Add `"test:apply-gate": "node --experimental-strip-types --test src/components/beneficiary/FindOrganization/apply-gate.test.mjs src/services/apply-eligibility.property.test.mjs"` to `package.json`, or append the property tests to `src/services/organizationProgramApplicability.test.mjs`, which `npm run test:program-applicability` already runs.

`src/components/beneficiary/FindOrganization/apply-gate.test.mjs` (kept next to the components, not under `src/app`, to avoid any route ambiguity):

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const read = (relativePath) =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');

const SCREEN = '../../../app/(beneficiary)/find-organization.tsx';
const LIST = './organization-program-list.tsx';
const CARD = './organization-program-card.tsx';

test('Find Organization does not disable Apply from the identity verification status', () => {
  assert.doesNotMatch(
    read(SCREEN),
    /applyDisabled\s*=/,
    'A new (Pending) beneficiary must be able to apply; the organization reviews the application afterwards.',
  );
});

test('Program list does not accept or forward a verification-derived disabled flag', () => {
  const list = read(LIST);
  assert.doesNotMatch(list, /applyDisabled/);
  assert.doesNotMatch(list, /disabled=\{/);
});

test('Program card disables Apply only from program-level availability (program.canApply)', () => {
  const card = read(CARD);
  assert.match(card, /const isApplyDisabled = !program\.canApply;/);
  assert.doesNotMatch(card, /verification_status|isVerified/);
});
```

`src/services/apply-eligibility.property.test.mjs`:

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fc from 'fast-check';

import { filterPrograms, isLocationEligible, isProgramApplicable } from '../utils/program-applicability.ts';
import { getRegistrationStatus } from '../utils/registration-window.ts';

const maybeId = fc.option(fc.integer({ min: 1, max: 100_000 }), { nil: null });

test('property: a program with no assigned geography is location-eligible for any beneficiary, including a new account with no barangay/area', () => {
  fc.assert(
    fc.property(maybeId, maybeId, (barangayId, areaId) =>
      isLocationEligible({
        assignedBarangayIds: [],
        assignedAreaIds: [],
        beneficiaryBarangayId: barangayId,
        beneficiaryAreaId: areaId,
      }) === true,
    ),
  );
});

test('property: a program with barangay restrictions is eligible only for a beneficiary whose barangay is listed', () => {
  fc.assert(
    fc.property(
      fc.uniqueArray(fc.integer({ min: 1, max: 500 }), { minLength: 1, maxLength: 10 }),
      maybeId,
      (assigned, barangayId) =>
        isLocationEligible({
          assignedBarangayIds: assigned,
          assignedAreaIds: [],
          beneficiaryBarangayId: barangayId,
        }) === (barangayId !== null && assigned.includes(barangayId)),
    ),
  );
});

test('property: a program with no registration dates is Open and applicable at any clock time', () => {
  fc.assert(
    fc.property(fc.date({ min: new Date('2000-01-01'), max: new Date('2100-01-01') }), (now) => {
      const { status, canApply } = getRegistrationStatus(null, null, now);
      return status === 'Open' && canApply === true;
    }),
  );
});

test('property: an open, unrestricted, not-yet-applied program is listed under "Open to Apply" for any beneficiary location', () => {
  fc.assert(
    fc.property(maybeId, maybeId, (barangayId, areaId) => {
      const isEligibleByLocation = isLocationEligible({
        assignedBarangayIds: [],
        assignedAreaIds: [],
        beneficiaryBarangayId: barangayId,
        beneficiaryAreaId: areaId,
      });
      const { status, canApply: windowOpen } = getRegistrationStatus(null, null);
      const program = {
        canApply: windowOpen && isEligibleByLocation,
        isApplicable: isProgramApplicable({ isEligibleByLocation, existingEnrollmentStatus: null, registrationStatus: status }),
        voucherType: 'Cash',
        programName: 'Relief',
        organizationName: 'Org',
        purpose: '',
      };
      assert.equal(filterPrograms([program], { scope: 'canApply' }).length, 1);
      return true;
    }),
  );
});
```

### 8.2 SQL (pgTAP): `supabase/tests/database/beneficiary_application_access.test.sql`

Pattern: `begin; ... select plan(n); ... set local role authenticated; select set_config('request.jwt.claim.sub', '<uuid>', true); ... rollback;` as in `organization_rls.test.sql`. Create the `active` fixture program inside the transaction by disabling `programs_validate_financial_policy` for the insert (rolled back), because activation normally needs on-chain funding evidence. Expected assertions (each already observed on the replay):

1. Pending beneficiary inserts an enrollment into an active public program with no geography: `lives_ok`; the row is `Pending`, bound to the identity; an `application_submitted` notification exists. Guards "the database does not require Verified".
2. Same beneficiary, barangay-restricted program, barangay not listed or null: `throws_ok(..., '42501')`. Listed barangay: `lives_ok`.
3. Non-invited beneficiary into a private program: `throws_ok(..., '42501')`.
4. Phase 2: a beneficiary sees `program_barangays` / `program_areas` rows for an active public program, and sees none for a draft program or a non-invited private program.
5. Existing `organization_rls.test.sql` assertions on `program_areas` / `program_barangays` counts should keep passing: its fixture programs set no status, so they default to `draft` (`programs.status` default, `20260716060000`), and the new policies require `active`. Confirm by running it, since I could not.

Environment blockers, stated honestly: this machine has no Docker, so none of the pgTAP files can run here. Separately, `supabase start` / `db reset` will stop at `20261004030000` on any empty database (P9). That needs a team decision before `npm run test:integration` can pass from a clean checkout.

### 8.3 Manual device QA

| Case | Expected |
|---|---|
| Fresh beneficiary sign-up, barangay X; program covers X; public | Find Organization lists it under Open to Apply; Apply is tappable; submit; "Application Submitted"; Application Status shows Pending Verification; organization sees the applicant |
| Same account, program covers only barangay Y (after Phase 2) | Pill "Not available in your area (limited to Y)"; appears under All Programs; not under Open to Apply |
| Same case with Phase 1 only | Apply works in the UI, then "Application Failed: new row violates row-level security policy for table "enrollments"" (documented interim behaviour) |
| Already applied program | "Application Pending" pill routes to status |
| Registration window closed or not yet open | Closed pill, or disabled Apply, unchanged |
| Private program, not invited | Known leak (P7): visible, then 42501 on submit |
| Slow network, tap Apply and submit immediately | No "Program information could not be resolved" (hardening) |

### 8.4 Commands and baselines

- `npm run type-check`: baseline clean (0 errors).
- `npm run lint`: touched files are clean except the existing error at `src/hooks/use-organization-programs.ts:34`, which must not change.
- `npm run test:program-applicability` (8/8 today) and the new `test:apply-gate`.
- `supabase test db` / `npm run test:integration` only where Docker is available and P9 is resolved.

---

## 9. Not verified, assumptions

- **Hosted project not touched.** `.env` points the app at `hmbraapdnkoxpepdqgaa` (host read from the file, no secrets printed). I did not load `.env.hosted.local` or run anything against it. I assume hosted equals the repo migrations: the documented rebuild at 52 migrations, plus the later ones the app now needs. B1 shows that without migration 53 a beneficiary sees no programs at all, so the reporter's hosted DB has at least that one. The exact applied level is unknown.
- **The reporter's program and account data are unknown**: its status, privacy flag, barangays, and the account's barangay. Hence the co-cause is stated as a mechanism with unknown impact for this one case.
- **The exact on-screen state was not observed**; it is inferred from the code and replay. Section 1 gives the 30-second check.
- **The replay is a faithful Postgres but not Supabase itself.** Fidelity was cross-checked against hosted counts (4.2). Platform default privileges and Supabase-managed roles are not modelled, but every privilege on the paths tested is granted explicitly in migrations.
- The Expo app was not run on a device. No Edge Function is on this path.

---

## 10. Appendix: statements used in the replay

Each was run as `authenticated` with `request.jwt.claim.sub` set to the actor:

```sql
-- B1..B5 (new beneficiary)
select id, name, status, is_private from public.programs;
select id, full_name from public.profiles where id = '<creator>';
select * from public.program_barangays where program_id = '<restricted program>';
select * from public.program_areas;

-- C1, C2, E1, E2 (organization admin)
select id, verification_status from public.profiles where role = 'beneficiary';
update public.profiles set verification_status = 'Verified' where id = '<new beneficiary>' returning id;

-- D1, D2 (new Pending beneficiary), exactly what applyToProgram() and submitRequirementResponses() send
insert into public.enrollments (beneficiary_id, program_id, approval_status, category)
values ('<uid>', '<program>', 'Pending', 'Cash') returning id;
insert into public.enrollment_requirement_responses (enrollment_id, requirement_id, value, file_url)
values ('<enrollment>', '<requirement>', '3', null)
on conflict (enrollment_id, requirement_id) do update set value = excluded.value, file_url = excluded.file_url;

-- G1, G2 (security anomaly P8)
update public.profiles set verification_status = 'Verified' where id = '<own id>' returning id;
update public.profiles set role = 'super_admin' where id = '<own id>' returning id;
```

---

## 11. Verification

fix(beneficiary): let unverified beneficiaries apply to programs (Phase 1 of section 6.2, client only, no migration). Uncommitted, per repo rules.

Files changed:
- `src/app/(beneficiary)/find-organization.tsx`: removed `applyDisabled={!isVerified}`. `isVerified` and the banner stay, now informational.
- `src/components/beneficiary/FindOrganization/organization-program-list.tsx`: removed the `applyDisabled` prop and its forwarding.
- `src/components/beneficiary/FindOrganization/organization-program-card.tsx`: removed the `disabled` prop; `isApplyDisabled = !program.canApply`.
- `src/components/beneficiary/FindOrganization/verification-required-banner.tsx`: doc comment and copy no longer say verification is required to apply.
- New `src/components/beneficiary/FindOrganization/apply-gate.test.mjs` (3 wiring tests) and `package.json` script `test:apply-gate`.

Deliberately NOT done (outside "only the proven fix"): Phase 2 geography migration (6.3), the `apply-program.tsx` hardening (P12), and all section 7 follow-ups. Until Phase 2 ships, a program restricted to other barangays still looks open and fails with the raw RLS alert (documented interim behaviour). No product decision D1/D2 was changed beyond D1 (verification is not a prerequisite for submitting an application).

Commands run from the repo root and results:
- `npm run test:apply-gate`: 3 tests, 3 pass, 0 fail. Red check: the HEAD version of `find-organization.tsx` contains `applyDisabled=` and the HEAD card does not contain `const isApplyDisabled = !program.canApply;`, so the first and third assertions fail on the pre-fix source.
- `npm run test:program-applicability`: 8 pass, 0 fail (unchanged).
- `npm run test:unit`: 653 tests, 647 pass, 0 fail, 6 skipped, exit 0. (This stage runs only `scripts/tests/**/*.test.mjs`; it does not include the src tests above.)
- `npm run type-check`: passed, exit 0, no errors (baseline also 0).
- `npm run lint`: exit 1, 421 problems = 28 errors + 393 warnings. This is identical to `.validation-artifacts/lint-baseline.json` (28 errors, 393 warnings), so there are no new problems. ESLint on the touched files (`find-organization.tsx`, `FindOrganization/*`, `use-organization-programs.ts`) reports only the pre-existing `react-hooks/set-state-in-effect` error at `use-organization-programs.ts:34` (P14), which was not modified. `npm run lint` therefore does not pass on this repo, before or after the change.
- `supabase test db`: not run. No migration was added, and Docker is not installed on this machine (section 4.2).
- Not done: on-device manual QA (section 8.3). Hosted project not touched; `.env.hosted.local` not loaded. No git commit, amend or push.
- Note: `npm run lint` and `npm run type-check` rewrite `.validation-artifacts/lint.json` and `type-check.json` (ignored/baseline artifacts); `lint-baseline.json` was not changed.

---

## 12. Auto-verify + geography migrations: verification

- Written: 2026-10-14 (iteration 1 of the implementation step; no `autoverify-review.json` existed). Plan: `.agents/tasks/autoverify-geography-plan.md`.
- Nothing was run against hosted Supabase (`hmbraapdnkoxpepdqgaa`). `.env.hosted.local` was not loaded. No `supabase db push` / `db reset`, no seed script. Git was used read-only (no commit, amend, or push). Docker is not installed. No secret was printed.
- Phase 1 client files were not touched. P8 (profiles column lockdown) was documented only, NOT fixed. No UI label or banner was added.

### 12.1 Confirmed design (as implemented)

1. **`public.handle_new_user()` only.** Migration A re-creates it with exactly two differences from the `20261002190000` body: `verification_status` is added to the insert column list, and its value is `case when requested_role = 'beneficiary' then 'Verified' else 'Pending' end`. The `on conflict ... do update` list does NOT set `verification_status` (no rewrite of an existing row, no backfill). `profiles_ensure_beneficiary_identity` is unchanged: it already copies the profile status into `beneficiary_identities`, so both tables are `Verified` from creation. `verified_at` and `verified_by` stay `NULL` on purpose (no person verified these accounts). No grant/revoke statement: `create or replace` preserves the ACL (checked: `handle_new_user` ACL identical before and after on the replay).
2. **Migration B** adds two permissive SELECT policies `to authenticated` using `private.is_active_program(program_id) and private.is_program_privacy_eligible(program_id, (select auth.uid()))`. No grant (the `select` grants to `authenticated` already exist from `20260716051000`).
3. No append-only, workflow, chain-evidence, or re-verification trigger and no existing RLS policy was weakened, dropped, or bypassed (proof f below). No STOP condition was hit.
4. The SQL comment in migration A states: MVP-only, why, what it does not do, and how to revert (new migration restoring the `20261002190000` body, plus optional data-reset queries).

### 12.2 Files changed (all new files and edits keep CRLF; verified 0 LF-only lines in each)

New:
- `supabase/migrations/20261005020000_mvp_auto_verify_new_beneficiaries.sql` (141 lines)
- `supabase/migrations/20261006000000_beneficiary_read_discoverable_program_geography.sql` (32 lines)
- `supabase/tests/database/beneficiary_auto_verification.test.sql` (16 assertions)
- `supabase/tests/database/beneficiary_program_geography_access.test.sql` (22 assertions)

Edited docs: `docs/relief-chain.md` (source of truth, edited first), `docs/prd-reliefchain.md`, `docs/flow-reliefchain.md`, `docs/build-reliefchain.md`, `docs/sprint-reliefchain.md`, `docs/brd-reliefchain.md`, `docs/bpd-reliefchain.md`, `docs/sad-reliefchain.md`, `docs/sdd-reliefchain.md`, `docs/index.md` (change log row).

- `relief-chain.md`: team-decision note in the source boundary, an "MVP build decision" paragraph in §7.1 Step 2 (auto-verify at sign-up, simulated, no real KYC, org-side verification not functional), and the Q4 row.
- `flow-reliefchain.md`: the "Identity verification / re-verification" rows (mermaid node A3 and the feature table row) now say 🟡 initial = MVP auto-verify (simulated), re-verification ✅; sequence diagram no longer shows "verify beneficiary" before applying; new rows for Find Organization Apply (open to any signed-in beneficiary, org reviews after submission, repo only) and for organization verification (⬜ not functional); two labels that implied a working Verify action were softened. The hosted row was not touched.
- `prd-reliefchain.md`: §5 step 2 reworded, feature row 4 set to 🟡, one paragraph on applying and coverage.
- `build-reliefchain.md`: §8 items 19 (auto-verify and revert), 20 (P8, URGENT, not fixed), 21 (P2/P3), 22 (P7), 23 (P9), 24 (existing pgTAP fixtures), a §7.2 note that the two pgTAP files were not executed, and ONE row in the §15.0 state table saying the two migrations are NOT applied to hosted. Nothing else in the hosted sections was changed.
- `sprint-reliefchain.md`: one change-log row (§8). No story status, priority, or criterion changed.
- Propagation of the changed fact (not in the plan's minimum list, needed so no document still says the in-app verification works): `brd` BR-03 (heading ✅ to 🟡 plus a sentence) and two summary mentions, `bpd` one sentence, `sad` one clause, `sdd` the sequence diagram.
- Not changed: stale "52 migrations" statements in `sad`/`sdd`/`index`/`brd` (hosted-state statements; the repo had 89 migration files before this change, 91 now). Left alone because the instruction was to touch hosted sections only for the "not applied" note.

### 12.3 Exact commands run (repo root `c:\Users\gab\relief-chain` unless stated)

```text
npm run type-check          -> passed, exit 0, no errors (baseline 0)
npm run lint                -> exit 1, 421 problems = 28 errors + 393 warnings
                               identical to baseline (.validation-artifacts/lint-baseline.json: 28 / 393).
                               The known error src/hooks/use-organization-programs.ts:34
                               (react-hooks/set-state-in-effect) is pre-existing and untouched.
npm run test:unit           -> 653 tests, 647 pass, 0 fail, 6 skipped, exit 0 (same as Phase 1 baseline)
npm run test:apply-gate     -> 3 / 3 pass
npm run test:program-applicability -> 8 / 8 pass
```

`npm run lint` does not pass on this repo before or after this change (baseline). No source (`src/`) file changed in this step, so no new lint or type finding is possible from it. `npm run lint` and `npm run type-check` rewrite the ignored `.validation-artifacts/*.json` files; `lint-baseline.json` was not changed.

Replay harness (scratch only, in `%TEMP%\rc-replay-autoverify`, NOT in the repo; PGlite 0.5.9 installed there with `npm install --save-exact`; repo `package.json` / `package-lock.json` not modified beyond the pre-existing Phase 1 `test:apply-gate` line):

```text
node step1.mjs   baseline replay of the 89 existing migrations
node run.mjs     full proof run (51 checks)
node red.mjs     red check: the two pgTAP files against a DB WITHOUT migrations A and B
node q.mjs       catalog query: triggers on public.profiles
node docedit.mjs documentation edits (exact-match, CRLF-preserving)
```

### 12.4 PGlite replay evidence

**Harness fidelity.** Stubs: roles `anon`, `authenticated`, `service_role`, `authenticator`; schemas `auth`, `storage`, `extensions`; `auth.users`, `auth.identities`, `storage.buckets`, `storage.objects` (RLS on); `auth.uid()/jwt()/role()` reading `request.jwt.claim.sub` / `request.jwt.claims`; `storage.foldername`; `crypt`/`gen_salt` stubs (excluded from function counts); `create publication supabase_realtime` (needed by `20261004040000`). RLS exercised with `set role authenticated` plus `set_config('request.jwt.claim.sub', ...)`.

Baseline replay of the 89 existing migrations: 87 OK, 1 empty (`20260717122817_hotfix_wallets.sql`), 1 failed (`20261004030000_accredit_demo_merchant_food_aid.sql`, "merchant authorization requires a draft or active program", report P9). Catalog counts in `public` (same definitions as `scripts/verify-hosted-schema.mjs`): **63 tables, 102 policies, 90 triggers, 40 enums, 59 functions**, exactly the baseline in section 4.2. In the proof run P9's migration was **skipped** (not edited), as instructed; it fails anyway on an empty database.

**Proof results (run.mjs: 51 checks, 51 pass, 0 fail):**

| Id | Result |
|---|---|
| ii | Under the OLD function a legacy beneficiary is `Pending` in `profiles` and `beneficiary_identities` (reproduces the reported bug) |
| (a) a1-a3 | After migration A, a new beneficiary sign-up: `profiles.verification_status = Verified`; exactly one `beneficiary_identities` row, `Verified`; `verified_at` NULL, `verified_by` NULL, `data_status = active` |
| (b) | New `lgu`, `merchant`, unknown role (`super_admin` metadata) and no-role sign-ups: role as before (`lgu` / `merchant` / `merchant` / `merchant`), `Pending`, no identity rows. The legacy Pending beneficiary and legacy merchant created before A are STILL `Pending` after A (no backfill) |
| (c) c1-c4 | The auto-verified new beneficiary inserts an enrollment into an active public program (row `Pending`, bound to its identity, `application_submitted` notification created); into a program restricted to its own barangay: succeeds; into a program restricted to another barangay: `42501 new row violates row-level security policy for table "enrollments"`; into a private program it is not invited to: `42501` |
| (d) d-pre, d1-d14 | Before B a beneficiary reads 0 geography rows of an active public program (the co-cause). After B: reads `program_barangays` and `program_areas` of the active public program (1 row each); 0 rows for a DRAFT program (both tables); a non-invited beneficiary reads 0 rows of the PRIVATE program (both tables); the phone-matched invited beneficiary reads both; embedded barangay names resolve; authenticated INSERT into either table is denied (`42501 permission denied`); `anon` cannot read; the enrollment gate is unchanged (other barangay and non-invited still `42501`; invited beneficiary can apply to the private program) |
| (e) e1-e7 | Existing org-member read policies still work: org A admin reads its own DRAFT and PRIVATE program coverage; org B admin reads 0 rows of org A's draft and private programs and 1 row of its own draft program; org A admin reads 0 rows of org B's draft |
| (f) f1-f5 | Catalog before vs after A+B: triggers 91 -> 91 (counting `auth` and `storage` schemas too), none removed, added, or disabled; policies 108 -> 110 with exactly the two new names, none lost, none changed; the only function whose definition hash changed is `public.handle_new_user()`, none added or removed; `handle_new_user` ACL identical; `public` counts 63/102/90/40/59 -> 63/**104**/90/40/59. Both new migrations applied cleanly; all other migrations applied exactly as in the baseline |
| (f) f6-f10 | Downstream gates: `issue_wallet_proof_challenge` succeeds for the auto-verified identity and still fails `23514` for the legacy Pending identity; `record_beneficiary_identity_reverification` by a non-member of the organization still fails `42501`, while a real org verifier can still append evidence for an enrolled auto-verified identity; `UPDATE` and `DELETE` on `beneficiary_identity_reverifications` still raise `55000` (append-only); the `submit-wallet-provision` precondition (identity row exists by `user_id`) holds |

**pgTAP files run through a minimal TAP shim (this is NOT real pgTAP, only `plan/ok/is/lives_ok/throws_ok/has_trigger/finish` re-implemented in plpgsql, run inside one transaction and rolled back):** `beneficiary_auto_verification.test.sql` 16 / 16 assertions pass; `beneficiary_program_geography_access.test.sql` 22 / 22 pass. Their `plan(n)` values match the executed assertion counts. Red check: with migrations A and B NOT applied, 4 assertions of the first file and 8 of the second fail (auto-verify flags, wallet challenge precondition, role-conditioned function body, the coverage reads, and the two policy-shape assertions), so the tests do detect the change.

**Findings from the replay that are not caused by this change (documented in build §8 items 20 and 24):**
- A sign-up with only `{"role":"beneficiary"}` is rejected (`profiles_beneficiary_required_fields_check`, `23514`) and one with only `{"role":"lgu"}` is rejected (`registrations.organization_name` NOT NULL, `23502`). Most existing pgTAP fixtures use those thin shapes, so they would stop at their fixture step. Not confirmed under real pgTAP. The two new files use complete metadata (the LGU fixture needs organization name, type, location, representative first/last name and position, and a document reference).
- `docs/build-reliefchain.md` §15.0 names a trigger `profiles_protect_role_escalation`; no migration defines it and none exists in the replayed catalog (profiles has only four AFTER triggers). Hosted not checked.
- The geography pgTAP fixtures activate programs through the legitimate funding sequence (no trigger disabled, no `session_replication_role`), which supersedes the "disable `programs_validate_financial_policy`" idea in section 8.2.

### 12.5 Hosted rollout: NOT EXECUTED, for the user to approve separately

Do not run these until you approve. This follows `docs/build-reliefchain.md` §15.4. The repo has far more migrations than the 52 recorded as applied to hosted (89 before this change, 91 now), so `db push` would also try every other unapplied migration, and `20261004030000` fails on a database that lacks its hard-coded rows (P9). Review the list first and stop if it is not exactly what you expect.

```powershell
cd c:\Users\gab\relief-chain
. .\scripts\load-hosted-env.ps1                                   # loads .env.hosted.local (never paste values)
npx supabase link --project-ref hmbraapdnkoxpepdqgaa
npx supabase migration list --linked                              # REVIEW: which versions are local-only?
node .\scripts\verify-hosted-schema.mjs                           # confirm the target is hosted, record counts
npm run deploy:db                                                 # = supabase db push; only if the list is as expected
node .\scripts\verify-hosted-schema.mjs                           # expect public policies +2 vs the earlier run
# then confirm wallet-binding protection per build 15.4:
#   select tgname, tgenabled from pg_trigger where tgname = 'wallets_protect_verified_binding';
. .\scripts\load-hosted-env.ps1 -Clear
```

Apply A and B together: with A alone a restricted program still looks open and fails with the raw RLS alert on submit. `npx supabase db reset --linked` is irreversible on this free-tier project and is NOT part of this rollout.

### 12.6 What could NOT be verified

- **`supabase test db` / `npm run test:integration`**: Docker is not installed, and P9 would stop a clean database at `20261004030000` anyway. The two new pgTAP files were therefore NOT executed with pgTAP. They were only run through the minimal TAP shim above, which proves their SQL and expectations on PGlite, not real pgTAP behavior (for example `has_trigger`, `throws_ok` message matching, and pgTAP's own `plan` check).
- **PGlite is not Supabase**: platform default privileges, Supabase-managed roles, GoTrue behavior, and PostgREST error mapping are not modelled; every privilege on the tested paths is explicit in migrations.
- **Hosted behavior and hosted migration level**: not touched, so unknown. Whether hosted has the objects §15.0 names (`profiles_protect_role_escalation`) is unverified.
- **On-device behavior**: the Expo app was not run; the Apply flow end to end on a device (sign up, open Find Organization, see real coverage, apply) is untested here.
- **Self-selected role (P8)**: anyone who signs up with `role=beneficiary` metadata is now auto-Verified. That is the decided MVP behavior, but together with the unlocked `profiles` UPDATE it makes `Verified` meaningless as a trust signal. This is the urgent security follow-up in build §8 item 20 and is deliberately not fixed here.
- Scratch artifacts: `%TEMP%\rc-replay-autoverify` was removed after the run (the two older locked `rc-patch-check*` folders from the earlier step are unrelated).
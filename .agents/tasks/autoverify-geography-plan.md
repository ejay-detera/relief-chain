# Plan: MVP auto-verify new beneficiaries + beneficiary read of discoverable program geography

- Written: investigation-only step. No code, SQL, or docs were edited; nothing was run against hosted Supabase (`hmbraapdnkoxpepdqgaa`); `.env.hosted.local` was not loaded; git was used read-only.
- Background: `.agents/tasks/beneficiary-apply-rootcause.md` (sections 2, 4, 6, 7) and `.agents/tasks/beneficiary-apply-review.json` (verdict APPROVED for the Phase 1 client fix, which is already applied and uncommitted; this plan does not touch it).
- Decisions are final (user): (1) new beneficiary accounts are auto-Verified in BOTH `profiles` and `beneficiary_identities`, trigger-only, no backfill, role `beneficiary` only; (2) not switchable, revertable by a later migration, with a clear SQL comment; (3) no UI label, docs only; (4) also ship the Phase 2 geography SELECT policies.
- **Conflict check result: NONE.** Auto-verify does not require weakening, dropping, or bypassing any append-only, workflow, chain-evidence, or reverification trigger or RLS policy. No STOP condition was hit. (Evidence in section 2.)

---

## 0. Summary of the confirmed design

1. **Where the change goes: `public.handle_new_user()` only.** It is the single place that decides the starting `verification_status` of a profile, and it already derives the role server-side. The existing trigger `profiles_ensure_beneficiary_identity` (`private.ensure_beneficiary_identity_for_profile()`) already copies the profile's `verification_status` into the new identity row (`Verified` stays `Verified`), so it needs **no change**. One edit therefore produces `Verified` in both tables, in the same statement, at creation.
2. **Evidence columns: none are required.** `beneficiary_identities.verified_at` and `verified_by` are nullable with no CHECK tying them to status. Leave both `NULL` (see 2.4 for why that is deliberate).
3. **Two new additive migrations, both strictly later than the current latest file `20261005010000_*`:**
   - `supabase/migrations/20261005020000_mvp_auto_verify_new_beneficiaries.sql`
   - `supabase/migrations/20261006000000_beneficiary_read_discoverable_program_geography.sql`
4. **Tests:** two new pgTAP files in `supabase/tests/database/`, plus a throwaway PGlite replay outside the repo with five proof points (section 6).
5. **Docs:** `relief-chain.md` (source of truth first), `prd`, `flow`, `build`, `sprint` change log (section 7).

---

## 1. Ground rules that apply to the coder

- Do NOT revert, redo, or touch the Phase 1 client edits (`find-organization.tsx`, `organization-program-list.tsx`, `organization-program-card.tsx`, `verification-required-banner.tsx`, `apply-gate.test.mjs`, `package.json` `test:apply-gate`).
- Do NOT edit any applied migration. Only add the two new files.
- Do NOT touch hosted. Do NOT load `.env.hosted.local`. Do NOT run `supabase db push`, `db reset --linked`, or any seed script. Pushing to hosted is a separate, explicitly approved deployment step (`docs/build-reliefchain.md` §15).
- No `git commit`, `amend`, or `push` (AGENTS.md). Read-only git only.
- Line endings: every migration, pgTAP file, and doc to be touched is **CRLF** (measured: 0 LF-only lines in each; no BOM; `core.autocrlf=true`). Write the new files and edits with CRLF and verify after writing (command in section 8).
- Docker is not installed here, so `supabase test db` cannot run. The PGlite replay is the executable evidence; the pgTAP files are written to repo conventions and flagged as not executed.

---

## 2. Investigation findings (FINAL effective definitions, with file:line)

### 2.1 `handle_new_user` (last definition confirmed)

| Fact | Evidence |
|---|---|
| Five definitions exist: `20260714080000_create_profile_on_signup.sql:3`, `20260714121043_use_registration_role_metadata_for_profiles.sql:1`, `20260714130000_beneficiary_profile_fields.sql:30`, `20260715020000_beneficiary_location_columns.sql:10`, **`20261002190000_add_household_size_to_profiles.sql:23-105`**. A grep over all of `supabase/**/*.sql` finds no later `create or replace function public.handle_new_user`. **The last one is `20261002190000` (lines 23-105).** | grep `handle_new_user` |
| It is `security definer`, `set search_path = ''`, `returns trigger`. | `20261002190000:23-27` |
| Role is derived server-side from `new.raw_user_meta_data ->> 'role'`: `in ('lgu','beneficiary','merchant')` is accepted, anything else (including `super_admin`, `admin`, missing) becomes `'merchant'`. | `20261002190000:31-36` |
| It inserts a profile and never names `verification_status`, so the column default `'Pending'` applies (`20260714140000_reconcile_hosted_baseline.sql:218`; allowed values by `profiles_verification_status_check`, same file `:246-253`: `Pending`, `Verified`, `Rejected`). | `20261002190000:38-81`; baseline `:217-253` |
| `on conflict (id) do update set` rewrites role and registration fields but not `verification_status`. Keep it that way: no rewrite of an existing row's status. | `20261002190000:82-104` |
| The trigger on `auth.users` is `on_auth_user_created` (`after insert`, `for each row execute procedure public.handle_new_user()`). `create or replace` keeps the object, owner, and ACL. | `20260714080000:29-33` |
| Execute on `handle_new_user()` is revoked from `public`, `anon`, `authenticated`. `create or replace function` preserves those privileges, so **no grant/revoke statements are needed in the new migration**. A pgTAP assertion guards this. | `20260714121136_restrict_profile_signup_trigger_execution.sql:1-3` |
| Self-selected role is a pre-existing gap (client supplies the metadata; report P8). **Out of scope. Do not change it.** Consequence to document: anyone who signs up with `role=beneficiary` metadata is auto-Verified, which is exactly the decided MVP behaviour. | decision 1 |
| `profiles_beneficiary_required_fields_check` (NOT VALID, enforced for new rows) already requires full_name, gov_id, complete_address, mobile_number, household_size for a non-anonymized beneficiary profile. It is unaffected by this change, but test fixtures must satisfy it. | `20261002210000_enforce_beneficiary_required_fields.sql:12-27` |

### 2.2 `profiles_ensure_beneficiary_identity` (decision: leave unchanged)

- Function `private.ensure_beneficiary_identity_for_profile()` is `security definer`, `search_path = ''`. If `new.role = 'beneficiary'` it inserts `(user_id, verification_status)` where status is `new.verification_status` when it is one of `Pending/Verified/Rejected`, else `'Pending'`, with `on conflict (user_id) do nothing`. (`20260716010000_add_beneficiary_identities_and_campaign_deduplication.sql:104-126`, insert at `:112-121`.)
- Trigger `profiles_ensure_beneficiary_identity` is `after insert or update of role on public.profiles`, `for each row`. (`:128-131`.) It fires inside the same statement as the profile insert, so it sees `new.verification_status = 'Verified'`.
- Why NOT change it: it has no sign-up context (it also fires for role flips and for seed upserts); making it stamp or force `Verified` would widen the policy beyond "new sign-up, role beneficiary" and would add a second function to revert. Why changing only `handle_new_user` is sufficient: the copy-through logic above already maps `Verified` to `Verified`.
- `on conflict (user_id) do nothing` means a pre-existing identity (legacy Pending) is never rewritten: this is what keeps "no backfill" true.

### 2.3 Every trigger, policy, and constraint that could reject, rewrite, or audit a row created `Verified`

Method: enumerated `create trigger` / `drop trigger` over all 89 migrations and checked each block's target table; grepped for dynamic `execute format('create trigger ...')` (only `protect_confirmed_financial_history`, which targets money tables, not these); grepped for `force row level security` (none).

**On `public.profiles` (triggers):**

| Trigger | Fires | Effect on a Verified beneficiary insert | Evidence |
|---|---|---|---|
| `profiles_ensure_beneficiary_identity` | after insert / update of role | Creates identity, copies status (see 2.2). No reject. | `20260716010000:128-131` |
| `on_lgu_profile_created` | after insert | Returns immediately unless role = `lgu`. | `20260716040000_registration_on_lgu_signup.sql:10-12,55-59` |
| `profiles_activate_sms_invites` | after insert / update of mobile_number, role | Marks matching `pending_sms_invites` registered and enqueues a notification. Does not read `verification_status`. | `20261002170000_activate_sms_invite_on_registration.sql:25-31,70-72` |
| `profiles_detect_beneficiary_duplicates` | after insert / update of gov_id, full_name, complete_address, role | Inserts flags only; its header states it never raises. Does not read `verification_status`. | `20261002200000_add_beneficiary_duplicate_detection.sql:14-21,152-154` |

There is no BEFORE trigger and no audit trigger on `profiles` that reads `verification_status`. Constraints on `profiles`: `profiles_verification_status_check` (allows `Verified`), `profiles_role_check` (`20260716000100_super_admin_role_and_seed.sql:2-8`), `profiles_beneficiary_required_fields_check` (2.1). RLS INSERT policies do not apply: `handle_new_user` is `security definer` and RLS is never `FORCE`d. The restrictive "Anonymized profile data cannot be reintroduced" policy is UPDATE-only (`20260716110000...:813`).

**On `public.beneficiary_identities`:**

| Object | Effect | Evidence |
|---|---|---|
| Trigger `beneficiary_identities_set_updated_at` | `before update` only; no insert-time effect. | `20260716010000:205-208` |
| Table constraints | `verification_status` CHECK `in ('Pending','Verified','Rejected')` and default `'Pending'`; `verified_at timestamptz` and `verified_by uuid` nullable, no CHECK linking them to status. Later columns (`data_status` default `'active'`, `anonymized_at`, `disposition_request_id`) are nullable or defaulted. | `20260716010000:19-29`; `20260716110000:187-190` |
| RLS | Only SELECT policies exist (own identity `20260716010000:217-221` and `20260717020000:5`, org-member `20260716040100:503`). Authenticated has no INSERT/UPDATE/DELETE grant; creation happens only through the `security definer` trigger function. | `20260716010000:228-236` |
| Writers after creation | Only `finalize_identity_deletion`/`execute_identity_disposition` (`20260716110000:901-908,987-990`), which set `user_id`, `verified_by`, `data_status`, `anonymized_at`, `disposition_request_id`. None writes `verification_status`. | same |

There is no append-only, workflow, or chain-evidence trigger on `beneficiary_identities`. The append-only table in this area is `beneficiary_identity_reverifications` (`reject_identity_reverification_mutation`, `20260716130000:90-101`); it is a separate evidence table that auto-verify neither writes nor needs.

### 2.4 Can an identity be created directly as Verified? What evidence is correct?

- **Yes.** Nothing in the schema forbids it, and three of the four seed scripts already create identities Verified straight from the profile row (`scripts/seed-ui-demo.mjs:103-110` upserts profiles Verified, which the same trigger copies; `seed-merchant-demo.mjs:147-153`; `seed-full-demo.mjs:62-71`). The sign-up path produces an identical outcome.
- **No evidence columns are required.** `verified_at` and `verified_by` are optional. The seeds stamp `verified_at = now()` after the fact but never set `verified_by` (`seed-ui-demo.mjs:127-130`, `seed-merchant-demo.mjs:278-283`).
- **Exact values to set at sign-up:** `profiles.verification_status = 'Verified'`; the trigger sets `beneficiary_identities.verification_status = 'Verified'`; `verified_at = NULL`, `verified_by = NULL`, `data_status = 'active'` (default).
- **Why leave `verified_at`/`verified_by` NULL (deliberate):** no human or organization verified these people, and those columns record a verification event. NULL/NULL doubles as a queryable marker for "auto-verified under the MVP policy" (`verification_status = 'Verified' and verified_at is null and verified_by is null`) that a later revert or re-verification campaign can use. Caveat to state in the SQL comment: it is a heuristic marker, not a guarantee, because some seed identities are also Verified with a stamped `verified_at`; for an exact cut use `created_at >= <this migration's apply time>`.
- **Reverification evidence is NOT required by auto-verify and is not satisfied by it.** `record_beneficiary_identity_reverification` is `service_role`-only (`20260716130000:636`), needs an active org verifier membership (`:301-345`) and an enrollment in that org's program, and appends to the immutable evidence table. Wallet rotation still demands a fresh (24 h) reverification row (`validate_wallet_rotation_intent`, `:140-172`). So the sensitive step-up path keeps its real evidence requirement.

### 2.5 Downstream readers of "Verified" (what changes for a new account)

- `issue_wallet_proof_challenge` (`20260716130000:197-254`, check at `:218-231`, error `:228`) requires identity `Verified` and `data_status = 'active'`; granted to `service_role` only (`:629-633`) and not called from `src/` or `supabase/functions/` (grep). An auto-verified identity now passes this check as intended; no caller changes.
- `submit-wallet-provision` (`supabase/functions/submit-wallet-provision/index.ts:56-66`) only requires that a `beneficiary_identities` row exists for `session.userId` (no status check), then binds a wallet row marked `verified` (`:112-130`). It already works for Pending; auto-verify neither helps nor hurts it. `prepare-payment`, `submit-payment`, `retry-payment` likewise only look up the identity by `user_id`.
- `request_wallet_rotation` requires the caller's identity `Verified` (`:397-407`) AND a fresh reverification (above): auto-verify satisfies the first only.
- Client readers (behaviour changes to document, no code change): Distribute Aid beneficiary list filters `Verified` profiles (`src/services/beneficiaryService.ts:30,51`), so new beneficiaries now appear there (this also removes the report's follow-up S1 blocker for the pilot); LGU dashboard "recent verified beneficiaries" (`src/app/(lgu)/index.tsx:62`); reports/progress counts (`reportService.ts:346`, `program-progress-service.ts:43`); `find-organization.tsx:32` `isVerified` (the informational banner stops showing); LGU beneficiary list badges (`BeneficiaryList.tsx`, `beneficiaries.tsx:278`).
- Known pre-existing gap that auto-verify makes more visible, to record in docs and NOT fix here: "Users can update own profile" has no column limits, so a user can already set their own `verification_status` or `role` (report P8). With auto-verify, `Verified` on `profiles` is no longer a trust signal for beneficiaries.

---

## 3. Migration A: MVP auto-verify

**File:** `supabase/migrations/20261005020000_mvp_auto_verify_new_beneficiaries.sql` (CRLF)

**Timestamp rationale:** the latest existing migration files are `20261005010000_inter_organization_transfers.sql` and `20261005010000_merchant_manifest_presync.sql` (89 files total; nothing later; listing sorted by name). `20261005020000` is distinct and sorts after both; `20261006000000` (migration B) sorts after it.

**Exact SQL** (this is the 20261002190000 body, with exactly two differences: the `verification_status` column/value, and the header/comment). Do not reformat anything else.

```sql
-- MVP-ONLY: automatically verify newly created BENEFICIARY accounts.
--
-- WHY
--   While the product is in its MVP phase, a new beneficiary account was created
--   with profiles.verification_status = 'Pending' (the column default) and the
--   matching beneficiary_identities row was created 'Pending' by the
--   profiles_ensure_beneficiary_identity trigger. Nothing in the app could ever
--   move either row to 'Verified' (an organization cannot see a beneficiary
--   profile before that beneficiary applies, and its Verify action is a
--   profiles UPDATE that RLS turns into a silent 0-row no-op), so new accounts
--   were stuck at Pending and the "Verified" gates downstream (Distribute Aid
--   list, wallet-proof challenge, wallet rotation precondition) could never
--   open for them. For the MVP, new beneficiaries are therefore verified at
--   creation.
--
-- WHAT
--   public.handle_new_user() now inserts verification_status = 'Verified' when,
--   and only when, the server-derived role is 'beneficiary'. Every other role
--   (lgu, merchant, and the 'merchant' fallback for unknown roles) still starts
--   'Pending' exactly as before. The existing trigger
--   profiles_ensure_beneficiary_identity is unchanged: it already copies the
--   profile status into beneficiary_identities, so the identity is created
--   'Verified' too. verified_at and verified_by are left NULL on purpose: no
--   person verified these accounts, and NULL/NULL marks them as auto-verified
--   (heuristic marker only; for an exact cut use created_at >= the time this
--   migration was applied).
--
-- WHAT THIS DOES NOT DO
--   * No backfill: existing Pending profiles and identities are untouched, and
--     the ON CONFLICT branch below deliberately does not rewrite
--     verification_status of an existing row.
--   * No settings flag or feature switch: this is a plain, unconditional change.
--   * It does not weaken, drop, or bypass any append-only, workflow, chain-
--     evidence, or re-verification trigger or any RLS policy. It does not
--     create re-verification evidence (beneficiary_identity_reverifications),
--     which wallet rotation still requires.
--   * It does not change how the role is chosen (raw_user_meta_data ->> 'role').
--
-- HOW TO REVERT (later, with a NEW migration; never edit this file)
--   Add a migration that runs CREATE OR REPLACE FUNCTION public.handle_new_user()
--   with the body from 20261002190000_add_household_size_to_profiles.sql (no
--   verification_status column in the insert list), then restore its original
--   function comment. Execute privileges are preserved by CREATE OR REPLACE.
--   Reverting stops FUTURE auto-verification only. Rows already created
--   'Verified' stay 'Verified' until a deliberate data decision is made, e.g.
--     update public.profiles set verification_status = 'Pending'
--       where role = 'beneficiary' and created_at >= '<this migration applied at>';
--     update public.beneficiary_identities set verification_status = 'Pending'
--       where verified_at is null and verified_by is null
--         and created_at >= '<this migration applied at>';
--   (review before running; those updates are not part of the revert migration).

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_role text;
begin
  requested_role := case
    when new.raw_user_meta_data ->> 'role' in ('lgu', 'beneficiary', 'merchant')
      then new.raw_user_meta_data ->> 'role'
    else 'merchant'
  end;

  insert into public.profiles (
    id,
    role,
    full_name,
    gov_id,
    location,
    stellar_pubkey,
    first_name,
    last_name,
    middle_initial,
    mobile_number,
    sex,
    civil_status,
    birthdate,
    gov_id_url,
    complete_address,
    municipality_city,
    city_id,
    area_id,
    barangay_id,
    household_size,
    verification_status
  )
  values (
    new.id,
    requested_role,
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'gov_id', ''),
    nullif(new.raw_user_meta_data ->> 'location', ''),
    nullif(new.raw_user_meta_data ->> 'stellar_pubkey', ''),
    nullif(new.raw_user_meta_data ->> 'first_name', ''),
    nullif(new.raw_user_meta_data ->> 'last_name', ''),
    nullif(new.raw_user_meta_data ->> 'middle_initial', ''),
    nullif(new.raw_user_meta_data ->> 'mobile_number', ''),
    nullif(new.raw_user_meta_data ->> 'sex', ''),
    nullif(new.raw_user_meta_data ->> 'civil_status', ''),
    nullif(new.raw_user_meta_data ->> 'birthdate', ''),
    nullif(new.raw_user_meta_data ->> 'gov_id_url', ''),
    nullif(new.raw_user_meta_data ->> 'complete_address', ''),
    nullif(new.raw_user_meta_data ->> 'municipality_city', ''),
    (new.raw_user_meta_data ->> 'city_id')::integer,
    (new.raw_user_meta_data ->> 'area_id')::integer,
    (new.raw_user_meta_data ->> 'barangay_id')::integer,
    (new.raw_user_meta_data ->> 'household_size')::integer,
    -- MVP-ONLY auto-verification: beneficiary accounts only (see header).
    case when requested_role = 'beneficiary' then 'Verified' else 'Pending' end
  )
  on conflict (id) do update set
    role = excluded.role,
    full_name = excluded.full_name,
    gov_id = excluded.gov_id,
    location = excluded.location,
    stellar_pubkey = excluded.stellar_pubkey,
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    middle_initial = excluded.middle_initial,
    mobile_number = excluded.mobile_number,
    sex = excluded.sex,
    civil_status = excluded.civil_status,
    birthdate = excluded.birthdate,
    gov_id_url = excluded.gov_id_url,
    complete_address = excluded.complete_address,
    municipality_city = excluded.municipality_city,
    city_id = excluded.city_id,
    area_id = excluded.area_id,
    barangay_id = excluded.barangay_id,
    household_size = excluded.household_size;

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Creates the profile row from sign-up metadata. MVP-ONLY: a newly created beneficiary profile starts Verified (the profiles_ensure_beneficiary_identity trigger copies that to beneficiary_identities); every other role starts Pending. verified_at/verified_by stay NULL. Revert with a new migration restoring the 20261002190000 body.';
```

Notes for the coder:
- The explicit `else 'Pending'` for non-beneficiary roles equals the column default, so non-beneficiary behaviour is byte-for-byte unchanged, and the revert is a pure removal.
- Do NOT add `verification_status` to the `on conflict ... do update set` list (no rewrite of an existing row, no backfill).
- Do NOT add `grant`/`revoke` statements (see 2.1).
- Confirm the pasted body matches `20261002190000:23-104` apart from the two marked differences (diff by eye or with a script; see section 8).

---

## 4. Migration B: beneficiary read of discoverable-program geography (Phase 2)

**File:** `supabase/migrations/20261006000000_beneficiary_read_discoverable_program_geography.sql` (CRLF). Sorts after migration A and after `20261005010000_*`.

**Helper verification (against the real migrations):**

| Item | Verified signature / fact | Evidence |
|---|---|---|
| `private.is_active_program(p_program_id uuid) returns boolean` | `security definer`, `stable`, `search_path=''`; true iff `programs.status = 'active'`. Only one definition. Execute granted to `authenticated, service_role`. | `20260716040100_scope_private_data_by_organization.sql:245-257`, grant `:296-297` |
| `private.is_program_privacy_eligible(p_program_id uuid, p_user_id uuid) returns boolean` | `security definer`, `stable`; `not coalesce(is_private,false) or is_program_invited_beneficiary(...)`. Execute granted to `authenticated, service_role`. | `20261002120000_enforce_private_program_access.sql:76-91`, grant `:94-96` |
| `grant select` on both tables to `authenticated` already exists; `anon` revoked; writes revoked. No later migration revokes it. No new grant is needed. | `20260716051000_harden_financial_mutation_paths.sql:119-120` (grep of all migrations that mention these tables shows no later change) |
| Current SELECT policies on the two tables are org-member only; the broad "read/write to authenticated" ones were dropped. | `20260716040100:366-369,384-387`; drops at `:306-307`, `20260716051000:104-111` |
| Policy names are unused. | grep |
| No RLS recursion: both helpers are `security definer` and read `programs`, `pending_sms_invites`, `profiles` (owner bypasses RLS). Neither helper reads `program_barangays`/`program_areas` (only `is_program_geo_eligible` does, and it is not used by these policies). | `20261002120000:109-151` |

**Exact SQL:**

```sql
-- Let a signed-in user read the geography (barangay and area restrictions) of
-- programs they can already discover, so Find Organization can show the real
-- coverage instead of defaulting every program to "Open to all locations".
--
-- Until now program_barangays / program_areas had only organization-member
-- SELECT policies, so the app's embed of both tables was always empty for a
-- beneficiary. The database still enforced the real barangay list at
-- enrollment insert (private.is_program_geo_eligible, 20261002120000), which
-- surfaced as a raw RLS error on Apply.
--
-- Scope is exactly the predicate family of the existing discovery policy on
-- public.programs ("Beneficiaries can discover active programs to apply"):
-- the program must be active AND public-or-invited. Geography of draft,
-- closed, or non-invited private programs stays hidden. Read access only; the
-- table grants (select to authenticated) already exist from
-- 20260716051000_harden_financial_mutation_paths.sql.

create policy "Beneficiaries can view geography of discoverable programs"
on public.program_barangays for select
to authenticated
using (
  private.is_active_program(program_id)
  and private.is_program_privacy_eligible(program_id, (select auth.uid()))
);

create policy "Beneficiaries can view areas of discoverable programs"
on public.program_areas for select
to authenticated
using (
  private.is_active_program(program_id)
  and private.is_program_privacy_eligible(program_id, (select auth.uid()))
);
```

Notes:
- Permissive policies are OR'd with the existing org-member ones; no existing policy is altered or weakened.
- Like the existing discovery policy, this is `to authenticated` with no role clause, so any signed-in role can read the geography of discoverable programs. This is consistent with what `programs` already exposes, and is not a new capability for a beneficiary. State it in the docs.
- Known adjacent issue, not fixed here (report P7/S3): "Merchants can view available programs" (`20261003220000_allow_merchant_program_read_and_enrollment_lookup.sql`) lets everyone see all active programs incl. private ones. These new policies are stricter than that (they require privacy eligibility), so they do not extend the leak to geography.
- The `barangays` and `areas` lookup tables are already readable by a beneficiary (report 6.3, replay: areas 36, barangays 93). `organizationService.ts` drops a restriction whose embedded name is null, which is why that readability matters; PROOF POINT 4 re-checks it.
- No client change is needed: `organizationService.ts` already embeds both tables and the card already renders "Not available in your area".

---

## 5. pgTAP tests (cannot be executed here: no Docker)

**Conventions observed** (`supabase/tests/database/*.test.sql`, e.g. `beneficiary_identities.test.sql`, `organization_rls.test.sql`): snake_case filename ending `.test.sql`; `begin;` / `create extension if not exists pgtap with schema extensions;` / `select plan(n);` ... `select * from finish();` / `rollback;`; fixtures inserted straight into `auth.users` (instance_id `00000000-...`, aud/role `authenticated`, `raw_user_meta_data` JSON) so `handle_new_user` fires; fixed-prefix UUIDs per file; role switch by `set local role authenticated; select set_config('request.jwt.claim.sub', '<uuid>', true); ... reset role;`; `lives_ok` / `throws_ok(sql, '42501', 'new row violates row-level security policy for table "x"', desc)` / `is` / `ok`. Other `supabase/tests/*.mjs` files are Docker PostgreSQL property tests for registration only and are not touched. Files are CRLF.

**Fixture rules (important):**
- A beneficiary `auth.users` fixture MUST carry `full_name`, `gov_id`, `complete_address`, `mobile_number`, and `household_size` in `raw_user_meta_data`, or the profile insert violates `profiles_beneficiary_required_fields_check` and the whole signup fixture fails. (Reading `beneficiary_identities.test.sql:101-141` and `organization_rls.test.sql:87-113`, those existing fixtures use only `{"role":"beneficiary"}` and therefore appear to violate that NOT VALID constraint, which applies to new rows. I could not run them to confirm. Treat as a likely PRE-EXISTING failure to flag in the final report, not to fix in this change.)
- Get a valid `area_id`/`barangay_id` dynamically (`select id from public.barangays order by id limit 2`), do not hard-code beyond what existing tests do (`area_id 1`, `barangay_id 1` appear in `organization_rls.test.sql:136-143`).
- To make a program `active` use the legitimate funding sequence already used in `authorization_immutability_constraints.test.sql:340-425` (verified treasury wallet fixture, insert `draft` voucher program with policy columns, `update ... status='funding', funding_status='reserving'`, then `update ... funding_status='funded', ... status='active'`). **Do NOT disable `programs_validate_financial_policy` or set `session_replication_role`** (this supersedes the report's 8.2 suggestion, to honour "never weaken a trigger to make a test pass"). Cash-aid variant is acceptable if the voucher fixture is simpler to copy verbatim; copy a known-good pattern, do not invent one.

### 5.1 `supabase/tests/database/beneficiary_auto_verification.test.sql`

Cases (about 12; set `plan(n)` to the real count):
1. New beneficiary sign-up (full metadata) -> `profiles.verification_status = 'Verified'`.
2. Same user -> exactly one `beneficiary_identities` row, `verification_status = 'Verified'`.
3. Same identity -> `verified_at is null and verified_by is null and data_status = 'active'` (documents the marker; no evidence required).
4. New `lgu` sign-up -> profile `'Pending'` (and no identity row).
5. New `merchant` sign-up -> profile `'Pending'`.
6. Sign-up with unknown/privileged metadata role (`'super_admin'`) -> profile role `'merchant'` and `'Pending'` (role derivation unchanged, no auto-verify).
7. Sign-up with no role metadata -> role `'merchant'`, `'Pending'`.
8. Downstream gate: as `service_role` (or superuser, matching `wallet_rotation.test.sql:130-141`), `public.issue_wallet_proof_challenge(...)` for the auto-verified identity with `purpose='beneficiary'` and `owner_type='beneficiary_identity'` `lives_ok` (mirror the call shape at `wallet_rotation.test.sql:130-141`).
9. Evidence still required: `public.record_beneficiary_identity_reverification(...)` for the auto-verified identity by a user with no org membership/enrollment `throws_ok` `42501` (auto-verify did not bypass the verifier-role check).
10. Guard: `not has_function_privilege('authenticated', 'public.handle_new_user()', 'EXECUTE')` and same for `anon` (ACL preserved by `create or replace`).
11. Guard: trigger `profiles_ensure_beneficiary_identity` still exists on `public.profiles` and `on_auth_user_created` on `auth.users` (`has_trigger`).
12. Guard: `pg_get_functiondef('public.handle_new_user()'::regprocedure)` contains `requested_role = 'beneficiary'` and does NOT mention `on conflict ... verification_status` rewrite (simple `like` check that the conflict clause does not set `verification_status`).

### 5.2 `supabase/tests/database/beneficiary_program_geography_access.test.sql`

Fixtures: one organization + admin (`lgu`), two beneficiaries (B1 whose barangay is in the program's list; B2 with a different barangay), program P_pub (active, public, with `program_barangays` and `program_areas`), P_draft (draft, with geography), P_priv (active, `is_private = true`, with geography) and a `pending_sms_invites` row for B1's mobile number on P_priv only (columns per `20261002120000:49-60`: `program_id`, `phone_number`; check the table definition for required columns before inserting).

Cases (set `plan(n)` to the real count):
1. B1 sees the `program_barangays` rows of P_pub; B2 sees them too (discovery is not geography-gated, by design in `20261002120000:158-165`).
2. B1 sees the `program_areas` rows of P_pub.
3. B1 sees 0 geography rows for P_draft (both tables).
4. B2 (not invited) sees 0 geography rows for P_priv (both tables).
5. B1 (invited by phone) sees the geography rows of P_priv (both tables).
6. Regression of the gate this feeds: B1 (listed barangay) `lives_ok` inserting an enrollment into P_pub; B2 (other barangay) `throws_ok` `42501` `new row violates row-level security policy for table "enrollments"`; B2 into P_priv `throws_ok` `42501`.
7. Authenticated still cannot write: `throws_ok` `42501` `permission denied for table program_barangays` on insert (mirrors `organization_rls.test.sql:308-317`).
8. Policy existence: both new policy names exist in `pg_policies` with `cmd = 'SELECT'` and roles `{authenticated}`.
9. Org-admin tenant isolation unchanged: org-A admin sees geography of org-B's DRAFT program as 0 rows.

### 5.3 Existing tests to re-check (by reading; they cannot run here)

- `organization_rls.test.sql:240-245` counts `program_areas`/`program_barangays` as an org-A admin: fixture programs there are created without a status, so they default to `draft` (`20260716060000_add_program_financial_policy.sql:106`), and the new policies need `active`; counts stay `1`. `financial_mutation_hardening.test.sql:215-241` counts by `program_id` for the actor's own program; union of permissive policies does not duplicate rows. No existing test should change.
- Add nothing to `supabase/tests/README.md` (it documents only the Docker-based property tests).

---

## 6. PGlite replay plan (the executable evidence; scratch only, outside the repo)

Purpose: the machine has no Docker, so prove behaviour by replaying the real migrations on in-memory PostgreSQL, as the root-cause report did (4.2: baseline fidelity matched hosted counts).

Setup rules:
- Work in a scratch dir **outside the repo** (for example `%TEMP%\rc-replay-autoverify`); `npm init -y` and `npm install --save-exact @electric-sql/pglite@0.5.9` there (version verified with `npm view`; Node v25.8.2 present). Do NOT add PGlite to the repo's `package.json` or lockfile. Delete the scratch dir when done (the two older locked `rc-patch-check*` folders in `%TEMP%` can be ignored).
- Stubs needed (as in the report): roles `anon`, `authenticated`, `service_role` (and `authenticator` if referenced); schemas `auth`, `storage`, `extensions`; `auth.users` with the columns the migrations/test inserts use; `auth.uid()` / `auth.jwt()` / `auth.role()` reading `request.jwt.claim.sub` / `request.jwt.claims`; minimal `storage.buckets`/`storage.objects`; `crypt`/`gen_salt` stubs; any extension PGlite lacks stubbed rather than skipped.
- Apply `supabase/migrations/*.sql` in filename order (ordinal string sort). Expected: 87 apply cleanly, one empty file, and `20261004030000_accredit_demo_merchant_food_aid.sql` fails on an empty DB (report P9). **The harness must catch that one error, log it, and continue**; do not fix or edit that migration.
- RLS is exercised with `set role authenticated` plus `set_config('request.jwt.claim.sub', '<uuid>', true)` (same mechanism PostgREST uses).
- Baseline to reproduce first (before adding the two new files): **63 tables, 102 policies, 90 triggers, 40 enums, 59 functions** (report 4.2). If the baseline does not match, stop and fix the harness before trusting any result.

Sequence: (i) apply the 89 existing migrations; (ii) while the old function is still in place, sign up a legacy beneficiary and a legacy merchant and record them (Pending); (iii) snapshot the catalog (`pg_trigger` names, `pg_policies` names, `pg_proc` md5 of definitions); (iv) apply migration A, then migration B (record each result); (v) run the proofs; (vi) snapshot again and diff.

**The five proof points:**

1. **Auto-verify in both tables.** After A, sign up (insert into `auth.users`, metadata `role=beneficiary` + required fields): `profiles.verification_status = 'Verified'` AND `beneficiary_identities.verification_status = 'Verified'` (one identity, `verified_at`/`verified_by` NULL, `data_status = 'active'`). Also sign up with the real mobile-registration metadata shape used by `BeneficiaryRegistrationFlow.tsx` if easy to copy.
2. **Scope limits hold: other roles and legacy rows untouched.** After A: new `lgu` and `merchant` (and unknown-role -> `merchant`) sign-ups are `Pending`, with no identity rows for them; the legacy Pending beneficiary signed up in step (ii) is STILL `Pending` in both tables (no backfill), proving the trigger-only change.
3. **End-to-end apply works and geography still gates.** As the new auto-verified beneficiary (authenticated): insert an enrollment into an active public program with no geography -> succeeds (and `application_submitted` notification exists as in report D1/D3); into a program restricted to the beneficiary's barangay -> succeeds; into a program restricted to a different barangay -> `42501` `new row violates row-level security policy for table "enrollments"`; into a private non-invited program -> `42501`. Activate programs through the real funding sequence or by the same fixture method the report used; do not disable triggers except where the report's replay already had to (state it explicitly if so, replay-only).
4. **Phase 2 policies behave and nothing else widens.** After B: as the beneficiary, `select` from `program_barangays` and `program_areas` returns rows for the active public program, 0 rows for a draft program and for a private non-invited program, rows for a private invited program (phone match), `barangays`/`areas` names resolve (readable), and an authenticated INSERT into either table is denied; an org-A admin still sees only org-A geography for draft programs (isolation unchanged); `anon` still sees nothing.
5. **No protective object weakened + downstream gates behave.** Catalog diff before/after the two migrations: policies +2 (102 -> 104, exactly the two new names), triggers unchanged (90), functions unchanged in count (59), every trigger name and every policy name that existed is still present, and the only `pg_proc` definition hash that changed is `public.handle_new_user`. Then, as `service_role`, `issue_wallet_proof_challenge` succeeds for the auto-verified identity; `record_beneficiary_identity_reverification` for it with no org verifier/enrollment fails `42501`; an `UPDATE`/`DELETE` on `beneficiary_identity_reverifications` still raises `55000`; the `submit-wallet-provision` precondition (identity row exists by `user_id`) holds.

Record the replay results (pass/fail per proof point and the catalog counts) in the final report. Do not leave the replay scripts in the repo.

---

## 7. Docs to edit (precise list; CRLF; no number, price, or partner claims)

Order matters: `relief-chain.md` first (AGENTS.md: the canonical source), then propagate.

| # | File | Where | What to add or change |
|---|---|---|---|
| 1 | `docs/relief-chain.md` | `#### Step 2 — Register and verify beneficiaries` (around line 300-305) and the `Q4` row (line 644) | Add a short "MVP build decision (post-proposal)" note: in the MVP build, a newly created beneficiary account is automatically marked Verified (profile and stable identity) at sign-up; no document or organization check is performed for that status; it is MVP-only, not switchable, and is to be replaced by a real verification flow; organization re-verification evidence (`beneficiary_identity_reverifications`) is still required for sensitive actions such as wallet rotation. Append to the Q4 row: "MVP interim decision: auto-verify at sign-up; real identity policy still open." Do not claim any government record integration. Date it with the change date (investigation report is dated 2026-10-14). |
| 2 | `docs/prd-reliefchain.md` | §5 step 2 at line 175 ("Beneficiary registers; LGU verifies; enrollment is identity- and campaign-scoped") and the matrix row 4 at line 79 | Reword step 2 to: beneficiary registers and is auto-verified in the MVP (organizations can still review the application and documents; a real verification path is not built); keep the "identity- and campaign-scoped" clause. Row 4: change the status/notes so it does not imply initial verification works in-app: mark initial verification as MVP auto-verify (🟡 interim), re-verification evidence as built. Add one line that beneficiaries can read the barangay/area coverage of programs they can discover (Phase 2). |
| 3 | `docs/flow-reliefchain.md` | mermaid node line 90 (`A3["✅ Identity verification / re-verification"]`), table row line 216, sequence diagram lines 176-179, and the Find Organization node line 60 / feature table | Row 216: keep re-verification ✅ but add "initial verification: 🟡 MVP auto-verify at sign-up (`handle_new_user`, migration `20261005020000`); organization-driven initial verification is not functional (a profile UPDATE by an organization is a silent no-op under RLS)". Fix the sequence diagram so it does not show "L->>APP: verify beneficiary" as the gate for applying. Add a feature row: "Beneficiary can apply without prior org verification; program geography visible to beneficiaries | 🟡 pending hosted deployment | migration `20261006000000`, Phase 1 client fix". Status labels must say "repo only; not applied to the hosted project" until deployed. |
| 4 | `docs/build-reliefchain.md` | §8 "Known Issues and Documentation Drift" table (rows end at 18, line ~230) | Add rows 19 onward: (19) MVP-only auto-verify: what, where (`handle_new_user`), that it is unconditional, how to revert (new migration restoring the `20261002190000` body; rows already Verified are not reverted automatically; queries in the migration comment), and that hosted has NOT received it. (20) "Users can update own profile" has no column limits, so users can self-set `role`/`verification_status` (report P8); with auto-verify `Verified` is not a trust signal. (21) P2: organization Verify is a silent 0-row no-op. (22) P7: "Merchants can view available programs" exposes private programs. (23) P9: `20261004030000` fails on an empty database, so `supabase start`/`db reset`/`supabase test db` stop there. Also, if §15.0 or any table states a migration count for the repo, update it (repo goes from 89 to 91 files; hosted count stays as recorded until a push). Add a note under the test conventions that the two new pgTAP files exist and were not executed locally (no Docker). |
| 5 | `docs/sprint-reliefchain.md` | §8 change log (append a dated row after the last, 2026-10-14) | One row: "Added MVP auto-verification of new beneficiaries and beneficiary read of discoverable-program geography; no story added, removed, re-prioritised, or re-criteria'd. BEN-01 (status 'Registered') and BEN-02 timeline wording unchanged; orgs verifying beneficiaries remains an ORG-13 / Verification Officer capability that is still not built" with reason "Pending accounts could never become Verified and could not apply; MVP decision. Behaviour is interim and revertable." Do NOT change any story's status or acceptance criteria text. |
| 6 | `docs/sdd-reliefchain.md` | §4.3 key functions (line 233) or the signup sequence near line 133-136 | Only if it describes `handle_new_user` behaviour: note that it sets the starting verification status (Verified for beneficiary, MVP-only). Do not change function counts (no function added; policy count changes only after hosted introspection, so do not edit "77 policies"; add a note that the repo has 2 more policies than hosted until pushed). |
| 7 | `docs/sad-reliefchain.md` | line 191 (`handle_new_user()` creates `profiles` from signup role metadata) | Append: "and starts beneficiary profiles Verified (MVP-only)". |
| 8 | `docs/brd-reliefchain.md` | `BR-03 Beneficiary verification ✅` (line 148-150) | Add one sentence: MVP auto-verifies at registration; organization verification and re-verification evidence remain for sensitive actions. Keep the status honest (no "✅" implying manual initial verification is built). |

No UI label or in-app text is added (decision 3). Nothing in `docs/dsd-reliefchain.md`, `bpd-reliefchain.md`, or `index.md` needs a change.

---

## 8. Ordered implementation steps and verification commands

1. **Write migration A** at `supabase/migrations/20261005020000_mvp_auto_verify_new_beneficiaries.sql` from section 3. Convert to CRLF. Verify: the function body equals `20261002190000:23-104` except the two intended differences (e.g. a short node/PowerShell script that normalises CRLF, strips the header comments, and diffs the two function bodies; the diff must show only the added `verification_status` column, the added value expression, and the comment).
2. **Write migration B** at `supabase/migrations/20261006000000_beneficiary_read_discoverable_program_geography.sql` from section 4. CRLF.
3. **Write the two pgTAP files** (section 5). CRLF. Syntax-sanity only; they cannot run here.
4. **Run the PGlite replay** (section 6) in the scratch dir; capture results for all five proof points and the before/after catalog diff. Fix the NEW SQL if a proof fails; do not weaken anything to make a proof pass. If any proof can only pass by weakening an append-only, workflow, chain-evidence, or reverification object or an RLS policy, STOP and write the conflict into this file's final section, then `send_message` severity `warning`.
5. **Edit docs** (section 7), `relief-chain.md` first.
6. **Repo checks** from the repo root (Phase 1 baseline: lint exits 1 with 28 errors / 393 warnings identical to `.validation-artifacts/lint-baseline.json`; there are no source changes in this plan, so expect no change):
   - `npm run type-check` (expect exit 0, no errors).
   - `npm run lint` (expect the same 28 errors / 393 warnings baseline; no new problems).
   - `npm run test:unit` (expect the Phase 1 result: 653 tests, 647 pass, 0 fail, 6 skipped).
   - `npm run test:apply-gate` and `npm run test:program-applicability` (expect 3/3 and 8/8).
   - `supabase test db` / `npm run test:integration`: NOT runnable here (no Docker, and `20261004030000` blocks clean databases, P9). State this plainly.
7. **Line endings and stray-file checks:**
   - For each new/edited file confirm `CRLF` count equals total lines and `LF-only = 0` (re-use the one-liner pattern: read bytes, count `\r\n` versus bare `\n`).
   - `git status --short` should show only: the Phase 1 files (unchanged, still uncommitted), the two new migrations, the two new pgTAP files, and the edited docs. Remove scratch artifacts; do not commit.
8. **Final report** must list: the two filenames, proof-point results with the catalog counts, what could not be verified (pgTAP execution, hosted state, on-device QA), the likely pre-existing fixture problem (section 5), and the reminder that deploying A and B to the hosted project needs explicit approval and the `docs/build-reliefchain.md` §15 procedure (hosted `migration list --linked` first; `.env.hosted.local` only then).

---

## 9. Risks, gaps, and things not verified

- **Not verified (no Docker, no hosted access):** pgTAP execution; the hosted project's applied migration level; real device behaviour. The replay is a faithful Postgres but not Supabase itself (platform default privileges are not modelled; every privilege on the paths tested is explicit in migrations).
- **Self-selected role (P8, out of scope):** anyone can sign up with `role=beneficiary` metadata and is now auto-Verified. This is the decided MVP behaviour, but it removes the last friction for a hostile client. Flagged for the separate security change (revoke broad `UPDATE` on `profiles`, protect `role` and `verification_status`).
- **Downstream widening to expect (not bugs):** Distribute Aid and LGU lists will include new beneficiaries immediately; the backend still does not enforce `Verified` at wallet binding or disbursement (report 6.4 caveat), so auto-verify does not add risk there but also does not make it meaningful.
- **Partial rollout hazard:** if migration A is applied without B, a restricted program still looks open and fails with the raw RLS alert on submit (report interim behaviour). Apply both together.
- **Revert does not undo data:** see the migration comment; reverting the function stops future auto-verification only.
- **Pre-existing test-fixture problem** (section 5): existing pgTAP beneficiary fixtures appear to violate `profiles_beneficiary_required_fields_check`; unconfirmed, reported not fixed.
- **Assumption made:** two pgTAP files rather than one, because the two migrations are independent concerns and the repo convention is one theme per file.

# MVP auto-verify for new beneficiaries and beneficiary read of discoverable-program geography

Two additive migrations: `20261005020000` re-creates `public.handle_new_user()` so a sign-up whose server-derived role is `beneficiary` starts `Verified` (the existing `profiles_ensure_beneficiary_identity` trigger copies that into `beneficiary_identities`), and `20261006000000` adds two permissive SELECT policies on `program_barangays` and `program_areas` gated by `is_active_program AND is_program_privacy_eligible`. Two pgTAP files and doc updates across the suite accompany them. Every checklist item was verified from the diff plus the recorded evidence in `beneficiary-apply-rootcause.md` §12; nothing was re-run.

Watch for: the two pgTAP files were not executed under real pgTAP (no Docker; only a TAP shim on PGlite), confirmed and disclosed in the docs. Self-selected role (P8) plus the unlocked `profiles` UPDATE makes `Verified` a weak trust signal, confirmed, documented as URGENT and deliberately not fixed here.

**Verdict**: APPROVED

## High-level view

The auto-verify change is one function replacement. The body is identical to the `20261002190000` definition except for a `verification_status` column in the insert list and a `case when requested_role = 'beneficiary' then 'Verified' else 'Pending' end` value. The role comes from the same server-side `in ('lgu','beneficiary','merchant')` derivation as before, so org, merchant, admin and unknown-role paths still get `Pending`. The `on conflict` branch does not touch `verification_status`, so there is no backfill and no rewrite of existing rows.

The geography migration only adds policies. It reuses the predicate family of the existing discovery policy on `programs`, so draft, closed and non-invited private programs expose no coverage rows. Existing org-member policies are not altered, and the permissive policies OR with them.

Docs consistently describe auto-verify as MVP-only and simulated with no KYC, mark both migrations as not applied to hosted, and record the adjacent defects (P2/P3, P7, P8 URGENT, P9) without fixing them. The coder's verification record is complete: lint and type-check match baseline, a 51-check PGlite replay covers role scoping, no-backfill, geography visibility, trigger and policy catalog diffs, and the append-only reverification table.

<details>
<summary>Issues (3)</summary>

1. **pgTAP not executed (non-blocking, confirmed)** — run `supabase test db` where Docker is available before relying on the two new files; the build doc already says they are unexecuted.
2. **Stale "52 migrations" hosted-state statements (non-blocking, confirmed)** — left deliberately in `sad`/`sdd`/`index`/`brd`; refresh when hosted is next introspected.
3. **P8 remains open (non-blocking for this change, confirmed)** — lock down `profiles` self-update (`role`, `verification_status`) in a separate, urgent migration, and do not apply auto-verify to hosted without a decision on it.

</details>

<details>
<summary>Details</summary>

## Auto-verify is scoped to beneficiaries by a server-derived role

A line-by-line comparison of the new function against lines 23-105 of `20261002190000_add_household_size_to_profiles.sql` shows exactly the intended differences: the added column, the commented `case` value, the trailing-comma shifts those cause, and the function comment. The role still comes from `raw_user_meta_data ->> 'role'` filtered through the fixed allow-list, with `merchant` as fallback, so super_admin or unknown roles collapse to `merchant` and `Pending`. This is the pre-existing self-selection gap (P8), which the change neither widens nor narrows beyond the decided behavior. No later migration redefines `handle_new_user`; `20261002190000` was the last, so this replacement does not revert anything newer. The grep over all migrations confirms that. No grant or revoke is included, and `create or replace` preserves the ACL (the replay recorded identical ACLs before and after).

The identity row becomes `Verified` through the unchanged trigger, with `verified_at` and `verified_by` left NULL. That is legitimate: no schema constraint ties them to status, and the SQL header explains the NULL/NULL marker as heuristic, with the `created_at` cut recommended for exactness. The `on conflict` list omits `verification_status`, which keeps no-backfill true. The replay shows legacy Pending beneficiaries and merchants remain `Pending` after A.

## MVP-only comment and revert instructions

The migration header states WHY, WHAT, WHAT IT DOES NOT DO, and HOW TO REVERT (a new migration restoring the `20261002190000` body, plus optional data-reset queries kept outside the revert migration). The function comment also carries the MVP-only marker. This satisfies the requirement.

## Trigger and RLS posture

`git status` shows only new files under `supabase/` and no modified migration, so no applied migration was edited. Both new timestamps sort after the previous latest `20261005010000_*` (the directory listing sorted by name ends `…010000_merchant_manifest_presync`, `20261005020000…`, `20261006000000…`), and A precedes B. The replay's catalog diff reports triggers 91 to 91 with none removed, added or disabled, policies 108 to 110 with exactly the two new names, and `handle_new_user` as the only function whose definition changed. The append-only `beneficiary_identity_reverifications` still raises `55000` on UPDATE and DELETE, and org-verifier evidence insertion and the non-member `42501` still behave. The pgTAP files contain no `disable trigger`, `session_replication_role`, or `drop trigger`. Program activation goes through the legitimate funding sequence.

## Geography SELECT policies

The helper signatures match the migrations: `private.is_active_program(uuid)` (`20260716040100:245`) and `private.is_program_privacy_eligible(uuid, uuid)` (`20261002120000:76`), both granted to `authenticated, service_role`. Both policies use `(select auth.uid())` and are `to authenticated`, SELECT only. Replay results show that draft programs expose 0 rows, a non-invited beneficiary sees 0 rows of a private program, the phone-matched invited beneficiary sees them, authenticated INSERT is denied, `anon` is denied, and the org A/B isolation reads are unchanged. Table SELECT grants already exist from `20260716051000`, so no grant is needed, as the migration notes. Like the `programs` discovery policy, any authenticated role can read the coverage of discoverable programs, which is documented.

## Client files and UI

The Phase 1 client files (`find-organization.tsx`, `organization-program-*.tsx`, `verification-required-banner.tsx`, `apply-gate.test.mjs`, `package.json`) have last-write times of 06:21-06:22, before the plan (06:43) and the migrations (06:46). No `src/` file changed in this step, and no "Auto-verified" label or banner was added. `src/` and `package.json` show only the Phase 1 diffs.

## Documentation truthfulness

Added text calls auto-verify "simulated", "no real KYC", "MVP-only", "not switchable", and "repo only; not applied to the hosted project". The §15.0 table gets one "Pending migrations ⬜ not applied" row, and no other hosted statement changed. The flow doc rows are 🟡 for initial verification, re-verification stays ✅, and organization verification is ⬜ not functional. Build §8 records items 19 (auto-verify), 20 (P8, marked URGENT and NOT fixed, with the unverified-on-hosted caveat about `profiles_protect_role_escalation`), 21 (P2/P3), 22 (P7), 23 (P9), and 24 (pgTAP fixtures). The sprint change log adds a row without changing story status or criteria, as AGENTS.md requires. The added text contains no market sizes, prices or partners. The ~1% fee is not touched.

## Validation evidence

The recorded results are: type-check exit 0; lint 28 errors + 393 warnings, identical to `.validation-artifacts/lint-baseline.json` (the known `use-organization-programs.ts:34` error is pre-existing and untouched); unit 653 tests, 647 pass, 0 fail, 6 skipped; apply-gate 3/3; program-applicability 8/8. No `src/` file changed in this step, so no new lint or type finding is possible from it. The pgTAP assertion counts (16 and 22) match each file's `plan(n)` by count of assertion calls, and the report states the files were only run through a shim and that real pgTAP was not executed. Every file has 0 LF-only lines (CRLF kept).

</details>

<details>
<summary>File map</summary>

- `supabase/migrations/20261005020000_mvp_auto_verify_new_beneficiaries.sql` — new; replaces `handle_new_user()` with beneficiary-only `Verified`, MVP header and revert notes.
- `supabase/migrations/20261006000000_beneficiary_read_discoverable_program_geography.sql` — new; two additive SELECT policies on `program_barangays` and `program_areas`.
- `supabase/tests/database/beneficiary_auto_verification.test.sql` — new pgTAP, 16 assertions, not executed under pgTAP.
- `supabase/tests/database/beneficiary_program_geography_access.test.sql` — new pgTAP, 22 assertions, not executed under pgTAP.
- `docs/*.md` (relief-chain, prd, flow, build, sprint, brd, bpd, sad, sdd, index) — status and decision updates, build §8 items 19-24, §15.0 pending-migrations row.
- `src/**` and `package.json` diffs — Phase 1 (already reviewed APPROVED), not changed in this step.

Full diff: `git diff` plus the untracked files above.

</details>

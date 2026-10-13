# Remove verification-status gate from beneficiary Apply button

Find Organization disabled every Apply button unless `profiles.verification_status === 'Verified'`. A new account is always `Pending` and no in-app path can verify it, so new beneficiaries could never apply. The change drops the `applyDisabled` prop chain (screen, list, card) so Apply is disabled only by `program.canApply` (registration window and location), rewords the banner to informational, and adds a source-wiring test with an `npm` script. No migration, no backend change.

Watch for: (1) the co-cause in the root-cause report (beneficiaries cannot read `program_barangays` / `program_areas`, so a barangay-restricted program is labeled "Open to all locations" and fails at insert with a raw RLS error) is not addressed (likely, documented as deliberate); (2) the regression test is a source-regex check, not a behavioral test (confirmed).

**Verdict**: APPROVED

## High-level view

The primary proven root cause is a client-only gate. The diff removes exactly that gate in the three places it was threaded through and nothing else. The database already accepts a Pending applicant (replay D1 in the report), so no RLS, trigger or eligibility rule is touched and organization, merchant and donor flows are unaffected.

The geography-visibility co-cause remains. After this change, an out-of-area program still looks open and surfaces a raw RLS alert on submit. The coder documented this as interim behavior and left the additive Phase 2 migration for approval, which is consistent with the repo rule that hosted deployment needs explicit sign-off.

Verification evidence is present and consistent with the diff: targeted test red/green reasoning, type-check clean, lint identical to the recorded baseline, unit suite passing. No migration, so `supabase test db` is not applicable.

<details>
<summary>Issues (3)</summary>

1. **Geography co-cause unfixed** — a barangay-restricted program still shows "Open to all locations" and fails with a raw 42501 alert; ship the Phase 2 SELECT-policy migration (report §6.3) as a follow-up after explicit approval. Non-blocking, likely.
2. **Source-regex regression test** — `apply-gate.test.mjs` asserts text patterns in `.tsx` files, so it would pass for a differently-expressed gate; acceptable since the repo has no RN renderer harness, but a behavioral check of the card/disabled logic would be stronger. Non-blocking, confirmed.
3. **Next blocker for org side (S1)** — an approved Pending beneficiary will still not appear in Distribute Aid because no path sets `Verified`; track as a follow-up, out of scope here. Non-blocking, confirmed in report.

</details>

<details>
<summary>Details</summary>

### Scope of the gate removal against the proven root cause

The report traces the block to `find-organization.tsx:265` (`applyDisabled={!isVerified}`) flowing through `OrganizationProgramList` into `OrganizationProgramCard` as `disabled`, combined as `disabled || !program.canApply`. The diff deletes the prop at all three levels and leaves `isApplyDisabled = !program.canApply`. A grep of the beneficiary screens, components and the organization service shows no other verification-based gating on the apply path (`apply-program.tsx` has none), so no second gate remains. `isVerified` stays only to drive the banner, which is now informational and does not claim verification is required. Since the type-check passes and the props are removed from all call sites, no other consumer of the card or list is broken (the report states they are used nowhere else).

### Regression surface and security posture

No SQL, RLS, trigger or Edge Function changed, so append-only, workflow and chain-evidence triggers are untouched, no new `any`, no hardcoded theme values introduced, and no `EXPO_PUBLIC_*` or signing changes. The change adds no capability the API did not already grant, since replay D1 shows a Pending beneficiary's enrollment insert already succeeds and creates the same `new_applicant` notifications as for verified applicants. Money movement is unaffected: an application is Pending with allocation 0 and disbursement still requires organization approval. Registration window and location checks stay in force through `program.canApply`.

### Geography visibility remains an interim gap

Because `program_barangays` and `program_areas` are invisible to beneficiaries, `isLocationEligible` receives empty arrays and the card says "Open to all locations". With the gate removed, a restricted program now reaches the database, which rejects the insert with a raw RLS message. This is the more honest failure than a silently inert button, and the coder disclosed it. Whether it affects the reporter's specific program depends on data the investigation could not read (likely). The fix is an additive migration with two SELECT policies, deferred pending approval.

### Test coverage

`apply-gate.test.mjs` has three assertions (screen has no `applyDisabled=`, list has no `applyDisabled` or `disabled={`, card uses `!program.canApply` and does not reference verification). The coder recorded that the first and third fail on the HEAD source. They are brittle to refactoring, such as renaming the constant, but they do guard the exact regression. The `test:apply-gate` script is registered in `package.json`. Property tests proposed in the report were not added; the existing `test:program-applicability` (8/8) already covers the program-level rules.

Not tested: on-device behavior, the SQL path (no Docker on the machine), and Phase 2.

</details>

<details>
<summary>File map</summary>

- `src/app/(beneficiary)/find-organization.tsx` — removed `applyDisabled={!isVerified}`
- `src/components/beneficiary/FindOrganization/organization-program-list.tsx` — removed `applyDisabled` prop and forwarding
- `src/components/beneficiary/FindOrganization/organization-program-card.tsx` — removed `disabled` prop; `isApplyDisabled = !program.canApply`
- `src/components/beneficiary/FindOrganization/verification-required-banner.tsx` — informational copy and comment
- `src/components/beneficiary/FindOrganization/apply-gate.test.mjs` — new wiring tests
- `package.json` — `test:apply-gate` script

Full diff: `git diff` in the repo (uncommitted).

</details>

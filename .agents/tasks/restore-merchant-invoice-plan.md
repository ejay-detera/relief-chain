# Implementation Plan: Restore merchant "Receive payment" invoice screen

Workflow `wf_184250ee93ec9d66`. Work on the current branch, no worktree. **Do not commit, amend, or push** (AGENTS.md). PowerShell: use `;` not `&&`. Never run dev servers/watchers in the foreground. Never run `supabase db reset`, hosted scripts, or load `.env.hosted.local`. Never print secrets.

## 0. Findings from exploration (verified, not assumed)

- **The brief's investigation file does not exist.** `.agents/tasks/merchant-receive-payment-qr-2026-10-14.md` is absent (the `.agents/tasks/` directory did not exist). Everything below was re-derived from the code, git history, and docs.
- **Root cause (confirmed):** commit `f978c77` ("make food aid works", 2026-10-03) overwrote `src/app/(merchant)/receive.tsx` (252-line invoice screen) with a 480-line camera-scanner/redemption screen. The `QR Scan` item in `MerchantBottomNavigation` routes to `/(merchant)/receive`, so the merchant lands on a scanner, not an amount form. `fcb76d8` (2026-10-05) then added offline-sync to that same file. `createSignedInvoice` currently has **no caller** in `src/app`.
- **Old screen did NOT render the bottom nav.** `MerchantBottomNavigation.tsx` is byte-identical to `f978c77^` (empty diff). The old screen was a `SafeAreaView(edges: top,left,right)` with a back arrow, a "Receive payment" title, a history icon, and a `ScrollView`. "Nav bar just like before" therefore means the tab bar entry routes here; the tab bar itself is a **new addition** to this screen (decided design item 3). `MerchantNavigationActiveItem` is `'dashboard' | 'programs' | 'history' | 'profile'`, and the QR item has no active style.
- **Every restoration dependency still exists with a matching signature** (read in full): `InvoiceAmountForm({isSubmitting,onSubmit(draft)})`, `InvoiceQrCard({invoice,transport})`, `InvoiceExpiryCountdown({expiresAt,onExpired})`, `InvoiceSettlementState({state})`, `InvoiceSigningStatus({walletState,isLoading,isSigning,bindingError,onStartRecovery?})`, `SettlementCheckButton({onCheck,isChecking,disabled?,lastCheckText?,errorText?})`, `createSignedInvoice(CreateInvoiceInput)` (`invoice-service.ts:120`), `saveInvoice/getStoredInvoiceByNonce/updateInvoiceStatus` (`merchant-invoice-storage.ts`), `useMerchantWallet()` -> `{state, merchantEntityId, isLoading, error, refresh}`, `isVerifiedMerchantWallet`, `merchantWalletPublicKey`, `useMerchantSettlementCheck(merchantId)` -> `{organizationId,isResolvingOrg,isChecking,error,lastCheck,settledEvidence,checkSettlement,resetCheck}`, types `MerchantInvoiceStep`, `InvoiceSettlementState`, `MerchantInvoiceDraft`, `InvoiceTransport`, `InvoiceV1` in `@/types/invoice`, `PILOT_*` in `@/constants/pilot-disclosure`. `BorderRadius.xl === 24` (replaces the old literal `24`). `FadeInView` exists.
- **Disclosures** (`PILOT_NETWORK_LABEL`, `PILOT_NO_VALUE_LABEL`, `PILOT_ASSET_CODE`) are rendered **inside** `InvoiceAmountForm` and `InvoiceQrCard`, not in the old screen. Reusing those components keeps them; no new disclosure code needed.
- **Mojibake**: PowerShell shows `Ã¢â€šÂ±` etc. for `₱`, `…`, `·`. The files are valid UTF-8 (the read/grep tools show `₱` and `…` correctly). Do not rewrite those characters. Read files with `read_file`, not `Get-Content`, before editing. When extracting the old screen use `git show f978c77^:"src/app/(merchant)/receive.tsx"` for reference only; **write the new files by hand**, do not pipe git output into files through PowerShell (it would re-encode).
- **Baseline (recorded before any edit):**
  - `npm run type-check` -> passes (exit 0).
  - `npm run test:unit` -> passes: 651 tests, 645 pass, 0 fail, 6 skipped.
  - `npm run lint` -> **already fails**: 421 problems (28 errors, 393 warnings), exit non-zero. Pre-existing and unrelated, except 2 errors in the current `src/app/(merchant)/receive.tsx` (`react-hooks/preserve-manual-memoization`, line 70, the `merchantIdentifiers` `useMemo`). These travel with the file into `redeem.tsx` and must stay **exactly 2** there (no more, no fewer). Full JSON baseline saved at `.validation-artifacts/lint-baseline.json` (gitignored). The lint gate is therefore "no new problems vs. baseline", with the 2 receive errors relocating to `redeem.tsx`.
  - **Web static export is broken pre-change**: `expo export --platform web` bundles then crashes in static rendering (`getValueWithKeyAsync is not a function` from `expo-secure-store` under Node SSR). It cannot be a gate. **Use the Android export instead** (the repo's own `npm run test:mobile-smoke` uses it), with `--no-bytecode --no-minify` so route keys are greppable. Baseline: succeeds in ~18 s and the unminified bundle contains `(merchant)/receive.tsx` and `(merchant)/history.tsx`. After the change it must also contain `(merchant)/redeem.tsx`. This is the "both routes resolve" proof. Typed-routes file `.expo/types/router.d.ts` is not generated on export (no `merchant` entries), so new routes need the repo's `as Href` / `as never` cast.
- `scripts/validation-commands.mjs`: `unit` = `node --test scripts/tests/**/*.test.mjs` only. Tests under `src/**` run through their own npm scripts (`test:navigation-back-behavior`, etc.).
- Only one test greps `receive.tsx`: `scripts/tests/retry-payment-orphan.test.mjs:384-388`. No test greps `receive.tsx` for scanner/redemption/offline strings (searched `scripts`, `src`, `supabase/tests` for `receive`, `createSignedInvoice`, `MerchantInvoice`).
- `prepare-payment/index.ts:83-84` accepts `cash` **and** `voucher` (confirmed). Docs saying "rejects any `fundingSourceKind !== 'cash'`" are stale.
- `execute_voucher_redemption` (migration `20261004010000...sql:361`) builds `v_tx_hash := encode(gen_random_bytes(32), 'hex')`: a **random database-generated hash, not a Stellar transaction**; it also falls back to `merchant@example.com` (lines 148/193/286). A later migration `20261004020000_update_redemption_and_history.sql` redefines the function; the doc-writing coder must re-read the **latest** definition before wording the doc.
- Working tree was clean at planning time (`git status --short` empty).

## 1. Design decisions (with rationale)

1. **`redeem.tsx` = verbatim copy of current `receive.tsx`**, with only: component rename `MerchantReceiveScreen` -> `MerchantRedeemScreen`; the two `console.warn('[receive] ...')` tags -> `'[redeem] ...'`. `handleBack` has no `receive` route reference (`router.back()` else `router.replace('/(merchant)' as never)`), so no behavior change. Back from redeem returns to the receive tab because receive reaches it with `router.push`. Rationale: byte-for-byte preservation of RPC, offline-queue, and receipt logic; the 2 lint errors relocate unchanged.
2. **Thin shell for `receive.tsx`** (AGENTS.md ~150-line rule): state/logic in `src/hooks/use-merchant-invoice-flow.ts`; presentational blocks in `src/components/MerchantInvoice/`. The hook is router-free (screen owns `useRouter` and `useLocalSearchParams`, passes `nonce` in), so it is testable and keeps navigation in the route file.
3. **Nav bar:** add `'qr'` to `MerchantNavigationActiveItem`, `active === 'qr' && styles.active` on the QR item. Additive; the existing `navigation-back-behavior.test.mjs` assertions (`router.navigate` for dashboard/programs/history/profile, no `router.replace`) still hold. Screen layout mirrors `history.tsx`/`index.tsx`: nav is the last child of the screen `View`; `ScrollView` bottom padding = `insets.bottom + FloatingTabBarGap + FloatingTabBarHeight + Spacing.four`.
4. **Keyboard vs. floating nav (deviation/judgment, flagged):** `MerchantBottomNavigation` is `position:absolute` at the bottom. Android defaults to `resize`, which lifts an absolute bar above the keyboard on top of the Generate button. Decision: new tiny hook `src/hooks/use-keyboard-visible.ts` (React Native `Keyboard` events: `keyboardWillShow/Hide` on iOS, `keyboardDidShow/Hide` on Android, listeners removed on cleanup) and render the nav only when the keyboard is hidden. iOS keeps `KeyboardAvoidingView behavior="padding"` as the redeem screen does.
5. **`autoFocus` (deviation, flagged):** `InvoiceAmountForm` hard-codes `autoFocus`. On a tab with a nav bar, autofocus would raise the keyboard on arrival and hide the very nav bar the user asked for. Add an optional prop `autoFocus?: boolean` (default `true`, so any other caller is unchanged; there is no other caller today) and pass `autoFocus={false}` from the restored screen. Cost: one tap on the field. This is the only edit to a `MerchantInvoice` component's behavior.
6. **Latent bug guard (small deviation from the old code, flagged):** old `handleExpired` unconditionally set `{status:'expired'}` and wrote `'expired'` to storage. `InvoiceExpiryCountdown` fires `onExpired` immediately for an already-past `expiresAt`, so resuming a **settled** invoice by `nonce` would downgrade it to expired. The new hook returns early from `handleExpired` when the displayed settlement is `settled`. Behavior for active invoices is identical.
7. **Scanner stays reachable:** a labeled secondary action "Scan a beneficiary QR to redeem a voucher" on the receive screen -> `router.push('/(merchant)/redeem' as Href)`. Redeem is registered in the `(merchant)` Stack with the layout's existing `animation: 'none'` screenOptions (no per-screen override; consistent with the other screens).
8. **No `any`.** The old `router.replace('/(merchant)' as any)` becomes `as Href`. New routes use `as Href` (the import `type Href` already used in `MerchantBottomNavigation.tsx`).
9. **Tablet/large sizes:** content wrapper `maxWidth: MaxContentWidth`, `width:'100%'`, `alignSelf:'center'` (token from `@/constants/theme`).
10. **Light mode only**; use `Spacing`, `BorderRadius`, `FloatingTabBar*`, `MaxContentWidth`, `BrandColors`; font family strings follow the existing `PlusJakartaSans_*` pattern.

### Deviations the code forced from the DECIDED DESIGN
- Item 3 said "check whether the old screen rendered the nav": it did **not**. The nav is new to this screen, which is what makes decisions 4 and 5 necessary.
- The brief's "trust the investigation file" could not be followed (file missing); all claims were re-verified.
- Web export check replaced by Android `--no-bytecode --no-minify` export (web static export is already broken at baseline). Not a regression.
- Lint is not green at baseline, so "lint passes" is replaced with "no new problems vs. baseline".

## 2. Files

### Create
| File | Purpose |
|---|---|
| `src/app/(merchant)/redeem.tsx` | Moved scanner/redemption/offline-sync screen (decision 1) |
| `src/hooks/use-merchant-invoice-flow.ts` | All invoice state/logic (below) |
| `src/hooks/use-keyboard-visible.ts` | `useKeyboardVisible(): boolean` |
| `src/components/MerchantInvoice/InvoicePresentView.tsx` | Present-QR block |
| `src/components/MerchantInvoice/InvoiceEntryView.tsx` | Form / recovery prompt / helper text block |
| `src/components/MerchantInvoice/RedeemVoucherLink.tsx` | Secondary "Scan a beneficiary QR..." action |

### Modify
| File | Change |
|---|---|
| `src/app/(merchant)/receive.tsx` | Replace contents with the thin invoice shell |
| `src/app/(merchant)/_layout.tsx` | Add `<Stack.Screen name="redeem" />` |
| `src/components/MerchantDashboard/MerchantBottomNavigation.tsx` | `'qr'` active item |
| `src/components/MerchantInvoice/InvoiceAmountForm.tsx` | optional `autoFocus` prop |
| `src/app/(merchant)/payment-history.tsx` | empty-state copy "in the scanner" -> "on the QR Scan tab" (one string) |
| `scripts/tests/retry-payment-orphan.test.mjs` | retarget gate test + reachability test |
| `src/app/navigation-back-behavior.test.mjs` | add QR-tab/route-registration assertions |
| `docs/flow-reliefchain.md`, `docs/sprint-reliefchain.md`, `docs/sad-reliefchain.md`, `docs/relief-chain.md`, `docs/prd-reliefchain.md` (line 61 route list only) | see section 6 |

### Do NOT touch
`src/app/(beneficiary)/**`, `supabase/functions/**`, `shared/invoice-codec.ts`, `supabase/migrations/**`, `src/components/shared/qr-modal.tsx`, `app.config.js`, `src/components/MerchantRedemption/**`, `src/components/offline/**`, `src/services/merchant-redemption-service.ts`, `src/services/offline/**`, `src/hooks/use-offline-sync.ts`, `src/hooks/use-beneficiary-balance-check.ts`.

## 3. Thin-shell decomposition

### `useMerchantInvoiceFlow(nonce: string | undefined)` in `src/hooks/use-merchant-invoice-flow.ts`
Moves from the old screen without changing semantics, except decision 6:
- Internal: `useAuth()` (`userId`), `useMerchantWallet()`, `useMerchantSettlementCheck(merchantEntityId ?? null)`.
- State: `step: MerchantInvoiceStep`, `presented: {invoice: InvoiceV1; transport: InvoiceTransport} | null`, `settlement: InvoiceSettlementState`, `formError: string | null`.
- Derived (render-time, no effect): `displayedSettlement = settledEvidence ? {status:'settled', evidence} : settlement`; `settlementCheckSummary` (`Checked <at> - N confirmed, N failed.`, keep the existing format); `isReady = isVerifiedMerchantWallet(walletState)`; `canCreate = Boolean(userId && merchantEntityId && merchantWallet && isReady)`; `needsRecovery = walletState?.status === 'recovery_required'`.
- Effect: resume-by-`nonce` (`getStoredInvoiceByNonce(merchantEntityId, nonce)`, with `cancelled` flag; sets `presented`, settlement from `record.settlementEvidence` / expiry, `step='present'`). setState occurs only inside the promise callback, so the `react-hooks/set-state-in-effect` rule is not triggered (it was not triggered in the old file either).
- Actions: `createInvoice(draft)` (the old `handleSubmit`: verified-signer guard with message **"Complete wallet recovery before creating invoices. Your verified merchant signer is not ready on this device."**, `setStep('signing')`, `createSignedInvoice({userId, merchantId: merchantEntityId, merchantWallet, kind, amountStroops, category, programId, contractId, receiptDigest})`, then `void saveInvoice(merchantEntityId, {id: nonce, invoice, transport, createdAt, status:'active'})`, `resetCheck()`, `step='present'`; catch maps "disposable testnet signer" to the recovery message when `needsRecovery`), `startNewInvoice()`, `handleExpired()` (with the settled guard + `updateInvoiceStatus(merchantEntityId, nonce, 'expired')`), `checkSettlement` wrapper.
- Returns a `Readonly` object: `{ step, presented, displayedSettlement, formError, walletState, isWalletLoading, walletBindingError, canCreate, needsRecovery, settlementCheck: {disabled, errorText, isChecking, lastCheckText, onCheck}, createInvoice, startNewInvoice, handleExpired }`. `merchantId` must remain `merchantEntityId` (never the auth user id). Never sign server-side; never touch prepare/submit; never extend/reuse an invoice; "settled" only from `settledEvidence`.

### `InvoicePresentView` props
`{ presented, displayedSettlement, settlementCheck, onExpired, onNewInvoice }`. Renders, inside `FadeInView delay={40}`: `InvoiceExpiryCountdown`, `InvoiceQrCard`, `InvoiceSettlementState`, `SettlementCheckButton`, "New invoice" outline button (`BorderRadius.xl`, `accessibilityRole="button"`).

### `InvoiceEntryView` props
`{ formError, canCreate, needsRecovery, isSubmitting, onSubmit, onStartRecovery }`. Renders `formError`, then `InvoiceAmountForm autoFocus={false}` if `canCreate`; else the recovery block (text "A verified merchant signer is required before you can create invoices." + "Start wallet recovery" button) if `needsRecovery`; else the helper text only.

### `receive.tsx` (target < 100 lines)
`useRouter`, `useLocalSearchParams<{nonce?: string}>`, `useSafeAreaInsets`, `useKeyboardVisible`, `useMerchantInvoiceFlow(nonce)`. Composition: `SafeAreaView(edges top/left/right) > View > [header (back arrow with canGoBack fallback `router.replace('/(merchant)' as Href)`, title "Receive payment", history icon -> '/(merchant)/payment-history'), KeyboardAvoidingView > ScrollView(keyboardShouldPersistTaps="handled") > [InvoiceSigningStatus, step==='present' ? InvoicePresentView : InvoiceEntryView, RedeemVoucherLink], !keyboardVisible && <MerchantBottomNavigation active="qr" />]`. Recovery route: `router.push('/(merchant)/wallet-recovery' as never)`.

## 4. Callers to re-point (full grep of `src`, `scripts`, `docs`; `receive` / `merchant/receive` / `(merchant)/receive`)

| Caller | Label / intent | Decision |
|---|---|---|
| `MerchantBottomNavigation.tsx:22` (QR Scan) | open the tab | **Keep -> receive** (the invoice tab is the product intent); add active state |
| `app/(merchant)/transactions.tsx:88` | empty-state "Receive Payment" = make a payment request | **Keep -> receive** |
| `app/(merchant)/payment-history.tsx:72` | empty-state "Receive Payment" | **Keep -> receive**; fix subtitle copy at line 69 |
| `components/MerchantHistory/HistoryPaymentsTab.tsx:85` | empty-state "Receive Payment" | **Keep -> receive** |
| `components/MerchantPaymentHistory/InvoiceDetailModal.tsx:49` | "Present in Scanner" -> `{pathname:'/(merchant)/receive', params:{nonce}}` | **Keep -> receive**; this is exactly the resume-by-nonce path the restored screen implements. Label wording left alone (flag as copy follow-up) |
| `components/MerchantDashboard/MerchantOfflineSyncWidget.tsx` | no route push; mounts `useOfflineSync` on the dashboard | **No change.** Offline auto-sync keeps running from the dashboard; the sync modal also lives in `redeem.tsx` |
| `components/offline/*` | no route references | **No change** |
| `components/MerchantDashboard/ReceivePaymentCard.tsx` | no callers anywhere (orphan; copy "Scan customer QR") | **No change**, flag as follow-up |
| `app/(merchant)/index.tsx`, `history.tsx` | no scanner entry points | **No change** |
| `scripts/generate-merchant-qr-simple.mjs:37` | console hint "Tap the 'Receive Payment' tab" | **No change**, flag (tab label is "QR Scan") |
| `docs/*` | see section 6 | edit |
| Nothing else pushed to receive expecting the scanner | confirmed by grep | So **no existing caller needs to move to `/(merchant)/redeem`**; the only new caller is `RedeemVoucherLink` |

## 5. Test retargeting (`scripts/tests/retry-payment-orphan.test.mjs`)

Replace the test at lines 384-388 (keep the same name prefix) with, using the existing `readRepo`:
1. **Gate test:** read `src/hooks/use-merchant-invoice-flow.ts`; assert `/isVerifiedMerchantWallet/` and `/Complete wallet recovery/`; assert it passes `merchantId: merchantEntityId`/uses `merchantEntityId` (not `userId`) for `createSignedInvoice`. Also read `src/app/(merchant)/receive.tsx` and assert it calls `useMerchantInvoiceFlow`. (Original two regexes are preserved, only retargeted to where the logic now lives.)
2. **Reachability test:** a small helper that BFS-walks `@/...` imports starting at `src/app/(merchant)/receive.tsx` (resolving `.ts`, `.tsx`, `/index.ts(x)`), asserts `src/services/invoice-service.ts` is in the reachable set; also asserts `src/app/(merchant)/_layout.tsx` contains `name="receive"` and `name="redeem"`, and `MerchantBottomNavigation.tsx` routes `QR Scan` to `/(merchant)/receive`.
3. **Redeem preserved test:** read `src/app/(merchant)/redeem.tsx`; assert `useOfflineSync`, `executeVoucherRedemption`, `BeneficiaryScannerView`, `RC-OFF-V1:` are present, and that `receive.tsx` does **not** import `MerchantRedemption` (guards against re-collision).

`src/app/navigation-back-behavior.test.mjs`: add `router.navigate('/(merchant)/receive')` assertion for the QR item, `active === 'qr'`, and `canGoBack` in `receive.tsx` and `redeem.tsx`.

Run: `node --test scripts/tests/retry-payment-orphan.test.mjs` and `npm run test:navigation-back-behavior`, then `npm run test:unit`.

## 6. Documentation edits (same change; no invented numbers, partners, or capabilities)

- **`docs/flow-reliefchain.md`:** MR2 node (line ~69) -> "Receive: signed QR invoice (QR Scan tab, `(merchant)/receive`)"; add MR7 node "Scan and redeem a voucher (`(merchant)/redeem`), database-only" with 🟡 and a style line like MR5; D1 stays ✅ (now reachable again) with the route named; scope-matrix row 249 `receive.tsx` -> `redeem.tsx`; add scope-matrix row "Merchant scan-and-redeem (MER-01/02)" status 🟡 "database-only: `execute_voucher_redemption` writes a database-generated random hash, not a Stellar transaction; no on-chain settlement" (re-read the latest function in `20261004020000_update_redemption_and_history.sql` first); update QR invoice generation row's "Where" to include `useMerchantInvoiceFlow`. One-line gate corrections at lines ~237, ~262-264, ~277 ("prepare-payment accepts `cash` and `voucher`, `index.ts:83-84`; the client only creates cash invoices; contract deployment prerequisites unchanged, not re-verified here").
- **`docs/sprint-reliefchain.md`:** add a §8 change-log row (date = today; "Restored the merchant invoice Receive screen at `(merchant)/receive`; moved scanner/redemption to `(merchant)/redeem`; no story added, removed, or re-prioritised; no status changed"; reason: `f978c77` replaced the invoice screen, leaving merchants with no way to request a payment from a beneficiary). Update the MER-02 block text with the new route name (`(merchant)/redeem`, reached from the QR Scan tab) and an honest note that the redemption RPC produces a database-only hash, so "settles on-chain" in its fourth criterion is **not** met by that path; **do not edit the criteria text and do not change MER-02's `Done` status silently**: record in the change log that the status needs review (a drifted behavior is a defect, per AGENTS.md). Optionally correct the stale §7.2 "VOUCHERS" gate sentence with the same one-line fix.
- **`docs/sad-reliefchain.md`:** line 62 route list -> `index`, `receive`, `redeem`, `history`, `payment-history`, `profile`, `edit-profile`, `programs`, `security`, `wallet-recovery`, `transactions` (the exact `Stack.Screen` names in `_layout.tsx`); lines 170-171/267 funding-gate wording fixed in one line each.
- **`docs/prd-reliefchain.md`:** line 61 surfaces list gets the same route names (it currently lists only 5).
- **`docs/relief-chain.md`:** one sentence under "Step 6 - Redeem through an accredited merchant" (line ~320): as built, the merchant presents a signed invoice QR that the beneficiary scans and pays (cash rail, Stellar testnet); scanning a beneficiary QR is a separate, database-only redemption path. Keep it factual; do not alter the proposal-derived text.
- Other docs with the stale funding gate (`sdd` lines 84/192, `prd` 90/182/237, `brd` 170): **not** rewritten here (out of the stated scope); list them in the final report as follow-ups.

## 7. Ordered steps

- [ ] 1. **Baseline** is already recorded (section 0). Before the first edit, re-run `git status --short` (must be clean) and confirm `.validation-artifacts/lint-baseline.json` exists. Verify: `git status --short` prints nothing.
- [ ] 2. **FEAT-001: relocate the scanner to `redeem`.** Create `src/app/(merchant)/redeem.tsx` from `read_file` of the current `receive.tsx` (rename component, rename two `[receive]` log tags, nothing else); register `<Stack.Screen name="redeem" />` in `_layout.tsx`. `receive.tsx` is **not** edited yet (still the scanner), so the build stays valid.
  Files: `src/app/(merchant)/redeem.tsx`, `src/app/(merchant)/_layout.tsx`.
  Verify: `npm run type-check` passes; `Compare-Object` of the two files shows only the 3 intended line diffs; lint JSON diff shows `redeem.tsx` has exactly the 2 `preserve-manual-memoization` errors.
- [ ] 3. **FEAT-002: restore the invoice screen.** Create hook, keyboard hook, 3 components; add `autoFocus` prop; extend nav type + QR active style; overwrite `receive.tsx` with the thin shell; add `RedeemVoucherLink`; fix payment-history subtitle copy.
  Files: see section 2.
  Verify: `npm run type-check` passes; `npm run lint` diff vs baseline shows no new problems (and `receive.tsx` no longer has its 2 errors); `receive.tsx` line count < 150 (target < 100); `node --test scripts/tests/retry-payment-orphan.test.mjs` still fails/passes as expected only after FEAT-003 (the old assertions may still pass because the recovery copy now lives in the hook; do not rely on that).
- [ ] 4. **FEAT-003: tests and docs.** Section 5 and section 6.
  Verify: `node --test scripts/tests/retry-payment-orphan.test.mjs`; `npm run test:navigation-back-behavior`; `npm run test:unit` (expect 645+ pass, 0 fail, 6 skipped); `npm run type-check`.
- [ ] 5. **Final verification (checklist below)** and report.

## 8. Verification checklist

1. `npm run type-check` -> exit 0.
2. `npm run lint` -> still exit non-zero at baseline; compare `node node_modules/eslint/bin/eslint.js . --no-cache -f json -o .validation-artifacts/lint-after.json` to `lint-baseline.json`: per-file/per-rule counts must be identical except `receive.tsx` (-2) and `redeem.tsx` (+2); **zero new problems in every new or modified file**.
3. `npm run test:unit` -> 0 failures; test count >= 651 (new tests add to it); 6 skipped unchanged.
4. `npm run test:navigation-back-behavior` -> passes.
5. **Bundle/route proof:** `$env:CI='1'; node node_modules/expo/bin/cli export --platform android --no-bytecode --no-minify --output-dir .validation-artifacts/android-export-after --clear` succeeds; `Select-String` on the emitted `_expo/static/js/android/entry-*.js` finds `(merchant)/receive.tsx`, `(merchant)/redeem.tsx`, and a string unique to the new screen (e.g. `Scan a beneficiary QR to redeem a voucher`). Then delete the export directory. (Also run the repo's `npm run test:mobile-smoke` once; delete `.validation-mobile-smoke` afterwards.)
6. `Select-String` that no file in `src/app/(merchant)/receive.tsx` imports from `@/components/MerchantRedemption`, `@/components/offline`, or `@/services/offline`.
7. Manual device/emulator checks that **cannot be automated here** and must be reported as not run if skipped: type an amount and tap Generate QR Code; QR visible with nav bar at a small height (e.g. 640 dp tall) and a large size; keyboard does not cover the amount field or Generate button on Android and iOS; nav bar hides while the keyboard is open and returns after; "QR Scan" item shown active; countdown reaches 0:00 and shows expired; resume from Payment History "Present in Scanner"; beneficiary Pay/Scan decodes the QR; "Scan a beneficiary QR..." opens the scanner and back returns to the receive tab.
8. `git status --short` lists only intended files; no `.validation-*` directories remain tracked; **nothing committed**.

## 9. Gotchas for the implementer

- Typed routes: new route strings must use `as Href` (or `as never`); the export does not regenerate `.expo/types`.
- `reactCompiler: true`: do not add manual `useMemo` dependency lists that the compiler cannot preserve (that is the cause of the 2 baseline errors). Prefer plain derived values or `useCallback` with the full dependency list.
- `useMerchantSettlementCheck` is already used on the dashboard with the same `merchantEntityId`; instantiating it again in the hook is how the old screen worked and is safe.
- `InvoiceExpiryCountdown` depends on a stable `onExpired`; wrap `handleExpired` in `useCallback` with `[merchantEntityId, presented, displayedSettlement.status]`.
- `router.navigate('/(merchant)/receive')` returns to the existing stack instance, so a generated QR survives switching tabs; this is desired. The `nonce` param is only read for resume.
- `FadeInView` is mount-only; it will not replay on re-render.
- Do not use `Get-Content` output to author files (mojibake).

## 10. Out of scope / follow-ups to report (not changed)

`execute_voucher_redemption` fabricated hash and `merchant@example.com` fallback; voucher-kind invoices (cash only); camera permission copy in `app.config.js` says "scan beneficiary QR codes for voucher redemption"; beneficiary no-wallet-key recovery; `qr-modal.tsx` (dashboard "Show QR" shows the static wallet address, not a payable QR, with beneficiary-oriented copy); `ReceivePaymentCard.tsx` orphan; "Present in Scanner" label in `InvoiceDetailModal`; `scripts/generate-merchant-qr-simple.mjs` tab name; stale funding-gate wording in `sdd`/`prd`/`brd`; sprint §7.2 "OFFLINE SYNC: No code" row contradicts flow doc; pre-existing lint failures (28 errors) and the broken static web export.

# Investigation: device has no wallet key (beneficiary@example.com on a freshly installed device)

Date: 2026-10-13. Mode: read-only. Nothing was edited, committed, restarted, or reset. No secret values were read or printed (env files were only checked for existence).

## 0. UPDATE after user screenshots (supersedes the confidence levels in §8)

The screenshots confirm root cause 1; it is no longer an inference.
- The Home banner text "This device has no wallet key. Please complete wallet setup." is the `missing_signer` branch of `src/components/beneficiary/Dashboard/wallet-status-card.tsx:14`. That component renders only when `walletState.status === 'recovery_required'`.
- Profile > "Wallet & recovery" shows "Action needed – Complete the required checks to start rotation". That is `rotationStatusFromWalletState` (`src/utils/wallet-rotation-status.ts:48-61`), `recovery_required` with `canStartRotation === true`. It means a verified active `wallets` row exists for this user and the device has no matching secret.
- The 1,050.00 RCPHP "reconciled 9/29/2026" comes from the DB table `beneficiary_balance_projection` (`src/hooks/use-beneficiary-balances.ts:~162`). It is not read from the chain. The live Horizon balance is skipped because the wallet is not `ready`.

**Bottom line for the demo user:** the 3 "checks" cannot be completed by the user in the app today. See §10 for why, with exact code paths. The practical options are in §10.8.

## 1. Summary answer

**Most likely root cause (high confidence from code, not yet observed on the device):** the demo account `beneficiary@example.com` already has an ACTIVE, VERIFIED `wallets` row. `scripts/seed-merchant-demo.mjs` bound it to the public key derived from `STELLAR_BENEFICIARY_SECRET` (a server-side bootstrap secret). That private key was never on any phone. On a new device or reinstall, the app's SecureStore slot is empty and a DB binding exists. The wallet core deliberately refuses to auto-generate a key in that case and returns `recovery_required / missing_signer`. The UI text is "Your wallet key isn't on this device."

**Auto-generation does exist, but only when no active verified wallet row exists for the user.** That is the case for a freshly registered beneficiary, not for the seeded demo account.

**For the seeded account there is no supported in-app way to fix this:**
- The beneficiary `wallet-recovery` screen is read-only. It has no "generate replacement" button, unlike the merchant screen.
- No Edge Function exposes beneficiary rotation. `request_wallet_rotation` exists as a DB RPC with no caller in `src/` or `supabase/functions/`.
- Importing the seeded key into the device is not possible. The app has no import path, and `adb` cannot write into the app's Keystore-backed SecureStore.

**`adb` is not the missing piece.**
- `adb` is not installed or on PATH on this Windows machine, so I could not inspect the device. See §2.
- Even with `adb`, it cannot create a wallet key. Against the hosted project, `adb reverse` is not needed at all (`docs/SETUP.md` §5).

**Secondary possibility to rule out:** this workspace has no `.env`. Metro logged `env:load files: []` and the warning "Supabase is not configured". If the installed build was made from this checkout (or without EAS env vars), it silently targets `https://placeholder.supabase.co`. In that case login cannot work. The hook would also throw at the `wallets` query before the key logic runs, so no key would ever be created. Because the user is logged in as `beneficiary@example.com`, the installed build must have a working Supabase URL, so this is unlikely for that build. It still matters for any rebuild.

**Recommended minimal path, no code change, no secrets in chat:** sign in with a brand-new beneficiary account that has no wallet row (§8, Option A). The app auto-creates the key on the dashboard and "Activate wallet" provisions it.

## 2. Q1: adb and device (could not be verified)

- `Get-Command adb`, `where.exe adb`, and searches of `%LOCALAPPDATA%\Android\Sdk`, `ANDROID_HOME`, `ANDROID_SDK_ROOT`, `C:\Android`, Program Files, and `C:\Users\gab` (depth 6) found no `adb.exe`. `ANDROID_HOME` and `ANDROID_SDK_ROOT` are unset. Only Java 17 and Node 25.8.2 were found.
- Result: **adb not found; no device list; app install state, debug vs release build, and `run-as` possibility are all UNVERIFIED.** `.expo/devices.json` is `{"devices": []}`.
- Package id: `com.reliefchain.app` (`app.config.js:android.package`).
- Build type hint: `eas.json` profile `development` uses `developmentClient: true` with `:app:assembleDebug`. `demo` and `preview` are release-type APKs. No `android/` or `ios/` folder exists locally (both are gitignored output).
- To check on the user's side, once adb exists (see `docs/SETUP.md` §5 for the PATH setup):
  - `adb devices -l`
  - `adb shell pm list packages com.reliefchain.app`
  - `adb shell dumpsys package com.reliefchain.app | Select-String "versionName|flags|DEBUGGABLE"`
  - Do not pull app data.

## 3. Q2: how and when the key is generated and persisted

Code path: `usePilotWallet` (`src/hooks/use-pilot-wallet.ts`) → `loadOrProvisionPilotWallet` (`src/services/stellar-wallet-service.ts:55`) → `resolvePilotWallet` (`src/services/stellar-wallet-service-core.ts:59`).

Storage:
- The namespace is `stellar:testnet:<userId>:seed:v1` (core `:22-28`). The SecureStore key replaces `:` with `.` (core `:30-32`).
- Options are `keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY` (service `:25-27`).
- On Android, expo-secure-store keeps the value in Android Keystore-encrypted storage inside the app's private data. It is not cloud-synced. It is wiped on uninstall or "clear data". I did not verify the exact Android backup behavior.

**When the key is generated.** Generation is automatic and silent. It happens inside `resolvePilotWallet` (core `:96-107`) when all of these hold:
1. A user session exists (`userId` from `useAuth`).
2. The `wallets` query for `purpose='beneficiary', network='stellar_testnet', is_active, verification_status='verified'` succeeds (hook `:70-86`).
3. That query returns no row.
4. SecureStore is available.
5. The slot is empty.

It does not require opening a provisioning screen. It runs whenever any component mounts `usePilotWallet`, for example the beneficiary dashboard (`src/app/(beneficiary)/index.tsx:39`). The result is `binding_required` with `wasProvisioned: true`.

Conditions that produce "no wallet / no usable key" (all in `stellar-wallet-service-core.ts` unless noted):

| # | Condition | Result | Location |
|---|---|---|---|
| 1 | No session (`userId` null) | `state = null`, nothing generated | `use-pilot-wallet.ts:60-66` |
| 2 | Supabase misconfigured (placeholder URL) or `wallets` query errors | Throws before the core runs; `state = null`, `error` set, no key generated | `use-pilot-wallet.ts:70-98`; `src/lib/supabase.ts:17-27` |
| 3 | `userId` has characters outside `[A-Za-z0-9._-]` | Throws `TypeError` (inside the hook's try/catch) | core `:22-26` |
| 4 | Active row malformed (not testnet, not active, bad G-address) | `unavailable: invalid_wallet_binding` | core `:66-70` |
| 5 | `SecureStore.isAvailableAsync()` false (web build, or no native module) | `unavailable: secure_storage_unavailable` | core `:73-75`; `node_modules/expo-secure-store/build/SecureStore.js:55-57` |
| 6 | Any SecureStore throw (Keystore error, locked device, etc.) | `unavailable: secure_storage_error` | core `:135-137` |
| 7 | **Slot empty AND an active DB wallet exists** (new device, reinstall, cleared data, different user id) | `recovery_required: missing_signer`, **no key generated** | core `:77-91` (comment `:78-86`) |
| 8 | Slot holds a non-Stellar-seed string | `recovery_required: invalid_signer` | core `:111-114` |
| 9 | Local key derives a different address than the DB row | `recovery_required: signer_mismatch` | core `:128-133` |

Also relevant:
- The UUID namespace is per user id. A different login on the same phone has its own slot.
- `WHEN_UNLOCKED_THIS_DEVICE_ONLY` has no cloud sync, so **a new device legitimately starts with no key**.
- Only `binding_required` (no DB row) triggers key creation. When a DB row exists, `missing_signer` is intentional. The code comment says silently generating a replacement would orphan funds already issued to the old address.
- **Unreachable when a row exists:** the `ActivateWalletCard` appears only when `walletState?.status === 'binding_required'` (`src/app/(beneficiary)/index.tsx:112`), and the card then drives `use-wallet-provision.ts`.

## 4. Q3: screens and tap paths per role

**Beneficiary**
- The key is created on dashboard mount by `usePilotWallet`, only if no active verified wallet row exists. No tap is needed.
- Then the dashboard shows `ActivateWalletCard` ("Activate your wallet" → "Activate wallet" button). It runs `useWalletProvision`: `prepare-wallet-provision` → device signs `changeTrust` with the SecureStore key → `submit-wallet-provision` → server inserts the verified `wallets` row.
- Server preconditions:
  - `prepare-wallet-provision` needs only a valid G-address and a JWT. It does not check the user's wallets row, and it Friendbot-funds an unknown account.
  - `submit-wallet-provision` requires a `beneficiary_identities` row for the caller (`submit-wallet-provision/index.ts`, "No beneficiary identity is linked to this account"). It does NOT check enrollment approval or MFA. It checks the signed XDR is exactly the sponsored trustline.
- A DB trigger creates the `beneficiary_identities` row when a beneficiary profile is created (`20260716010000_add_beneficiary_identities_and_campaign_deduplication.sql`, around `:111-114`).
- `Profile → "Wallet & recovery"` (`(beneficiary)/profile.tsx`, route `(beneficiary)/wallet-recovery.tsx`) shows status only. In `recovery_required` it lists "Your wallet key isn't on this device" plus prerequisites: re-verify identity, recent step-up, replace wallet. **It has no action button.** `pay-scan.tsx:150` also routes to it.
- Rotation prerequisites (DB, `20260716130000_add_wallet_rotation_intents.sql`; client `wallet-custody-core.ts:192-224`):
  - A current active verified wallet.
  - A proof-verified, inactive replacement wallet for the same identity.
  - A fresh identity re-verification, recorded by a beneficiary verifier role via `record_beneficiary_identity_reverification`, under 24h old.
  - AAL2 step-up under 10 minutes old.
  - **No Edge Function or UI is wired to start it.** Grep of `src/`, `supabase/functions/` and `scripts/` found `request_wallet_rotation` and `issue_wallet_proof_challenge` only in type/contract files. The 13 deployed functions contain no rotation entry point. `flow-reliefchain.md` line 220 marks "Wallet rotation + recovery" as ✅. Treat that as overstated for the beneficiary role (see §9).

**Merchant**
- `useMerchantWallet` (`src/hooks/use-merchant-wallet.ts`) calls the same core. It first requires a `merchant_entities` row for the profile (`:79-85`), otherwise it throws and no key is created.
- Recovery UI: `Profile → Wallet and recovery settings` (`(merchant)/profile.tsx:79`) or the prompt card on `receive.tsx:454` → `(merchant)/wallet-recovery.tsx` → `MerchantRotationPanel`.
  - Tap "generate replacement" (`generateAndStoreReplacementMerchantSigner`), then provision. `submit-merchant-provision` supersedes the old active row.
  - This is the supported "get a new key onto the device" path, for merchants only.

**LGU / organization**
- No device-signed wallet. Org treasury wallets are server-held, seeded by `seed-merchant-demo.mjs`. No provisioning UI exists for them.

## 5. Q4: existing supported ways to get a funded, usable testnet wallet on a device

| Method | Gets a key onto the phone? | Needs adb? | Notes |
|---|---|---|---|
| New beneficiary registration or login (no wallet row) → dashboard auto-key → "Activate wallet" | **Yes** | No | Sponsor pays the reserve; Friendbot funds the account (`prepare-wallet-provision`) |
| Merchant `wallet-recovery` replace flow | Yes (merchant only) | No | Supersedes the old row |
| `scripts/invoke-provision.mjs` | **No.** It generates the keypair inside the script process (simulated phone) | No | Local stack default. Creates a throwaway `provision-bene-<id>@example.test` user |
| `scripts/seed-merchant-demo.mjs` | No. Binds the seeded account to the server-side `STELLAR_BENEFICIARY_SECRET` | No | This is why the demo beneficiary has a wallet row without a device key |
| `scripts/provision-wallet.mjs`, `attach-wallet.mjs`, `seed-with-wallets.mjs` | No | No | Operator-side. `attach-wallet.mjs` has a hardcoded user id and inserts a random wallet; `seed-with-wallets.mjs` attaches wallet addresses without secrets |
| Friendbot | Funds an account, not a key | No | Used by `prepare-wallet-provision` |

adb is needed only for the local stack: `adb reverse tcp:8081 tcp:8081` and `adb reverse tcp:54321 tcp:54321`, plus installing a dev build. It is not needed against the hosted demo project.

Demo accounts (names only; seeded by `seed-merchant-demo.mjs`, with a documented password in `docs/build-reliefchain.md` §11):
- LGU/org admin: `admin@example.com`
- Beneficiary: `beneficiary@example.com`
- Merchant: `merchant@example.com`
- Super admin: `superadmin@reliefchain.app` (created by a migration)

Other seed scripts use conflicting addresses (`beneficary@example.com`, `admin@merchant.com`). Known issue 17.

State of `beneficiary@example.com`, from code and docs, not from querying the hosted DB:
- Verified identity.
- Approved enrollment ('Approved', Cash, allocation 10,000,000,000 stroops).
- ACTIVE verified `beneficiary_identity` wallet row bound to the `STELLAR_BENEFICIARY_SECRET` address (`seed-merchant-demo.mjs:296-315`).
- Hosted row counts after seeding: `wallets=3` (build doc §11).
- Hosted state was **not queried** here, because `.env.hosted.local` is absent.

## 6. Q5: what the installed app points at

- Config source: `process.env.EXPO_PUBLIC_SUPABASE_URL` and `_ANON_KEY`, inlined at bundle time (`src/lib/supabase.ts:10-27`). `app.config.js` also copies these into `extra`.
- Fallback: `https://placeholder.supabase.co` with only a `console.warn` when the URL or key is missing or is the `.env.example` sample (`supabase.ts:17`, `:26-27`).
- This workspace has **no** `.env`, `.env.local`, `.env.hosted.local`, `.env.bootstrap.local`, or `supabase/functions/.env`. `scripts/seed-info.json` (non-secret ids only) is present. `.env`, `.env*.local` are gitignored.
- `.expo/dev/logs/start.log`: Metro logged `env:load ... files: []` on every start and "Supabase is not configured" in the web console.
- The installed app's real target is **unverifiable from here**. It depends on where it was built (local `.env`, EAS env vars, or a prior build), and an installed APK's URL is fixed at build time.
- A placeholder target would explain "no key" because the `wallets` query would fail first. It would also make login fail. The user says login worked, which weakens this explanation for the installed build.

## 7. Q6: runtime evidence

- `.expo/dev/logs/start.log` covers 2026-10-09 21:16 to 23:29 (+08:00) and is **web platform only** (247 bundling events, all `platform: web`, none for android). Today is 2026-10-13, so it predates the device test.
- Notable lines:
  - "Supabase is not configured" (repeated).
  - `[beneficiary-balance-cache] Failed to cache balance: ExpoSecureStore.default.setValueWithKeyAsync is not a function`. That is the web SecureStore shim, so it applies to the web run, not the phone.
  - Several `[pay-scan sources]` logs show `unavailableReason: null` during an earlier web session.
- `adb logcat` could not be run (adb missing). **No Android runtime evidence exists.**

## 8. Q7 and Q8: ranked causes, remaining unknowns, and the plan

**Ranked root causes**
1. **(Most likely, about 85%)** Existing DB binding with no local signer on a new device: `recovery_required / missing_signer` (§3 row 7). Evidence: the seed script binds the beneficiary to a server-side secret; `resolvePilotWallet` core `:77-91`; the read-only beneficiary recovery screen; RLS lets the beneficiary read their own row (`20260717123300_fix_infinite_recursion.sql` wallets select policy), so the app does see the row.
2. **(About 10%)** Build targets a placeholder or wrong Supabase, or the query fails, so the hook never reaches the key logic (§3 row 2). Evidence: no `.env`; `env:load files: []`; the web warnings. Weakened by the fact that login works.
3. **(About 5%)** `SecureStore` unavailable or erroring on the device (§3 rows 5 and 6). Android Keystore issues are rare.

**What would confirm it, with no secrets**
- Open Profile → "Wallet & recovery". Cause 1 shows "Your wallet key isn't on this device." Cause 3 shows "Secure storage is unavailable on this device right now." Cause 2 shows a loading or empty state or an error on the dashboard.
- Set up adb, then `adb logcat -d -t 300` filtered to `ReactNativeJS`, and look for the Supabase warning.

**Not verified**
- Whether adb sees the device, the app's install state, and the build type.
- The installed build's Supabase target.
- The live hosted `wallets` rows for this user.
- Whether `.env.bootstrap.local` (the only copy of `STELLAR_BENEFICIARY_SECRET`) exists on another machine. It is absent here.
- Whether a new registration's sign-in routing requires application review before reaching the dashboard (not traced).

**Plan: get a working wallet key on the device (user steps, PowerShell, no secrets in chat)**

Option A (recommended, no code, no DB writes beyond normal sign-up):
1. Confirm the build points at the hosted project. For a fresh build, create `.env` from `.env.example` with the hosted project URL host `hmbraapdnkoxpepdqgaa.supabase.co`, the anon key, and the RCPHP issuer/SAC public ids from `docs/build-reliefchain.md` §8 item 15 (the new pair). Run `npm run check:release-env` before building. Do not reuse the old issuer/SAC. Put no secrets in `EXPO_PUBLIC_*`. Skip this step if the installed build already logs in.
2. On the phone, sign out of `beneficiary@example.com`.
3. Register a new beneficiary account in the app and sign in. The profile trigger creates the `beneficiary_identities` row. The app has no wallet row for it.
4. Open the beneficiary Home tab. The key is auto-created in SecureStore on first mount, and the "Activate your wallet" card appears.
5. Tap "Activate wallet". The server Friendbot-funds the account, builds the sponsored trustline, the device signs it, and the server authorizes it and inserts the verified row. The card turns into "Wallet activated".
6. Verify under Profile → "Wallet & recovery" (should say no rotation needed). Optionally check `https://horizon-testnet.stellar.org/accounts/<public key>` for an authorized RCPHP trustline.
7. Caveat: a fresh account has no program enrollment or allocation. Features that need entitlements (My Assistance, vouchers, pay-scan) still require an LGU to approve it into a program. `beneficiary@example.com` already has this seeded. This is the cost of Option A.

Option B (keeps `beneficiary@example.com` and its seeded enrollment; needs operator approval, hosted data write):
- Neither the app nor an Edge Function can rebind a verified row.
- The trigger `wallets_protect_verified_binding` blocks address, status and proof changes, but allows supersession, which is the documented intent ("supersede it instead").
- An operator could deactivate the old row (`is_active=false`, `superseded_at/by`) through a reviewed SQL statement, using the hosted DB credentials loaded from `.env.hosted.local` via `. .\scripts\load-hosted-env.ps1`. After that the app would auto-generate a key and the card would provision it.
- Effects and risks:
  - The seeded wallet's on-chain RCPHP and its entitlement/allocation linkage are orphaned, because nothing migrates them.
  - Whether the supersession columns need other constraints satisfied was not checked.
  - This is a hosted-DB write. Ask for explicit confirmation first and never run `supabase db reset --linked`.
- I recommend Option A unless the seeded enrollment is required.

Option C (not recommended): importing the seeded key (`STELLAR_BENEFICIARY_SECRET`) into the phone. There is no import path, SecureStore cannot be written by adb, and doing it would push a server-held secret to a device and likely into chat or shell history.

**Code changes that look warranted (described only, not made)**
1. Add a beneficiary "Replace wallet on this device" action to `(beneficiary)/wallet-recovery.tsx`, mirroring `MerchantRotationPanel`. It would sit behind an Edge Function that wraps `request_wallet_rotation` and requires re-verification and step-up. It must never sign for the user, must keep the prepare/submit split, and must be idempotent. This is a feature, not a quick fix, and needs a clarifying round (see AGENTS.md).
2. In `src/lib/supabase.ts`, make a missing URL fail loudly in the UI (a blocking banner) instead of a console-only warning. Docs already list this risk.
3. Update `docs/flow-reliefchain.md:220` so the beneficiary row says the recovery UI is status-only and no rotation entry point exists. This follows the rule "never document as working what isn't".

**Rule check (AGENTS.md)**
- Every step above is testnet-only, with device-side signing and no server-side signing for users.
- No `EXPO_PUBLIC_*` secret is involved.
- Option B and any DB write touch the hosted demo project, so they need explicit approval.
- Do not run any seed script without first confirming the target. Scripts default to the local stack.
- Never paste seeds, service-role keys, or DB passwords into chat. Load them with `scripts/load-hosted-env.ps1` and reference them by key name.

## 9. Docs drift noticed (informational)
- `docs/flow-reliefchain.md:220` marks beneficiary "Wallet rotation + recovery" as ✅, but the shipped UI is read-only and no rotation Edge Function is deployed.
- `docs/SETUP.md:40` says "the Android SDK is installed", but no `adb` exists on this machine's PATH or in the default SDK locations.

## 10. Beneficiary rotation/recovery deep-dive (added after screenshots)

### 10.1 What the screen is, exactly

Tap path to the screen:
1. Bottom tab bar, "Profile" tab (`src/app/(beneficiary)/profile.tsx`).
2. The row titled "Wallet & recovery" (the `Pressable` at `profile.tsx:~95` that calls `router.push('/(beneficiary)/wallet-recovery')`).
3. Route `src/app/(beneficiary)/wallet-recovery.tsx` (hidden from the tab bar with `href: null` in `_layout.tsx`).

What it contains:
- The "Wallet status" card (`WalletRotationStatusCard`), using the label "Action needed" for `prerequisites_required` (`WalletRotationStatusCard.tsx:17`).
- A "Test device authentication" button (`BiometricFallbackNote`). It only runs a no-op fingerprint/passcode check through `requestPaymentApproval` in `src/utils/biometric-auth.ts`. It is NOT the "step-up" that rotation requires, signs nothing, and changes no state.
- Three static `RecoveryDisclosureCard`s.

**There is no button anywhere on this screen that starts a rotation, re-verifies identity, or generates a key.** The 4 bullet points are produced by one pure function: `rotationStatusFromWalletState` (`wallet-rotation-status.ts:45-61`). It lists constants (`REVERIFY_IDENTITY`, `RECENT_STEP_UP`, `REPLACE_WALLET`) and checks nothing against the server. Showing them as bullets does not mean the server found them unsatisfied. They are a static checklist for the `recovery_required` + `canStartRotation` case.

### 10.2 The rotation backend, end to end (what exists and what is wired)

| Step | Where | Who may call it | Wired to the app or a deployed Edge Function? |
|---|---|---|---|
| Create a replacement wallet row in `challenge_issued` | RPC `issue_wallet_proof_challenge` (`20260716130000_add_wallet_rotation_intents.sql`) | `service_role` only (grants at the end of the file) | **No.** No Edge Function or script calls it. Only referenced in `database.types.ts` and `scripts/schema-types-contract.mjs` |
| Verify the replacement key signed the challenge | `signPilotWalletProofChallenge` (`stellar-wallet-service.ts:93`) on the device; server side `verifyReplacementWalletRotationProof` (`supabase/functions/_shared/wallet-rotation.ts:53`) | Device + server library | `signPilotWalletProofChallenge` has no caller in `src/`. The `_shared` library is imported by no `index.ts` |
| Mark the replacement `verified` (inactive) | RPC `complete_wallet_proof` | `service_role` only | **No** caller. Same as above |
| Record identity re-verification | RPC `record_beneficiary_identity_reverification` | `service_role` only; inside it `p_verified_by` must hold role `organization_administrator` or `beneficiary_verifier` in the org, and the beneficiary must have an enrollment in one of that org's programs | **No** caller anywhere in `src/`, `supabase/functions/`, or `scripts/` |
| Request the rotation | RPC `request_wallet_rotation` | `authenticated` (the only grant to app users) | **No** caller in the app. Preconditions in §10.3 |
| Prepare and sign the on-chain authorization | `prepareWalletRotation` / `verifyRotationAuthorizationSubmission` (`src/services/wallet-rotation-core.ts`) via `_shared/wallet-rotation.ts` | Library | **Not imported by any of the 13 deployed Edge Functions** (the 13 folders under `supabase/functions` include no `prepare-wallet-rotation` or `submit-wallet-rotation`) |
| Confirm and swap the active wallet | RPC `transition_wallet_rotation_intent(...,'confirmed')` | `service_role` only | **No** caller. Via the DB it deactivates the old row, sets `superseded_*`, and activates the replacement atomically |
| Move voucher entitlements to the new key | `rotate_entitlement` (contract `contracts/voucher/src/lib.rs:635`, admin-authorized) via `supabase/functions/_shared/stellar/voucher-administration.ts` | Contract admin | **No Edge Function imports `voucher-administration.ts`** |

Consequence: the beneficiary rotation exists as DB RPCs, a verified-pure TypeScript core with tests, and Rust contract logic. **None of it has a deployed or client entry point.** `docs/flow-reliefchain.md:220` marks it ✅; that overstates the as-built state for the beneficiary role (the merchant role does have a real path via `prepare/submit-merchant-provision`).

### 10.3 The three checks, how each would be satisfied, and what actually blocks the demo user

**Check 1 "Your wallet key isn't on this device"** (the cause).
- Needs a keypair on the device whose public key either equals the current row (impossible, since the old secret is server-side in `.env.bootstrap.local` and the app has no import) or is a registered replacement wallet.
- No beneficiary UI exists to generate one. The only generator for an existing binding is `generateAndStoreReplacementMerchantSigner` (`stellar-wallet-service.ts:75`). It is merchant-labelled but keyed only by user id, and is called from `MerchantRotationPanel` only.

**Check 2 "Re-verify your identity".**
- It is not self-service. The DB records it via `record_beneficiary_identity_reverification` (`:301`), `service_role` only, with `p_verified_by` required to be an active `organization_administrator` or `beneficiary_verifier` of the org that owns one of the beneficiary's enrollment programs. The evidence is a 64-hex digest plus a method string, and expiry within 24h.
- For the demo user, `admin@example.com` holds `organization_administrator` (`seed-merchant-demo.mjs:~224`) and the beneficiary has an Approved enrollment in that org's program (`:~296`), so the DB precondition could be met.
- There is no LGU screen that records it. A human with DB/service-role access must call the RPC (SQL or a script). `request_wallet_rotation` then requires the re-verification to be under 24h old, unexpired, and in the same organization (`validate_wallet_rotation_intent`, around `:60-75` and `:118-125`).

**Check 3 "Complete a recent step-up authentication".**
- Meaning: the caller's JWT must be `aal: aal2` and have a TOTP/OTP/WebAuthn `amr` entry with a timestamp inside 10 minutes. This is `private.has_recent_step_up` and `private.require_sensitive_action('wallet_rotation', 10 minutes)`, both called by `request_wallet_rotation`. The same check applies client-side in `assessWalletRotationPrerequisites` (`wallet-custody-core.ts:219-222`).
- Factor: TOTP authenticator app (`src/services/mfa-service.ts`, `mfa.enroll` with `factorType: 'totp'`, then `mfa.challenge`/`verify`).
- **A beneficiary has no UI to enroll or verify TOTP.** `MfaSecurityPanel` is mounted only in `(lgu)/security.tsx` and `(merchant)/security.tsx`. There is no beneficiary Security screen (beneficiary route list in `src/app`).
- Local `supabase/config.toml` has `[auth.mfa.totp] enroll_enabled = false` and `verify_enabled = false`. Whether TOTP is enabled on the hosted project is a dashboard setting and was not verifiable here.

**Check 4 "Replace the lost wallet with a new one"** (the action itself). No UI, as covered above. In addition, `request_wallet_rotation` needs a pre-existing `verified`, inactive replacement wallet row (`validate_wallet_rotation_intent` on INSERT), which only the `service_role`-only `issue_wallet_proof_challenge` + `complete_wallet_proof` can create.

Conclusion: even if the user did everything the screen asks, they could not, because Check 2 and the wallet-row creation need an operator, and Check 3 lacks a beneficiary TOTP UI.

### 10.4 Do the 1,050 RCPHP and entitlements migrate?

- The 1,050.00 figure is the DB projection `beneficiary_balance_projection`, scoped by organization, program, and beneficiary identity (unique key in `20260716121000_add_stale_aware_financial_projections.sql`), and is reconciled from ledger events. It is not tied to a wallet row, so a wallet swap in the database would not by itself change the number shown.
- What rotation moves, by design: `planConfirmedRotationEffects` (`wallet-rotation-core.ts:~294-322`) swaps the active wallet row and lists `entitlementMigrations`. In the contract, `rotate_entitlement` repoints voucher entitlements from `old_wallet` to `new_wallet` and leaves the daily-spend counter untouched. It does not transfer any token balance.
- Spendable cash RCPHP is held on-chain by the old Stellar account (the one derived from the server-side beneficiary secret). **Nothing in the rotation core transfers cash from the old address to the new one.** After a rotation, cash payments signed by the device (`signPreparedCashTransaction`, which requires the local key to equal the payer wallet) would use the new, empty-of-RCPHP wallet. I did not verify on-chain balances, so how much of the 1,050 is voucher entitlements vs. cash at the old address is unknown.
- The programme's seeded allocation is 'Cash', 10,000,000,000 stroops (`seed-merchant-demo.mjs:~296`). The 1,050 figure does not equal this, so other disbursements happened. Unverified.

### 10.5 Known blockers and bugs found

1. **No beneficiary entry point for rotation** (§10.2). Highest impact.
2. **No beneficiary MFA UI** (§10.3). `request_wallet_rotation` can never succeed for a beneficiary session as shipped.
3. **`recovery_required` with a status-only screen** gives users no action. The "Action needed" label implies an action exists.
4. **`submit-wallet-provision` cannot rebind.** If the user were to reach the Activate flow with a new key while the old row is active, it would call insert and hit `wallets_one_active_owner_purpose_idx` (one active wallet per owner/purpose/network), which would fail with "provisioned on-chain but could not be bound". Also, it would already have Friendbot-funded and trustlined the new address. The app does not let the user get there (the card shows only in `binding_required`).
5. **Auto-heal policies are stale.** `20260718000100_wallet_update_policy.sql` ("dev wallet auto-healing") allows owners to UPDATE their wallet rows, but `wallets_protect_verified_binding` (restored by `20260925090000`) blocks changes to the address of verified rows and the restrictive policy "Wallet changes require recent AAL2" gates updates. It cannot be used to repoint the demo wallet.
6. **Doc overstatement:** `flow-reliefchain.md:220` (§9 above).
7. **Environment unknowns:** `.env.bootstrap.local` (the only copy of `STELLAR_BENEFICIARY_SECRET` and the other signers) is not in this workspace; `.env.hosted.local` is not either. Any operator route needs them on whichever machine has them.

### 10.6 Could existing scripts re-provision this demo user instead?

| Script | Re-provisions `beneficiary@example.com`'s phone? | Why |
|---|---|---|
| `invoke-provision.mjs` | No | Creates a brand-new throwaway user `provision-bene-<id>@example.test` and generates the key in-process. It never touches the demo account or a phone |
| `seed-merchant-demo.mjs` | No, and risky | It re-binds the account to the server-side `STELLAR_BENEFICIARY_SECRET` address; the seed also inserts a new org/program each run (the seed does not delete older rows). Not a way to put a key on a phone |
| `seed-with-wallets.mjs`, `attach-wallet.mjs` | No | They insert wallet rows without secrets (`attach-wallet.mjs` hardcodes a user id and a random wallet, so it would also hit the one-active-wallet index). Not on the verified path |
| `provision-wallet.mjs` | No | Generates a throwaway wallet or takes `WALLET_SECRET`; provisions on-chain only |
| `invoke-payment.mjs` | Partial (PC-side demo only) | Signs as the beneficiary using the server-side secret, sign-in as the seeded user. This is the supported way to exercise the seeded beneficiary's funds today, from a terminal, not from the phone |
| `manual-disburse-to-beneficiary.mjs` | No | Operator disbursement using the org treasury and beneficiary secret |

No script puts a key into the phone's SecureStore, and no script was written to supersede a beneficiary wallet row. All of them default to the local stack unless the hosted env is loaded (AGENTS.md).

### 10.7 Env/network notes for any operator step
- Hosted-only operator credentials load via `. .\scripts\load-hosted-env.ps1`. It loads only `SUPABASE_DB_PASSWORD`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` and `SUPABASE_DB_URL` (names only printed). It does NOT load the Stellar signer seeds; those are in `.env.bootstrap.local`.
- Use `node .\scripts\verify-hosted-schema.mjs` to confirm the target is hosted before any write.
- adb: still not found on this machine; not needed for any of the options below.

### 10.8 Options, ranked, with the exact steps (nothing was executed)

**Option A (fastest, zero risk to the seeded data): use a fresh beneficiary account on this phone.** Same as §8 Option A. The seeded account stays untouched; `1,050 RCPHP` stays with `beneficiary@example.com`. Limitation: the new account has no program/entitlement/cash balance.
- Taps: Sign out (Profile) → Register as beneficiary → sign in → Home tab: the "Activate your wallet" card appears → "Activate wallet".
- Follow-up: an LGU (`admin@example.com`) can then approve the new account into the demo program.

**Option B (keeps `beneficiary@example.com`, requires an operator and your approval): supersede the old wallet row, then let the phone auto-provision.**
1. Operator confirms the target with `node .\scripts\verify-hosted-schema.mjs`.
2. Operator runs one reviewed SQL statement as service role against `public.wallets` for that identity's active row, with `is_active=false`, `superseded_by_wallet_id=<a new row id>`, `superseded_at=now()`, `superseded_by=<admin user id>`. The table's check `wallets_supersession_state_check` requires all three superseded columns together and `not is_active`. `superseded_by_wallet_id` has a foreign key to a real `wallets` row, so a placeholder replacement row must exist first, and it cannot be created through the existing RPCs without the proof flow. This makes the SQL non-trivial, and I did not verify a working sequence.
3. On the phone: pull-to-refresh Home. With no active row, `usePilotWallet` auto-creates the key and shows "Activate wallet"; tap it. `submit-wallet-provision` inserts the new active row.
- Effects: the seeded wallet's 1,050 RCPHP cash stays at the old address and becomes unreachable from the app (the app signs only with the local key), and voucher entitlements stay bound to the old key in the contract unless `rotate_entitlement` is run by the contract admin. It is a hosted-DB write; needs explicit approval. Never `db reset --linked`.

**Option C (full intended flow, needs new code and operator actions): complete the real rotation.** Operator calls `issue_wallet_proof_challenge` → phone signs → `complete_wallet_proof` → `record_beneficiary_identity_reverification` (by `admin@example.com`) → beneficiary TOTP step-up → `request_wallet_rotation` → on-chain authorization → `transition_wallet_rotation_intent('confirmed')` + `rotate_entitlement`. Steps 1, 2, 4 and 6-8 have no endpoint today. Requires the code in §10.9.

**Option D (use the seeded funds without a phone key):** drive the demo from the PC with `invoke-payment.mjs` (it signs as the beneficiary with the server-side secret). The phone then shows balances but cannot sign.

Recommendation: A to get a working wallet and key on the phone now; D if the demo needs the seeded 1,050 RCPHP flows; B only if the user must stay on `beneficiary@example.com`, after accepting the orphaning of the old wallet. C is a feature.

### 10.9 Code changes warranted (describe only)
1. Beneficiary rotation Edge Functions (e.g. `prepare-wallet-rotation` / `submit-wallet-rotation`) wrapping `_shared/wallet-rotation.ts`, `issue_wallet_proof_challenge`/`complete_wallet_proof`, `request_wallet_rotation`, and an admin-authorized `rotate_entitlement`. Keep the prepare/submit split and idempotency; never sign for the user; return an unsigned package.
2. A beneficiary "Replace wallet on this device" panel on `(beneficiary)/wallet-recovery.tsx` modelled on `MerchantRotationPanel`; reuse `signPilotWalletProofChallenge`.
3. A beneficiary Security screen reusing `MfaSecurityPanel`, plus confirmation that TOTP is enabled on the hosted project (local `config.toml` has it disabled).
4. An LGU action to record identity re-verification (calls `record_beneficiary_identity_reverification` through an Edge Function with role and step-up checks).
5. Decide and document what happens to cash RCPHP held at the old address (not moved by rotation as designed).
6. Fix `docs/flow-reliefchain.md:220` until the above exist.
These are scope changes. Per AGENTS.md they need a plan and clarifying questions before any implementation.

### 10.10 Rule check
- All options keep Stellar testnet only, device-side signing, and no secret in `EXPO_PUBLIC_*`, and none involves pasting a secret into chat.
- Options B and C write to the hosted DB: ask first.
- Do not weaken `wallets_protect_verified_binding` to make Option B easier.

# Investigation: merchant "Receive payment" QR page missing (merchant cannot receive payment from a beneficiary)

Date: 2026-10-14. Mode: read-only. Nothing was edited, committed, restarted, or reset. Repo HEAD `206386c` (main). `git status` shows only untracked `.agents/tasks/`, `docs/demo/`, `tools/`; no tracked source file is modified. No secret values were read.

## 1. Summary answer

**The merchant half of the documented "Receive payment" flow (merchant enters an amount, the app signs an invoice and shows a QR, the beneficiary scans it in Pay/Scan and pays) no longer has any UI. The user report is correct.**

- The merchant "QR Scan" tab does exist and is reachable. It routes to `src/app/(merchant)/receive.tsx`, but that file is now only a **camera scanner plus voucher-redemption form**. It does not show a QR and cannot create an invoice.
- The beneficiary Pay/Scan screen (`src/app/(beneficiary)/pay-scan.tsx`) only accepts `reliefchain:invoice:v1:` QR codes. It rejects every other QR as "not a Relief Chain invoice".
- Nothing in the merchant app can produce such a QR. So the beneficiary can never pay the merchant through Pay/Scan.
- Root cause is in git history. Commit `f978c77` ("make food aid works", 2026-10-03) replaced the 252-line invoice version of `receive.tsx` with the scanner/redemption version. Commit `fcb76d8` (2026-10-05) then added offline sync to the scanner version.
- The invoice building blocks were left behind with no callers: `src/components/MerchantInvoice/*`, `createSignedInvoice`, `saveInvoice`, `ReceivePaymentCard`, and the `payment-history` route.
- Docs still say this flow is built (`flow-reliefchain.md` MR2 and D1 are ✅, and so are PRD US-04/US-05 and BRD BR-09). That is false for the merchant half.

**Confidence.**
- High (by reading code, git history, and grepping callers) that the invoice-QR display UI is absent from every merchant route.
- High that `receive.tsx` is reachable and is scanner-only.
- Not verified at runtime: nothing was run on a device or emulator. I did not observe what the user sees, whether the camera opens, or whether the hosted database has the redemption migrations (see §10).

**A second, bigger finding.** The scanner path that does exist (merchant scans beneficiary QR, then `execute_voucher_redemption`) is a **database-only bookkeeping RPC**.
- It generates a random 32-byte hex string as the "transaction hash" and never touches Stellar.
- No device signs anything, and the beneficiary never approves.
- Yet the receipt labels it "Blockchain Evidence" / "Stellar Tx Hash".
- Sprint MER-02 is marked Done although its criteria ("process a Stellar blockchain transaction", "Payment Received once it settles on-chain") are not met by this path.

**Two docs disagree on who shows the QR.** `relief-chain.md` and sprint MER-02 say the merchant scans a beneficiary QR. BRD, PRD, SDD, and the flow doc say the merchant issues a signed invoice and the beneficiary scans it. Both halves exist in code, and neither completes end-to-end on-chain. This needs a product decision (§9) before implementation.

## 2. Q1 — What the docs say (and where they conflict)

| Source | Direction | Evidence |
|---|---|---|
| `docs/relief-chain.md` (declared source of truth) | **Merchant scans beneficiary QR** | Line 37 "Merchant scans a beneficiary QR code, validates the voucher, confirms the transaction, receives settlement…"; line 56 (workflow step 6); lines 319-322 (Step 6) and the sentence "The source does not state whether the QR code identifies a person, account, voucher, claim, or signed transaction"; line 394 "Beneficiaries … present QR credentials for redemption"; line 471 `expo-camera`, `react-native-qrcode-svg` for "Beneficiary and voucher QR generation/scanning for merchant redemption" |
| `docs/sprint-reliefchain.md` MER-02 (lines 315-322) | **Merchant scans beneficiary QR** | "scan a beneficiary's QR code and process a Stellar blockchain transaction"; criteria include a receipt and a "Payment Received" notification once the transaction settles on-chain. Status **Done** |
| `docs/brd-reliefchain.md` BR-09 (line 173) | **Merchant issues signed invoice; beneficiary scans** | "Merchant issues a signed invoice; beneficiary scans and approves biometrically…" ✅ |
| `docs/prd-reliefchain.md` US-04 (lines ~136-145), US-05, §5 "Program to redemption" step 5 | **Merchant issues signed invoice; beneficiary scans** | US-04: "scan a merchant QR code and approve payment" ✅. §5 step 5: "Merchant issues a signed QR invoice" |
| `docs/sdd-reliefchain.md` lines 29-31, 144-147 | **Merchant creates signed invoice; beneficiary scans** | Table: "Invoice (merchant) … Signed invoice creation and QR display"; sequence: "M->>DB: create signed invoice", "B->>B: scan QR, decode via shared/invoice-codec" |
| `docs/flow-reliefchain.md` lines 69, 112, 189-190, 222, 262 | **Merchant signed invoice; beneficiary scans** | MR2 "✅ Receive — signed QR invoice"; D1 "✅ Merchant signed QR invoice"; row 222 "QR invoice generation ✅ `MerchantInvoice/InvoiceQrCard.tsx`"; row 249 says offline sync built via `receive.tsx` |
| `docs/sad-reliefchain.md` line 63 | n/a (route list) | `(merchant)` Stack lists only `index, receive, profile, programs, security`; it is stale (the layout has 10 screens) |

**Conflicts to resolve in `docs/relief-chain.md` first (per AGENTS.md):**
1. Scan direction: `relief-chain.md` and MER-02 versus BRD/PRD/SDD/flow.
2. Flow doc line ~262-265 says `prepare-payment` rejects anything except cash ("Only cash funding source is supported in MVP."). The code at `supabase/functions/prepare-payment/index.ts:83-84` accepts `cash` and `voucher` and returns "Only cash and voucher funding sources are supported."
3. Sprint changelog entry 2026-10-03 (line 449) claims a "dual-mode redemption hub on Merchant QR Scan tab". `receive.tsx` has a single mode (scanner then redemption form).
4. Sprint §7.2 (line ~423) says OFFLINE SYNC has "No code". `flow-reliefchain.md` row 249 says "Built". Code under `src/services/offline/` exists (added in `fcb76d8`).

## 3. Q2 — Merchant routing, screens, components

**Role routing (verified by reading).**
- `src/utils/auth-routing.ts:8-18` maps `merchant` to group `(merchant)` and home `/(merchant)`.
- `src/app/_layout.tsx:80-84` redirects to `getRoleHome(profile.role)` when the current group does not match the role. The `hasRedirectedRef` guard prevents loops.
- There is no merchant-specific gate, feature flag, or role check on the individual merchant routes.
- `src/app/(merchant)/_layout.tsx` is a plain `Stack` (`animation: 'none'`, `headerShown: false`) listing 10 screens. There is no `Tabs` navigator for merchants. The "tab bar" is a component, `MerchantBottomNavigation`, rendered by individual screens.

**Bottom navigation** (`src/components/MerchantDashboard/MerchantBottomNavigation.tsx`):
- Dashboard → `/(merchant)`
- Programs → `/(merchant)/programs`
- **QR Scan → `/(merchant)/receive`** (line 22; the label is "QR Scan", with no "Receive" wording)
- History → `/(merchant)/history`
- Profile → `/(merchant)/profile`

It is rendered by `index`, `programs`, `history`, and `profile` only. `receive.tsx` is full-screen and does not render it. `MerchantNavigationActiveItem` (line 8) has no `'qr'` value.

## 4. Q3 — Existing merchant files and reachability

| File / symbol | Purpose | Reachable from merchant UI? | Notes |
|---|---|---|---|
| `src/app/(merchant)/index.tsx` | Dashboard | Yes (home) | Header "Show QR" opens `QrModal` with the merchant's static G-address (see §6). No receive/invoice action. `ReceivePaymentCard` is not used here |
| `src/app/(merchant)/receive.tsx` (~480 lines) | Camera scanner → beneficiary lookup → redemption form → receipt | **Yes**: bottom nav "QR Scan" (nav line 22) | Scanner/redemption only. Layout registration `_layout.tsx:6`. Violates the ~150-line rule |
| `src/components/MerchantRedemption/{BeneficiaryScannerView,BeneficiaryBalanceCard,RedemptionAmountForm,RedemptionReceiptModal}.tsx` | Scanner and redemption UI | Yes, via `receive.tsx` | Used by `receive.tsx` only |
| `src/components/offline/{OfflineBanner,SyncStatusModal}.tsx`, `MerchantDashboard/MerchantOfflineSyncWidget.tsx` | Offline sync UI | Yes | Used by `receive.tsx` and the dashboard |
| `src/app/(merchant)/payment-history.tsx` | Invoice history list (reads local SecureStore invoices) | **No inbound link.** Registered in `_layout.tsx:13`, but no `router.push` to it exists. The only caller was the old `receive.tsx` header button | Orphaned route. Its empty-state button pushes to `/(merchant)/receive` |
| `src/components/MerchantPaymentHistory/InvoiceDetailModal.tsx` (line 48-52, 110-112) | "Present in Scanner" pushes `/(merchant)/receive` with `params: { nonce }` | Only reachable from `payment-history` (orphaned) | Current `receive.tsx` ignores `nonce` (the old version resumed the invoice from storage) |
| `src/app/(merchant)/transactions.tsx` | Older transaction list | No inbound link found | Empty state pushes to `receive` |
| `src/app/(merchant)/history.tsx` + `MerchantHistory/*` | MER-03 history | Yes (nav, dashboard "View all") | `HistoryPaymentsTab.tsx:84-88` empty-state button pushes to `receive` |
| `src/components/MerchantInvoice/InvoiceAmountForm.tsx` | Amount entry, "Generate QR Code" (always `kind: 'cash'`) | **No** (no importer after `f978c77`) | Uses `stroopsFromDecimalInput`, `PILOT_*` disclosure constants |
| `.../InvoiceQrCard.tsx`, `InvoiceExpiryCountdown.tsx`, `InvoiceSettlementState.tsx`, `InvoiceSigningStatus.tsx` | Present/expiry/settlement/signer status | **No** | Fully built; no importer |
| `.../SettlementCheckButton.tsx` | Authorized settlement check | Only via `MerchantDashboard/SettlementSyncCard.tsx`, which itself has no importer | Orphaned. The dashboard calls `checkSettlement()` directly from `useMerchantSettlementCheck` |
| `.../PendingPaymentItem.tsx` + `src/hooks/use-pending-payments.ts` | Pending payments | No | Orphaned (the removed screen had a comment "Pending payments UI removed") |
| `src/components/MerchantDashboard/ReceivePaymentCard.tsx` | "Receive Payment / Scan customer QR" dashboard card | **No importer** | Copy says "Scan customer QR" and hints "Opens the customer payment QR scanner" |
| `src/services/invoice-service.ts` `createSignedInvoice` | Build and sign invoice, encode QR transport | **No caller** in `src/` | Only the removed screen called it |
| `src/services/merchant-invoice-storage.ts` `saveInvoice`, `getStoredInvoiceByNonce` | Local invoice store | `saveInvoice` has no caller; `getStoredInvoices` is read by `use-merchant-transactions.ts` and `use-merchant-invoice-history.ts` | The invoice store is never populated by any current flow |
| `src/components/shared/qr-modal.tsx` | Displays a static public key as QR | Yes (merchant dashboard header, beneficiary "Show my QR") | Copy "Your Payment QR / Present this to merchants to receive aid or redeem vouchers" is beneficiary-oriented, but it is also used on the merchant dashboard |

**Why the invoice flow is unreachable, exactly:** there is no screen that calls `createSignedInvoice`. This is not a missing tab entry, a hidden route, a role gate, a feature flag, or a broken import. It is a deleted screen. Git: `f978c77` rewrote `src/app/(merchant)/receive.tsx` (480 lines changed); the parent version `f978c77^:src/app/(merchant)/receive.tsx` is the invoice screen (252 lines). That version used `useMerchantWallet`, `createSignedInvoice`, `saveInvoice`, `InvoiceAmountForm`, `InvoiceQrCard`, `InvoiceExpiryCountdown`, `InvoiceSettlementState`, `SettlementCheckButton`, and `useMerchantSettlementCheck`. It is a ready blueprint.

**A fossil test:** `scripts/tests/retry-payment-orphan.test.mjs:384-388` ("merchant receive keeps the verified-signer creation gate") only greps `receive.tsx` for the strings `isVerifiedMerchantWallet` and `Complete wallet recovery`. It still passes against the scanner version (the strings exist there), so it does not detect that invoice creation is gone. I did not run it.

## 5. Q4 — Beneficiary side and the QR/payment contract as it exists

### 5a. Beneficiary → pays a merchant (invoice flow, two-phase, device-signed)

- Screen: `src/app/(beneficiary)/pay-scan.tsx` (a tab, "Pay/Scan"). It uses `ScannerView` (`src/components/beneficiary/PayScan/ScannerView.tsx`, `expo-camera`).
- Parse: `decodeAndVerifyScannedInvoice` in `src/services/invoice-scan-service.ts` calls `decodeAndVerifyInvoiceQr` from `shared/invoice-codec.ts`.
  - It checks the schema, network, asset, merchant Ed25519 signature, and expiry, and fails closed.
  - Static wallet addresses and identity QRs map to `malformed_payload`: "This QR is not a Relief Chain invoice. Static wallet addresses and identity codes cannot be paid."
- Wire format (`shared/invoice-codec.ts`):
  - Inline: `reliefchain:invoice:v1:<base64url(canonical JSON)>` (`INVOICE_QR_PREFIX`).
  - Reference fallback: `reliefchain:invoice:v1:ref:<base64url>`, used when the inline QR exceeds `MAX_INLINE_QR_CHARS = 1200`. It needs connectivity to resolve.
  - Expiry: exactly 10 minutes (`INVOICE_TTL_SECONDS = 600`).
- `InvoiceV1` (`src/types/invoice.ts`): `version 1`, `asset` (RCPHP, issuer, SAC, network), `merchantId` (the `merchant_entities.id`, not the display name), `settlementWallet`, `invoiceSigner`, `amountStroops`, a 32-byte hex `nonce`, `issuedAt`, `expiresAt`, `merchantSignature`, optional `receiptDigest`, and `kind: 'cash' | 'voucher'` (voucher adds `category`, `programId`, `contractId`). No PII.
- Hook and services: `usePaymentIntent` (`src/hooks/use-payment-intent.ts`) → `preparePayment` (Edge Function `prepare-payment`) → unsigned signing package → biometric approval (`utils/biometric-auth.ts`) → the device signs → `submitPayment` (`submit-payment`) → `observePayment` / `retryPayment` (`src/services/payment-service.ts`).
- `prepare-payment` checks the invoice signature, the beneficiary's identity, enrollment, verified active wallet, the merchant's accreditation, and that the settlement wallet matches the merchant's verified wallet. It accepts `fundingSourceKind` `cash` or `voucher`, and is idempotent via an invoice-bound key (`isReplay`).
- Gate on the beneficiary device: `pay-scan.tsx:150-155, 224` requires `isVerifiedPilotWallet(walletState)` to authorize payments.

### 5b. Beneficiary → shows a QR to the merchant (redemption flow)

- Beneficiary dashboard "Show my QR" (`quick-action-grid.tsx:27`) opens `QrModal` with the beneficiary's **static Stellar public key** (`(beneficiary)/index.tsx:77,166`).
- My Assistance → voucher card → `VoucherQrModal` (`src/components/beneficiary/MyAssistance/voucher-qr-modal.tsx:53-61`) encodes a JSON payload: `{ type: 'reliefchain:voucher', version: 1, programId, enrollmentId, beneficiaryWallet, programName, category, … }`.
- `extractVoucherTarget` (`src/services/merchant-redemption-service.ts:114-186`) accepts: a raw G-address, `reliefchain:beneficiary|wallet:<G…|uuid>`, the JSON above, or a raw UUID. `receive.tsx:106-113` additionally accepts the offline envelope `RC-OFF-V1:<base64 JSON>` (`src/services/offline/qr-transport.ts`).
- None of these payloads is signed by the beneficiary. The QR is a bearer identifier.

### 5c. Merchant redemption RPC (what the current "QR Scan" screen calls)

- Lookup: RPC `check_beneficiary_balance_for_merchant`.
- Redeem: `executeVoucherRedemption` calls RPC `execute_voucher_redemption` (latest definition `supabase/migrations/20261004020000_update_redemption_and_history.sql:228-452`).
- What the RPC does:
  - Checks accreditation, finds the enrollment, and reads the balance.
  - Sets `v_tx_hash := encode(extensions.gen_random_bytes(32), 'hex')`. This is a **random value, not a Stellar hash**.
  - Updates `enrollments.voucher_balance` and `beneficiary_balance_projection`, inserts `public.redemptions` and `merchant_metrics`, and returns the random hash.
- What it does **not** do: use `prepare`/`submit`, involve a device signature or a Horizon submit, require beneficiary consent, or write ledger evidence.
- The receipt (`RedemptionReceiptModal.tsx:41,134-139`) shows it as "Blockchain Evidence" / "Stellar Tx Hash".
- Accreditation fallback inside the RPC: it also accepts the hardcoded name `'merchant@example.com'`, and accepts any merchant when a program's `selected_merchants` is empty (lines ~78-97 of the quoted range).

### 5d. Is there a merchant-side service for creating a payment request?

Yes, and it is complete. `createSignedInvoice` (`src/services/invoice-service.ts:116-128`), `signMerchantInvoice` (`src/services/stellar-wallet-service.ts:130`), `buildUnsignedInvoice`, `encodeInvoiceForTransport`, and `merchant-invoice-storage.ts`. Settlement is observed via `useMerchantSettlementCheck` → `reconcile-stellar` and the reconciler-owned DB evidence, never from the invoke response alone. No new Edge Function is needed for the merchant half.

## 6. Merchant dashboard "Show QR" is not a payable QR

`MerchantDashboardHeader` "Show QR code" → `QrModal` with the merchant's G-address (`(merchant)/index.tsx:184`). If a beneficiary scans it in Pay/Scan, the G-address is 56 characters, which is above `MIN_PLAUSIBLE_QR_LENGTH` (`INVOICE_QR_PREFIX.length + 32` = 55, `ScannerView.tsx:20`). By reading, it is therefore decoded and rejected with the "not a Relief Chain invoice" message. Not run on a device. This is probably what the user hits when testing: the only QR a merchant can show cannot be paid.

## 7. Q5 — QR dependencies and camera permission

- `package.json`: `expo-camera ~57.0.1`, `react-native-qrcode-svg ^6.3.21` (caret range; it was already in the repo), `react-native-svg 15.15.4`, `expo-local-authentication ~57.0.1`, `expo-secure-store ~57.0.0`. No new dependency is needed.
- `app.config.js`: Android permission `android.permission.CAMERA` (line ~30) plus the `expo-camera` plugin (line ~58) with `cameraPermission: 'Relief Chain uses your camera to scan beneficiary QR codes for voucher redemption.'`. The text is merchant-redemption-specific; the beneficiary Pay/Scan uses the same permission. Its wording may want a small update if the app scans invoices too. A change to this plugin string needs a native rebuild.
- Use in the app: scanning in `PayScan/ScannerView.tsx` and `MerchantRedemption/BeneficiaryScannerView.tsx` (`CameraView`, `useCameraPermissions`, `barcodeTypes: ['qr']`). Rendering via `QRCode` in `shared/qr-modal.tsx`, `MerchantInvoice/InvoiceQrCard.tsx`, `MerchantPaymentHistory/InvoiceDetailModal.tsx`, `Mfa/MfaEnrollmentModal.tsx`, and `voucher-qr-modal.tsx`. The invoice QR renderer, `InvoiceQrCard`, exists (220 px).

## 8. Q6 — Sprint and flow status versus reality

- No sprint story describes the merchant invoice / "Receive payment" capability. `docs/sprint-reliefchain.md` has no match for "invoice" or "Receive payment" (checked by search).
- MER-02 (lines 314-322) is **Done**. It covers the scanner and the "process a Stellar blockchain transaction" criteria.
  - Met by reading: scan to identify the beneficiary and balance (criterion 1), the amount limited by balance/category (criterion 2), and a receipt (criterion 3).
  - **Not met**: the story text "process a Stellar blockchain transaction" and criterion 4 ("Payment Received" once it settles on-chain). The RPC fabricates the hash, no chain transaction exists, and no on-chain settlement is observed. I did not verify whether a "Payment Received" notification is sent in some other way.
  - So MER-02 is Done only in the DB-bookkeeping sense.
- MER-01 (lines 304-312) Done: the online half is plausibly implemented. The offline half depends on the offline sync.
- `flow-reliefchain.md`: MR2 ✅ "Receive — signed QR invoice" and D1 ✅ are **not true for the UI** (the library exists; the screen was removed). Row 249 "Bluetooth & Offline sync ✅ Built (dual transport + queue + RPC)" mentions BLE: `src/services/offline/ble-transport.ts` exists; I did not verify that it is wired.
- The redemption RPC path is not listed in the flow doc as a simulated or DB-only path. AGENTS.md says "Keep simulated or gated behavior labeled".

## 9. Q7 — Interaction with `device-no-wallet-key-2026-10-13.md`

I read the first ~266 lines (§1-§10.3) of that report. I did not read its remainder.

- Invoice creation needs `isVerifiedMerchantWallet(walletState)` (`state.status === 'ready'`, `use-merchant-wallet.ts`), because `signMerchantInvoice` fails if the SecureStore key does not match `invoiceSigner`. The old screen gated on this and showed "Start wallet recovery".
- A seeded `merchant@example.com` on a fresh device is `recovery_required / missing_signer`. The supported fix is in-app: `(merchant)/wallet-recovery.tsx` → `MerchantRotationPanel` → generate replacement → `prepare/submit-merchant-provision` (per that report §4). The merchant side is therefore recoverable.
- The **beneficiary** side cannot yet be recovered in-app. For the seeded `beneficiary@example.com` on a new device, `pay-scan.tsx` will show "This device has no signer…" and disable authorization (`canAuthorize={isSignerReady}`). An end-to-end invoice test needs a beneficiary whose key is on the device. Either use the original device or a new beneficiary account that is enrolled and funded (its Option A).
- The current redemption screen also gates the form on `isReady` (`receive.tsx:132, 354`) even though the RPC never signs. This would block the scanner-flow demo for a merchant in `recovery_required` for no technical reason.
- The report's remark that `receive.tsx:454` shows the recovery prompt matches the current file only roughly (the prompt card is in the redemption form).

## 10. What I could not verify

- Any runtime behavior: I did not run the app, a device, or an emulator. I cannot confirm what the user saw when the QR Scan tab opened (scanner, permission screen, or error).
- Whether the hosted Supabase project has the redemption migrations. `AGENTS.md` records 52 migrations on hosted as of 2026-09-24. The repo now has **89** migration files, including 35 dated after 2026-09-25 (e.g. `20261004020000_update_redemption_and_history.sql`, `20261005000000_offline_sync_engine.sql`). I did not query hosted state. If they were not pushed, `check_beneficiary_balance_for_merchant` / `execute_voucher_redemption` would fail on the hosted demo, and the scanner would show errors.
- Whether the user means "the QR Scan page has no receive mode" (my reading) or something else (see Q5 in §12).
- I did not run `npm run lint`, `type-check`, or `test:unit`.

## 11. Proposed minimal implementation plan (do not implement until the §12 answers arrive)

Assumes **Option C from Q1** (keep the scanner, add an invoice "Request payment" mode). Changes if the user picks Option A (invoice only) or B (scanner only) are noted at the end.

### Reuse (no new services, hooks, or types)
`createSignedInvoice`, `merchant-invoice-storage`, `useMerchantWallet` (`isVerifiedMerchantWallet`, `merchantWalletPublicKey`), `useMerchantSettlementCheck`, the `MerchantInvoice/*` components, `FadeInView`, tokens from `src/constants/theme.ts`, `PILOT_*` constants, types in `src/types/invoice.ts` and `merchant-payment-history.ts`. No Edge Function or schema change is needed for the merchant half.

### Files and changes

1. **Create `src/hooks/use-merchant-invoice-flow.ts`**. Extract the state and logic of the old screen (`git show f978c77^:src/app/(merchant)/receive.tsx`): `step`, `presented`, `settlement`, `formError`, `handleSubmit` (calls `createSignedInvoice`, then `saveInvoice`), `startNewInvoice`, `handleExpired` (`updateInvoiceStatus(…, 'expired')`), optional resume by `nonce`, and `useMerchantSettlementCheck`. The hook receives `{ userId, merchantEntityId, walletState }`. Keep the verified-signer gate (`isVerifiedMerchantWallet`) and the recovery message. Add a unit test next to it if it contains pure helpers.
2. **Create `src/app/(merchant)/request-payment.tsx`** (thin shell, under 150 lines): header, `InvoiceSigningStatus`, then either `InvoiceAmountForm` or the present block (`InvoiceExpiryCountdown`, `InvoiceQrCard`, `InvoiceSettlementState`, `SettlementCheckButton`, "New invoice"). Put the present block in a new `src/components/MerchantInvoice/InvoicePresentView.tsx` to stay small. A new route is preferred over editing `receive.tsx` because `receive.tsx` is already ~480 lines and carries the offline queue and redemption logic, so a rewrite would put them at risk.
3. **Modify `src/app/(merchant)/_layout.tsx`**: add `<Stack.Screen name="request-payment" />`. No Tabs config is involved (Stack).
4. **Modify entry points** (the final choice depends on Q2):
   - `src/components/MerchantRedemption/BeneficiaryScannerView.tsx` (or the `receive.tsx` scanner wrapper): add a visible "Request payment (show QR)" control. This keeps the "QR Scan" tab as the one merchant entry point. If the control is placed in `BeneficiaryScannerView`, that component is used only by `receive.tsx`, so the blast radius is small.
   - and/or `src/app/(merchant)/index.tsx`: render the already-built, currently unused `ReceivePaymentCard`. Its copy ("Scan customer QR") must be updated to say what it opens.
   - Re-point the empty-state buttons (`HistoryPaymentsTab.tsx:84`, `transactions.tsx:87`, `payment-history.tsx:72`) and `InvoiceDetailModal.tsx:48-52` (which pushes `receive` with `nonce`) to `request-payment`, passing `nonce`. Optionally re-link `payment-history` from History (decision pending, Q6).
5. **Fix the misleading merchant "Show QR"**: the merchant dashboard reuses `shared/qr-modal.tsx`, whose copy is for beneficiaries. Either pass title/subtitle props (default values keep the beneficiary usage unchanged) or label it "Settlement wallet address (not payable by scan)". This touches a **shared component** used by both roles, so keep the props optional and the defaults unchanged.
6. **Tests**:
   - Replace the weak source-grep test (`scripts/tests/retry-payment-orphan.test.mjs:384-388`) with a reachability check. For example: the file that calls `createSignedInvoice` is registered in `(merchant)/_layout.tsx` and linked from `MerchantBottomNavigation` or the scanner. Retarget it; do not weaken it.
   - Keep the existing codec tests (`shared/` fixtures) unchanged.
7. **Not in the minimum scope** (flagged for review, since AGENTS.md says to flag out-of-scope changes): the `execute_voucher_redemption` fabricated hash, its hardcoded `'merchant@example.com'` accreditation fallback, and the `isReady` gate on the redemption form. See Q4.

### Gotchas
- **Shared components**: `qr-modal.tsx` (both roles), `MerchantBottomNavigation` (4 screens; `active` type has no `'qr'`), `FadeInView`. Changing prop contracts affects the beneficiary dashboard.
- **Layout**: `receive.tsx` scanner is `flex: 1`, black, no SafeArea. The new screen should use the old white `SafeAreaView` layout. `InvoiceQrCard` is 220 px; a ~1200-character payload is dense, so keep a white quiet zone. Verify scannability on a real device at low brightness.
- **Typed routes**: existing code uses `as never` / `as Href` for new merchant routes; follow that pattern.
- **Identity**: `merchantId` in the invoice must be `merchant_entities.id` (from `useMerchantWallet().merchantEntityId`), not the auth user id. `prepare-payment` resolves accreditation from it.
- **Signer readiness**: invoice creation needs a `ready` signer; the old UI offered "Start wallet recovery". Keep it.
- **Expiry and replay**: invoices live 10 minutes and carry a one-time nonce; do not add reuse or extension. "Settled" must come only from reconciler evidence (existing `useMerchantSettlementCheck`), never optimistically.
- **Invoice kind**: `InvoiceAmountForm` hard-codes `kind: 'cash'`. Voucher invoices need `programId`, `contractId`, `category` from `VoucherInvoiceProgramOption` (the type exists; no hook produces it). Cash-only is the minimum.
- **Labels**: keep `PILOT_NETWORK_LABEL` / `PILOT_NO_VALUE_LABEL` (testnet, no monetary value) on the amount form and QR screen. Light mode only, tokens only, no hardcoded spacing.
- **Constraints respected**: testnet only; the device signs (no server signing); the existing prepare/submit split and idempotency are not touched; no dependency changes; no new Edge Function; the beneficiary pay path is not modified.
- **Camera permission string** (`app.config.js`) is redemption-specific. Changing it needs a native rebuild; leave it unless the copy is a problem.
- **Mojibake**: some orphaned files (e.g. `InvoiceAmountForm.tsx`, `InvoiceSigningStatus.tsx`) showed garbled `₱`/`…` when printed through PowerShell `Get-Content`. This is probably a console-encoding artifact; verify the file bytes with the editor before touching them.

### Docs to update in the same change (AGENTS.md "Keeping Documentation True")
1. `docs/relief-chain.md`: record the product decision on the QR direction (§2 conflict 1). Do this first.
2. `docs/flow-reliefchain.md`: MR2 / D1 / row 222 (set to the true status until shipped, then ✅); row 249 and the `receive.tsx` reference; mark the redemption RPC path as DB-only or simulated; correct the "cash-only gate" box (lines ~262-265) to match `prepare-payment`.
3. `docs/sprint-reliefchain.md`: MER-02 (status versus the on-chain criteria), add a story and acceptance criteria for the invoice capability if the user approves (record in the §8 change log with a reason), and fix §7.2 OFFLINE SYNC "No code".
4. `docs/prd-reliefchain.md` (US-04/US-05, §5), `docs/brd-reliefchain.md` (BR-09), `docs/sdd-reliefchain.md` (lines 29-31), and `docs/sad-reliefchain.md` line 63 (route list: add `request-payment`, `history`, `payment-history`, `wallet-recovery`, `edit-profile`, `transactions`).
5. `docs/build-reliefchain.md`: add a known issue if the redemption RPC remains DB-only.

### How to test
- Static: `npm run lint` (zero warnings), `npm run type-check`, `npm run test:unit`. Add or adjust the reachability test (item 6).
- Manual, two devices (or one device plus emulator), against the hosted demo project (confirm the target first; scripts default to local):
  1. Merchant with a `ready` signer opens QR Scan, then Request payment, enters an amount, and sees the QR, a 10-minute countdown, and "awaiting scan".
  2. Beneficiary (signer on device, enrolled and funded) opens Pay/Scan, scans the QR, reviews, approves with biometrics or the fallback, and sees the status flow.
  3. Merchant taps "Check settlement" and sees it settled only after reconciliation evidence. History shows it.
  4. Negative cases: expired invoice (rejected); a second scan of the same invoice (replay, no double spend); the merchant in `recovery_required` (blocked with a recovery link); the beneficiary scanning the merchant's static "Show QR" (rejected with the message in §6).
  5. Regression: the existing scanner redemption flow (including offline queue) still works unchanged, and the nav buttons still land on the same screens.
- If Option A or B is chosen instead: Option A removes or hides the scanner entry; Option B only re-labels and fixes docs (see Q1).

## 12. Clarifying questions (product decisions; I have not guessed)

**Q1. Which direction is the intended "merchant receives payment" flow?**
- A. Merchant enters an amount and shows a signed invoice QR; the beneficiary scans it in Pay/Scan and pays on-chain (matches BRD, PRD, SDD, flow, and the existing beneficiary code).
- B. Merchant scans the beneficiary's QR (matches `relief-chain.md` and MER-02 and the current screen).
- C. Both: keep the scanner and add "Request payment (show QR)" as a second mode. **My recommendation**, since both halves have code and it needs the fewest removals.

**Q2. Where should the merchant find it?**
- A. A control on the existing "QR Scan" screen (one entry point).
- B. A "Receive Payment" card on the dashboard (reusing `ReceivePaymentCard`).
- C. Both A and B.
- D. Change the bottom nav label (for example "Receive") and make it open a mode chooser.

**Q3. What can the merchant request?**
- A. Cash (RCPHP) amount only (the minimum; uses the existing `InvoiceAmountForm`).
- B. Cash plus voucher invoices tied to a program and category (needs a program-option hook and the merchant category attestation, i.e. more scope).

**Q4. What should happen to the existing scan-and-redeem RPC path (database-only, fabricated "Stellar Tx Hash")?**
- A. Leave it, but relabel the receipt as simulated / not on-chain, and document it.
- B. Gate or hide it behind the on-chain invoice flow (a financial-invariant fix; a separate story).
- C. Keep it as is for this task and handle it separately (flag only).

**Q5. Please confirm what you saw.** On the merchant "QR Scan" tab, did you see (A) the camera scanner asking for a beneficiary QR, (B) a permission screen or error, or (C) something else? And which role/account and device were you testing with? (I am treating "receive payment is not present" as meaning the invoice/QR display mode, per the history above.)

**Q6. Should the orphaned invoice history (`payment-history`) come back as a screen?** (A) Yes, link it from History or the new screen; (B) No, leave the unified History (MER-03) as the only list.

**Q7. Test accounts for the end-to-end demo.** The seeded beneficiary has no key on a fresh device (see the 2026-10-13 report). Use (A) the original device, (B) a new enrolled and funded beneficiary account, or (C) wait for a beneficiary recovery feature?

## 13. Evidence index

- `src/app/(merchant)/_layout.tsx:4-17`: 10-screen Stack.
- `src/app/(merchant)/receive.tsx`: scanner/redemption; imports at lines 8-31; `handleScanSuccess` 104-117; `handleRedeemVoucher` 130-?; no `createSignedInvoice` import.
- `src/components/MerchantDashboard/MerchantBottomNavigation.tsx:22`: the QR Scan button.
- `src/components/MerchantDashboard/ReceivePaymentCard.tsx`: unused, with no importer.
- `src/services/invoice-service.ts:116-128`: `createSignedInvoice` (no caller).
- `src/services/invoice-scan-service.ts`: the beneficiary scan decode; `shared/invoice-codec.ts:42-56`: prefixes and TTL.
- `src/app/(beneficiary)/pay-scan.tsx`: the beneficiary payment flow.
- `src/services/merchant-redemption-service.ts:114-186` (QR parse), `876-926` (`executeVoucherRedemption`).
- `supabase/migrations/20261004020000_update_redemption_and_history.sql:228-452`: the DB-only redemption RPC with a random hash.
- `supabase/functions/prepare-payment/index.ts:83-84`: cash and voucher accepted.
- Git: `f978c77` (2026-10-03, replaced the invoice screen), `fcb76d8` (2026-10-05, offline sync), `e168707` (2026-09-29, added the invoice screen).
- Docs: `relief-chain.md:37,56,319-322,394,471`; `sprint-reliefchain.md:304-322,423,449`; `brd-reliefchain.md:173`; `prd-reliefchain.md:136-145`; `sdd-reliefchain.md:29-31,144-147`; `flow-reliefchain.md:69,112,189-190,222,249,262-265`; `sad-reliefchain.md:63`.

# Product Requirements Document (PRD): ReliefChain

**Project:** ReliefChain — Blockchain-Powered Disaster Relief Distribution Platform  
**Date:** 2026-09-24  
**Version:** 1.0  
**Owner:** MINDMESH  
**Status:** Active  
**Source of truth:** [`relief-chain.md`](relief-chain.md)  
**Related:** [BRD](brd-reliefchain.md) · [BPD](bpd-reliefchain.md) · [SAD](sad-reliefchain.md) · [SDD](sdd-reliefchain.md) · [DSD](dsd-reliefchain.md) · [Flow](flow-reliefchain.md) · [Build](build-reliefchain.md)

---

> **Source-of-truth rule.** [`relief-chain.md`](relief-chain.md) is the canonical foundation document for ReliefChain. If this PRD conflicts with it, resolve the conflict in `relief-chain.md` first, then propagate. Any agent or developer needing to confirm a product fact should read `relief-chain.md`, then the rest of `docs/`, before reading code.
>
> **This document is as-built.** Feature status reflects what exists in the repository today, with file evidence. Intent that is not yet code is marked as roadmap. Do not read a requirement as a shipped capability.

**Status legend**

| Mark | Meaning |
|---|---|
| ✅ | Built and wired end-to-end |
| 🟡 | Partial, mocked, simulated, or built-but-gated |
| ⬜ | Planned — no implementation in code today |
| ❌ | Explicitly out of scope for v1 |

---

## 1. Product Purpose and Value Proposition

ReliefChain is a disaster relief distribution platform for governments and humanitarian organizations. An organization creates a relief program, registers and verifies beneficiaries, approves assistance, and disburses aid over Stellar; accredited merchants redeem beneficiary QR invoices and receive on-chain settlement; every financial movement is recorded against append-only ledger, audit, and reconciliation records.

**Value proposition (from the foundation document):**

> ReliefChain enables governments and humanitarian organizations to distribute secure, transparent, and programmable disaster assistance in minutes instead of days using the Stellar blockchain.

**What the build actually optimizes for.** The implemented system is a financial-controls platform first: 54 tables, 40 enum types, 77 row-level-security policies, 79 triggers, four projection tables, append-only evidence tables, a two-phase prepare/submit transaction protocol, idempotency-key claiming, reconciliation runs/issues/cursors, MFA with step-up authorization, and retention plus identity-disposition workflows. Correctness and auditability are the product, not a supporting feature.

**Hard operating boundary.** The pilot is **Stellar testnet only**. `shared/stellar-config.ts` throws `StellarConfigurationError('Mainnet is hard-disabled for the pilot.')` for any non-`false` mainnet setting, allowlists only `https://horizon-testnet.stellar.org` and `https://soroban-testnet.stellar.org`, and declares the asset **RCPHP** with `RCPHP_DISCLOSURE = 'Testnet only — no real monetary value.'` No requirement in this PRD implies real money movement.

---

## 2. Target Personas

### Primary — LGU / Organization Administrator

- **Who:** Administrator at a local government unit or humanitarian organization that funds and runs relief programs. Role `lgu` in `src/utils/auth-routing.ts`.
- **Jobs:** Register the organization and pass review, create and fund programs, define eligibility and voucher policy, accredit merchants, verify beneficiaries, run disbursements, monitor budget and activity.
- **Surfaces:** `src/app/(lgu)/` — `index` (Dashboard), `programs`, `pay-scan` (titled **Disbursements**), `beneficiaries`, `settings`, plus the seven-step `create-program/` wizard.
- **Gate:** LGU accounts pass through a registration review state machine before reaching the dashboard (`src/utils/lgu-navigation-guard.ts`, `registrations` table, `/(auth)/application-review`).

### Primary — Beneficiary

- **Who:** A verified individual or household enrolled in a relief program. Role `beneficiary`.
- **Jobs:** Register and submit identity evidence, provision a wallet, view entitlements and balance, scan a merchant QR invoice, approve payment, review transaction history, recover a wallet.
- **Surfaces:** `src/app/(beneficiary)/` — `index`, `my-assistance`, `pay-scan`, `find-organization`, `profile`, plus hidden `transactions` and `wallet-recovery`.

### Primary — Accredited Merchant

- **Who:** Operator of an accredited grocery, pharmacy, hardware, or school-supply store. Role `merchant`.
- **Jobs:** Register and get accredited to a program, generate a signed QR invoice, accept redemption, view settlements and metrics, request cash-out, handle refunds.
- **Surfaces:** `src/app/(merchant)/` — `index`, `receive`, `profile`, `programs`, `security` (a `Stack`, with bottom navigation supplied by `src/components/MerchantDashboard/MerchantBottomNavigation.tsx`).

### Roadmap — Donor / Public Auditor ⬜

No `donor` role, route, table, or component exists in the codebase. The implemented transparency substitutes are the `public_financial_transparency` view, the `public_program_aggregate_projection` table, and the controlled `auditor_view_*` RPCs. A donor persona is roadmap scope (§9).

---

## 3. Core Features, Priorities, and Status

MoSCoW priority is the product judgment. Status is the code reality.

| # | Feature | Priority | Status | Evidence |
|---:|---|---|---|---|
| 1 | Organization/LGU registration with review workflow | Must | ✅ | `registrations` table, `create_registration_on_lgu_signup()`, `guard_registration_status_transition`, `src/components/OrganizationRegistration/`, `ApplicationReview/` |
| 2 | Relief program management | Must | ✅ | `create-program/` 7-step wizard, `src/services/programService.ts`, `programs` + `program_areas` + `program_barangays` + `program_merchants` + `program_policy_events`, `programs_validate_financial_policy` trigger |
| 3 | Beneficiary registration | Must | ✅ | `src/components/BeneficiaryRegistration/`, `src/services/registrationService.ts`, resubmission via `src/utils/resubmission.ts` |
| 4 | Beneficiary verification and re-verification | Must | ✅ | `src/components/BeneficiaryVerification/`, `(lgu)/beneficiaries.tsx`, `record_beneficiary_identity_reverification()`, append-only `beneficiary_identity_reverifications` |
| 5 | Duplicate detection (identity + campaign scope) | Must | ✅ | `beneficiary_identities`, `disaster_response_campaigns`, `enrollments_prepare_identity_scope`, `programs_sync_campaign_to_enrollments`, test `supabase/tests/database/beneficiary_identities.test.sql` |
| 6 | Wallet provisioning with proof of possession | Must | ✅ | `prepare-wallet-provision` / `submit-wallet-provision`, `wallets`, `issue_wallet_proof_challenge()`, `complete_wallet_proof()`, `src/components/WalletProvision/` |
| 7 | Cash-rail disbursement to beneficiaries | Must | ✅ | `src/components/DistributeAid/` 5-step wizard, `distribution-service.ts`, `use-distribution-job.ts`, `distribution_jobs` + `distribution_recipients`, `prepare-disbursement` / `submit-disbursement`, `mark_distribution_recipient_submitted()` |
| 8 | Merchant QR invoice generation | Must | ✅ | `src/components/MerchantInvoice/InvoiceQrCard.tsx`, `shared/invoice-codec.ts` |
| 9 | Beneficiary QR scan and payment approval | Must | ✅ | `beneficiary/PayScan/ScannerView.tsx` (`expo-camera`), `invoice-scan-service.ts`, `PaymentReview/`, `PaymentStatus/` |
| 10 | Merchant redemption and on-chain settlement | Must | ✅ | `prepare-payment` / `submit-payment`, `payment-service.ts`, `payment_intents`, `settlements`, `redemptions` |
| 11 | Biometric payment approval with safe fallback | Must | ✅ | `src/utils/biometric-auth.ts` — classifies cancel vs unenrolled and falls back to explicit on-screen confirmation |
| 12 | MFA and step-up for sensitive actions | Must | ✅ | `src/components/Mfa/`, `mfa-service.ts`, `use-step-up.ts`, `src/utils/step-up.ts`, `20260716050000_add_audit_events_and_mfa_policies.sql` |
| 13 | Reconciliation against Stellar | Must | ✅ | `reconcile-stellar`, `_shared/edge-cash-reconciler.ts`, `reconciliation_runs` / `_issues` / `_cursors`, `ledger_transactions`, `contract_events` |
| 14 | Immutable audit and evidence trail | Must | ✅ | `audit_events` + `append_audit_event()`, append-only triggers on `contract_events`, `ledger_transactions`, `financial_intents`, `dispute_evidence`, `program_policy_events` |
| 15 | Organization dashboard and financials | Must | ✅ | `(lgu)/index.tsx`, `Dashboard/` components, `use-organization-financials.ts`, `use-organization-treasury.ts`, `program_financial_projection` |
| 16 | Programmable voucher escrow rail | Must | 🟡 **built, tested, gated** | `contracts/voucher/` (`VoucherContract`), `_shared/stellar/voucher-{program,payment,administration,reconciliation}.ts`, `voucher_redemptions`. Unreachable: `supabase/functions/prepare-payment/index.ts` rejects any `fundingSourceKind !== 'cash'` with *"Only cash funding source is supported in MVP."* |
| 17 | Merchant cash-out | Should | 🟡 **simulated** | `request-cashout`, `cashout_requests`, `src/components/CashOut/SimulatedCashOutNotice.tsx`; `scripts/test-cashout.mjs` simulates external status transitions (SETUP.md §10) |
| 18 | Refunds and disputes | Should | ✅ | `Refund/`, `refund-service.ts`, `refunds`, `disputes`, `dispute_evidence`, contract `refund` method |
| 19 | Wallet rotation and recovery | Should | ✅ | `wallet_rotation_intents`, `request_wallet_rotation()`, `transition_wallet_rotation_intent()`, `WalletRecovery/`, contract `rotate_entitlement` |
| 20 | Retention and identity disposition | Should | ✅ | `20260716110000_add_retention_and_identity_disposition_controls.sql` — `retention_policies`, `identity_disposition_requests`, `execute_identity_disposition()`, `set_retention_legal_hold()` |
| 21 | Merchant metrics | Should | ✅ | `merchant_metrics`, hardened RPC, `merchantMetricsService.ts`, `use-merchant-metrics.ts` |
| 22 | Public financial transparency surface | Should | 🟡 **data only** | `public_financial_transparency` view, `public_program_aggregate_projection`, `auditor_view_*` RPCs — no UI |
| 23 | Analytics and report export UI | Should | ⬜ | Projections and auditor RPCs exist; no charting or export screen |
| 24 | SMS notifications | Should | ⬜ **roadmap, partial scope** | No SMS package, provider, or code anywhere in `src/` |
| 25 | Bluetooth offline synchronization | Should | ⬜ **roadmap, planned build** | No BLE dependency; zero matches in `src/`, `supabase/`, `contracts/`; Android permissions are CAMERA + RECORD_AUDIO only (`app.config.js`) |
| 26 | Donor transparency portal | Could | ⬜ **roadmap, partial scope** | No donor role, route, table, or component |
| 27 | Mainnet operation and real-money settlement | — | ❌ | Hard-disabled in `shared/stellar-config.ts`; RCPHP has no monetary value |
| 28 | AI disaster prediction / forecasting | — | ❌ | Not in the current proposal or codebase. Any earlier "predict/prepare" framing is superseded |
| 29 | Hosted testnet demo environment | Must | ✅ | Live 2026-09-24: schema, 13 Edge Functions, secrets, demo data ([build](build-reliefchain.md) §15.0) |
| 30 | Hosted **production** deployment | — | ❌ | EAS environment variables, release signing, monitoring, and incident response are all absent (SETUP.md §13) |

---

## 4. User Stories and Acceptance Criteria

### US-01 — Create and fund a relief program ✅

> As an **LGU Administrator**, I want to create a relief program with a budget, eligibility rules, and voucher policy so that assistance is bounded before any money moves.

- Given an approved organization, when I complete the seven wizard steps (`index → budget → eligibility → documents → schedule → voucher → summary`), then the program persists with geography, policy, and financial fields.
- Given invalid financial policy, when the program is written, then `programs_validate_financial_policy` rejects it at the database level rather than in the client only.
- Given a policy change, when it is applied, then a `program_policy_events` row is appended and cannot be mutated afterward.

### US-02 — Verify a beneficiary without creating duplicates ✅

> As an **LGU Administrator**, I want identity-scoped enrollment so the same person cannot be enrolled twice in one campaign.

- Given a beneficiary identity, when an enrollment is created, then `enrollments_prepare_identity_scope` binds it to a `beneficiary_identities` row and a campaign scope.
- Given a second enrollment attempt for the same identity in the same campaign, when it is submitted, then the database rejects it.
- Given a re-verification decision, when it is recorded, then `record_beneficiary_identity_reverification()` appends an immutable record.

### US-03 — Disburse aid to enrolled beneficiaries ✅

> As an **LGU Administrator**, I want to disburse to many beneficiaries and see per-recipient outcomes.

- Given a funded program and enrolled recipients, when I run the distribution wizard, then a `distribution_jobs` row and `distribution_recipients` rows are created and progress is observable through `use-distribution-job.ts`.
- Given a prepared disbursement, when it is authorized, then `prepare-disbursement` and `submit-disbursement` execute the two-phase protocol and confirmation is left to reconciliation.
- Given a recipient transition, when it is marked submitted, then `mark_distribution_recipient_submitted()` performs it atomically.
- Given failures, when the job completes, then `DistributionFailureSummary` reports them per recipient.

### US-04 — Redeem assistance at an accredited merchant ✅

> As a **Beneficiary**, I want to scan a merchant QR code and approve payment so I receive goods without cash.

- Given a merchant-signed invoice, when I scan it, then `invoice-scan-service.ts` decodes and validates it against `shared/invoice-codec.ts`.
- Given a valid invoice, when `prepare-payment` runs, then the server verifies the signature, expiry, my beneficiary identity, my enrolled program, my verified active `stellar_testnet` wallet, the merchant's active accreditation valid at `issuedAt`, and that the invoice settlement wallet matches the merchant's verified wallet.
- Given an amount beyond `Number.MAX_SAFE_INTEGER`, when validation runs, then the request **fails closed** rather than silently losing precision.
- Given approval, when I confirm, then biometric approval is requested and a cancel or unenrolled device falls back to explicit on-screen confirmation.
- Given a replayed request, when it is prepared again, then the response returns `isReplay: true` without double-charging.

### US-05 — Receive settlement as a merchant ✅ / cash-out 🟡

> As a **Merchant**, I want redemption settled on-chain and to request cash-out.

- Given a completed redemption, when the ledger closes, then value settles to my verified settlement wallet and a `settlements` row is recorded.
- Given settled balance, when I request cash-out, then `request-cashout` creates a `cashout_requests` row — **external cash-out is simulated in this pilot** and the UI states so via `SimulatedCashOutNotice.tsx`.

### US-06 — Operate a program whose value cannot leak ✅ (contract-level)

> As an **Administrator or auditor**, I want escrow arithmetic that cannot silently lose money.

- Given any value change in `VoucherContract`, when it is applied, then `assert_conservation` enforces `total_funded == contract_balance + (gross_redeemed - refunded) + returned_to_treasury` and `allocated_outstanding <= contract_balance`, using `checked_add`/`checked_sub` and failing with `Error::ConservationViolation`.
- Given a redemption, when any check fails, then the whole invocation reverts and the one-time nonce is **not** consumed.
- Given an emergency, when `pause`/`resume` is called by `config.emergency_authority`, then the program halts without seizing beneficiary value.
- Given wallet rotation, when `rotate_entitlement` runs, then the old wallet is revoked implicitly and daily spend is deliberately **not** reset.

### US-07 — Operate offline during a connectivity outage ⬜

> As a **Merchant or authorized field officer**, I want to keep recording validated redemptions when the internet is down.

Acceptance criteria are **not yet specified** because no implementation or protocol decision exists. Before this story can be built, the open items in [`relief-chain.md` §14](relief-chain.md) Q14–Q17 must be closed: offline authorization and revocation, device trust and encryption, balance reservation, double-redemption prevention, and conflict resolution on resynchronization. See §9.

---

## 5. Key User Flows

**Authentication and routing (✅).** Cold start renders `src/app/_layout.tsx` (`AuthProvider` → `RootLayoutNav` → `StartSplash` + `Slot`). There is no `src/app/index.tsx`; the entry route is produced by a redirect effect. No session → `/(auth)/choose-account`. An LGU with a registration status is routed by `getLguNavigationDecision` to `/(auth)/application-review` or the LGU dashboard. Any other role/group mismatch is sent to `getRoleHome(profile.role)`. A `hasRedirectedRef` guard prevents redirect loops.

**Program to redemption (✅, cash rail).**
1. LGU creates and funds a program.
2. Beneficiary registers; LGU verifies; enrollment is identity- and campaign-scoped.
3. Beneficiary wallet is provisioned and bound by proof of possession.
4. LGU disburses; reconciliation confirms.
5. Merchant issues a signed QR invoice.
6. Beneficiary scans, approves with biometrics, and `prepare-payment` → `submit-payment` executes.
7. Settlement lands in the merchant's verified wallet; reconciliation and audit records are written.

**Voucher escrow path (🟡).** Identical up to step 6, then routed through `VoucherContract.redeem` with invoice binding to `contract_id`, `sac`, `network == testnet`, and `asset_code`, plus merchant signature verification, per-transaction limit, remaining entitlement, rolling daily limit, and one-time nonce. Unreachable today because of the cash-only gate.

Full status matrix and diagrams: [`flow-reliefchain.md`](flow-reliefchain.md).

---

## 6. Non-Goals for v1

- Mainnet operation or handling of real funds (hard-disabled).
- AI disaster prediction, forecasting, or resource optimization.
- A donor account, donation intake, custody, or refund flow.
- Production deployment, release signing, or app-store submission. A hosted **testnet demo** environment is in scope and exists.
- Case management, logistics, inventory, or long-term social-protection administration.
- Non-Philippine jurisdictions and non-voucher aid instruments.
- Offline mode as a guaranteed capability until §9 items are designed.

---

## 7. Business Model

**Known:** the app is intended to charge a transaction fee of approximately **1%** to fund ongoing maintenance.

**Not yet decided:** who remits the fee (organization, merchant, or program budget), whether it applies to disbursement, redemption, or both, treatment of refunds and reversals, cash-out pricing, minimums or caps, non-fee revenue such as licensing or grants, and any procurement or compliance implications of charging a public body.

This is deliberately the shortest section in the document, and it is the weakest of the six scored finals criteria. See [`relief-chain.md` §17.4](relief-chain.md).

---

## 8. Dependencies and Assumptions

**Dependencies**

- Stellar **testnet** Horizon and Soroban RPC (allowlisted origins only) plus Friendbot during bootstrap.
- Local Supabase stack via Docker Desktop and the project-local Supabase CLI.
- Testnet RCPHP asset bootstrap (`bootstrap-topology.mjs`, `bootstrap-asset.mjs`) before any chain flow.
- `supabase/functions/.env` generated by `make-functions-env.mjs` for Edge signers.
- A physical Android device or emulator; Android is the verified target.
- `STELLAR_CONTRACT_ADMIN_SECRET` is expected by Edge code but **not** provisioned by the topology bootstrap — a live gap for voucher work (SETUP.md §7).

**Assumptions**

- Beneficiary QR redemption happens in person at an accredited merchant.
- Statutory identity evidence (National ID, Barangay Certificate, DSWD records) is captured as submitted evidence; **no live government integration exists**.
- English-language UI for v1; localization is undecided.
- Light mode is the supported appearance; see [DSD](dsd-reliefchain.md).

---

## 9. Roadmap — Declared Intent, No Code Yet

| Item | Intended scope | Blocking decisions |
|---|---|---|
| **Bluetooth offline sync** ⬜ | Full implementation is planned | Transport and pairing model, offline authorization and revocation, balance reservation, double-redemption prevention, conflict resolution and rejected-record handling, Android permission additions ([`relief-chain.md`](relief-chain.md) Q14–Q17) |
| **SMS notifications** ⬜ | Partial — notify on assistance release; not a full messaging system | Provider, sender identity, consent, retries, cost, delivery telemetry (Q18) |
| **Donor transparency portal** ⬜ | Partial — read-only program-level view, likely built on `public_financial_transparency` and `public_program_aggregate_projection` | Whether donors get accounts, donation intake and custody, privacy thresholds (Q19, Q24) |
| **Voucher rail unlock** 🟡 | Allow `fundingSourceKind: 'voucher'` through `prepare-payment` | Contract admin secret provisioning, per-program contract deployment, UI funding-source selection |
| **Analytics/report UI** ⬜ | Surface existing projections | Metric definitions, aggregation windows, privacy thresholds (Q27, Q28) |

Partial scope means partial by design. When these ship, this table and [`flow-reliefchain.md`](flow-reliefchain.md) must be updated in the same change.

---

## Self-Check

- [x] Every Must-Have has a status mark and file evidence
- [x] Bluetooth, SMS, and donor portal are stated as roadmap with no code
- [x] The voucher rail is described as built, tested, and gated, with the gate cited
- [x] Testnet-only and RCPHP non-value boundaries are stated
- [x] Business model records the 1% fee and names what is undecided
- [x] `relief-chain.md` is cited as source of truth
- [ ] US-07 acceptance criteria pending offline design decisions
- [ ] Localization and dark mode pending

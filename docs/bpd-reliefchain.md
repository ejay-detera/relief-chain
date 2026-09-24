# Business Product Document (BPD): ReliefChain

**Project:** ReliefChain — Blockchain-Powered Disaster Relief Distribution Platform  
**Date:** 2026-09-24  
**Version:** 1.0  
**Owner:** MINDMESH  
**Status:** Active  
**Source of truth:** [`relief-chain.md`](relief-chain.md)  
**Related:** [BRD](brd-reliefchain.md) · [PRD](prd-reliefchain.md) · [SAD](sad-reliefchain.md) · [SDD](sdd-reliefchain.md) · [DSD](dsd-reliefchain.md) · [Flow](flow-reliefchain.md) · [Build](build-reliefchain.md)

---

> **Source-of-truth rule.** [`relief-chain.md`](relief-chain.md) is the canonical foundation document. Resolve conflicts there first, then propagate. Read `relief-chain.md`, then the rest of `docs/`, before reading code.
>
> **This version supersedes the "ReliefGuard AI" BPD.** That document contained a market sizing model, three pricing tiers, three-year revenue and margin projections, an ROI case example, and a partnership architecture naming a dozen organizations. **None of it was sourced, and none of it was agreed.** It has been removed rather than corrected, because correcting invented numbers produces different invented numbers.
>
> **Evidence standard for this document.** One element of the business model is decided: an approximately **1% transaction fee**. Everything else in commercial strategy is **open**. This document states what is decided, states what is open, and states what a defensible business plan still requires. It contains no projections.

**Status legend:** ✅ decided or built · 🟡 partial, gated, or simulated · ⬜ open, not decided · ❌ out of scope

---

## 1. What We Are Selling

### 1.1 Product definition

ReliefChain is software for organizations that distribute disaster relief. It manages the relief lifecycle end to end: organization onboarding, beneficiary registration and verification, duplicate prevention, program and budget definition, merchant accreditation, batch disbursement over Stellar, QR-based merchant redemption, reconciliation against the ledger, and append-only audit evidence.

### 1.2 Value proposition

> ReliefChain enables governments and humanitarian organizations to distribute secure, transparent, and programmable disaster assistance in minutes instead of days using the Stellar blockchain.

### 1.3 What is actually differentiated today

The temptation in a pitch is to lead with the unbuilt features. The defensible story is the opposite — it is the control surface that exists:

| Differentiator | Why it is hard to copy |
|---|---|
| **Database-enforced duplicate prevention** | Enrollment uniqueness is scoped to identity plus campaign and rejected by Postgres, not by client validation. A competitor bolting this on later must restructure their schema. |
| **Two-phase prepare/submit with device-side signing** | The server never holds a beneficiary key. This is an architectural commitment, not a feature flag. |
| **Chain-evidence coupling** | Triggers refuse to mark a workflow confirmed unless linked ledger evidence exists. Confirmation cannot be faked by application code. |
| **Append-only audit, ledger, and evidence tables** | History cannot be rewritten by the operator, which is the specific thing an auditor wants to know. |
| **Contract-level conservation invariants** | `assert_conservation` in the Soroban voucher contract makes value creation or destruction impossible by construction. 🟡 Built and tested; gated off — see §2.2. |

**This is a financial-controls product.** Correctness and auditability are the thing being sold. Speed is a consequence of the settlement rail, not the moat.

### 1.4 What it is not

It is not an AI platform. There is no prediction, forecasting, risk scoring, GIS heatmap, or anomaly-detection model in the product or the repository, and none is planned. Any pitch that implies otherwise is unsupportable in Q&A.

---

## 2. Commercial Readiness — State This First

### 2.1 Hard boundaries

| Boundary | Detail |
|---|---|
| Network | **Stellar testnet only.** `shared/stellar-config.ts` throws `'Mainnet is hard-disabled for the pilot.'` |
| Asset | **RCPHP**, declared `'Testnet only — no real monetary value.'` |
| Merchant cash-out | 🟡 **Simulated.** No licensed fiat partner is engaged |
| Hosting | 🟡 A hosted Supabase **testnet demo** environment is live as of 2026-09-24. No release signing, monitoring, or production secret management |
| Customers | ❌ Zero. No LGU, agency, or NGO has deployed, piloted, procured, or endorsed ReliefChain |
| Revenue | ❌ Zero. No fee has been charged and no aid of real value has moved |

**Say this out loud in the pitch.** Judges will find it in thirty seconds of questioning, and finding it after a growth claim is far more damaging than leading with it.

### 2.2 The gated differentiator

The Soroban `VoucherContract` implements purpose-restricted aid: one immutable instance per program, conservation invariants on every value change, merchant category and signature verification, per-transaction and rolling daily limits in UTC buckets, one-time nonces, non-seizing pause and resume, and rotation that cannot reset limits.

It is **unreachable from the app**. `supabase/functions/prepare-payment/index.ts` rejects any `fundingSourceKind !== 'cash'` with *"Only cash funding source is supported in MVP."*

Commercially this matters because purpose restriction is the feature a relief buyer cares about most, and it is the feature that cannot be demonstrated end to end today. The honest framing: **built, tested at the contract level, deliberately gated for the MVP, with a named unlock path** (lift the gate, provision `STELLAR_CONTRACT_ADMIN_SECRET`, wire the funding-source selection through the disbursement flow). See [Build](build-reliefchain.md) §8.

---

## 3. Market and Customers

### 3.1 Market sizing — **Not validated**

There is no sizing model in this document. The previous BPD claimed a $3.2B TAM, $280M SAM, and $18M SOM. No source, method, or date supported any of the three figures.

A defensible sizing exercise for ReliefChain would need, at minimum:

1. Published LGU DRRM fund allocations — the 5% Local Disaster Risk Reduction and Management Fund is statutory, so the base is knowable from actual budget documents rather than estimated.
2. The share of that fund used for household cash or voucher assistance, as opposed to infrastructure and equipment.
3. A defensible take rate against the ~1% fee, applied only to distribution volume the platform would plausibly touch.
4. Humanitarian organization relief budgets in the Philippines, from published annual reports.

Until those four inputs come from named, dated sources, **ReliefChain has no market size** and should not present one. An honest "we have not sized this yet, here is how we would" answers the question better than a number that collapses under one follow-up.

### 3.2 The problem being addressed

From the proposal, restated as premises rather than research: manual verification is slow, duplicate registrations are hard to catch across programs, distribution takes days, cash handling carries security and accountability risk, transparency is limited, auditing is burdensome, connectivity fails in disaster areas, and beneficiaries often do not learn that assistance is available. Full list in [BRD](brd-reliefchain.md) §2.

No statistic is attached to any of these, because the proposal supplies none and none is invented here.

### 3.3 Customer segments

| Segment | Role in the model | Motivation | Status |
|---|---|---|---|
| **LGUs and DRRMOs** | Intended paying customer | Faster response, traceability, audit readiness, public trust | ⬜ None engaged |
| **Humanitarian NGOs** | Intended paying customer or co-operator | Verifiable delivery, reduced duplication, funder reporting | ⬜ None engaged |
| **Accredited merchants** | Network participant, not a payer | Post-disaster sales, settlement without cash handling | ⬜ None engaged |
| **Beneficiaries** | End user, never charged | Fast assistance, dignity, visible balance | ⬜ No real beneficiary |
| **Auditors and funders** | Oversight consumer | Verifiable trail without personal data | 🟡 Data exists, no UI |
| **Donors** | Prospective segment | Confidence that contributions were delivered | ⬜ No role in code |

Who signs the contract inside an LGU (mayor, DRRMO head, treasurer, IT) is **undecided** and materially affects the sales motion. That is an open question, not an assumption to be filled in.

### 3.4 Buyer objections we cannot yet answer

Naming these is more useful than pretending they are handled:

| Objection | Current answer |
|---|---|
| "Can merchants actually get pesos?" | Not yet. Cash-out is simulated and no licensed partner is engaged. |
| "Is a relief token legal here?" | Unknown. No legal review has been performed. |
| "What happens when the network is down?" | Today, nothing. Offline continuity is planned with no code. |
| "Has anyone else used this?" | No. Zero customer deployments. A hosted testnet demo environment exists; no organization has used it. |
| "What does it cost us?" | Approximately 1% of transaction volume. The mechanics are undecided. |
| "Will it hold up at disaster scale?" | Unproven. No load testing has been done. |

---

## 4. Business Model

### 4.1 What is decided ✅

**A transaction fee of approximately 1%**, intended to fund ongoing platform maintenance.

That is the entire decided commercial model. There are no subscription tiers, no enterprise analytics product, and no premium data offering. The previous BPD's ₱150,000–₱600,000 annual tiers and 0.5% fee are removed; the tiers were never agreed and the 0.5% figure contradicts the decided 1%.

### 4.2 What is open ⬜

Each item below changes the revenue model materially. None has been decided.

| # | Open question | Why it matters |
|---:|---|---|
| 1 | Who remits the fee — organization, merchant, or split | Determines whether the buyer sees a cost or a deduction from aid |
| 2 | Whether the base is disbursement, redemption, or both | Double-charging the same peso is a credibility risk |
| 3 | Whether the fee is deducted from the relief budget or invoiced separately | A deduction reduces aid reaching households, which a public buyer will challenge |
| 4 | Refund, reversal, and dispute treatment | A refunded transaction that keeps its fee is an audit finding |
| 5 | Cash-out pricing, and whether the VASP margin sits inside or on top of the 1% | Determines whether 1% is actually achievable |
| 6 | Minimums, caps, and floors | A ₱500 disbursement yields ₱5, which will not cover its own processing |
| 7 | Whether a public body may lawfully be charged a percentage fee | Procurement and audit exposure |
| 8 | Any non-fee revenue | Whether 1% alone can sustain the platform |

### 4.3 Unit economics — unknown

The fee is a revenue line, not a margin. Nothing in this repository establishes cost per transaction. Before the 1% can be defended as sustainable, the following must be measured rather than assumed: Stellar network fees at the intended operation volume, Supabase compute and storage at beneficiary scale, Edge Function invocation cost per disbursement and redemption, reconciliation polling cost, support and dispute handling cost per program, and merchant plus beneficiary onboarding cost.

**A pilot with real cost telemetry is the only way to close this.** Modeling it now would produce exactly the kind of number this rewrite removed.

---

## 5. Product Offering by Role

What a buyer actually gets today, per role. Detail in [PRD](prd-reliefchain.md).

### 5.1 Organization (LGU / NGO) ✅

Dashboard, Programs, Disbursements, Beneficiaries, Settings. Seven-step program creation wizard with database-validated financial policy. Beneficiary verification and re-verification with append-only decisions. Batch disbursement with per-recipient outcomes and retry. Budget and activity monitoring. MFA with step-up on sensitive financial actions.

### 5.2 Merchant ✅ / 🟡

Dashboard, Receive, Programs, Profile, Security. Per-program accreditation with a validity window. Signed QR invoice generation. Redemption acceptance with settlement-wallet matching. Settlement history and metrics. Refund processing. Cash-out request — 🟡 external settlement simulated and labeled as such in the UI.

### 5.3 Beneficiary ✅

Dashboard, My Assistance, Pay/Scan, Find Organization, Profile. Device-custodied Stellar wallet with the secret in `expo-secure-store`. Entitlement and balance visibility. Merchant QR scanning with biometric approval and an explicit fallback so no device can lock a user out. Wallet rotation and recovery.

### 5.4 Not yet part of the offering

| Capability | Status | Commercial consequence |
|---|---|---|
| Purpose-restricted vouchers | 🟡 Built, gated | The headline buyer feature cannot be demonstrated end to end |
| Offline continuity (Bluetooth) | ⬜ Planned, no code | The disaster-resilience claim is unsupported |
| Beneficiary SMS | ⬜ Planned as partial scope | No notification channel exists |
| Donor portal | ⬜ Planned as partial scope | No donor-side product |
| Auditor UI | 🟡 Data and RPCs only | Auditors cannot self-serve |
| Analytics and export | ⬜ Projections exist, no UI | Reporting is not a sellable feature yet |
| Real fiat settlement | ⬜ Not started | Merchants cannot be paid |

---

## 6. Go-To-Market — Sequence, Not Forecast

This is a dependency sequence. It carries no dates, client counts, or revenue figures, because none can be justified.

### Stage 0 — Pre-commercial (current)

Testnet, simulated cash-out, a hosted demo environment with no monitoring. **Exit criteria:** legal review of the token, fee, and identity handling; monitoring, alerting, and incident response on that environment; a named fiat off-ramp partner. The wallet-binding dev migration is resolved — `20260925090000_restore_wallet_binding_trigger.sql` restores the trigger, confirmed enabled on the hosted database ([Build](build-reliefchain.md) §8 item 1).

Nothing beyond this stage can begin until legal review completes. It is the single hardest gate and it has not started.

### Stage 1 — First pilot

One organization, one program, a bounded beneficiary count, a small merchant set. **Purpose is measurement, not revenue.** Baselines to capture: approval-to-credit time, redemption rate, reconciliation exception rate, support load per program, and cost per transaction. Fee handling during a pilot is undecided — likely waived, which must be stated rather than implied.

### Stage 2 — Voucher rail and offline

Lift the funding-source gate so purpose restriction is demonstrable. Build the offline tier, which requires offline authority and revocation, balance reservation, replay protection, and deterministic conflict resolution to be designed before it has acceptance criteria.

### Stage 3 — Repeatable deployment

Only after Stage 1 produces measured outcomes. What "repeatable" requires: onboarding that does not need the engineering team, a support model, a documented procurement path, and the fee mechanics in §4.2 settled.

**No stage numbers appear here on purpose.** Claiming "45 LGUs in year two" with zero pilots is the exact failure mode this document exists to prevent.

---

## 7. Prospective Ecosystem

Everything below is a **target**, not a partner. No agreement, integration, endorsement, or conversation of record exists with any named entity.

| Category | Prospective entities | Why they would matter |
|---|---|---|
| Government | DSWD, DILG, NDRRMC, LGUs, DRRMOs | Buyer, and institutional legitimacy |
| Humanitarian | Philippine Red Cross, UNICEF, World Vision, Save the Children | Buyer or co-operator, plus funder reporting demand |
| Fiat liquidity | Licensed PH VASPs and EMIs | **Blocking dependency** — without one, merchants cannot be paid |
| Blockchain | Stellar Development Foundation | Rail, tooling, ecosystem support |
| Infrastructure | Supabase | Data platform |
| Merchants | Groceries, pharmacies, hardware stores, school-supply retailers | Redemption network density |

The previous BPD's "partnership architecture" named PAGASA, UP NOAH, MMDA, Puregold, SM Markets, Mercury Drug, Generika, Coins.ph, Maya, and PDAX. Listing a target is not a partnership. The weather and hydrology entries are additionally irrelevant now that prediction is out of scope.

---

## 8. Compliance and Commercial Risk

### 8.1 Compliance posture — intent, not attestation

| Area | Intent | Reality |
|---|---|---|
| BSP / e-money | Closed-loop relief tokens redeemable only at accredited merchants | **No legal review, no ruling, no licence.** RCPHP is a valueless testnet asset, so no regulated activity occurs today |
| Data Privacy Act (RA 10173) | Personal data under RLS with retention, legal hold, and reviewed disposition; pseudonymous on-chain records | Controls exist in code. **No privacy impact assessment, DPO review, or NPC registration** |
| Audit readiness | Append-only evidence linked to ledger records | Structurally supports audit. **No auditor has reviewed or accepted any export format** |
| Procurement (RA 9184) | Emergency modalities may apply | **Not assessed by counsel** |

Never describe ReliefChain as compliant, exempt, or certified. Describe the controls, then name the reviews that have not happened.

### 8.2 Commercial risk register

Judgment, not measurement.

| Risk | Impact | Status |
|---|---|---|
| Regulatory treatment of the token and the fee | High | ⬜ No legal review — the top gate before any commercial activity |
| No fiat off-ramp, so merchants cannot be paid | High | 🟡 Simulated; no licensed partner engaged |
| Fee mechanics undefined, so no quotable price exists | High | ⬜ Eight open decisions in §4.2 |
| Unit economics unknown, so 1% may not be sustainable | High | ⬜ Requires pilot telemetry |
| The headline voucher feature is gated off | High | 🟡 Built; named unlock path |
| Offline continuity is claimed but unbuilt | High | ⬜ Design decisions open |
| Zero pilots, so every validation claim is theoretical | High | ⬜ No organization engaged |
| Charging a public body a percentage fee may be procurement-blocked | Medium | ⬜ Not assessed |
| Merchant network density in a disaster zone | Medium | ⬜ No merchant engaged |
| LGU administration turnover mid-deployment | Medium | ⬜ No LGU engaged |
| No monitoring, alerting, or incident response | Medium | 🟡 Hosted environment exists; observability does not |
| Unproven capacity at disaster scale | Medium | ⬜ No load testing |

---

## 9. Social Impact

### 9.1 What the product does for people

Beneficiaries hold their own wallet and approve their own payments biometrically, with a fallback so no device excludes anyone. Relief spending stays with local accredited merchants rather than leaving the municipality through centralized procurement. Distribution does not require standing in a queue in post-disaster conditions. Personal data stays in Postgres under RLS; **no beneficiary personal data is written on-chain**.

These are design properties of the built system. They are not measured outcomes — no real beneficiary has used ReliefChain.

### 9.2 SDG alignment

The proposal names six goals: **SDG 1** No Poverty · **SDG 9** Industry, Innovation and Infrastructure · **SDG 10** Reduced Inequalities · **SDG 11** Sustainable Cities and Communities · **SDG 16** Peace, Justice and Strong Institutions · **SDG 17** Partnerships for the Goals.

Stated alignments only. No outcome indicator, measurement method, or reporting commitment exists. SDG 13 (Climate Action) was claimed in the previous BPD on the strength of flood prediction; prediction is out of scope, so that claim is withdrawn.

---

## 10. Finals Positioning

The Top 5 final event is judged on Innovation, Feasibility, Scalability, Impact, Business Plan, and Pitching, with a 10-minute presentation and a 20-minute Q&A ([`relief-chain.md`](relief-chain.md) §17). Twenty minutes of questioning is long enough to reach every soft spot.

| Criterion | Strongest evidence | Exposure |
|---|---|---|
| **Innovation** | Contract-level conservation invariants, chain-evidence coupling, two-phase protocol with device-side signing | The voucher rail is gated — say so before being asked |
| **Feasibility** | It runs on a live hosted project: 54 tables, 77 RLS policies, 13 Edge Functions, 52 migrations, property and DB tests | Testnet only, no monitoring, no legal review |
| **Scalability** | Projection tables, durable reconciliation cursors, stateless Edge Functions | Zero load testing; capacity is asserted, not measured |
| **Impact** | Real controls: DB-enforced duplicate prevention, append-only audit, no personal data on-chain | No pilot, so no measured outcome |
| **Business Plan** | The ~1% fee | **Weakest criterion.** No sizing, no unit economics, no pricing mechanics, no customer |
| **Pitching** | Leading with limits is itself credibility | Any overclaim is one question from collapsing |

**Business Plan is the weakest criterion and will stay weakest until a pilot produces cost and outcome data.** The best available answer is a precise account of what is decided, what is open, and what each open item is waiting on — which is what §3.1, §4.2, and §4.3 provide.

---

## 11. What a Defensible Business Plan Still Needs

In dependency order. Nothing here can be substituted with an estimate.

1. **Legal review** of the token, the fee, and identity handling. Blocks everything commercial.
2. **Fee mechanics** — the eight decisions in §4.2, which together produce the first quotable price.
3. **A named fiat off-ramp partner.** Without one there is no merchant value proposition.
4. **Market sizing from the four named inputs** in §3.1, sourced and dated.
5. **Unit economics from pilot telemetry**, which is the only way to test whether 1% is sustainable.
6. **One pilot organization** with a measured baseline. Every impact and efficiency claim depends on it.
7. **Metric definitions with an agreed event boundary** — Edge acceptance, Horizon submission, ledger close, and reconciliation confirmation are seconds apart and not interchangeable ([BRD](brd-reliefchain.md) §11).
8. **Monitoring and incident response** on the hosted environment. The environment itself now exists ([Build](build-reliefchain.md) §15.0); no pilot can run without observability on it.

---

## Self-Check

- [x] Renamed from ReliefGuard AI to ReliefChain; AI and prediction framing removed
- [x] TAM/SAM/SOM removed; replaced with the inputs a real sizing would require
- [x] Pricing tiers and the 0.5% fee removed; only the decided ~1% fee stated
- [x] Three-year projections, margin table, and ROI case example removed with no replacement
- [x] Named organizations described as prospective targets, not partners
- [x] Commercial readiness stated up front: testnet, simulated cash-out, zero customers, zero revenue
- [x] Unit economics stated as unknown rather than modeled
- [x] GTM expressed as a dependency sequence with exit criteria, not dates or client counts
- [x] Compliance stated as intent with outstanding reviews named
- [x] Business Plan identified as the weakest finals criterion
- [x] Dead links to removed documents eliminated
- [ ] Legal, privacy, and procurement reviews outstanding
- [ ] No pilot, customer, measured cost, or measured outcome exists

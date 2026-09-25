# Documentation Index: ReliefChain

**Project:** ReliefChain — Blockchain-Powered Disaster Relief Distribution Platform  
**Date:** 2026-09-24  
**Version:** 1.0  
**Owner:** MINDMESH  
**Status:** Active  
**Source of truth:** [`relief-chain.md`](relief-chain.md)

---

## 1. Start Here

[`relief-chain.md`](relief-chain.md) is the **canonical source of truth** for ReliefChain. Any developer or AI agent needing to confirm a product fact reads it first. If a document in this folder conflicts with it, resolve the conflict in `relief-chain.md`, then propagate to the affected documents.

`docs/` is the **first place to look** for context — before reading code and before asking.

---

## 2. Documentation Suite

Read in this order.

| # | Document | File | What it answers |
|---:|---|---|---|
| 1 | **Foundation** | [relief-chain.md](relief-chain.md) | Why ReliefChain exists, what it is, identity, workflow, competitive framing, open decisions, finals criteria. Proposal-derived |
| 2 | **BRD** | [brd-reliefchain.md](brd-reliefchain.md) | Business problem, roles, stakeholders, numbered business requirements **with as-built status**, compliance, risk, metrics |
| 3 | **BPD** | [bpd-reliefchain.md](bpd-reliefchain.md) | Commercial readiness, customer segments, the ~1% fee and what is still open, GTM sequence, finals positioning |
| 4 | **PRD** | [prd-reliefchain.md](prd-reliefchain.md) | Personas, features with MoSCoW priority **and as-built status**, user stories, non-goals, business model, roadmap |
| 5 | **SAD** | [sad-reliefchain.md](sad-reliefchain.md) | Architecture pattern, tiers, pinned stack with trade-offs, component communication, quality attributes |
| 6 | **SDD** | [sdd-reliefchain.md](sdd-reliefchain.md) | Subsystems, Edge Function contracts, data flow, schema and trigger families, configuration |
| 7 | **DSD** | [dsd-reliefchain.md](dsd-reliefchain.md) | Design tokens, appearance modes, component and navigation specs, accessibility posture |
| 8 | **Flow** | [flow-reliefchain.md](flow-reliefchain.md) | The honest status map: built ✅ · gated or simulated 🟡 · planned ⬜ · out of scope ❌ |
| 9 | **Build** | [build-reliefchain.md](build-reliefchain.md) | Setup, commands, code patterns, guardrails, known issues, Definition of Done |
| 10 | **Sprint** | [sprint-reliefchain.md](sprint-reliefchain.md) | **Use for anything sprint-related.** 32 user stories with acceptance criteria, priorities, roles, assignment, and the gaps between backlog and as-built |

**Supporting repository documents**

| Document | File | Purpose |
|---|---|---|
| Environment setup | [SETUP.md](SETUP.md) | Canonical step-by-step local and testnet procedure |
| Repository readme | [../README.md](../README.md) | Orientation and the testnet-only boundary |
| Agent rules | [../AGENTS.md](../AGENTS.md) | Operating rules for AI agents and developers |
| Original proposal | [final-proposal.md](final-proposal.md) | The written UTHACK ANG PUHUNAN 2026 submission — historical product input |
| Sprint sheet export | [sprint.html](sprint.html) | Google Sheets export of the backlog — source of [sprint-reliefchain.md](sprint-reliefchain.md); read the Markdown instead |

---

## 3. Platform Summary — As Built

```
ReliefChain — Stellar TESTNET only · asset RCPHP · no monetary value

  ONE EXPO BINARY, THREE ROLE SURFACES
  ├── (lgu)          programs · beneficiaries · disbursements · dashboard
  ├── (beneficiary)  entitlements · QR pay/scan · wallet recovery
  └── (merchant)     signed QR invoice · settlements · metrics · cash-out

  SUPABASE EDGE FUNCTIONS — two-phase prepare / submit
  └── device signs; the server never holds a beneficiary key

  POSTGRES CONTROL PLANE
  └── RLS + workflow, append-only, and chain-evidence triggers

  STELLAR TESTNET
  ├── cash rail via RCPHP SAC .............................. reachable
  └── VoucherContract escrow (conservation invariants) ..... built, gated
```

**Not implemented:** Bluetooth offline sync, SMS notifications, donor portal, analytics UI.  
**Simulated:** merchant cash-out.  
**Deployed:** a hosted Supabase **testnet demo** project — 52 migrations, 13 Edge Functions, demo accounts ([build](build-reliefchain.md) §15.0).  
**Out of scope:** mainnet, real funds, AI prediction, production deployment (release signing, monitoring, incident response).

---

## 4. Change Log

| Date | Change | Documents |
|---|---|---|
| 2026-09-24 | Moved `SETUP.md` into `docs/` and repaired the links in `build-reliefchain.md`, `index.md`, `AGENTS.md`, and `README.md`. Corrected SETUP.md's stale facts: it described a **committed native `android/` project and Gradle wrapper** that does not exist (both `android/` and `ios/` are gitignored generated output, so `expo run:android` prebuilds) — closing known issue 4; added `lgu-signup` to the function list for 13 total; replaced the manual `STELLAR_CONTRACT_ADMIN_SECRET` instruction with `provision-contract-admin.mjs`; documented `EXPO_PUBLIC_DEMO_MODE`, bundle-time env inlining, the `--local` vs `--linked` reset hazard, the seed scripts' silent local default, and the conflicting addresses in `seed-test-users.mjs` / `seed-full-demo.mjs`; added the missing npm scripts to §11. Rewrote README's quick links, which pointed at the deleted `ReliefChain_Project_Direction.md` and `.kiro/specs/` — closing known issue 5. | [SETUP.md](SETUP.md) · [build-reliefchain.md](build-reliefchain.md) · [../README.md](../README.md) · [../AGENTS.md](../AGENTS.md) |
| 2026-09-24 | **Executed the hosted deployment.** Project `hmbraapdnkoxpepdqgaa` was rebuilt with `db reset --linked` (all 52 migrations), the Stellar topology re-bootstrapped with a new RCPHP issuer and SAC, 16 Edge secrets set, **13** Edge Functions deployed, and demo accounts seeded. Recorded as [build-reliefchain.md](build-reliefchain.md) §15.0 and propagated through every status claim: "no hosted environment" replaced with "hosted testnet demo, unoperated" in the BRD, BPD, SAD, SDD, PRD, Flow, and SETUP.md §13. Corrected the object counts from static migration greps to live introspection — **54 tables, 77 RLS policies, 79 triggers** (was "52 tables, 113 policies, ~74 triggers"). Recovered the orphaned `lgu-signup` function source and hardened it with `verify_jwt = true`, closing known issue 13 and raising the function count from 12 to 13. Corrected the demo password to `password`. | All |
| 2026-09-24 | Added the hosted deployment runbook as [build-reliefchain.md](build-reliefchain.md) §15 — link, `db push`, Edge secrets, `functions deploy`, EAS env vars, demo APK, hosted seeding, and a pre-demo checklist. Resolved known issues 1 (added `20260925090000_restore_wallet_binding_trigger.sql`), 3 (deleted the stale `app.json`), and partly 6 (`production` now emits an AAB; new `demo` profile emits the sideloadable APK). Added issues 13–15: the missing `lgu-signup` function, the `resetPasswordForEmail` redirect gap, and the absent `.env.bootstrap.local` signer secrets. Added `scripts/check-release-env.mjs` + `npm run check:release-env` to fail a release build whose env would silently fall back to the placeholder Supabase project. | [build-reliefchain.md](build-reliefchain.md) |
| 2026-09-24 | Converted the `sprint.html` sheet export into [sprint-reliefchain.md](sprint-reliefchain.md): all 32 user stories with acceptance criteria, priorities, roles, and sheet notes. Normalised the duplicate `ADM-01` and the `ORG-010`–`ORG-013` IDs, and added a reconciliation section covering the Platform Admin and Verification Officer roles the backlog assumes but the code does not have. Established it as the reference for all sprint work in `AGENTS.md`. | [sprint-reliefchain.md](sprint-reliefchain.md) · [../AGENTS.md](../AGENTS.md) |
| 2026-09-24 | Rewrote the two remaining business documents as [brd-reliefchain.md](brd-reliefchain.md) and [bpd-reliefchain.md](bpd-reliefchain.md), then removed `brd-reliefguard.md` and `bpd-reliefguard.md`. Removed unsourced claims carried over from ReliefGuard AI: TAM/SAM/SOM sizing, ₱150k–₱600k subscription tiers, the 0.5% fee, three-year revenue and margin projections, the ROI case example, "0% fraud", "~2,000x faster", the named-partner architecture, and SDG 13. The business model is now limited to the decided ~1% transaction fee, with unit economics marked unknown. | [brd-reliefchain.md](brd-reliefchain.md) · [bpd-reliefchain.md](bpd-reliefchain.md) |
| 2026-09-24 | Replaced the ReliefGuard AI documentation set with an as-built ReliefChain suite. Created SAD, SDD, DSD, Flow, and Build documents; rewrote the PRD. Removed superseded SERMS and Axial documents (`Build.md`, `SAD.md`, `flow.md`, `Axial.md`, `dsd-axial.md`, `prd-axial.md`, `sdd-axial.md`). Established `relief-chain.md` as source of truth. | All |
| 2026-09-24 | Added the Top 5 finals criteria and 10-minute pitch plus 20-minute Q&A format as §17. | [relief-chain.md](relief-chain.md) |
| 2026-09-24 | Created the foundation document from the written proposal. | [relief-chain.md](relief-chain.md) |

---

## 5. Health Check

- [x] `relief-chain.md` is named as source of truth in all nine suite documents
- [x] Every feature claim in the suite carries a status mark
- [x] Testnet-only and RCPHP no-value boundaries stated across the suite
- [x] Bluetooth, SMS, and donor portal documented as roadmap with no code
- [x] The voucher rail is described as built, tested, and gated, with the gate cited
- [x] Known issues and documentation drift recorded in [build-reliefchain.md](build-reliefchain.md) §8
- [x] No ReliefGuard AI document remains; unsourced market, pricing, and projection claims removed
- [x] Named government, NGO, and merchant entities described as prospective targets, not partners
- [x] The sprint backlog is in version-controlled Markdown and named as the reference for sprint work
- [ ] No sprint story is assigned or started — Developer and Status columns are empty across all 32
- [ ] Platform Admin and Verification Officer roles are assumed by the backlog but absent from the code
- [ ] SLOs, dark mode, localization, fee mechanics, and unit economics remain TBD
- [ ] Legal, privacy, and procurement reviews have not started — the top gate before any commercial activity

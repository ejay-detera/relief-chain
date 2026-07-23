# Documentation Index: ReliefGuard AI

**Project:** ReliefGuard AI (ReliefChain)  
**Maintained by:** ReliefGuard AI Engineering & Product Team  
**Last updated:** 2026-07-22  
**Version:** 1.0.0  
**Hackathon Context:** [2026 PUP Hackathon: UtHack ang Puhunan](2026-pup-uthackathon.md) — Deadline July 31, 2026

---

## 1. Documentation Suite

This index maps the canonical documentation suite for the ReliefGuard AI platform and ReliefChain subsystem.

### Core Product & Business Strategy

| Document | File | Status | Description |
|---|---|---|---|
| **BRD** (Business Requirements) | [brd-reliefguard.md](brd-reliefguard.md) | Approved (v2.0) | Complete Business Requirements Document: 4-phase lifecycle, 13 core features with implementation status, system roles (Organization, Merchant, Beneficiary), stakeholder ecosystem, actual tech stack, business model, risk matrix, KPIs, hackathon alignment, and UN SDGs. |
| **PRD** (Product Requirements) | [prd-reliefchain.md](prd-reliefchain.md) | Approved (v1.0) | Complete technical and functional requirements: 4-phase disaster lifecycle (Predict, Prepare, Respond, Recover), user roles, Stellar testnet boundary, and MoSCoW feature status. |
| **BPD** (Business Product Document) | [bpd-reliefguard.md](bpd-reliefguard.md) | Approved (v1.0) | Business model & strategy: B2G SaaS + micro-transaction revenue model, TAM/SAM/SOM market sizing, GTM wedge strategy, LGU ROI, regulatory risk matrix, and SDG alignment. |
| **Project Overview** | [mindmesh-project-overview.md](mindmesh-project-overview.md) | Reference | Comprehensive system architecture overview covering AI flood prediction, smart resource planning, programmable digital vouchers, and competitive positioning. |
| **Project Direction** | [ReliefChain_Project_Direction.md](../ReliefChain_Project_Direction.md) | Approved | High-level elevator pitch, core feature definitions, and user role specifications (LGU, Beneficiary, Merchant, Donor/Auditor). |
| **Hackathon Guidelines** | [2026-pup-uthackathon.md](2026-pup-uthackathon.md) | Reference | Official 2026 PUP Hackathon prompt, submission deliverables (Written Proposal PDF + 2–3 min YouTube Video), topic alignment, and judging criteria. |

### Technical Setup & Operation Guides

| Document | File | Description |
|---|---|---|
| **Environment & Developer Setup** | [SETUP.md](../SETUP.md) | Step-by-step setup guide for Windows/Android, Supabase local stack, Docker, Edge Functions, and Stellar testnet bootstrapping. |
| **Demo Quick Start** | [DEMO_QUICK_START.md](../DEMO_QUICK_START.md) | Fast 5-minute guide for setting up and running live presentation payment demos. |
| **Demo Checklist** | [DEMO_CHECKLIST.md](../DEMO_CHECKLIST.md) | Pre-presentation verification checklist and emergency troubleshooting procedures. |
| **Demo Mode Guide** | [DEMO_MODE_GUIDE.md](../DEMO_MODE_GUIDE.md) | Comprehensive guide on Demo Mode configuration and simulation flags. |
| **Payment Fix Complete** | [PAYMENT_FIX_COMPLETE.md](../PAYMENT_FIX_COMPLETE.md) | Details on Stellar payment pipeline fixes, idempotency, and prepare/submit lifecycle. |

---

## 2. Platform Architecture Summary

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           RELIEFGUARD AI                                │
│                     Disaster Resilience Platform                        │
├────────────────────────────────────┬────────────────────────────────────┤
│         BEFORE DISASTER            │           AFTER DISASTER           │
│     AI Prediction & Planning       │     Blockchain Relief (ReliefChain)│
├────────────────────────────────────┼────────────────────────────────────┤
│ • Phase 1: Predict                 │ • Phase 3: Respond                 │
│   PAGASA, NOAH, IoT, Flood Models  │   LGU Aid Programs, Beneficiary    │
│ • Phase 2: Prepare                 │   Verification, Stellar Vouchers,  │
│   Smart Resource & Budget Plan     │   Merchant QR POS Payments         │
│                                    │ • Phase 4: Recover                 │
│                                    │   Real-Time Donor Transparency,    │
│                                    │   On-Chain Audit Trail             │
└────────────────────────────────────┴────────────────────────────────────┘
```

---

## 3. Change Log

| Date | Change Description | Docs Affected |
|---|---|---|
| 2026-07-24 | Authored Business Requirements Document (BRD) based on PDF specification covering 4-phase lifecycle, 13 core features, system roles, Stellar justification, competitive matrix, and UN SDGs. | [brd-reliefguard.md](brd-reliefguard.md) |
| 2026-07-22 | Rewrote PRD to align fully with ReliefGuard AI / ReliefChain platform scope and Stellar testnet boundaries. | [prd-reliefchain.md](prd-reliefchain.md) |
| 2026-07-22 | Authored Business Product Document (BPD) covering TAM/SAM/SOM, B2G SaaS pricing, LGU ROI, GTM strategy, and SDG alignment. | [bpd-reliefguard.md](bpd-reliefguard.md) |
| 2026-07-22 | Updated documentation index to align with ReliefGuard AI and remove legacy OCR pipeline references. | [index.md](index.md) |

---

## 4. Documentation Health Check

Quick triage checklist to ensure system and documentation alignment:
- [x] All primary documents point to **ReliefGuard AI** as the umbrella platform and **ReliefChain** as the blockchain distribution subsystem.
- [x] Stellar testnet boundary is explicitly documented across PRD and setup guides (RCPHP test asset only, Mainnet hard-disabled).
- [x] Tech stack alignment verified: React Native / Expo SDK 57 (mobile-first), Supabase (PostgreSQL, Auth, Storage, Edge Functions), `@stellar/stellar-sdk` v16.
- [x] AI features correctly categorized into Implemented vs. Designed/Mock for hackathon demonstration purposes.

# Business Product Document (BPD)

**Project:** ReliefGuard AI  
**Date:** 2026-07-22  
**Version:** 1.0  
**Owner:** ReliefGuard AI Product & Business Strategy Lead  
**Status:** Draft  
**Related Documents:** [Product Requirements Document (PRD)](prd-reliefchain.md) · [Project Overview](mindmesh-project-overview.md) · [Project Direction](../ReliefChain_Project_Direction.md)  
**Hackathon Context:** [2026 PUP Hackathon: UtHack ang Puhunan](2026-pup-uthackathon.md) — Deadline July 31, 2026

---

## 1. Executive Summary & Value Proposition

### 1.1 Business Vision
ReliefGuard AI is a high-impact, enterprise-grade **B2G (Business-to-Government) and B2NGO disaster resilience platform** that integrates Artificial Intelligence (AI) and Blockchain technology to modernize disaster preparedness, financial aid distribution, and post-disaster recovery across the Philippines.

### 1.2 One-Line Value Proposition
> *"ReliefGuard AI empowers LGUs and humanitarian organizations to predict flood risks before disasters strike and disburse transparent, fraud-proof digital financial aid in minutes instead of days."*

### 1.3 Key Value Drivers
- **Velocity:** Reduces aid disbursement turnaround time from 7–14 days to **under 5 minutes** via instant Stellar network settlement.
- **Accountability:** Eliminates leakage, middleman corruption, and phantom recipient fraud through on-chain cryptographic tracking and programmable digital vouchers.
- **Proactive Preparedness:** Replaces reactive emergency spending with AI-driven early warnings, flood depth estimation, and automated resource planning.
- **Dignity & Local Economy Support:** Empowers disaster victims to buy food, medicine, and building supplies directly from accredited local merchants, stimulating local disaster economy recovery.

---

## 2. Market Opportunity & Problem Validation

### 2.1 The Philippine Context
The Philippines is geographically situated in the Pacific Ring of Fire and the Typhoon Belt, making it one of the most natural-disaster-prone countries globally:
- **Typhoon Frequency:** An average of **20+ tropical cyclones** enter the Philippine Area of Responsibility (PAR) annually.
- **Economic Loss:** Direct climate-related disaster damage exceeds **₱50 Billion to ₱100 Billion annually** in agriculture, infrastructure, and local commerce.
- **Demographic Exposure:** Over **60% of the Philippine population** resides in coastal or low-lying flood-vulnerable municipalities.

### 2.2 Problem Validation: Current Relief Bottlenecks

```
[ Traditional Disaster Relief Bottlenecks ]
┌────────────────────────┐      ┌────────────────────────┐      ┌────────────────────────┐
│  Generalized Forecast  │ ───► │ Manual Verification    │ ───► │ Physical Cash Handling │
│  Late, broad warnings  │      │ Paper lists & queues   │      │ Theft, loss, high cost │
└────────────────────────┘      └────────────────────────┘      └────────────────────────┘
                                                                            │
                                                                            ▼
┌────────────────────────┐      ┌────────────────────────┐      ┌────────────────────────┐
│  Opaque Post-Audit     │ ◄─── │ Merchant Delays        │ ◄─── │ Uncontrolled Spending  │
│  Months to reconcile   │      │ Slow gov't reimbursement│     │ Non-essential purchases│
└────────────────────────┘      └────────────────────────┘      └────────────────────────┘
```

1. **Before the Disaster (Prediction & Planning Gap):**
   - LGUs rely on regional weather forecasts without barangay-level flood depth elevation modeling.
   - Resource allocation (food packs, medical kits) is based on guesswork, leading to severe supply mismatches.
2. **After the Disaster (Distribution & Transparency Gap):**
   - **Slow Cash Distribution:** Manual physical verification causes beneficiary lines lasting hours to days.
   - **High Administrative Overhead:** Processing paper receipts, logistics, and manual physical cash security costs up to 15–20% of total relief budgets.
   - **Fraud & Double-Dipping:** Duplicate registrations across different aid programs and unauthorized proxies claiming funds.
   - **Lack of Spending Controls:** Physical cash disbursements cannot guarantee funds are spent on basic necessities (food/medicine) rather than non-essential items.

### 2.3 Addressable Market Sizing (TAM / SAM / SOM)

```
+-------------------------------------------------------------------+
|  TAM: $3.2B / ₱180B  (Global Climate Resilience Tech & Emergency Relief)
|  +----------------------------------------------------------------+
|  |  SAM: $280M / ₱15.6B  (Philippine LGU DRRM & Humanitarian Relief)
|  |  +-------------------------------------------------------------+
|  |  |  SOM: $18M / ₱1.0B  (Target 1st-3rd Class Flood Belt LGUs & Top NGOs)
|  +----------------------------------------------------------------+
+-------------------------------------------------------------------+
```

- **Total Addressable Market (TAM):** **$3.2 Billion (~₱180 Billion)** — Global emergency response, humanitarian fund distribution software, and climate risk analytics market.
- **Serviceable Addressable Market (SAM):** **$280 Million (~₱15.6 Billion)** — Total annual Disaster Risk Reduction and Management (DRRM) fund allocation across all 1,488 municipalities, 146 cities, and 82 provinces in the Philippines, plus international aid agency budgets in PH.
- **Serviceable Obtainable Market (SOM):** **$18 Million (~₱1.0 Billion)** — Initial capture target: 120 High-Risk Flood Belt 1st & 2nd Class LGUs in Luzon (e.g., Marikina, Bulacan, Pampanga, Cagayan) and major international NGO disaster budgets within 3 years.

---

## 3. Target Market & Customer Segments

ReliefGuard AI serves a multi-sided B2G/B2NGO ecosystem:

```
                          ┌────────────────────────┐
                          │    ReliefGuard AI      │
                          │   Platform Core        │
                          └───────────┬────────────┘
                                      │
        ┌───────────────────┬─────────┴─────────┬───────────────────┐
        ▼                   ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│ LGU / Gov't   │   │ Beneficiaries │   │ Accredited    │   │ Donors &      │
│ Buyers        │   │ (Citizens)    │   │ Merchants     │   │ Auditors      │
└───────────────┘   └───────────────┘   └───────────────┘   └───────────────┘
```

| Customer Segment | Core Motivation / Value Driver | Decision Maker | Monetization / Role |
|---|---|---|---|
| **LGU / Local DRRMOs** | Faster emergency response, zero fund leakage, audit compliance, public trust | City/Municipal Mayor, DRRMO Head, City Treasurer | Primary Paying Customer (SaaS + Micro-fee) |
| **Humanitarian NGOs** (Red Cross, UNICEF, etc.) | High accountability, instant donor report generation, target aid delivery | Country Director, Disaster Response Operations Lead | Institutional Partner / Co-Licensee |
| **Beneficiaries** (Citizens) | Fast, dignified aid delivery without queues; transparent balance tracking | Head of Household | End User (Free) |
| **Accredited Merchants** (Groceries, Pharmacies) | Direct surge in local retail revenue post-disaster, instant digital settlement | Store Owner / Retail Operator | Network Partner (Free / Low settlement friction) |
| **Donors & Auditors** (COA, International Donors) | Real-time on-chain verifiable audit trail, transparent budget utilization | Audit Lead / Program Director | Platform Viewer (Free Transparency Access) |

---

## 4. Product Offering & Four-Phase Business Value

ReliefGuard AI offers a unified end-to-end service across the 4 disaster management phases:

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ 1. PREDICT      │ ──► │ 2. PREPARE      │ ──► │ 3. RESPOND      │ ──► │ 4. RECOVER      │
│ AI Flood Risk   │     │ Smart Resource  │     │ Blockchain Aid  │     │ Transparency &  │
│ Forecasting     │     │ & Budget Plan   │     │ & Vouchers      │     │ On-Chain Audit  │
└─────────────────┘     └─────────────────┘     └─────────────────┘     └─────────────────┘
```

### Phase 1: Predict (AI Risk Analytics)
- **Business Value:** Prevents loss of life and property damage by providing barangay-level flood depth forecasts 24–48 hours ahead of conventional weather advisories.
- **Key Modules:** AI Flood Forecasting Engine (PAGASA + UP NOAH + IoT data), Interactive GIS Risk Heatmap.

### Phase 2: Prepare (Resource Optimization)
- **Business Value:** Eliminates stockouts and budget waste by algorithmically recommending exact quantities of food packs, medical kits, and evacuation center capacity.
- **Key Modules:** Smart Resource Allocator, Automated Emergency Budget Estimator.

### Phase 3: Respond (Blockchain Aid Distribution)
- **Business Value:** Enables instant, zero-cash aid distribution using programmable digital vouchers on the Stellar network.
- **Key Modules:** LGU Program Portal, Digital Wallet Custody, Purpose-Bound Vouchers (Food 🍚, Medicine 💊, Shelter 🏠), Merchant QR POS Acceptance.

### Phase 4: Recover (Auditability & Analytics)
- **Business Value:** Provides complete financial transparency for Commission on Audit (COA) compliance and donor reporting.
- **Key Modules:** Real-Time Donor Portal, On-Chain Transaction Verification, Post-Disaster Performance Metrics.

---

## 5. Business & Revenue Model

ReliefGuard AI employs a **Hybrid B2G SaaS + Micro-Transaction Fee** model designed to align with Philippine LGU procurement laws (RA 9184) and Disaster Risk Reduction and Management (DRRM) budget guidelines.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        REVENUE MODEL MATRIX                            │
├─────────────────────────┬─────────────────────────┬────────────────────┤
│ Revenue Stream          │ Target Customer         │ Pricing Structure  │
├─────────────────────────┼─────────────────────────┼────────────────────┤
│ 1. Annual LGU Tier SaaS │ Municipalities & Cities │ ₱150,000 - ₱600,000│
│    Subscription         │                         │ per year (by Class)│
├─────────────────────────┼─────────────────────────┼────────────────────┤
│ 2. Aid Disbursement     │ DRRMO Fund / NGO        │ 0.5% - 1.0% micro- │
│    Transaction Fee      │ Emergency Allocation    │ fee per payout     │
├─────────────────────────┼─────────────────────────┼────────────────────┤
│ 3. Premium Risk &       │ Insurance & Private     │ Custom Enterprise  │
│    Climate Analytics    │ Real Estate Developers  │ Subscription API   │
└─────────────────────────┴─────────────────────────┴────────────────────┘
```

### 5.1 Pricing Tiers

1. **Tier 1: 3rd - 5th Class Municipalities**
   - **Annual Subscription:** ₱150,000 / year
   - **Includes:** Core Relief Distribution, up to 10,000 beneficiary wallets, basic flood prediction map, standard email/chat support.
2. **Tier 2: 1st - 2nd Class Cities & Municipalities**
   - **Annual Subscription:** ₱350,000 / year
   - **Includes:** Advanced AI Flood Depth Modeling, unlimited beneficiary wallets, merchant QR network setup, priority 24/7 emergency support.
3. **Tier 3: Highly Urbanized Cities (HUCs) & Provincial Governments**
   - **Annual Subscription:** ₱600,000 / year
   - **Includes:** Multi-barangay consolidated dashboard, custom GIS drone/sensor data integration, multi-department role access, custom COA audit exports.

### 5.2 Micro-Transaction Fee (Disbursement Volume)
- **Fee Rate:** **0.5%** charged on total disbursed funds (e.g., ₱10,000,000 relief program = ₱50,000 platform processing fee).
- **Justification:** Substantially lower than traditional cash logistics and physical security costs (which range from 5% to 15%).

### 5.3 Financial Projections (3-Year Horizon)

| Metric | Year 1 (Pilot) | Year 2 (Growth) | Year 3 (Scale) |
|---|---|---|---|
| **Active LGU Clients** | 10 LGUs | 45 LGUs | 120 LGUs |
| **Active NGO Partners** | 2 NGOs | 6 NGOs | 15 NGOs |
| **Total Aid Disbursed (PHP)** | ₱50 Million | ₱350 Million | ₱1.2 Billion |
| **SaaS Subscription Revenue** | ₱3.5 Million | ₱18.0 Million | ₱54.0 Million |
| **Transaction Fee Revenue (0.5%)** | ₱250,000 | ₱1.75 Million | ₱6.0 Million |
| **Gross Revenue** | **₱3.75 Million** | **₱19.75 Million** | **₱60.0 Million** |
| **Gross Margin** | 72% | 81% | 86% |

---

## 6. Go-To-Market (GTM) Strategy & Rollout Plan

### 6.1 GTM Wedge Strategy: High-Risk Flood Belt LGUs First

```
[ Phase 1: High-Risk Wedge ]      [ Phase 2: Regional Scale ]      [ Phase 3: National Standard ]
┌──────────────────────────┐      ┌──────────────────────────┐      ┌──────────────────────────┐
│ Marikina, Bulacan,       │ ───► │ Provincial DRRMOs &      │ ───► │ DSWD National Rollout &  │
│ Pampanga, Cagayan        │      │ Major NGO Networks       │      │ ASEAN Expansion          │
└──────────────────────────┘      └──────────────────────────┘      └──────────────────────────┘
```

1. **Phase 1: Pilot Deployment (Months 1–6)**
   - Target 5 key high-risk pilot LGUs along the Luzon typhoon corridor (e.g., Marikina City, Malolos City, Hagonoy Bulacan).
   - Execute Memorandums of Agreement (MOA) for sandbox trial during the peak typhoon season.
   - Onboard 50+ local grocery and pharmacy merchants per municipality.
2. **Phase 2: Regional Scaling & NGO Integration (Months 7–18)**
   - Expand to 40+ LGUs across Luzon and Visayas (Cagayan Valley, Bicol Region, Eastern Visayas).
   - Partner with Philippine Red Cross and international aid agencies (UNICEF, World Vision) for joint program delivery.
3. **Phase 3: Institutionalization & Policy Integration (Months 19–36)**
   - Partner with DILG and DSWD to certify ReliefGuard AI as an approved digital relief management tool.
   - Scale to 120+ LGUs nationwide.

---

## 7. Strategic Partnerships & Local Ecosystem Collaborators

Per hackathon submission requirements, ReliefGuard AI leverages a multi-stakeholder collaborative ecosystem:

```
┌────────────────────────────────────────────────────────────────────────┐
│                   ECOSYSTEM PARTNERSHIP ARCHITECTURE                   │
├──────────────────────────┬─────────────────────────────────────────────┤
│ Partner Category         │ Strategic Partner & Role                    │
├──────────────────────────┼─────────────────────────────────────────────┤
│ Government & DRRM        │ • DSWD (Department of Social Welfare & Dev) │
│                          │ • NDRRMC & DILG (LGU Digital Directive)     │
│                          │ • Local City/Municipal DRRMOs               │
├──────────────────────────┼─────────────────────────────────────────────┤
│ Weather & Hydrology Data │ • PAGASA (National Weather Bureau)          │
│                          │ • UP NOAH (Nationwide Operational Assessment)│
│                          │ • MMDA Flood Control Command                │
├──────────────────────────┼─────────────────────────────────────────────┤
│ Financial & Blockchain   │ • Stellar Development Foundation (SDF)      │
│                          │ • Licensed PH VASPs / Anchors               │
│                          │   (Coins.ph, Maya, PDAX for PHP liquidity)  │
├──────────────────────────┼─────────────────────────────────────────────┤
│ Merchant & Retail        │ • Supermarket Chains (Puregold, SM Markets) │
│                          │ • Pharmacy Chains (Mercury Drug, Generika)  │
│                          │ • Barangay Sari-Sari Store Associations     │
├──────────────────────────┼─────────────────────────────────────────────┤
│ Humanitarian NGOs        │ • Philippine Red Cross                      │
│                          │ • UNICEF Philippines / World Vision PH      │
└──────────────────────────┴─────────────────────────────────────────────┘
```

---

## 8. Operational & Financial ROI for LGUs

Deploying ReliefGuard AI provides measurable cost savings, velocity improvements, and operational efficiency gains for local government units:

```
┌────────────────────────────────────────────────────────────────────────┐
│                       LGU ROI & IMPACT METRICS                         │
├─────────────────────────────┬───────────────────┬──────────────────────┤
│ Metric                      │ Traditional Process│ ReliefGuard AI       │
├─────────────────────────────┼───────────────────┼──────────────────────┤
│ Aid Disbursement Velocity   | 7 to 14 Days      │ < 5 Minutes          │
├─────────────────────────────┼───────────────────┼──────────────────────┤
│ Admin & Cash Logistics Cost | 12% - 18% of budget │ < 2.5% of budget     │
├─────────────────────────────┼───────────────────┼──────────────────────┤
│ Duplicate / Fraudulent Claims| 8% - 15% estimated │ 0% (Cryptographic)   │
├─────────────────────────────┼───────────────────┼──────────────────────┤
│ Merchant Settlement Time    │ 30 to 90 Days     │ Instant / Real-Time  │
├─────────────────────────────┼───────────────────┼──────────────────────┤
│ Audit Reconciliation Time   │ 3 to 6 Months     │ Automated / 1 Click  │
└─────────────────────────────┴───────────────────┴──────────────────────┘
```

### Case Example (Standard Municipality Relief Program):
- **Disaster Budget:** ₱10,000,000 (10,000 Beneficiaries @ ₱1,000 each)
- **Traditional Logistics & Paper Cost:** ~₱1,500,000 (15%)
- **ReliefGuard AI Software & Micro-Fee Cost:** ~₱200,000 (2%)
- **Net Taxpayer Savings per Disaster Event:** **₱1,300,000 (~86% savings on admin overhead)**

---

## 9. Governance, Regulatory Compliance & Risk Matrix

### 9.1 Compliance Framework

```
┌────────────────────────┐      ┌────────────────────────┐      ┌────────────────────────┐
│ BSP VASP / Anchor      │      │ Data Privacy Act (DPA) │      │ COA Audit Readiness    │
│ Non-custodial voucher  │      │ NPC Circular 16-01     │      │ Immutable ledger logs  │
│ architecture           │      │ Encryption at rest     │      │ Full receipt lineage   │
└────────────────────────┘      └────────────────────────┘      └────────────────────────┘
```

1. **Bangko Sentral ng Pilipinas (BSP) Compliance:**
   - Relief Vouchers are closed-loop digital tokens (RCPHP) valid solely at accredited merchants for basic relief goods, operating under BSP closed-loop payment exemptions.
   - Fiat liquidity cash-out is routed through licensed Philippine VASPs/EMIs (Coins.ph, Maya).
2. **Data Privacy Act of 2012 (RA 10173):**
   - Beneficiary PII (Personally Identifiable Information) is encrypted at rest using AES-256 in Supabase PostgreSQL with strict Row Level Security (RLS).
   - Only anonymized transaction hashes, wallet public keys, and timestamps are recorded on the public Stellar blockchain.
3. **Commission on Audit (COA) Compliance:**
   - Generates 1-click COA-compliant disbursement audit reports linked to verifiable Stellar transaction hashes and merchant redemption receipts.

### 9.2 Comprehensive Risk Matrix & Mitigation Strategy

| Risk Category | Identified Risk | Impact | Probability | Mitigation Strategy |
|---|---|---|---|---|
| **Regulatory** | BSP virtual asset policy changes or licensing delays | High | Low | Closed-loop voucher architecture; partner directly with existing licensed VASPs/EMIs for cash settlement. |
| **Infrastructure** | Severe power outages and cell tower failure during typhoons | High | Medium | Implement offline QR token caching on merchant devices with auto-sync upon reconnection; SMS gateway fallback. |
| **Procurement** | Slow LGU procurement cycles (RA 9184 compliance) | Medium | High | Utilize emergency DRRM procurement exemptions (Section 53.2 Emergency Modality under RA 9184 IRA rules). |
| **Liquidity & Merchant** | Merchant hesitation to accept digital vouchers or cash-out delay | Medium | Medium | Pre-enroll anchor supermarket/pharmacy chains; guarantee instant 1-click VASP bank/e-wallet bank transfer settlement. |
| **Political** | Turnover of LGU administration during local elections | Medium | High | Institutionalize software adoption through Barangay DRRM Council resolutions and DILG digital governance benchmarking. |

---

## 10. Social Impact & SDG Alignment (PUP Hackathon Criteria)

ReliefGuard AI directly aligns with the **2026 PUP Hackathon: UtHack ang Puhunan** evaluation criteria, demonstrating tangible societal impact:

```
┌────────────────────────────────────────────────────────────────────────┐
│                 UN SUSTAINABLE DEVELOPMENT GOALS (SDGs)                 │
├────────────────────────────────────────────────────────────────────────┤
│ • SDG 1: No Poverty — Protects vulnerable families from disaster shock │
│ • SDG 9: Industry & Innovation — Leverages AI & Stellar blockchain     │
│ • SDG 10: Reduced Inequalities — Fair, transparent aid distribution     │
│ • SDG 11: Sustainable Cities — Enhances LGU disaster climate resilience│
│ • SDG 13: Climate Action — Early flood warning & proactive preparedness│
│ • SDG 16: Strong Institutions — Zero-corruption, audit-ready governance│
│ • SDG 17: Partnerships — Unites Gov't, NGOs, Tech, and Merchants       │
└────────────────────────────────────────────────────────────────────────┘
```

- **Inclusivity & Dignity:** Ensures senior citizens, PWDs, single parents, and vulnerable households receive emergency assistance directly without standing in harsh climate conditions.
- **Local Economic Stimulus:** Keeps disaster relief spending within the local municipality's merchant economy rather than importing centralized relief goods from outside distributors.

---

## Self-Check & Document Validation

- [x] Executive Summary and value proposition clearly stated
- [x] Market opportunity validated with Philippine disaster data and TAM/SAM/SOM sizing
- [x] Target personas and B2G/B2NGO customer segments defined
- [x] 4-Phase Product Lifecycle (Predict, Prepare, Respond, Recover) mapped to business value
- [x] Hybrid B2G SaaS + Micro-transaction fee revenue model detailed with 3-year financial projections
- [x] High-Risk Flood Belt LGU Go-To-Market (GTM) strategy outlined
- [x] Ecosystem local partners and collaborators specified (PAGASA, UP NOAH, DSWD, Stellar/VASPs, Merchants, NGOs)
- [x] LGU ROI & financial cost savings quantified
- [x] Regulatory compliance (BSP, DPA, COA) and 5-tier Risk Matrix addressed
- [x] PUP Hackathon alignment & UN SDGs mapped

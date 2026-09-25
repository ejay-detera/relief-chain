# ReliefChain — Foundation Document

**Version:** 1.1  
**Date:** 2026-09-24  
**Status:** Draft Living Foundation — written proposal plus team-supplied finals rules

> This document is the foundation reference for ReliefChain's purpose, product thinking, identity, proposed workflow, and technical direction.
>
> **Factual-source boundary:** product facts in this document come from [`final-proposal.md`](final-proposal.md). Competition finals facts in §17 come from the finals rules supplied directly by the team (sections **F3** and **G**). These two sources are kept separate and are never merged into one another.
>
> This is a proposal-derived document, not evidence that the described capabilities are already implemented, integrated, deployed, certified, or operating in production. Where the proposal is silent, this document says **Open**, **TBD**, or **Not stated** rather than inventing an answer.

---

## FOR DEVS + TL;DR

> If you read nothing else, read this section. It separates the product defined by the proposal from decisions that still need to be made.

### What we're building

ReliefChain is an end-to-end disaster relief distribution platform for governments and humanitarian organizations. An organization creates a relief program, registers and verifies beneficiaries, approves assistance, and distributes purpose-specific digital vouchers using the Stellar blockchain and Soroban. Accredited merchants scan beneficiary QR codes, validate vouchers, confirm redemptions, receive blockchain settlement, and update the transaction ledger. Beneficiaries receive SMS updates when aid is approved, released, or redeemed. When internet access is unavailable, accredited merchants and authorized personnel use Bluetooth to exchange and validate transaction records locally; pending records are synchronized securely with the blockchain after connectivity returns. Organizational dashboards, a privacy-preserving donor portal, and historical disaster analytics provide oversight without exposing beneficiary personal information to donors.

The proposal specifies a React Native 0.86 and Expo SDK 57 client for iOS, Android, and web; Expo Router and TypeScript; Stellar and Soroban through `@stellar/stellar-sdk`; Supabase Edge Functions; Supabase PostgreSQL and Auth with Row-Level Security; QR scanning; secure device storage and biometric authentication; React Native Reanimated and `@expo/ui`; Plus Jakarta Sans; Bluetooth offline synchronization; and an SMS gateway. It does **not** state the current implementation status of these capabilities.

### Proposal-defined product decisions

| Area | Proposal-defined decision | Confidence boundary |
|---|---|---|
| Product category | End-to-end disaster relief distribution platform | Directly stated |
| Proposal context | Submitted for **UTHACK ANG PUHUNAN 2026** | Directly stated |
| Submitting team | **MINDMESH** | Directly stated |
| Primary operators | Governments and humanitarian organizations | Directly stated |
| Assistance instrument | Programmable, purpose-specific digital vouchers | Directly stated |
| Distribution ledger | Stellar blockchain with Soroban | Directly stated |
| Beneficiary eligibility inputs | National ID, Barangay Certificate, DSWD records, household information, and duplicate detection | Directly stated; integration mechanics are not stated |
| Redemption network | Accredited merchants | Directly stated; accreditation policy is not stated |
| Redemption interaction | Merchant scans a beneficiary QR code, validates the voucher, confirms the transaction, receives settlement, and updates the ledger | Directly stated |
| Low-connectivity operation | Bluetooth-based local synchronization between accredited merchants and authorized personnel, followed by blockchain synchronization when connectivity returns | Directly stated; conflict and double-redemption controls are not stated |
| Beneficiary communication | SMS notifications for assistance approval/release and redemption | Directly stated; provider and delivery policy are not stated |
| Organizational oversight | Centralized transparency dashboard | Directly stated |
| Donor oversight | Donor transparency portal that does not reveal beneficiary personal information | Directly stated |
| Historical reporting | Disaster analytics for distribution time, redemption, budget use, geographic coverage, and organization performance | Directly stated |
| Implementation status | Not stated in the proposal | Do not infer from feature wording |

### Proposal-defined architecture in one paragraph

The proposed client is a single React Native 0.86 / Expo SDK 57 application spanning iOS, Android, and web, with Expo Router for navigation and TypeScript for type safety. Device-facing services provide QR scanning, secure local storage, biometric authentication, Bluetooth offline synchronization, and SMS-assisted communication. Supabase Edge Functions form the proposed serverless API and event-processing layer, while Supabase PostgreSQL and Auth provide relational persistence, authentication, real-time synchronization, Row-Level Security, and transaction audit records. Stellar and Soroban provide programmable voucher distribution, redemption settlement, and transparent ledger records. The proposal does not define the exact API contracts, database schema, Soroban contract interfaces, Stellar network, settlement asset, key-custody model, Bluetooth protocol, or synchronization-conflict algorithm.

### Core workflow at a glance

1. A government or humanitarian organization creates a disaster relief program.
2. Beneficiaries are registered and checked using the proposal's listed verification inputs and duplicate detection.
3. Approved beneficiaries are assigned assistance under the relief program.
4. The organization selects **Distribute Funds**, causing programmable digital vouchers to be transferred through the proposed Stellar-based flow.
5. Beneficiaries receive SMS notification that assistance is available.
6. An accredited merchant scans the beneficiary QR code, validates the voucher, confirms redemption, receives blockchain settlement, and updates the ledger.
7. If internet access is unavailable, an accredited merchant and authorized personnel exchange and validate transaction records locally through Bluetooth.
8. Pending offline records synchronize securely with the blockchain after connectivity returns.
9. Organizations monitor operations through the transparency dashboard; donors view program-level utilization without beneficiary personal information; historical metrics feed disaster analytics.

### Scope and status truth table

| Capability | Defined by the proposal | Built or deployed according to the proposal |
|---|---:|---:|
| Relief program management | Yes | Not stated |
| Beneficiary verification | Yes | Not stated |
| Duplicate detection | Yes | Not stated |
| Blockchain aid distribution | Yes | Not stated |
| Programmable vouchers | Yes | Not stated |
| Merchant QR redemption | Yes | Not stated |
| Bluetooth offline synchronization | Yes | Not stated |
| SMS notifications | Yes | Not stated |
| Transparency dashboard | Yes | Not stated |
| Donor transparency portal | Yes | Not stated |
| Disaster analytics | Yes | Not stated |

### Team named in the proposal

The proposal lists the following contributors but does not assign roles or ownership areas:

| Team | Member | Role in source |
|---|---|---|
| MINDMESH | E-jay Detera | Not stated |
| MINDMESH | Shelley Sesante | Not stated |
| MINDMESH | Mobaraq Camar | Not stated |
| MINDMESH | Gabriel, David Jr. M. | Not stated |
| MINDMESH | Jasmine Mikaella Aninion | Not stated |

### Immediate implementation blockers left open by the source

Before production implementation can be claimed, the team must resolve at least the voucher representation, beneficiary and merchant identity model, Stellar network and asset, key custody, offline authorization, replay and double-redemption prevention, synchronization conflicts, on-chain/off-chain privacy boundary, SMS provider, merchant settlement and fiat handling, database schema, contract interfaces, operational recovery, and business model. These are open because the proposal does not supply the answers.

### Finals stage in one line

ReliefChain is judged in the Top 5 finals on innovation, feasibility, scalability, impact, business plan, and pitching, with a **10-minute presentation followed by 20 minutes of judge Q&A**. Because Q&A is twice the pitch length, the open items above are the practical risk surface. Details and criterion-by-criterion readiness are in §17.

---

## 1. Where We Started: The Proposal Context

ReliefChain appears in a written proposal submitted by **MINDMESH** for **UTHACK ANG PUHUNAN 2026** under the title:

> **ReliefChain — Blockchain-Powered Disaster Relief Distribution Platform**

The proposal establishes the product concept, problem framing, feature set, target users, proposed technology stack, Stellar rationale, comparative positioning, and aligned Sustainable Development Goals.

The source does **not** document:

- the date ReliefChain was conceived;
- a research methodology or external research sources;
- event dates, prize details, or selected competition track;
- development milestones or ownership by team member;
- implementation, testing, deployment, or production status;
- partner agreements or government integrations;
- a readable textual business-model description; or
- formal product decisions made after the proposal.

Those omissions are preserved as omissions in this foundation rather than filled from other project documents.

**Finals stage.** The proposal itself does not describe the judging model, but the team has since supplied the Top 5 finals criteria and presentation format. Those facts are recorded separately in [§17](#17-finals-stage-top-5-judging-criteria-and-presentation-format).

---

## 2. The Problem ReliefChain Addresses

Natural disasters can leave thousands of families in urgent need of assistance. The proposal describes relief operations as constrained by administrative friction, fraud exposure, cash risk, weak visibility, and damaged or unavailable connectivity.

### 2.1 Operational failure points

| Problem identified in the proposal | Operational consequence expressed or implied by the proposal |
|---|---|
| Manual beneficiary verification | Slower processing and greater administrative effort |
| Duplicate registrations | Risk that aid records or claims are counted more than once |
| Slow aid distribution | Emergency assistance reaches affected households later than intended |
| Cash handling risks | Physical distribution introduces security and accountability concerns |
| Limited transparency | Organizations and donors cannot easily trace program progress and fund use |
| Difficult auditing | Reconstructing distribution activity is burdensome |
| Fraudulent claims | Assistance may be diverted from intended beneficiaries |
| Poor internet connectivity | Online-only systems may stop working in disaster-affected areas |
| Limited beneficiary communication | People may not know when assistance has been approved, released, or redeemed |

The proposal provides no independent statistics, studies, citations, baseline measurements, or named incident examples for these claims. They are the proposal's product premises and should not be presented elsewhere as independently verified research without additional sourcing.

### 2.2 Why a standard digital wallet is insufficient

The proposal makes a clear category distinction: existing digital wallets transfer money but are not designed to manage the complete disaster assistance lifecycle. ReliefChain is therefore framed around the full operating chain rather than a payment event alone:

- relief program creation;
- beneficiary registration and verification;
- duplicate detection;
- assistance approval;
- programmable voucher issuance;
- purpose restrictions;
- accredited merchant redemption;
- low-connectivity continuity;
- blockchain recording and settlement;
- beneficiary communication;
- organizational monitoring;
- donor transparency; and
- historical analytics.

This end-to-end framing is the central product thesis.

### 2.3 The connectivity constraint

Poor connectivity is treated as a first-class operating condition, not an edge case. The proposal explicitly combines two accessibility mechanisms:

- **SMS notifications** for beneficiaries who may not have smartphones or internet access; and
- **Bluetooth offline synchronization** for local exchange and validation of transaction records between accredited merchants and authorized personnel.

The source promises synchronization after internet connectivity returns, but it does not define the technical or policy controls that make offline redemption safe. That distinction must remain visible in all later designs.

---

## 3. The Product Response: A Complete Relief Distribution Lifecycle

ReliefChain is proposed as one connected platform rather than a collection of unrelated tools. The proposal's lifecycle can be understood as five linked control planes.

### 3.1 Program control

Organizations define a disaster program, its budget, aid type, target beneficiary count, and remaining balance. This establishes the purpose and financial envelope before distribution begins.

### 3.2 Eligibility control

Beneficiary records are checked using National ID, Barangay Certificate, DSWD records, household information, and duplicate detection. The proposal names these inputs but does not define which are mandatory, how they are verified, or how conflicting records are resolved.

### 3.3 Aid control

Approved beneficiaries receive programmable digital vouchers restricted to an intended category. The proposal gives food, medicine, shelter, and school supplies as examples. The enforcement mechanism and voucher representation remain unspecified.

### 3.4 Redemption and continuity control

Accredited merchants validate beneficiary QR codes and confirm transactions. Bluetooth supports local continuity when internet service is unavailable, and pending activity later synchronizes to the blockchain.

### 3.5 Accountability control

Stellar records transactions; organizations monitor live program data; donors view program-level use without beneficiary personal information; and historical analytics measure distribution performance.

The proposal does not document alternative candidate products or a prior candidate selection process. No such history is invented here.

---

## 4. Why the Capabilities Belong Together

The proposal's differentiation depends on convergence across distribution, access, and accountability.

### Speed without program control is incomplete

A fast payment alone does not establish beneficiary eligibility, prevent duplicate registration, constrain use, accredit a merchant, or show program progress. ReliefChain surrounds the transfer with the administrative lifecycle described in the proposal.

### Programmability without accessibility is incomplete

A voucher cannot provide practical assistance if a beneficiary cannot learn that it exists or a merchant cannot process it during a connectivity outage. SMS and Bluetooth are therefore connected to the voucher flow rather than treated as separate conveniences.

### Offline operation without reconciliation is incomplete

Local continuity must eventually produce a shared record. The proposal links offline Bluetooth records to later blockchain synchronization. The exact reconciliation controls are open, but the intended lifecycle is explicit.

### Transparency without privacy is incomplete

The proposal combines blockchain records and donor monitoring with a boundary: the donor portal must not reveal beneficiary personal information. Public accountability is intended at the program and utilization level, not through donor access to individual beneficiary identity.

### Data without learning is incomplete

The live dashboard supports current operations, while disaster analytics are intended to make prior distribution performance measurable across time, redemption, budget use, geography, and organization performance.

The resulting thesis is:

> ReliefChain is not merely a faster transfer rail. It is a proposed operating system for the creation, delivery, redemption, continuity, and accountable observation of disaster assistance.

This sentence is a synthesis of the proposal, not a separate source quotation.

---

## 5. The Name: ReliefChain

The proposal establishes **ReliefChain** as the project name and consistently pairs it with **Blockchain-Powered Disaster Relief Distribution Platform**.

The source does not provide a naming story, etymology, naming criteria, or rejected alternatives. A formal explanation of the name is therefore **TBD**. Later documents should not invent a canonical brand narrative without an explicit team decision.

---

## 6. Product Identity

### 6.1 Established positioning

| Identity element | Source-defined form |
|---|---|
| Product name | **ReliefChain** |
| Product descriptor | **Blockchain-Powered Disaster Relief Distribution Platform** |
| Category contrast | Not another digital wallet; a purpose-built disaster relief management platform |
| Primary organizational audience | Governments and humanitarian organizations |
| Core outcome | Faster, more transparent, secure, and accountable emergency assistance distribution |

### 6.2 One-line value proposition

> ReliefChain enables governments and humanitarian organizations to distribute secure, transparent, and programmable disaster assistance in minutes instead of days using the Stellar blockchain.

This is the proposal's stated one-line value proposition.

### 6.3 Source-backed messaging pillars

1. **Complete lifecycle, not transfer only.** Program creation, verification, distribution, redemption, tracking, and analytics live in one proposed platform.
2. **Purpose-specific assistance.** Programmable vouchers are intended to restrict aid to its approved use.
3. **Continuity under weak connectivity.** SMS and Bluetooth are intended to keep beneficiaries and field actors connected to the relief process.
4. **Transparent records and easier auditing.** Stellar is proposed as the transaction ledger and settlement rail.
5. **Donor visibility without beneficiary disclosure.** Donors see program utilization and progress, not beneficiary personal information.
6. **Every peso directed toward intended beneficiaries.** Fraud reduction and accountability are central outcome claims in the proposal.

### 6.4 Visual identity currently documented

The proposal specifies the following UI-related technology choices:

- Plus Jakarta Sans typography;
- `@expo/ui` as part of the native design system;
- React Native Reanimated for high-performance motion;
- accessible design tokens; and
- a target of high-performance 60fps animations.

The proposal does **not** specify a logo system, color palette, brand archetype, dark/light mode posture, icon language, spacing scale, elevation model, motion principles, copy voice, or tone rules. Those remain open.

### 6.5 Beneficiary-facing copy example

The proposal provides this illustrative SMS:

> Your ₱5,000 Food Assistance under the Typhoon Relief Program has been successfully released. Please visit your nearest accredited merchant to redeem your voucher.

This is an example, not a fixed amount, program name, message template, localization decision, or delivery guarantee.

---

## 7. Product Vision: The Unified Workflow

### 7.1 End-to-end operating flow

#### Step 1 — Create a relief program

A government or humanitarian organization creates a disaster relief campaign. The proposal's example includes a program name, total budget, aid type, target beneficiary count, and automatically updated remaining budget.

#### Step 2 — Register and verify beneficiaries

Beneficiaries are registered and checked using the proposal's listed evidence sources: National ID, Barangay Certificate, DSWD records, household information, and duplicate detection.

The proposal does not define whether ReliefChain directly connects to any government record system. A named record source is not evidence of a live integration.

#### Step 3 — Approve assistance

Once beneficiaries are approved, they become eligible for assistance under the selected relief program. Approval roles, evidence thresholds, exception handling, appeals, and audit requirements are not specified.

#### Step 4 — Distribute programmable vouchers

The organization selects **Distribute Funds**. The system is intended to transfer programmable digital vouchers through the Stellar blockchain. The proposal associates this with fast settlement, low transaction fees, secure transactions, transparent records, and an immutable audit trail.

#### Step 5 — Notify beneficiaries

Beneficiaries receive SMS updates when assistance is approved or released and when it is redeemed. The source does not define the SMS provider, sender identity, retry policy, language selection, delivery reporting, or fallback process.

#### Step 6 — Redeem through an accredited merchant

The merchant scans the beneficiary QR code, validates the voucher, confirms the transaction, receives blockchain settlement, and causes the transaction ledger to update.

The source does not state whether the QR code identifies a person, account, voucher, claim, or signed transaction. It also does not define replay protection or lost-code recovery.

#### Step 7 — Continue locally when internet access is unavailable

Accredited merchants and authorized personnel use Bluetooth to exchange and validate transaction records locally. This is intended to support uninterrupted relief operations in disaster-affected areas.

The source does not define how offline authority is granted, how devices trust one another, how balances are reserved, how double redemption is prevented, or how a compromised device is revoked.

#### Step 8 — Synchronize after connectivity returns

Pending transactions synchronize securely with the Stellar blockchain once internet access returns. The source does not define ordering, idempotency, conflict resolution, rejected-transaction handling, or the user experience when an offline record cannot settle.

#### Step 9 — Monitor, disclose, and learn

Organizations use the transparency dashboard to monitor budgets, assistance, programs, beneficiaries, merchant transactions, redemptions, geography, and audit logs. Donors view donations and program utilization without beneficiary personal information. Historical analytics summarize distribution performance.

The proposal defines donor monitoring but does not define donation intake, custody, payment processing, refunds, or donor identity management.

### 7.2 Proposed core features

| # | Feature | Proposal-level behavior |
|---:|---|---|
| 1 | Disaster Relief Program Management | Create campaigns with a budget, aid type, target beneficiary count, and automatically updated remaining budget |
| 2 | Beneficiary Verification | Use National ID, Barangay Certificate, DSWD records, household information, and duplicate detection |
| 3 | Blockchain Aid Distribution | Transfer approved programmable vouchers through Stellar with fast, low-cost, transparent records |
| 4 | Programmable Digital Vouchers | Issue purpose-specific vouchers such as food, medicine, shelter, and school supplies, redeemable at accredited merchants for intended purposes |
| 5 | Merchant Redemption | Scan QR, validate voucher, confirm transaction, receive blockchain settlement, and update the ledger |
| 6 | Bluetooth Offline Synchronization | Exchange and validate records locally between accredited merchants and authorized personnel, then synchronize pending transactions after connectivity returns |
| 7 | SMS Notifications | Notify beneficiaries when assistance is approved/released or redeemed |
| 8 | Transparency Dashboard | Monitor budget, distribution, programs, beneficiaries, merchant activity, redemption, geography, and audit logs |
| 9 | Donor Transparency Portal | Show donation, supported program, utilization, beneficiary count, and distribution progress without beneficiary personal information |
| 10 | Disaster Analytics | Report average distribution time, redemption rate, budget utilization, geographic coverage, and organization performance |

### 7.3 Illustrative program example

The proposal uses this example to demonstrate program management:

| Field | Illustrative value |
|---|---|
| Program | Typhoon Relief 2026 |
| Budget | ₱20,000,000 |
| Aid type | Food Voucher |
| Target beneficiaries | 4,000 households |
| Remaining budget | Automatically updated |

These values are examples only. They are not product limits, a committed live program, pricing, funding, or evidence of an agreement with an organization.

### 7.4 What success looks like at proposal level

If the proposal's intended outcomes are realized:

- organizations can create relief programs within minutes;
- approved assistance can be released faster than a manual process;
- vouchers can be constrained to intended purposes and accredited merchants;
- beneficiaries without smartphones or internet access can receive updates by SMS;
- field actors can continue recording and validating transactions during internet outages;
- restored connectivity produces synchronized blockchain records;
- organizations can monitor distribution and redemption in one dashboard;
- donors can observe program-level use without beneficiary personal information;
- historical performance can be compared through disaster analytics; and
- fraud, duplicate claims, cash risk, and audit difficulty are reduced.

These are intended outcomes, not measured results. The proposal supplies no KPI baselines, targets, pilot results, or production evidence.

### 7.5 Role-oriented product surfaces

| Participant | Proposal-defined jobs or visibility |
|---|---|
| Government agencies and local governments | Create programs, verify beneficiaries, distribute aid, monitor operations, and review records |
| Humanitarian organizations | Create and operate relief programs, distribute assistance, and monitor progress |
| Accredited merchants | Scan, validate, redeem, settle, and synchronize transactions |
| Authorized personnel | Participate in local Bluetooth exchange and validation when internet access is unavailable |
| Beneficiaries | Receive assistance, present QR credentials for redemption, and receive SMS updates |
| Donors | Monitor donation and program-level utilization without beneficiary personal information |

The proposal does not define the information architecture, screen list, tab structure, role-switching behavior, or exact permissions for these surfaces.

### 7.6 Business model

The proposal contains a **Business Model** heading followed by an embedded image, but the supplied textual content does not state pricing, fees, subscriptions, licensing, funding sources, payer identity, settlement spread, merchant charges, donor charges, or revenue allocation.

Accordingly:

- no monetization model is canonical in this foundation;
- no participant should be assumed to pay a fee;
- no financial projection should be inferred; and
- the business model remains **TBD** pending an explicit textual decision from the team.

---

## 8. Target Users and Participants

The proposal names four participant groups without ranking them as primary, secondary, or later-phase markets.

### 8.1 Government

- Department of Social Welfare and Development (DSWD)
- Local Government Units
- Provincial Governments
- City Governments
- Municipal Governments

Naming DSWD as a target user does not establish an endorsement, integration, partnership, procurement, or pilot.

### 8.2 Humanitarian organizations

- Philippine Red Cross
- UNICEF
- World Vision
- Save the Children
- International NGOs
- Faith-Based Organizations

These are target examples in the proposal, not confirmed customers or partners.

### 8.3 Accredited merchants

- Grocery stores
- Pharmacies
- Hardware stores
- School supply stores

The proposal does not define merchant accreditation, due diligence, category mapping, settlement terms, devices, fees, or dispute handling.

### 8.4 Beneficiaries

- Disaster victims
- Senior citizens
- Persons with disabilities
- Farmers
- Fisherfolk
- Low-income families

The proposal does not define eligibility policy, prioritization, household composition rules, consent, grievance procedures, or accessibility accommodations for any beneficiary category.

---

## 9. Proposed Technology and Architecture

### 9.1 Technology stack stated in the proposal

| Layer | Technology | Proposed role |
|---|---|---|
| Mobile and web client | React Native 0.86 / Expo SDK 57 | Cross-platform native iOS, Android, and web application for LGUs, merchants, and beneficiaries |
| Routing and navigation | Expo Router | File-based navigation, deep linking, modal sheets, native stack routing, and typed routes |
| Language | TypeScript | End-to-end type safety across components, utilities, and tests |
| Blockchain ledger | Stellar and Soroban through `@stellar/stellar-sdk` | Programmable aid vouchers, transparent disbursements, and fast settlement |
| Backend and APIs | Supabase Edge Functions using Deno / TypeScript | Event-driven serverless functions for voucher issuance, synchronization validation, and webhooks |
| Database and security | Supabase PostgreSQL and Auth | Relational persistence, authentication, Row-Level Security, real-time synchronization, and transaction audit logs |
| Camera and QR | `expo-camera`, `react-native-qrcode-svg` | Beneficiary and voucher QR generation/scanning for merchant redemption |
| Security and biometrics | `expo-secure-store`, `expo-local-authentication` | Hardware-backed encrypted storage and Face ID/fingerprint authentication |
| UI and motion | React Native Reanimated, `@expo/ui`, Plus Jakarta Sans | Native design system, accessible design tokens, modern typography, and high-performance animation |
| Offline and resilience | Bluetooth offline synchronization and SMS gateway | Peer-to-peer local data exchange in zero-connectivity areas and beneficiary alerts without smartphone internet |

### 9.2 Logical component model synthesized from the stack

#### Client layer

The proposed Expo application serves LGU, merchant, and beneficiary workflows across iOS, Android, and web. The proposal does not say whether these are separate builds, role-gated areas in one build, or independently deployed applications.

#### Device capability layer

Camera and QR capabilities support redemption. Secure Store and local authentication protect device-held material. Bluetooth supports local record exchange. The proposal does not define operating-system limitations, permissions, device enrollment, trusted-device policy, or web fallbacks.

#### Application service layer

Supabase Edge Functions are intended to process voucher issuance, synchronization validation, and webhooks. No function names, request schemas, authentication tokens, rate limits, retries, or idempotency rules are defined.

#### Data and identity layer

Supabase PostgreSQL and Auth are intended to hold relational data, authenticate actors, enforce Row-Level Security, synchronize updates, and retain audit records. No table design, tenant boundary, role model, retention policy, or audit immutability mechanism is defined.

#### Blockchain layer

Stellar and Soroban are intended to support programmable vouchers, disbursement records, and settlement. The source does not define whether a voucher is a Stellar asset, Soroban token, contract balance, claim record, or another primitive.

#### Communication layer

An SMS gateway notifies beneficiaries. No provider, country coverage, throughput, sender ID, cost model, retry behavior, or consent policy is stated.

### 9.3 Proposed high-level data flow

1. An authenticated organizational user defines a program.
2. Beneficiary and verification data are recorded and checked.
3. Approval makes a beneficiary eligible for a voucher.
4. A server-side issuance operation and/or Soroban contract creates or transfers the programmable voucher.
5. The beneficiary receives an SMS notification and a redeemable QR-based interaction.
6. The merchant authenticates, scans the QR code, validates eligibility and voucher rules, and confirms redemption.
7. Online activity settles and records through the proposed backend and Stellar path.
8. Offline activity is exchanged locally through Bluetooth and retained as pending.
9. Restored connectivity causes validation and synchronization with the backend and blockchain.
10. Organizational, donor, and analytics views consume appropriate projections of the resulting records.

Steps that mention server-side or contract processing are architectural synthesis from the stated stack. Their exact sequence and interfaces are not source-defined.

### 9.4 Security, privacy, and audit intent stated by the proposal

- Auth and Row-Level Security are part of the proposed database/security layer.
- Secure Store and local biometric authentication are part of the proposed device security layer.
- Stellar provides transparent transaction records and an immutable audit trail in the proposal's framing.
- Donors must not see beneficiary personal information.
- Offline records are intended to synchronize securely.

The proposal does not define data classification, encryption in transit or at rest, key management, recovery, consent, deletion, retention, breach response, on-chain data minimization, privileged access, or audit-log tamper controls. Transparent blockchain records must not be interpreted as permission to place beneficiary identity data on-chain.

### 9.5 Offline-resilience boundary

| Proposal establishes | Proposal does not establish |
|---|---|
| Bluetooth is the intended local transport | Bluetooth profile, message format, discovery, pairing, or encryption protocol |
| Participants are accredited merchants and authorized personnel | How authorization is issued, proven offline, renewed, or revoked |
| Records can be exchanged and validated locally | What validation can be completed without a current server or ledger state |
| Pending activity synchronizes after connectivity returns | Ordering, idempotency, replay protection, or conflict-resolution rules |
| Operations are intended to continue during outages | How balances are reserved or double redemption is prevented |
| Synchronization is intended to be secure | Device attestation, signing keys, trust roots, compromise recovery, or rejected-record handling |

No later document should claim that the offline fraud problem is solved until these open controls are designed and verified.

### 9.6 Source wording about settlement speed

The proposal describes Stellar settlement as occurring **in seconds** and its stack table also uses **sub-second settlement**. This foundation preserves the broader claim of fast settlement but does not resolve or benchmark the difference. Performance targets require measurement and an explicit definition of what event counts as settled.

---

## 10. Why Stellar, According to the Proposal

The proposal selects Stellar because it is presented as suitable for fast, secure, and low-cost digital payments in disaster assistance.

The stated benefits are:

- settlement in seconds;
- extremely low transaction fees;
- a secure blockchain ledger;
- easy wallet integration;
- transparent transactions; and
- global interoperability.

The proposal further associates Stellar and Soroban with programmable aid vouchers, transparent disbursements, and settlement.

These are proposal claims. The source provides no benchmark, fee calculation, network selection, asset selection, contract design, capacity test, wallet model, or comparison with another blockchain. Those decisions remain open.

---

## 11. Competitive Positioning

The proposal provides the following capability comparison. It is reproduced as proposal positioning, not as an independently validated market analysis.

| Capability | Traditional Disaster Response | Digital Wallet | ReliefChain |
|---|---:|---:|---:|
| Disaster Relief Program Management | Limited | No | Yes |
| Blockchain Aid Distribution | No | Limited | Yes |
| Programmable Vouchers | No | No | Yes |
| Offline Bluetooth Synchronization | No | No | Yes |
| SMS Notifications | Limited | Limited | Yes |
| Donor Transparency | No | No | Yes |
| Live Monitoring Dashboard | Limited | Limited | Yes |
| Historical Disaster Analytics | No | No | Yes |

The proposal does not name competitors, products, comparison criteria, research dates, evidence, pricing, adoption, or performance data. Competitive claims must be validated before use as externally asserted fact.

### What the proposal says makes ReliefChain different

ReliefChain is presented as purpose-built for governments and humanitarian organizations rather than as a general payment application. Its differentiation is the combination of:

- disaster program management;
- beneficiary verification;
- programmable vouchers;
- merchant redemption;
- Bluetooth offline synchronization;
- SMS notifications;
- blockchain settlement and records;
- organizational transparency;
- donor transparency; and
- historical analytics.

The intended outcome is faster, more accountable aid delivery in low-connectivity environments while reducing fraud and helping every peso reach its intended beneficiaries.

---

## 12. Sustainable Development Goals Named in the Proposal

ReliefChain is aligned in the proposal with:

- **SDG 1 — No Poverty**
- **SDG 9 — Industry, Innovation and Infrastructure**
- **SDG 10 — Reduced Inequalities**
- **SDG 11 — Sustainable Cities and Communities**
- **SDG 16 — Peace, Justice and Strong Institutions**
- **SDG 17 — Partnerships for the Goals**

The source lists these alignments but does not define outcome indicators, measurement methods, reporting commitments, or causal evidence for any SDG.

---

## 13. What ReliefChain Is Not

These boundaries are directly supported by the proposal or are narrow restatements of its explicit positioning.

| Boundary | Source-backed reason |
|---|---|
| Not merely a digital wallet | The proposal explicitly contrasts ReliefChain with wallets that only transfer money |
| Not a payment event without program management | The proposal defines the full assistance lifecycle |
| Not designed as an online-only relief process | SMS and Bluetooth address limited or absent internet connectivity |
| Not a donor portal that reveals beneficiary personal information | The proposal explicitly preserves beneficiary privacy in donor views |
| Not evidenced as a production system by this document | The factual source is a written proposal and states no implementation status |
| Not evidenced as integrated with named government or humanitarian organizations | Organizations are named as target users, not confirmed partners |

The proposal does not define broader non-goals such as supported jurisdictions, disaster types, aid instruments beyond vouchers, cash compatibility, procurement boundaries, case management, logistics, inventory, healthcare records, or long-term social-protection programs. Those scope boundaries are **TBD**.

---

## 14. Open Decisions and Living Questions

The following questions arise directly from gaps in the proposal. Their presence does not imply an answer.

| # | Decision area | Current source posture | Why it must be resolved |
|---:|---|---|---|
| Q1 | Current implementation status | Not stated | Prevents proposal features from being mistaken for shipped capabilities |
| Q2 | MVP scope and feature priority | All ten items are called core features; no release cut is defined | Determines build sequence and acceptance criteria |
| Q3 | Organizational tenancy and roles | Government and humanitarian operators are named; permissions are not | Required for isolation, approval, audit, and delegation |
| Q4 | Beneficiary identity policy | Five verification inputs are named | Required to define mandatory evidence, exceptions, consent, and review |
| Q5 | External record integrations | National ID and DSWD records are named | Must distinguish manual evidence from authorized live integration |
| Q6 | Duplicate detection | Capability named without rules | Requires matching logic, confidence thresholds, false-positive handling, and appeals |
| Q7 | Voucher representation | Programmable digital voucher on Stellar/Soroban | Determines contracts, balances, transfers, revocation, expiry, and audit events |
| Q8 | Purpose restriction enforcement | Food, medicine, shelter, and school supplies are examples | Requires merchant/category rules and enforcement location |
| Q9 | Stellar environment | Stellar is selected; network is not | Required for testing, deployment, costs, and operational risk |
| Q10 | Settlement asset and fiat path | Not stated | Required to explain what merchants receive and how value enters/exits the system |
| Q11 | Wallet and key custody | Easy wallet integration is cited; custody is not | Determines beneficiary usability, signing, recovery, and liability |
| Q12 | Merchant accreditation | Accredited merchants are required | Needs onboarding, due diligence, category assignment, suspension, and settlement terms |
| Q13 | QR payload and security | QR scanning is required | Needs data format, signing, expiry, replay prevention, rotation, and recovery |
| Q14 | Offline authorization | Authorized actors are named | Needs enrollment, proof, renewal, and device revocation |
| Q15 | Offline balance reservation | Not stated | Needed to prevent the same value being redeemed in disconnected locations |
| Q16 | Bluetooth trust and encryption | Bluetooth synchronization is named | Needs pairing, authentication, confidentiality, integrity, and protocol choices |
| Q17 | Offline conflict resolution | Later synchronization is named | Needs ordering, idempotency, rejection handling, operator review, and user messaging |
| Q18 | SMS service design | SMS gateway is named | Needs provider, sender ID, locale, consent, retries, cost, and delivery telemetry |
| Q19 | Beneficiary personal-data boundary | Donor privacy is stated | Needs field-level classification and strict on-chain/off-chain rules |
| Q20 | Database schema and RLS | Supabase PostgreSQL/Auth/RLS are selected | Needs entities, relationships, tenant keys, policies, and privileged workflows |
| Q21 | Audit-log immutability | Immutable audit logs are an intended capability | Needs a precise technical definition across database and blockchain records |
| Q22 | Soroban contract interfaces | Soroban is selected | Needs methods, authorization, state, events, upgrade policy, and failure behavior |
| Q23 | Backend API and webhook contracts | Edge Functions and webhooks are selected | Needs endpoint schemas, authentication, idempotency, retries, and rate limits |
| Q24 | Donor funding intake | Donor monitoring is defined | The source does not define how donations enter, are held, assigned, or refunded |
| Q25 | Merchant disputes and reversals | Not stated | Required for invalid goods, mistaken redemption, rejection, and settlement failure |
| Q26 | Business model | No textual terms stated | Required for sustainability, procurement, fees, and stakeholder incentives |
| Q27 | Analytics definitions | Five metrics are named | Needs formulas, event sources, aggregation windows, and privacy thresholds |
| Q28 | Geographic distribution | Dashboard and analytics include geography | Needs precision, consent, retention, and safe aggregation decisions |
| Q29 | Accessibility and language support | Beneficiaries include seniors and persons with disabilities | Product behavior and supported languages are not specified |
| Q30 | Deployment and operations | Not stated | Needs environments, regions, monitoring, backup, recovery, and incident ownership |
| Q31 | Disaster-scale capacity | Not stated | Needs offline and online load assumptions, queueing, and degraded-mode behavior |
| Q32 | Success metrics | Outcomes are qualitative | Needs baselines, targets, measurement periods, and pilot acceptance gates |
| Q33 | Legal, policy, and procurement review | Not stated | Identity, aid eligibility, payments, and government use require explicit review before production claims |
| Q34 | Team roles and decision ownership | Contributors are listed without roles | Needed to assign the unresolved decisions and implementation work |

These questions are the appropriate subjects for a future `/grill-me` session. They should not be silently answered from outdated documentation.

**Finals-weighted subset.** The Top 5 criteria in [§17](#17-finals-stage-top-5-judging-criteria-and-presentation-format) put direct scoring pressure on a specific group of these open items: Q2 and Q9–Q23 carry feasibility risk, Q20, Q23, Q30, and Q31 carry scalability risk, Q26 and Q32 carry business-plan and impact risk, and Q33 carries credibility risk under questioning. Resolving these is what converts the proposal's claims into defensible answers.

---

## 15. Document Governance and Source Provenance

### 15.1 Source hierarchy for this version

1. **Product facts:** [`final-proposal.md`](final-proposal.md) only.
2. **Competition finals facts:** the finals rules supplied directly by the team (F3 and G), used only in §17.
3. **Foundation synthesis:** this file, `relief-chain.md`, organizes those facts and marks source gaps.


A finals criterion does not create a product fact. Scoring on a dimension such as business plan or scalability does not mean the proposal defined one.

### 15.2 Information classes used here

| Label or wording | Meaning |
|---|---|
| **Directly stated** | Present in the proposal's readable text or tables |
| **Synthesis** | Connects multiple directly stated proposal elements without adding a new project fact |
| **Illustrative** | An example from the proposal, not a requirement, limit, commitment, or live record |
| **Open / TBD / Not stated** | The proposal provides no answer |
| **Intended / proposed** | Describes product direction, not implementation evidence |

### 15.3 Conflict handling

When a newer team decision changes a proposal-derived statement:

1. record the decision and its date in this foundation;
2. identify the exact section being replaced;
3. preserve material historical context when it explains why the decision changed;
4. distinguish shipped behavior from planned behavior; and
5. only then propagate the update to downstream documents.

Do not resolve a conflict by importing an unstated answer from an outdated document.

### 15.4 Embedded diagrams

The source includes embedded images under **Business Model** and **System Workflow**. Their visual details were not translated into this foundation because no verified textual extraction was supplied. The workflow in this document is synthesized only from the proposal's readable Summary, Solution, and Core Features text. The business model remains open for the same reason.

---

## 16. Canonical Proposal Record

### 16.1 Project name

**ReliefChain**

### 16.2 Project title

**Blockchain-Powered Disaster Relief Distribution Platform**

### 16.3 Proposal context

- **Submission:** Written Proposal
- **Event:** UTHACK ANG PUHUNAN 2026
- **Submitted by:** MINDMESH

### 16.4 Contributors named

- E-jay Detera
- Shelley Sesante
- Mobaraq Camar
- Gabriel, David Jr. M.
- Jasmine Mikaella Aninion

No roles are stated.

### 16.5 Problem statement

Current disaster relief operations can be slowed or weakened by manual beneficiary verification, duplicate registration, slow distribution, cash handling risk, limited transparency, difficult auditing, fraudulent claims, poor connectivity, and limited beneficiary communication. Standard digital wallets transfer value but do not manage the full disaster assistance lifecycle.

### 16.6 Proposed solution

ReliefChain proposes to let governments and humanitarian organizations create relief programs, verify beneficiaries, distribute programmable digital vouchers over Stellar, support QR redemption at accredited merchants, notify beneficiaries through SMS, continue local transaction exchange through Bluetooth during internet outages, synchronize pending activity after connectivity returns, and provide organizational, donor, and historical transparency.

### 16.7 Value proposition

> ReliefChain enables governments and humanitarian organizations to distribute secure, transparent, and programmable disaster assistance in minutes instead of days using the Stellar blockchain.

### 16.8 Target participants

- government agencies and local governments;
- humanitarian and faith-based organizations;
- accredited merchants; and
- disaster-affected beneficiaries and vulnerable groups.

### 16.9 Proposed technology

React Native 0.86, Expo SDK 57, Expo Router, TypeScript, Stellar, Soroban, `@stellar/stellar-sdk`, Supabase Edge Functions, Supabase PostgreSQL, Supabase Auth, `expo-camera`, `react-native-qrcode-svg`, `expo-secure-store`, `expo-local-authentication`, React Native Reanimated, `@expo/ui`, Plus Jakarta Sans, Bluetooth offline synchronization, and an SMS gateway.

### 16.10 Why Stellar

Fast settlement, low fees, secure ledger records, wallet integration, transparency, and global interoperability.

### 16.11 Status boundary

The proposal does not state:

- what has been implemented;
- what has been tested;
- what is deployed;
- which Stellar network or asset is used;
- which external systems are integrated;
- which organizations have approved or piloted ReliefChain;
- how offline conflicts and fraud are controlled;
- how merchants receive fiat value;
- how the product earns revenue; or
- when any capability will ship.

No one should infer those answers from this foundation.

---

## 17. Finals Stage: Top 5 Judging Criteria and Presentation Format

This section records the finals rules supplied directly by the team. It is the only section in this document sourced from the competition rules rather than the written proposal.

### 17.1 Stage definition

The finals stage is described as **Top 5 judging and Q&A**: a final pitch delivered to judges, followed by questioning.

Reaching this stage is a competition process fact. It is not evidence that ReliefChain is implemented, validated, funded, or adopted, and nothing in this section changes the status boundaries in §16.11.

### 17.2 Top 5 final event criteria (F3)

| Criterion | Judged on |
|---|---|
| **Innovation** | Uniqueness and originality |
| **Feasibility** | Practicality and technical viability |
| **Scalability** | Potential for expansion |
| **Impact** | Social, economic, or environmental |
| **Business Plan** | Viability and sustainability |
| **Pitching** | Clarity and value proposition |

The supplied rules list these six criteria without stating weights, scoring scales, rubric levels, judge composition, tie-breakers, or minimum thresholds. Those remain **Not stated**.

### 17.3 Presentation and Q&A format (G)

| Segment | Limit |
|---|---|
| **G1 — Final presentation** | 10 minutes per team |
| **G2 — Judge Q&A** | 20 minutes following the presentation |

Q&A is twice the length of the pitch. The defensibility of the material therefore matters more than its delivery length: most judge-facing time is spent answering questions rather than presenting.

The rules do not state slide limits, demo requirements, live-versus-recorded rules, allowed materials, presenter count, setup time, overrun penalties, or question scope. Those remain **Not stated**.

### 17.4 Where each criterion is already supported

| Criterion | Existing foundation support | Principal gap to close |
|---|---|---|
| Innovation | §4 convergence thesis, §7.2 core features, §11 positioning | §11 has no validated competitor evidence |
| Feasibility | §9.1 stack, §9.2 component model, §9.3 data flow | §9.5 offline controls and Q7–Q23 are unresolved |
| Scalability | §9 architecture, §8 participant breadth | Q30 and Q31 define no capacity or operational model |
| Impact | §2 problem framing, §7.4 intended outcomes, §12 SDGs | No baselines, targets, or measured results (Q32) |
| Business Plan | §7.6 | No pricing, payer, or sustainability model at all (Q26) |
| Pitching | §6.2 value proposition, §6.3 messaging pillars | Narrative must not overstate implementation status |

Business Plan is the weakest position: it is a scored criterion, and the proposal supplies no textual monetization or sustainability terms.

### 17.5 Anticipated question pressure

Given the 20-minute Q&A and the criteria above, the questions most likely to expose current gaps are:

- how a voucher is represented on Stellar or Soroban, and how purpose restriction is enforced (Q7, Q8);
- what prevents the same voucher being redeemed twice while devices are offline (Q15, Q17);
- how offline Bluetooth participants are authorized and revoked (Q14, Q16);
- what merchants actually receive, and how value enters and exits as fiat (Q10, Q12);
- how beneficiary personal data is kept off a transparent ledger (Q19);
- whether National ID and DSWD checks are live integrations or manual evidence (Q5);
- how duplicate detection decides and handles false positives (Q6);
- who pays for the platform and how it sustains itself (Q26); and
- what has actually been built versus proposed (Q1).

This list is derived from the criteria plus §14; the rules do not state the questions judges will ask.

### 17.6 Finals-rule traceability

| Supplied rule content | Foundation location |
|---|---|
| F3 & G — Finals/Pitching, Top 5 judging and Q&A | §17.1 |
| F3 — Innovation, Feasibility, Scalability, Impact, Business Plan, Pitching | §17.2; §17.4 |
| G1 — 10-minute presentation limit | §17.3 |
| G2 — 20-minute judge Q&A | §17.3; §17.5 |

---

## Appendix A — Proposal-to-Foundation Traceability

This appendix covers the written proposal only. Finals-rule traceability is in §17.6.

| Proposal content | Foundation location |
|---|---|
| Summary | Developer TL;DR; §§3–4; §16.6 |
| One-Line Value Proposition | §6.2; §16.7 |
| The Problem | §2; §16.5 |
| Our Solution | §§3–4; §7; §16.6 |
| Business Model heading/image | §7.6; §15.4 |
| System Workflow heading/image | §7.1; §15.4 |
| Core Features 1–10 | §7.2 |
| Target Users | §8 |
| Technology Stack | §9.1; §16.9 |
| Why Stellar? | §10; §16.10 |
| Competitive Advantage | §11 |
| Sustainable Development Goals | §12 |
| What Makes ReliefChain Different? | §§4, 6.3, 11, and 13 |
| Submitted By | Developer TL;DR; §§1 and 16.4 |

---

## Appendix B — Source-Constrained Glossary

| Term | Meaning supported by the proposal | Details not defined by the proposal |
|---|---|---|
| Relief program / campaign | An organizational disaster assistance program with budget, aid type, targets, and remaining balance | Lifecycle states, approvals, funding source, and closure |
| Beneficiary | A person or household approved to receive disaster assistance | Account model, custody, consent, appeals, and recovery |
| Verification | Use of named identity, local, government, household, and duplicate checks | Mandatory fields, live integrations, scoring, and exceptions |
| Programmable digital voucher | Purpose-specific digital assistance redeemable at accredited merchants | Stellar primitive, contract rules, expiry, revocation, and transferability |
| Accredited merchant | An approved redemption participant such as a grocery, pharmacy, hardware, or school-supply store | Accreditation process, fees, settlement terms, and suspension |
| Beneficiary QR code | A scannable element used by merchants during redemption | Payload, signatures, privacy, expiry, and replay protection |
| Authorized personnel | A field actor permitted to participate in offline Bluetooth synchronization | Role, enrollment, authority scope, and revocation |
| Offline synchronization | Local Bluetooth exchange and validation followed by later blockchain synchronization | Protocol, trust, double-spend control, conflict handling, and recovery |
| Transparency dashboard | Organizational monitoring of budget, assistance, programs, beneficiaries, transactions, redemption, geography, and logs | Roles, refresh frequency, formulas, and exports |
| Donor transparency portal | Donor view of donation and program-level progress without beneficiary personal information | Donation intake, donor identity, privacy thresholds, and reporting cadence |
| Disaster analytics | Historical measures of time, redemption, utilization, geography, and organization performance | Formulas, baselines, benchmarks, and retention |

---

## Appendix C — Do-Not-Overclaim Guardrails

Until newer, reviewed evidence is added to this foundation, do not claim that:

- ReliefChain is production-ready. A hosted Supabase **testnet demo** environment does exist as of 2026-09-24 ([`build-reliefchain.md`](build-reliefchain.md) §15.0), so "nothing is deployed" is no longer accurate — but it has no monitoring, no alerting, no incident response, and no real funds. Say "a hosted testnet demo," never "live" or "in production." Implementation status belongs in [`flow-reliefchain.md`](flow-reliefchain.md), not in this proposal-derived document;
- a government agency, humanitarian organization, or named NGO is a partner, customer, or pilot participant;
- ReliefChain has live National ID or DSWD access;
- duplicate detection has a defined or tested algorithm;
- vouchers have a finalized Stellar or Soroban representation;
- a production Stellar network, token, wallet, or custody model has been selected;
- merchant accreditation and settlement are operational;
- Bluetooth mode prevents double redemption or securely resolves every offline conflict;
- SMS delivery is integrated with a provider or guaranteed;
- beneficiary personal information is safe merely because Row-Level Security or blockchain is mentioned;
- database audit logs are technically immutable without a defined mechanism;
- the comparative capability table has been independently validated;
- the stated Stellar speed or cost has been benchmarked for this workflow;
- the illustrative ₱20,000,000 program or ₱5,000 SMS represents a live commitment;
- the business model, pricing, or payer has been decided; or
- the listed SDGs have measured outcomes.

Finals-specific guardrails:

- do not treat reaching the Top 5 as validation, funding, adoption, or a production milestone;
- do not state criterion weights, scoring scales, judge identities, or results, because the supplied rules define none; and
- do not let a judging criterion imply a product fact: being scored on business plan or scalability does not mean either is defined.

These guardrails are part of the foundation's accuracy contract. Replace them only when the corresponding evidence or explicit team decision is recorded here.

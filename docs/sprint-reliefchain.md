# Sprint Backlog: ReliefChain — User Stories & Acceptance Criteria

**Project:** ReliefChain — Blockchain-Powered Disaster Relief Distribution Platform  
**Sprint timeline:** September 20 – October 5  
**Date:** 2026-09-24  
**Version:** 1.0  
**Owner:** MINDMESH  
**Status:** Active  
**Source of truth (product facts):** [`relief-chain.md`](relief-chain.md)  
**Source sheet:** [`sprint.html`](sprint.html) — Google Sheets export, the original of this document  
**Related:** [BRD](brd-reliefchain.md) · [BPD](bpd-reliefchain.md) · [PRD](prd-reliefchain.md) · [SAD](sad-reliefchain.md) · [SDD](sdd-reliefchain.md) · [DSD](dsd-reliefchain.md) · [Flow](flow-reliefchain.md) · [Build](build-reliefchain.md)

---

> ## Use this document for anything sprint-related
>
> **This file is the working reference for sprint scope, user stories, acceptance criteria, priorities, and assignment.** Before starting, estimating, splitting, assigning, closing, or reporting on any sprint item, read it here first.
>
> That includes: "what am I working on", "is this in scope", "what are the acceptance criteria for X", "what's the priority of Y", "who owns Z", "what's left this sprint", "add a story", "mark a story done", and any standup, planning, or review summary.
>
> **Rules of use**
> - A story is only **Done** when every acceptance criterion in its block is satisfied — not when the happy path renders.
> - Update the story block here in the same change as the code. A story whose behaviour drifted from its criteria is a defect, not an update to the criteria.
> - Adding, removing, or re-prioritising a story is a scope change: record it in §8 Change log with a reason.
> - Product facts (what the system is, what it supports) come from [`relief-chain.md`](relief-chain.md), not from this backlog. Where the two disagree, `relief-chain.md` wins and this file gets corrected.
> - Implementation status comes from [`flow-reliefchain.md`](flow-reliefchain.md). This backlog describes **intended** work; it is not evidence that anything is built.
> - Read §6 before planning. Several stories assume roles and capabilities that do not exist in the current codebase.

---

## 1. Scope at a Glance

32 stories across four modules plus a cross-cutting module.

| Module | Stories | High | Medium | Low |
|---|---:|---:|---:|---:|
| Admin (platform) | 3 | 2 | 1 | 0 |
| Organization | 13 | 8 | 4 | 1 |
| Beneficiary | 7 | 3 | 4 | 0 |
| Merchant | 5 | 3 | 2 | 0 |
| Other modules | 4 | 2 | 1 | 1 |
| **Total** | **32** | **18** | **12** | **2** |

**Assignment state:** every story's Developer and Status cell is empty in the source sheet. Nothing is assigned and nothing is marked started. Treat all 32 as **Unassigned / Not started** until someone fills them in here.

### Legend

**Priority** — `High` must land this sprint · `Medium` should land · `Low` may slip

**Status** — use one of: `Not started` · `In progress` · `In review` · `Blocked` · `Done`

**Roles referenced:** Platform Admin · Organization · Organization Admin · Verification Officer · Beneficiary · Merchant

---

## 2. Admin (Platform)

### ADM-01 — Review submitted organization registrations
**Priority:** High · **Role:** Platform Admin · **Developer:** — · **Status:** —

> As a Platform Administrator, I want to review submitted organization registrations so that I can verify legitimacy before granting platform access.

- View organization name, type, government registration number, contact info, and authorized representative details.
- Approve or reject a registration, updating status from Pending to Approved or Rejected.
- A rejected organization receives a notification stating the reason for rejection.
- An approved organization automatically receives platform access and its Organization Administrator account is activated.

### ADM-02 — Platform-wide audit log
**Priority:** High · **Role:** Platform Admin · **Developer:** — · **Status:** —

> As a Platform Administrator, I want to view a complete, platform-wide audit log so that I can investigate discrepancies or misuse across all organizations.

- Every action (create, update, approve, reject, distribute, redeem) is logged with actor, timestamp, action type, and affected record.
- Logs are immutable and cannot be edited or deleted by any user, including administrators.
- I can filter logs by organization, date range, actor, and action type.
- I can export a filtered log to PDF or Excel for investigation records.

> **Numbering note.** The source sheet labels this story `ADM-01`, the same ID as the story above. Renumbered to `ADM-02` here so IDs are unique. Fix the sheet or adopt this numbering — do not keep two ADM-01s.

### ADM-03 — Suspend or deactivate an organization
**Priority:** Medium · **Role:** Platform Admin · **Developer:** — · **Status:** —

> As a Platform Administrator, I want to suspend or deactivate an organization's platform access so that I can respond to fraud, misuse, or policy violations after approval.

- I can suspend an already-approved organization, immediately blocking its members from creating or managing programs.
- A suspension requires a documented reason, which is stored in the audit log.
- The organization is notified of the suspension and the reason.
- I can reinstate a suspended organization, restoring its prior access.

*Sheet note: Not in the original story set — added because ADM-01 covers onboarding but not post-approval enforcement, which the Business Model's compliance/audit goals imply.*

---

## 3. Organization

### ORG-01 — Transfer funds to another organization
**Priority:** Medium · **Role:** Organization · **Developer:** — · **Status:** —

> As an Organization, I want to transfer funds to another organization so that donor funds or program budgets can be reallocated between partner organizations.

- I can select a destination organization and specify a transfer amount, which cannot exceed my organization's available wallet balance.
- I must confirm the transfer before it is submitted; the transfer is recorded as a blockchain transaction on Stellar.
- The sending organization receives confirmation that the transfer was submitted, and later that it settled.
- The receiving organization is notified that funds have been received and its balance is updated in real time.
- The transfer appears in both organizations' transaction history and the platform audit log.

*Sheet note: Original AC only said 'Send money' / 'Notified that the money is sent' — expanded to cover balance checks, confirmation, and both-side notification, since this moves real aid funds.*

### ORG-02 — Invite a team member
**Priority:** High · **Role:** Organization Admin · **Developer:** — · **Status:** —

> As an Organization Administrator, I want to invite a team member by name and email so that verification and program responsibilities are properly distributed within my organization.

- I enter the member's Full Name and Email Address to send an invitation.
- Every invited member is assigned the role of Verification Officer by default, with permission to review and verify beneficiary and merchant applications.
- Only the Organization Administrator (the account that registered the organization) can create, edit, or change the status of relief programs — Verification Officers cannot.
- The invitee receives an email with a link to set up their account; the invitation expires after 7 days if unused.
- I can view the status of each invitation (Pending, Accepted, Expired).

*Sheet note: Resolves the team's open question: members are standardized as 'Verification Officer' with verification-only permissions; program creation stays restricted to the Organization Administrator.*

### ORG-03 — Deactivate a member
**Priority:** Medium · **Role:** Organization Admin · **Developer:** — · **Status:** —

> As an Organization Administrator, I want to deactivate a member so that I can immediately revoke access for staff who leave or misuse their account.

- Deactivating a member immediately blocks their login and revokes all API/session access.
- Records the member previously verified or approved remain intact and attributed to them for audit purposes.
- I can reactivate a deactivated member, restoring their prior role and permissions.

*Sheet note: Flagged 'kahit wag na to' (deprioritize) in the source — kept as Medium rather than dropped, since revoking access for departed staff is a basic security control; can move to a later sprint if scope is tight.*

### ORG-04 — Program status workflow
**Priority:** High · **Role:** Organization Admin · **Developer:** — · **Status:** —

> As an Organization Administrator, I want to move a relief program through its defined status workflow so that it progresses in a controlled, auditable way.

- Programs move through statuses in strict order: Draft → Pending Approval → Active → Distribution Ongoing → Completed → Archived.
- Programs cannot skip statuses; an attempt to do so is blocked with an explanatory error.
- Every status change is timestamped and logged with the acting user.
- Moving from Draft to Pending Approval requires the program to have a name, budget, aid type, and target beneficiary count filled in.

### ORG-05 — Configure distribution strategy
**Priority:** High · **Role:** Organization Admin · **Developer:** — · **Status:** —

> As an Organization Administrator, I want to configure the distribution strategy for a relief program so that assistance is disbursed in a way that fits the program's operational needs.

- I can select exactly one distribution strategy when creating or editing a relief program: Manual, Batch, or Automatic.
- Manual requires an administrator to approve each individual disbursement.
- Batch disburses to all currently-approved beneficiaries in a single administrator-triggered run.
- Automatic disburses to each beneficiary as soon as they are approved, with no further manual step.
- The selected strategy is saved as part of the program configuration and shown on the program's detail page.

### ORG-06 — Monitor distribution progress in real time
**Priority:** High · **Role:** Organization Admin · **Developer:** — · **Status:** —

> As an Organization Administrator, I want to monitor distribution progress in real time so that I can track program completion and budget health.

- Dashboard shows distributed vs. remaining budget, and verified/approved vs. remaining beneficiary counts, updated in real time.
- Dashboard breaks down progress by aid/voucher type (e.g., Food, Medicine, Shelter, School Supply).
- Dashboard shows a geographic breakdown of distribution and redemption where beneficiary address data is available.
- I can drill down from a summary metric into the underlying list of transactions.

### ORG-07 — Generate reports
**Priority:** Low · **Role:** Organization Admin · **Developer:** — · **Status:** —

> As an Organization Administrator, I want to generate program, distribution, beneficiary, merchant, financial, transaction, and audit reports so that I can report to stakeholders and donors.

- Each report type can be generated independently, filtered by program and date range.
- All reports export to PDF or Excel.
- Financial and audit reports reconcile against the immutable blockchain ledger so exported figures cannot drift from on-chain records.
- Report generation for a given filter combination completes within a reasonable time or shows a progress indicator for large exports.

### ORG-08 — Review and resolve beneficiary appeals
**Priority:** High · **Role:** Verification Officer (role cell blank in source) · **Developer:** — · **Status:** —

> As a Verification Officer, I want to review and resolve beneficiary appeals so that rejected applicants have a fair recourse process.

- I can view all appeals filtered by status (Submitted, Under Review, Approved, Rejected).
- I can approve or reject an appeal, and must provide remarks when rejecting.
- Appeal status changes (Submitted → Under Review → Approved/Rejected) trigger a beneficiary notification.
- An approved appeal automatically re-opens the beneficiary's application at the appropriate stage rather than requiring a fresh registration.

### ORG-09 — Review merchant registration requests
**Priority:** High · **Role:** Organization Admin · **Developer:** — · **Status:** —

> As an Organization Administrator, I want to review merchant registration requests so that only qualified businesses are accredited to redeem financial assistance.

- I can view all pending merchant applications in a queue.
- I can review each merchant's business information, category, and wallet address.
- I can search and filter merchant applications by business name, category, and status.

### ORG-10 — Approve or reject merchant applications
**Priority:** High · **Role:** Organization Admin · **Developer:** — · **Status:** —

> As an Organization Administrator, I want to approve or reject merchant applications so that only accredited merchants can participate in financial aid redemption.

- I can approve or reject a merchant application.
- I can provide remarks when rejecting an application; remarks are required on rejection.
- Merchant status changes from Pending to Approved or Pending to Rejected.
- The merchant is notified of the decision, including the reason if rejected.

### ORG-11 — View a merchant's redemption history
**Priority:** Medium · **Role:** Organization Admin · **Developer:** — · **Status:** —

> As an Organization Administrator, I want to view a merchant's redemption history so that I can monitor financial aid transactions processed by that merchant.

- I can view all redemption transactions for a selected merchant.
- Each transaction displays the beneficiary (or an anonymized reference), program, voucher type, amount, date, and transaction status.
- I can filter a merchant's history by date range and program.

### ORG-12 — Manage accredited merchants
**Priority:** Medium · **Role:** Organization Admin · **Developer:** — · **Status:** —

> As an Organization Administrator, I want to manage accredited merchants so that I can maintain an up-to-date list of participating businesses.

- I can view all accredited merchants with their category and status.
- I can suspend or reactivate a merchant account, with a required reason for suspension.
- A suspended merchant cannot redeem financial assistance until reactivated; any redemption attempt is blocked with a clear message.

*Sheet note: Source flagged 'kahit wag na to' (deprioritize) — kept, since ORG-10 already introduces merchant status changes and a suspend control is a small, high-value extension of that same workflow.*

### ORG-13 — Review beneficiary applications
**Priority:** High · **Role:** Verification Officer (role cell blank in source) · **Developer:** — · **Status:** —

> As a Verification Officer, I want to review beneficiary applications so that only eligible applicants receive financial assistance.

- I can view a queue of pending beneficiary applications.
- I can view all submitted documents and household/ID information for an application.
- I can approve or reject an application, or request additional information from the applicant.
- I can add verification remarks that are stored with the application record.
- Requesting additional information notifies the beneficiary and pauses the review clock until they respond.

> **Numbering note.** The source sheet writes these as `ORG-010`, `ORG-011`, `ORG-012`, `ORG-013`. Normalised to `ORG-10`–`ORG-13` here to match `ORG-01`–`ORG-09`.

---

## 4. Beneficiary

### BEN-01 — Register and submit information
**Priority:** High · **Role:** Beneficiary · **Developer:** — · **Status:** —

> As a Beneficiary, I want to register and submit my personal, address, household, and ID information so that I can be considered for financial assistance.

- Required fields (name, address, household composition, valid ID) must be completed before I can submit.
- The system checks for likely duplicate registrations (matching ID number or name + address) and flags them for staff review rather than silently rejecting.
- I receive confirmation once my registration is submitted, and its status is set to Registered.

### BEN-02 — View application status
**Priority:** Medium · **Role:** Beneficiary · **Developer:** — · **Status:** —

> As a Beneficiary, I want to view my application status so that I know where I stand in the process.

- Status reflects the current stage: Registered → Pending Verification → Verified → Approved → Aid Released → Redeemed → Completed.
- Each status change is timestamped and visible in a simple history view.
- If my application is rejected, the status and rejection reason are both shown clearly.

### BEN-03 — View approved aid details
**Priority:** High · **Role:** Beneficiary · **Developer:** — · **Status:** —

> As a Beneficiary, I want to view details of aid I've been approved for so that I understand what I'm entitled to.

- Approved aid details (program, voucher type, amount, validity period) are visible immediately after Organization approval.
- Details indicate where and how the voucher can be redeemed (e.g., which merchant categories accept it).

### BEN-04 — View wallet balance
**Priority:** High · **Role:** Beneficiary · **Developer:** — · **Status:** —

> As a Beneficiary, I want to view my Stellar-compatible wallet balance so that I know how much assistance I have available.

- Balance reflects real-time blockchain state, per voucher/aid type.
- If the balance cannot be fetched (e.g., no connectivity), the last-synced balance is shown with a clear 'last updated' timestamp rather than a blank or misleading value.

### BEN-05 — View transaction history
**Priority:** Medium · **Role:** Beneficiary · **Developer:** — · **Status:** —

> As a Beneficiary, I want to view my transaction history so that I can track how my aid has been used.

- Transaction list includes date, amount, merchant, voucher type, and status.
- Transactions synced via offline Bluetooth exchange are clearly marked as 'Pending Sync' until confirmed on-chain.

### BEN-06 — Submit an appeal
**Priority:** Medium · **Role:** Beneficiary · **Developer:** — · **Status:** —

> As a Beneficiary, I want to submit an appeal if my application is rejected so that I have a chance to correct or clarify my eligibility.

- I can submit an appeal with supporting remarks and, if needed, additional documents.
- I can track appeal status (Submitted → Under Review → Approved/Rejected).
- I'm notified of the final decision.

### BEN-07 — Receive notifications
**Priority:** Medium · **Role:** Beneficiary · **Developer:** — · **Status:** —

> As a Beneficiary, I want to receive notifications for application approval, aid release, and successful redemption so that I stay informed without checking manually.

- Notifications are delivered for each of the three listed events.
- Notifications are sent via SMS for beneficiaries without a smartphone or internet access, and via in-app/push where available.
- Each SMS includes the program name, amount, and a short instruction (e.g., where to redeem).

---

## 5. Merchant

### MER-01 — Balance check before redemption
**Priority:** High · **Role:** Merchant · **Developer:** — · **Status:** —

> As a Merchant, I want the system to check the beneficiary's available balance before I process a redemption so that I don't process a transaction exceeding what's available.

- The system checks the beneficiary's voucher balance for the relevant aid type before confirming redemption.
- Insufficient balance blocks the transaction and shows a clear error message to the merchant.
- The same check runs against the last-synced local balance when offline, and is re-verified once the transaction syncs online.

### MER-02 — Scan QR and process redemption
**Priority:** High · **Role:** Merchant · **Developer:** — · **Status:** —

> As a Merchant, I want to scan a beneficiary's QR code and process a Stellar blockchain transaction to redeem assistance so that I receive payment for goods or services provided.

- I can scan the beneficiary's QR code to identify their account and available voucher balance.
- The redemption amount cannot exceed the voucher's remaining balance or purpose (e.g., a Food voucher cannot pay for non-food items).
- A receipt is generated upon successful redemption.
- I receive a 'Payment Received' notification once the transaction settles on-chain.

### MER-03 — View redemption history
**Priority:** Medium · **Role:** Merchant · **Developer:** — · **Status:** —

> As a Merchant, I want to view my redemption history so that I can reconcile payments received.

- I can view all redemption transactions I've processed, with date, beneficiary reference, program, amount, and status.
- I can filter by date range and status, and export the list for reconciliation with my own records.

### MER-04 — Register business
**Priority:** Medium · **Role:** Merchant · **Developer:** — · **Status:** —

> As a Merchant, I want to register my business on ReliefChain so that I can apply to become an accredited merchant for financial aid redemption.

- I can provide my business information: business name, owner, address, and contact details.
- I can select my merchant category (e.g., Grocery, Pharmacy, Hardware, School Supplies).
- I can provide my wallet address for settlement.
- My application is submitted with a Pending status.
- I receive a notification confirming that my application has been submitted.

### MER-05 — Track accreditation status
**Priority:** High · **Role:** Merchant · **Developer:** — · **Status:** —

> As a Merchant, I want to track the status of my accreditation application so that I know whether I can participate in relief programs.

- I can view my current application status (Pending, Approved, Rejected).
- If rejected, I can view the reason provided by the Organization Administrator.
- I receive a notification whenever my application status changes.

---

## 6. Other Modules

### VOUCHERS — Purpose-specific digital vouchers
**Priority:** High · **Role:** Organization Admin · **Developer:** — · **Status:** —

> As an Organization Administrator, I want to issue purpose-specific digital vouchers (e.g., Food, Medicine, Shelter, School Supplies) so that assistance is spent only on its intended need.

- I can define one or more voucher types for a program, each with its own aid category, unit amount, and validity period.
- Each voucher is only redeemable at merchants accredited for the matching category.
- An attempt to redeem a voucher at a non-matching merchant category is blocked with a clear message.

*Sheet note: Not present as its own story in the original sheet, though the proposal names Programmable Digital Vouchers as a core, numbered feature (Section 4) — added to make the acceptance criteria explicit for developers.*

### SMS NOTIFICATIONS — Beneficiary SMS channel
**Priority:** Medium · **Role:** Platform (role cell blank in source) · **Developer:** — · **Status:** —

> As a platform, I want to send SMS notifications for key beneficiary events so that beneficiaries without smartphones or internet access stay informed.

- SMS is sent on: application approved, aid released, and redemption completed.
- SMS delivery failures are logged and retried; a permanently failed SMS is flagged for staff follow-up.
- SMS content is in the beneficiary's registered language/dialect where supported, and stays within standard SMS length or is split into multiple parts.

*Sheet note: The original sheet has BEN-07 for notifications generally, but did not separately specify the SMS gateway integration named in the proposal's architecture diagram — split out as its own story for the dev team building that integration.*

### OFFLINE SYNC — Bluetooth exchange when offline
**Priority:** High · **Role:** Merchant / Verification Officer (role cell blank in source) · **Developer:** — · **Status:** —

> As a Merchant / Verification Officer, I want to exchange and validate transaction data over Bluetooth when internet access is unavailable so that redemptions can continue during disasters.

- When no internet connection is detected, the app switches to offline mode and allows Bluetooth exchange of voucher/redemption data between authorized devices.
- Each offline transaction is validated locally against the last-synced voucher balance and is recorded with a 'Pending Sync' status.
- Once connectivity is restored, all pending offline transactions are automatically synchronized to the Stellar blockchain in the order they occurred.
- If a sync detects a conflict (e.g., an already-spent balance), the conflicting transaction is flagged for administrator review rather than silently applied.

*Sheet note: Not in the original sheet, though Bluetooth Offline Synchronization is one of the proposal's core numbered features (Section 6) and appears in the System Workflow diagram — added as a High priority story since it's central to the platform's disaster-response value proposition.*

### ANALYTICS — Historical disaster-response analytics
**Priority:** Low · **Role:** Organization Admin · **Developer:** — · **Status:** —

> As an Organization Administrator, I want to see historical disaster-response analytics so that I can evaluate and improve program performance over time.

- Dashboard shows average distribution time, redemption rate, budget utilization, and geographic coverage, computed across completed and archived programs.
- Metrics can be filtered by program, aid type, and date range.
- Analytics figures are read-only summaries derived from the audit log and blockchain ledger, so they cannot be edited directly.

*Sheet note: Not in the original sheet — added to cover the proposal's Disaster Analytics feature (Section 10), which ORG-06/ORG-07 don't fully address since those are program-level dashboards/exports rather than cross-program historical trends.*

---

## 7. Reconciliation With the As-Built System

**Read this before planning.** Several stories assume roles or capabilities that do not exist in the code today. This is not a reason to drop them — it is the estimation input. Implementation status detail lives in [flow-reliefchain.md](flow-reliefchain.md); the operating boundary lives in [brd-reliefchain.md](brd-reliefchain.md) §1.4.

### 7.1 Roles the backlog assumes that the app does not have

`src/utils/auth-routing.ts` routes exactly three roles: `lgu`, `beneficiary`, `merchant`.

| Backlog role | Exists in code | Consequence |
|---|---|---|
| **Platform Admin** | ❌ No | All three ADM stories need a new role, its own route group, its own RLS policy set, and a cross-organization data scope. This is a new tier, not three screens. Estimate accordingly. |
| **Verification Officer** | ❌ No | ORG-02, ORG-08, and ORG-13 assume a second organization-level role with narrower permissions than the admin. Today an org account is a single role with full access. Needs membership, invitation, and permission modelling before the stories are buildable. |
| Organization / Organization Admin | ✅ As `lgu` | Maps to the existing surface. |
| Beneficiary | ✅ | Maps directly. |
| Merchant | ✅ | Maps directly. |

### 7.2 Capabilities the backlog assumes

| Story | As-built reality |
|---|---|
| **VOUCHERS** (purpose-restricted spend) | The Soroban `VoucherContract` implements this and is tested, but it is **unreachable from the app**: `supabase/functions/prepare-payment/index.ts` rejects any `fundingSourceKind !== 'cash'` — *"Only cash funding source is supported in MVP."* The story is a gate lift plus wiring, not a from-scratch build. |
| **OFFLINE SYNC** (Bluetooth) | ⬜ No code. No BLE dependency; Android permissions are CAMERA and RECORD_AUDIO only. Needs offline authority and revocation, balance reservation, replay protection, and deterministic conflict resolution designed **before** the acceptance criteria are testable. The largest unknown in this backlog. |
| **SMS NOTIFICATIONS** | ⬜ No code. No SMS package or provider is chosen. Provider selection is a prerequisite, and BEN-07's SMS criterion depends on it. |
| **BEN-05** 'Pending Sync' marker | Depends on OFFLINE SYNC. Cannot be completed independently. |
| **MER-01** offline balance check | Depends on OFFLINE SYNC for the offline half. The online half is independently deliverable. |
| **ORG-01** org-to-org transfer | Not verified as present. Confirm against code before estimating — do not assume either way. |
| **ORG-07 / ANALYTICS** export | Projection tables and auditor RPCs exist; no charting or export interface does. |
| Stellar settlement in all stories | **Testnet only.** `shared/stellar-config.ts` throws `'Mainnet is hard-disabled for the pilot.'` Asset is `RCPHP`, declared *'Testnet only — no real monetary value.'* "Receives payment" in MER-02 means a testnet settlement, not money. |
| Merchant cash-out | 🟡 Simulated. No story in this backlog covers real fiat settlement, and no licensed partner is engaged. |

### 7.3 Sequencing consequence

Three High-priority items — VOUCHERS, OFFLINE SYNC, and the ADM module — each carry a structural prerequisite rather than a straightforward build. If the sprint is planned as 18 High stories of comparable size, it will miss. Resolve the prerequisites or reprioritise explicitly in §8.

---

## 8. Change Log

Record every scope change here: added or removed stories, priority changes, renumbering, and criteria edits. One line each, with the reason.

| Date | Change | Reason |
|---|---|---|
| 2026-09-24 | Created this document from the `sprint.html` sheet export. Normalised the duplicate `ADM-01` to `ADM-02`, and `ORG-010`–`ORG-013` to `ORG-10`–`ORG-13`. Added §7 reconciliation against the as-built system. No story content, priority, or criterion was altered. | Make the backlog usable and unambiguous in version control, and surface the role and capability gaps that affect estimation. |
| 2026-09-25 | ORG-04 partially implemented on the database vocabulary (`draft → funding → active → closing → closed`, plus `funding_failed` retry) instead of the backlog's (`Draft → Pending Approval → Active → Distribution Ongoing → Completed → Archived`). Funding stages route through the existing treasury activation flow + reconciler (the client never writes them); direct writes cover `active → closing` and `closing → closed` only, audit-logged via trigger. The legacy Completed button is removed (`completed` violates the lifecycle check on hosted); status badges now show database truth instead of date-derived Active. ORG-04 stays open until the team reconciles the vocabulary. | Unblock enrollment/disbursement testing without inventing statuses or weakening the reconciler-owned activation invariant; record the drift honestly rather than editing criteria to match code. |
| 2026-09-26 | Added LGU "Check distribution status" authorized reconcile action on the distribution observation screen (ORG-06): LGU-session `reconcile-stellar` job-branch call plus reconciled-state refresh, mirroring the merchant settlement check; no acceptance criteria changed. | Stranded `submitted` distribution recipients with valid on-chain hashes had no working authorized reconcile trigger while submit returned 200; the LGU-self path unblocks them without widening auth. |

---

## 9. Source Sheet Fidelity

What was carried over verbatim, and what was corrected.

**Preserved exactly:** all 32 user stories, every acceptance criterion, all priorities, all role assignments, and all italic sheet notes (reproduced under *Sheet note*).

**Corrected, with the original recorded:**
- Duplicate `ADM-01` → `ADM-02` (§2).
- `ORG-010`–`ORG-013` → `ORG-10`–`ORG-13` (§3).

**Left as found, flagged:**
- Four stories have a blank Role cell: ORG-08, ORG-13, SMS NOTIFICATIONS, OFFLINE SYNC. The role stated here is inferred from the story text and labelled as such. Fill the cells in.
- Every Developer and Status cell is empty across all 32 rows.
- The sheet's own column headers are mislabelled: column C is headed "Acceptance Criteria" but contains the user story, and column F is headed "Task" but contains the acceptance criteria. This document uses the accurate labels.

---

## Self-Check

- [x] All 32 stories from `sprint.html` carried over with full acceptance criteria
- [x] Priorities, roles, and sheet notes preserved
- [x] Duplicate and inconsistent story IDs corrected with the originals recorded
- [x] Blank Role, Developer, and Status cells flagged rather than filled with guesses
- [x] Usage instruction stated up front, including the Done rule and the scope-change rule
- [x] Backlog assumptions reconciled against the as-built roles and capabilities in §7
- [x] Testnet-only and simulated-cash-out boundaries restated so "receives payment" is not read as real money
- [ ] No story is assigned or started — Developer and Status columns need filling
- [ ] Platform Admin and Verification Officer roles need modelling before their stories are buildable
- [ ] Offline sync design decisions outstanding; its acceptance criteria are not yet testable

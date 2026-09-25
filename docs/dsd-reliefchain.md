# Design System Document (DSD): ReliefChain

**Project:** ReliefChain — Blockchain-Powered Disaster Relief Distribution Platform  
**Date:** 2026-09-24  
**Version:** 1.0  
**Owner:** MINDMESH  
**Status:** Active  
**Source of truth:** [`relief-chain.md`](relief-chain.md)  
**Related:** [BRD](brd-reliefchain.md) · [BPD](bpd-reliefchain.md) · [PRD](prd-reliefchain.md) · [SAD](sad-reliefchain.md) · [SDD](sdd-reliefchain.md) · [Flow](flow-reliefchain.md) · [Build](build-reliefchain.md)

---

> **Source-of-truth rule.** [`relief-chain.md`](relief-chain.md) is the canonical foundation document. Resolve conflicts there first, then propagate. Agents and developers should read `relief-chain.md`, then the rest of `docs/`, before reading code.
>
> **Token authority.** `src/constants/theme.ts` is the implementation authority for every token in this document. If a value here disagrees with that file, the file wins and this document must be corrected.
>
> **Appearance scope.** ReliefChain is **light mode**. Dark mode is **TBD** — see §3.2.

---

## 1. Design Philosophy

**Role:** the interface serves three audiences in one binary — an LGU administrator moving public funds, a disaster-affected beneficiary who may be stressed and unfamiliar with the app, and a merchant transacting repeatedly at a counter. Clarity outranks personality.

**Principles**

1. **Legibility before decoration.** Text is high contrast on white; brand color carries meaning, not mood.
2. **Green means action and identity; navy means active or selected state.** Green (`#6FCA4B`) is the app's signature; navy (`#112E58`) marks the current position and primary text emphasis.
3. **One primary action per screen.** Financial steps are explicit and confirmable, never incidental taps.
4. **Wizards over dense forms.** Program creation is seven steps and distribution is five, because each step is an auditable decision.
5. **State must be visible.** A payment, a disbursement, or a registration always shows where it is — prepared, submitted, awaiting reconciliation, confirmed, or failed.
6. **Never imply real money.** RCPHP is a testnet asset with no monetary value. Any amount display near a value claim must be able to carry that disclosure.

**Explicitly avoided:** dense multi-column data grids on phone screens; color as the only signal; motion that competes with reading; celebratory language on financial confirmations; ambiguity about whether an amount is real.

---

## 2. Design Tokens

All values are from `src/constants/theme.ts`.

### 2.1 Brand colors

| Token | Value | Usage |
|---|---|---|
| `BrandColors.green` | `#6FCA4B` | Primary action, tab bar surface, brand identity |
| `BrandColors.navy` | `#112E58` | Active/selected state, headings, strong emphasis |
| `BrandColors.yellow` | `#E4CF10` | Accent and attention — use sparingly |
| `BrandColors.lightGray` | `#EEEDED` | Neutral fills and separators |
| `BrandColors.grey` | `#979797` | Muted text, disabled states, placeholders |
| `BrandColors.budgetGradientEnd` | `#6595DA` | Terminal stop for budget-card gradients (`expo-linear-gradient`) |

`AGENTS.md` names four brand colors; `theme.ts` adds `grey` and `budgetGradientEnd`. Both greys and the gradient stop are legitimate and in use — treat `theme.ts` as the complete set.

### 2.2 Surface colors

| Token | Light | Dark (defined, not supported) |
|---|---|---|
| `text` | `#000000` | `#ffffff` |
| `background` | `#ffffff` | `#000000` |
| `backgroundElement` | `#F0F0F3` | `#212225` |
| `backgroundSelected` | `#E0E1E6` | `#2E3135` |
| `textSecondary` | `#60646C` | `#B0B4BA` |

### 2.3 Spacing

Base unit 4, with a deliberately non-linear scale.

| Token | Value | Typical use |
|---|---|---|
| `Spacing.half` | 2 | Hairline separation |
| `Spacing.one` | 4 | Tight internal gaps |
| `Spacing.two` | 8 | Control padding |
| `Spacing.three` | 16 | Default element spacing, screen gutters |
| `Spacing.four` | 24 | Section spacing |
| `Spacing.five` | 32 | Block separation |
| `Spacing.six` | 64 | Major vertical rhythm |
| `Spacing.eight` | 96 | Hero and empty-state spacing |

### 2.4 Radius

| Token | Value | Usage |
|---|---|---|
| `BorderRadius.sm` | 4 | Chips, small inputs |
| `BorderRadius.md` | 8 | Buttons, inputs |
| `BorderRadius.lg` | 16 | Cards |
| `BorderRadius.xl` | 24 | Sheets, large cards |
| `BorderRadius.full` | 9999 | Avatars and circular controls |

Two shell values are intentionally outside the scale: the floating tab bar uses radius `30`, and its active icon chip uses radius `14` (`src/app/(beneficiary)/_layout.tsx`). Do not reuse them for content components.

### 2.5 Layout

| Token | Value | Meaning |
|---|---|---|
| `FloatingTabBarHeight` | 60 | Tab bar height |
| `FloatingTabBarGap` | 10 | Gap above the safe-area bottom inset |
| `BottomTabInset` | iOS 50 / Android 80 | Bottom padding content must reserve |
| `MaxContentWidth` | 800 | Caps line length on tablet and web |

Screens must respect safe areas with `react-native-safe-area-context` and reserve `BottomTabInset` so the floating bar never covers the last row.

### 2.6 Typography

**Faces:** Plus Jakarta Sans weights 400, 500, 600, 700 (`@expo-google-fonts/plus-jakarta-sans`) plus **Sarina** 400 (`@expo-google-fonts/sarina`), both loaded in `src/app/_layout.tsx`.

| Role | Face | Weight |
|---|---|---|
| Display / brand mark | Sarina | 400 |
| Headings | Plus Jakarta Sans | 600–700 |
| Body | Plus Jakarta Sans | 400 |
| Labels, buttons | Plus Jakarta Sans | 500–600 |
| Emphasis on amounts | Plus Jakarta Sans | 600–700 |

`Sarina` is a decorative display face: use it for brand expression only, never for body copy, numerals, amounts, or any text a user must read under stress. `theme.ts` also exports a platform `Fonts` map (`sans`/`serif`/`rounded`/`mono`) for system-face fallbacks.

**No numeric type scale is defined in code.** Sizes are currently per-component. Defining a shared scale is open work (§8).

### 2.7 Elevation

There is no shadow token set. The floating tab bar explicitly flattens platform elevation (`elevation: 0`, `shadowOpacity: 0`) and expresses depth through color, radius, and offset instead. `expo-glass-effect` is available for translucent surfaces; use it deliberately and verify contrast.

---

## 3. Appearance Modes

### 3.1 Light mode — supported

Light is the designed and supported appearance: white background, black primary text, `#60646C` secondary text, navy emphasis, green actions.

### 3.2 Dark mode — TBD

Dark palettes exist in `theme.ts` and `app.config.js` sets `userInterfaceStyle: 'automatic'`, so a device in dark mode may resolve dark values in any component that reads them. That path is **not designed, not reviewed, and not verified**.

Treat dark mode as unsupported until these are done:

- Audit every screen for hardcoded light-only colors.
- Verify brand-on-dark contrast, especially green `#6FCA4B` and yellow `#E4CF10` on `#000000`.
- Decide whether to force light (`userInterfaceStyle: 'light'`) or fully support automatic.
- Re-check QR contrast, scanner overlays, and gradient cards on dark backgrounds.

Until then, do not claim dark-mode support, and do not add dark-only styling.

---

## 4. Component Specifications

Component rules are enforced by `AGENTS.md` and `context/frontend-skills/frontend-rule.md`; the Expo-specific rules come from `.agents/skills/expo-expert/SKILL.md`.

### 4.1 Structural rules

- Any screen or component beyond roughly **150 lines** splits into a folder under `src/components/<Feature>/`.
- Screens in `src/app/**` own state, effects, and data; their render is a short composition.
- Sub-components take props and emit callbacks (`onUpdate`, `onSubmit`); modals own their own form state and call a submit callback.
- Shared UI goes in `src/components/shared/`; shared types in `src/types/<domain>.ts`, never re-declared.
- Functional components with hooks only; `StyleSheet.create` over inline styles; no `any`.
- Long lists use `FlatList`/`SectionList` with an explicit `keyExtractor` — never `.map()` over a large array inside a `ScrollView`.
- Prefer `expo-image` over React Native `Image`; `expo-symbols` for symbol icons where applicable.
- Install dependencies with `npx expo install <package>`.

### 4.2 Buttons

| Variant | Fill | Label | Radius | Use |
|---|---|---|---|---|
| Primary | `BrandColors.green` | white, weight 600 | `md` (8) | The single main action |
| Secondary | white with green border | green | `md` | Alternative action |
| Tertiary / ghost | transparent | navy | `md` | Low-emphasis navigation |
| Destructive | error red (per component) | white | `md` | Reject, dispose, cancel with consequence |
| Disabled | `lightGray` | `grey` | `md` | Blocked action — pair with a reason |

Minimum touch target 44×44. Financial submits must show an in-flight state and must not be double-submittable.

### 4.3 Inputs

Radius `md`; `grey` placeholders; navy focus emphasis; validation message directly below the field; never color-only error signaling. Amount inputs must reject unsafe values in the client and rely on server-side fail-closed validation as the real guard (SDD §2).

### 4.4 Cards

Radius `lg` (16) or `xl` (24), white or `backgroundElement` fill, `Spacing.three` internal padding. Budget cards may use a green→`budgetGradientEnd` gradient; keep label text above a verified contrast threshold on the gradient.

### 4.5 Status representation

Financial state is a first-class UI concern. Every status must pair a **label** with a **shape or icon**, not color alone.

| Domain state | Presentation |
|---|---|
| `requested` / `prepared` | Neutral, "preparing" |
| `submitted` | In-flight, "submitted — awaiting confirmation" |
| Reconciled / confirmed | Green success with the settled amount |
| `failed` | Destructive with a concrete next step |
| Simulated (cash-out) | Explicit notice — see `src/components/CashOut/SimulatedCashOutNotice.tsx` |
| Pending review (registration) | Informational, with what happens next |

### 4.6 QR surfaces

- **Display** (`MerchantInvoice/InvoiceQrCard.tsx`, `shared/qr-modal.tsx`): maximum quiet zone and contrast; never tint the code; never place it on a gradient.
- **Scan** (`beneficiary/PayScan/ScannerView.tsx` + `qr-viewfinder.tsx`): a clear viewfinder, a plain-language permission prompt matching the `app.config.js` copy ("Relief Chain uses your camera to scan beneficiary QR codes for voucher redemption."), and a readable failure message for an invalid, expired, or wrong-program invoice.

### 4.7 Biometric approval

`requestPaymentApproval()` distinguishes cancelled from unenrolled. The UI must therefore offer an explicit on-screen confirmation fallback and never dead-end a user whose device has no enrolled biometric.

---

## 5. Navigation

Three role shells, deliberately different.

### 5.1 Beneficiary — floating pill tab bar

Absolutely positioned, `BrandColors.green`, radius `30`, height `60`, inset 16 left and right, `bottom = safeArea.bottom + 10`, labels hidden, platform elevation and shadow zeroed. The active tab shows a navy chip (40×40, radius `14`) behind a white-tinted 22×22 icon. Five visible tabs: Dashboard, My Assistance, Pay/Scan, Find Organization, Profile.

### 5.2 LGU — standard tabs

Five visible tabs: Dashboard, Programs, **Disbursements** (route `pay-scan`), Beneficiaries, Settings. Wizard, detail, and edit routes are hidden with `href: null` and reached programmatically. The group is wrapped in `CreateProgramProvider` so wizard state survives step navigation.

### 5.3 Merchant — stack with a custom bottom bar

A `Stack` with `animation: 'none'`; bottom navigation is `MerchantDashboard/MerchantBottomNavigation.tsx`. Counter use favors instant, non-animated transitions.

### 5.4 Auth

A plain `Stack`, `headerShown: false`. Registration continuation routes (`verify-email`, `registration-success`, `forgot-password`) are whitelisted by `auth-routing.ts` so a partially onboarded user is not bounced.

---

## 6. Motion

`react-native-reanimated` 4.5.1 with `react-native-worklets`. Motion signals state change; it never decorates.

| Interaction | Guidance |
|---|---|
| Press feedback | Immediate, subtle |
| Screen transition | Platform default; merchant stack disables animation on purpose |
| Wizard step | Directional, short |
| In-flight financial action | A persistent progress indicator — never an indefinite spinner with no label |
| Success | A brief confirmation; no celebratory looping |

Respect reduced-motion preferences: replace movement with an opacity change.

---

## 7. Accessibility

**Committed**

- Minimum 44×44 touch targets.
- Label plus shape or icon for every status, never color alone.
- Plain-language permission and error copy.
- Biometric fallback so no user is locked out.
- `MaxContentWidth` 800 to keep line length readable on wide screens.
- Safe-area compliance with reserved `BottomTabInset`.

**Not yet verified**

- WCAG AA contrast audit. Two pairs need measurement before any claim: white on green `#6FCA4B`, and anything on yellow `#E4CF10`. Yellow at this luminance will likely fail as a text background — prefer it as a border, dot, or fill behind dark text.
- Screen-reader labeling coverage, especially the icon-only beneficiary tab bar, which hides labels and therefore needs explicit accessibility labels.
- Dynamic type and large-font-scale behavior.
- Language support beyond English.

Full accessibility compliance requires manual testing with assistive technology and expert review; this document does not assert it.

---

## 8. Open Design Work

| Item | Status |
|---|---|
| Numeric type scale as shared tokens | **TBD** — sizes are per-component today |
| Dark mode | **TBD** — §3.2 |
| WCAG AA contrast verification | **TBD** — green and yellow pairs |
| Screen-reader labels for the icon-only tab bar | **TBD** |
| Localization | **TBD** — English only today |
| Elevation/shadow tokens | **TBD** — none exist |
| Empty, offline, and error-state illustration set | **TBD** |
| RCPHP "no monetary value" disclosure placement | **TBD** — the string exists (`RCPHP_DISCLOSURE`); consistent surfacing is undecided |

---

## Self-Check

- [x] Every token traced to `src/constants/theme.ts`
- [x] Light mode stated as the supported appearance; dark mode marked TBD with exit criteria
- [x] Navigation documented per role shell with real values
- [x] Component rules aligned with `AGENTS.md`, the frontend rules, and the Expo skill
- [x] Sarina constrained to display use
- [ ] Contrast audit outstanding for green and yellow pairings
- [ ] Type scale, elevation tokens, and localization outstanding

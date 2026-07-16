//! Contract data types.
//!
//! Every persisted structure is PII-free by construction (design: Requirement
//! 7.3, 19.1). Beneficiaries and merchants are referenced only by Stellar
//! `Address` (a wallet, not a person) or by an opaque pseudonymous
//! `BytesN<32>` identifier that carries no recoverable identity value.
//!
//! Amounts are integer stroops as `i128` everywhere; decimal formatting happens
//! only at UI boundaries (design: "Stellar Account and Asset Topology").

use soroban_sdk::{contracttype, Address, BytesN, String, Symbol};

/// Immutable program configuration, frozen at `initialize` and never rewritten
/// (design: instance storage; Requirement 5.7, 7.10). Stored once in instance
/// storage and returned verbatim by `get_config`.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProgramConfig {
    /// Program administrator: authorizes `allocate`, `set_merchant`, and
    /// testnet wallet rotation.
    pub admin: Address,
    /// Source treasury that funds the escrow; the only address permitted to
    /// call `fund`.
    pub treasury: Address,
    /// Emergency authority for `pause` / `resume` (testnet: single admin;
    /// production: multi-party — enforced off-chain by the deployer).
    pub emergency_authority: Address,
    /// The `RCPHP` Stellar Asset Contract (SAC) address this escrow holds.
    pub sac: Address,
    /// Pseudonymous program identifier (no PII, no reversible identity value).
    pub program_id: BytesN<32>,
    /// Human-facing asset code, e.g. `RCPHP`. Purely descriptive.
    pub asset_code: Symbol,
    /// Full approved budget, in stroops, that must be escrowed before
    /// activation and that bounds total allocation.
    pub funded_budget: i128,
    /// Program expiry (ledger timestamp, seconds). Entitlements may not outlive
    /// this, and redemption after it is rejected (task 9.2).
    pub program_expires_at: u64,
    /// Refund window after expiry, in seconds, honored by closure (task 9.3).
    pub refund_window_secs: u64,
    /// Per-transaction redemption limit in stroops (task 9.2).
    pub per_tx_limit: i128,
    /// Rolling daily redemption limit in stroops (task 9.2 / 9.3).
    pub daily_limit: i128,
    /// Contract implementation version. There is no upgrade function; a new
    /// version is a new deployment (design: "The contract has no upgrade
    /// function").
    pub contract_version: u32,
}

/// Program lifecycle. `Draft` funds and backs the escrow; `Active` allows
/// allocation and (task 9.2) redemption; `Paused` is a non-seizing freeze
/// (task 9.3); `Closed` is terminal after unused escrow is returned (task 9.3).
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Lifecycle {
    Draft,
    Active,
    Paused,
    Closed,
}

/// Aggregate financial totals kept in instance storage and checked against the
/// conservation invariants before and after every value-changing operation
/// (design: "Financial Invariants").
///
/// Invariants maintained by the contract:
/// * `total_funded == contract_balance + (gross_redeemed - refunded) + returned_to_treasury`
/// * `allocated_outstanding <= contract_balance`
///
/// After full backing, `total_funded == funded_budget`, which yields the
/// design's headline identity
/// `funded_budget = contract_balance + net_merchant_settlement + returned_to_treasury`.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Totals {
    /// Immutable target backing, copied from `ProgramConfig.funded_budget`.
    pub funded_budget: i128,
    /// Sum of all confirmed `fund` deposits.
    pub total_funded: i128,
    /// Asset currently escrowed in the contract.
    pub contract_balance: i128,
    /// Sum of allocated-but-not-yet-settled entitlement value.
    pub allocated_outstanding: i128,
    /// Gross value released to merchants across all redemptions (task 9.2).
    pub gross_redeemed: i128,
    /// Value returned to entitlements via refunds (task 9.3).
    pub refunded: i128,
    /// Unused / expired escrow returned to the treasury at closure (task 9.3).
    pub returned_to_treasury: i128,
}

impl Totals {
    /// A fresh totals ledger for a program with the given target budget.
    pub fn new(funded_budget: i128) -> Self {
        Totals {
            funded_budget,
            total_funded: 0,
            contract_balance: 0,
            allocated_outstanding: 0,
            gross_redeemed: 0,
            refunded: 0,
            returned_to_treasury: 0,
        }
    }

    /// Net value settled to merchants: `gross_redeemed - refunded`.
    pub fn net_merchant_settlement(&self) -> i128 {
        self.gross_redeemed - self.refunded
    }
}

/// A beneficiary entitlement. Keyed by an opaque `entitlement_id`; the only
/// person-linked value is the beneficiary wallet address, never PII.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Entitlement {
    /// Opaque pseudonymous identifier (stable across wallet rotation).
    pub entitlement_id: BytesN<32>,
    /// The wallet currently authorized to redeem this entitlement.
    pub beneficiary: Address,
    /// Original allocated amount, in stroops.
    pub allocated: i128,
    /// Remaining redeemable balance, in stroops.
    pub remaining: i128,
    /// Entitlement expiry (ledger timestamp, seconds).
    pub expires_at: u64,
    /// False once fully spent, expired-and-closed, or revoked.
    pub active: bool,
}

/// Program-scoped merchant authorization. Consumed by `set_merchant` and
/// `redeem` in task 9.2; defined here so the public interface is complete and
/// the workspace compiles.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MerchantAuthorization {
    /// Stable pseudonymous merchant identifier (no display name, no PII).
    pub merchant_id: BytesN<32>,
    /// Verified settlement wallet that receives released value.
    pub settlement_wallet: Address,
    /// The Ed25519 public key (raw 32 bytes) the merchant uses to sign invoices.
    ///
    /// A Soroban `Address` cannot be converted to or from a raw Ed25519 public
    /// key on-chain (rs-soroban-sdk issue #1636), so the admin binds the
    /// authorized invoice-signing key explicitly here. `redeem` verifies the
    /// invoice signature against this key and rejects any other signer, which is
    /// what ties a signed invoice to an accredited merchant (Requirement 9.2,
    /// 9.4, 10.3).
    pub invoice_signer: BytesN<32>,
    /// Accreditation category this merchant may serve.
    pub category: Symbol,
    /// Authorization validity deadline (ledger timestamp, seconds).
    pub valid_until: u64,
    /// False once revoked; revocation never reverses prior settlements.
    pub active: bool,
}

/// On-chain view of a signed `reliefchain:invoice:v1` invoice. Mirrors the
/// canonical fields in `shared/invoice-codec.ts`; consumed by `redeem` in task
/// 9.2. Contains no PII or item descriptions.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct InvoiceV1 {
    pub version: u32,
    pub kind: Symbol,
    pub network: Symbol,
    pub asset_code: Symbol,
    pub asset_issuer: String,
    pub sac: Address,
    pub program_id: String,
    pub contract_id: Address,
    pub merchant_id: BytesN<32>,
    pub settlement_wallet: Address,
    pub invoice_signer: BytesN<32>,
    pub amount: i128,
    pub category: Symbol,
    pub nonce: BytesN<32>,
    pub issued_at: u64,
    pub expires_at: u64,
}

/// A confirmed redemption record. Written by `redeem` in task 9.2; defined here
/// so `get_redemption` has a concrete return type.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Redemption {
    pub redemption_id: BytesN<32>,
    pub entitlement_id: BytesN<32>,
    pub merchant_id: BytesN<32>,
    pub amount: i128,
    pub refunded: i128,
    pub settled_at: u64,
}

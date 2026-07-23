//! Storage keys, TTL policy, and typed accessors.
//!
//! * Instance storage holds immutable configuration, lifecycle, and aggregate
//!   totals (small, always-read state).
//! * Persistent storage holds per-entity records (entitlements, merchants,
//!   redemptions, nonces, daily spend) keyed by opaque identifiers.
//!
//! Every call extends the TTL of the instance entry and of any persistent
//! entry it touches (design: "Every call extends the TTL of touched live
//! entries"; Requirement 18.7, 22.5).

use soroban_sdk::{contracttype, BytesN, Env};

use crate::types::{Entitlement, Lifecycle, MerchantAuthorization, ProgramConfig, Redemption, Totals};

// --- TTL policy -------------------------------------------------------------
//
// Testnet ledgers close roughly every 5 seconds, so ~17280 ledgers per day.
// Touched entries are extended to ~30 days, refreshed when they fall below
// ~29 days remaining. A scheduled keeper (task 11.1) extends beyond the refund
// window; per-call extension keeps hot entries alive between keeper runs.

/// Approximate number of ledgers closed per day on testnet.
pub const LEDGERS_PER_DAY: u32 = 17_280;

/// Target TTL (in ledgers) for the instance entry when touched.
pub const INSTANCE_BUMP_LEDGERS: u32 = 30 * LEDGERS_PER_DAY;
/// Refresh the instance TTL when it drops below this threshold.
pub const INSTANCE_TTL_THRESHOLD: u32 = INSTANCE_BUMP_LEDGERS - LEDGERS_PER_DAY;

/// Target TTL (in ledgers) for a persistent entry when touched.
pub const PERSISTENT_BUMP_LEDGERS: u32 = 30 * LEDGERS_PER_DAY;
/// Refresh a persistent TTL when it drops below this threshold.
pub const PERSISTENT_TTL_THRESHOLD: u32 = PERSISTENT_BUMP_LEDGERS - LEDGERS_PER_DAY;

/// Storage keys. Instance-scoped singletons and persistent per-entity records.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// Immutable program configuration (instance).
    Config,
    /// Current lifecycle state (instance).
    Lifecycle,
    /// Aggregate financial totals (instance).
    Totals,
    /// Entitlement by opaque id (persistent).
    Entitlement(BytesN<32>),
    /// Merchant authorization by opaque id (persistent) — task 9.2.
    Merchant(BytesN<32>),
    /// Redemption record by opaque id (persistent) — task 9.2.
    Redemption(BytesN<32>),
    /// One-time merchant invoice nonce marker (persistent) — task 9.2.
    UsedNonce(BytesN<32>),
    /// Daily spend keyed by (entitlement id, day index) (persistent) — task 9.2/9.3.
    DailySpend(BytesN<32>, u64),
}

// --- Instance TTL -----------------------------------------------------------

/// Extend the instance entry TTL. Call from every public entry point.
pub fn extend_instance_ttl(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_BUMP_LEDGERS);
}

/// Extend the TTL of a single persistent entry the call touched.
pub fn extend_persistent_ttl(env: &Env, key: &DataKey) {
    env.storage()
        .persistent()
        .extend_ttl(key, PERSISTENT_TTL_THRESHOLD, PERSISTENT_BUMP_LEDGERS);
}

// --- Config -----------------------------------------------------------------

pub fn has_config(env: &Env) -> bool {
    env.storage().instance().has(&DataKey::Config)
}

pub fn set_config(env: &Env, config: &ProgramConfig) {
    env.storage().instance().set(&DataKey::Config, config);
}

pub fn get_config(env: &Env) -> Option<ProgramConfig> {
    env.storage().instance().get(&DataKey::Config)
}

// --- Lifecycle --------------------------------------------------------------

pub fn set_lifecycle(env: &Env, lifecycle: &Lifecycle) {
    env.storage().instance().set(&DataKey::Lifecycle, lifecycle);
}

pub fn get_lifecycle(env: &Env) -> Option<Lifecycle> {
    env.storage().instance().get(&DataKey::Lifecycle)
}

// --- Totals -----------------------------------------------------------------

pub fn set_totals(env: &Env, totals: &Totals) {
    env.storage().instance().set(&DataKey::Totals, totals);
}

pub fn get_totals(env: &Env) -> Option<Totals> {
    env.storage().instance().get(&DataKey::Totals)
}

// --- Entitlements (persistent) ----------------------------------------------

pub fn has_entitlement(env: &Env, id: &BytesN<32>) -> bool {
    env.storage()
        .persistent()
        .has(&DataKey::Entitlement(id.clone()))
}

pub fn set_entitlement(env: &Env, entitlement: &Entitlement) {
    let key = DataKey::Entitlement(entitlement.entitlement_id.clone());
    env.storage().persistent().set(&key, entitlement);
    extend_persistent_ttl(env, &key);
}

pub fn get_entitlement(env: &Env, id: &BytesN<32>) -> Option<Entitlement> {
    let key = DataKey::Entitlement(id.clone());
    let entitlement: Option<Entitlement> = env.storage().persistent().get(&key);
    if entitlement.is_some() {
        extend_persistent_ttl(env, &key);
    }
    entitlement
}

// --- Merchants (persistent) — task 9.2 --------------------------------------

pub fn set_merchant(env: &Env, merchant: &MerchantAuthorization) {
    let key = DataKey::Merchant(merchant.merchant_id.clone());
    env.storage().persistent().set(&key, merchant);
    extend_persistent_ttl(env, &key);
}

pub fn get_merchant(env: &Env, id: &BytesN<32>) -> Option<MerchantAuthorization> {
    let key = DataKey::Merchant(id.clone());
    let merchant: Option<MerchantAuthorization> = env.storage().persistent().get(&key);
    if merchant.is_some() {
        extend_persistent_ttl(env, &key);
    }
    merchant
}

// --- Redemptions (persistent) — task 9.2 ------------------------------------

pub fn set_redemption(env: &Env, redemption: &Redemption) {
    let key = DataKey::Redemption(redemption.redemption_id.clone());
    env.storage().persistent().set(&key, redemption);
    extend_persistent_ttl(env, &key);
}

pub fn get_redemption(env: &Env, id: &BytesN<32>) -> Option<Redemption> {
    let key = DataKey::Redemption(id.clone());
    let redemption: Option<Redemption> = env.storage().persistent().get(&key);
    if redemption.is_some() {
        extend_persistent_ttl(env, &key);
    }
    redemption
}

// --- One-time invoice nonces (persistent) — task 9.2 ------------------------
//
// A nonce marker is written only in the same successful invocation that settles
// value (design: "A nonce is recorded only in the same successful invocation
// that settles value"). Its presence rejects any replay of the same invoice.

pub fn is_nonce_used(env: &Env, nonce: &BytesN<32>) -> bool {
    env.storage()
        .persistent()
        .has(&DataKey::UsedNonce(nonce.clone()))
}

pub fn mark_nonce_used(env: &Env, nonce: &BytesN<32>) {
    let key = DataKey::UsedNonce(nonce.clone());
    env.storage().persistent().set(&key, &true);
    extend_persistent_ttl(env, &key);
}

// --- Daily spend (persistent) — task 9.2 ------------------------------------
//
// Keyed by (stable entitlement id, day index) rather than wallet so that a
// wallet rotation cannot reset a beneficiary's rolling daily limit (design:
// "Daily spend is keyed by stable entitlement rather than wallet").

pub fn get_daily_spend(env: &Env, entitlement_id: &BytesN<32>, day: u64) -> i128 {
    env.storage()
        .persistent()
        .get(&DataKey::DailySpend(entitlement_id.clone(), day))
        .unwrap_or(0)
}

pub fn set_daily_spend(env: &Env, entitlement_id: &BytesN<32>, day: u64, amount: i128) {
    let key = DataKey::DailySpend(entitlement_id.clone(), day);
    env.storage().persistent().set(&key, &amount);
    extend_persistent_ttl(env, &key);
}

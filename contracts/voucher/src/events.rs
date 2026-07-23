//! Contract events.
//!
//! Events carry only pseudonymous identifiers, wallet addresses, amounts, and
//! correlation values — never PII (design: "Events contain pseudonymous
//! identifiers, addresses, amounts, and correlation values only";
//! Requirement 19.1). The reconciler ingests these to build read models.

use soroban_sdk::{symbol_short, Address, BytesN, Env};

/// Emitted after a confirmed `fund` deposit into the escrow.
///
/// topics: `("funded",)`
/// data:   `(from, amount, total_funded)`
pub fn funded(env: &Env, from: &Address, amount: i128, total_funded: i128) {
    env.events()
        .publish((symbol_short!("funded"),), (from.clone(), amount, total_funded));
}

/// Emitted when the program transitions from `Draft` to `Active` (fully backed).
///
/// topics: `("activated",)`
/// data:   `(program_id, funded_budget, total_funded)`
pub fn activated(env: &Env, program_id: &BytesN<32>, funded_budget: i128, total_funded: i128) {
    env.events().publish(
        (symbol_short!("activated"),),
        (program_id.clone(), funded_budget, total_funded),
    );
}

/// Emitted when a beneficiary entitlement is allocated.
///
/// topics: `("alloc", entitlement_id)`
/// data:   `(beneficiary, amount, expires_at)`
pub fn entitlement_allocated(
    env: &Env,
    entitlement_id: &BytesN<32>,
    beneficiary: &Address,
    amount: i128,
    expires_at: u64,
) {
    env.events().publish(
        (symbol_short!("alloc"), entitlement_id.clone()),
        (beneficiary.clone(), amount, expires_at),
    );
}

/// Emitted when a merchant authorization is added, updated, or revoked.
///
/// topics: `("merchant", merchant_id)`
/// data:   `(settlement_wallet, active, valid_until)`
pub fn merchant_changed(
    env: &Env,
    merchant_id: &BytesN<32>,
    settlement_wallet: &Address,
    active: bool,
    valid_until: u64,
) {
    env.events().publish(
        (symbol_short!("merchant"), merchant_id.clone()),
        (settlement_wallet.clone(), active, valid_until),
    );
}

/// Emitted when a voucher redemption settles value to a merchant.
///
/// Carries pseudonymous identifiers, the settlement wallet, and the amount
/// only — never PII (design: "Events contain pseudonymous identifiers,
/// addresses, amounts, and correlation values only"; Requirement 19.1).
///
/// topics: `("redeemed", entitlement_id, merchant_id)`
/// data:   `(redemption_id, settlement_wallet, amount, remaining, settled_at)`
pub fn redeemed(
    env: &Env,
    entitlement_id: &BytesN<32>,
    merchant_id: &BytesN<32>,
    redemption_id: &BytesN<32>,
    settlement_wallet: &Address,
    amount: i128,
    remaining: i128,
    settled_at: u64,
) {
    env.events().publish(
        (
            symbol_short!("redeemed"),
            entitlement_id.clone(),
            merchant_id.clone(),
        ),
        (
            redemption_id.clone(),
            settlement_wallet.clone(),
            amount,
            remaining,
            settled_at,
        ),
    );
}

/// Emitted when a merchant refunds value from a confirmed redemption back to the
/// original beneficiary entitlement (Requirement 15.3, 15.4).
///
/// topics: `("refunded", redemption_id)`
/// data:   `(entitlement_id, merchant_wallet, amount, cumulative_refunded, entitlement_remaining)`
pub fn refunded(
    env: &Env,
    redemption_id: &BytesN<32>,
    entitlement_id: &BytesN<32>,
    merchant_wallet: &Address,
    amount: i128,
    cumulative_refunded: i128,
    entitlement_remaining: i128,
) {
    env.events().publish(
        (symbol_short!("refunded"), redemption_id.clone()),
        (
            entitlement_id.clone(),
            merchant_wallet.clone(),
            amount,
            cumulative_refunded,
            entitlement_remaining,
        ),
    );
}

/// Emitted when an entitlement is migrated to a newly authorized wallet and the
/// old wallet's redemption ability is revoked (Requirement 16.3, 16.4).
///
/// topics: `("rotated", entitlement_id)`
/// data:   `(old_wallet, new_wallet)`
pub fn beneficiary_rotated(
    env: &Env,
    entitlement_id: &BytesN<32>,
    old_wallet: &Address,
    new_wallet: &Address,
) {
    env.events().publish(
        (symbol_short!("rotated"), entitlement_id.clone()),
        (old_wallet.clone(), new_wallet.clone()),
    );
}

/// Emitted when the emergency authority pauses the program. Non-seizing: no
/// value moves (Requirement 7.11).
///
/// topics: `("paused",)`
/// data:   `(reason_hash,)`
pub fn paused(env: &Env, reason_hash: &BytesN<32>) {
    env.events()
        .publish((symbol_short!("paused"),), (reason_hash.clone(),));
}

/// Emitted when the emergency authority resumes a paused program.
///
/// topics: `("resumed",)`
/// data:   `(reason_hash,)`
pub fn resumed(env: &Env, reason_hash: &BytesN<32>) {
    env.events()
        .publish((symbol_short!("resumed"),), (reason_hash.clone(),));
}

/// Emitted when the program closes and unused/expired escrow is returned to the
/// treasury (Requirement 15.7, 15.8).
///
/// topics: `("closed",)`
/// data:   `(returned_amount, returned_to_treasury_total, contract_balance_after)`
pub fn closed(
    env: &Env,
    returned_amount: i128,
    returned_to_treasury_total: i128,
    contract_balance_after: i128,
) {
    env.events().publish(
        (symbol_short!("closed"),),
        (
            returned_amount,
            returned_to_treasury_total,
            contract_balance_after,
        ),
    );
}

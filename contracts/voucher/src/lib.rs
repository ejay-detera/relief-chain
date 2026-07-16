#![no_std]
//! Relief Chain isolated voucher escrow contract (testnet pilot).
//!
//! One immutable instance of this contract is deployed per activated voucher
//! program. It escrows the program's `RCPHP` backing through the asset's
//! Stellar Asset Contract (SAC), records pseudonymous entitlements, and (in
//! later tasks) verifies signed invoices, settles merchants, refunds, rotates
//! wallets, pauses, and closes.
//!
//! There is deliberately **no upgrade function** (design: "The contract has no
//! upgrade function"; Requirement 7.10). A new contract version is a new
//! deployment.
//!
//! # Task boundaries
//! This file implements task 9.1 (immutable configuration, funding,
//! full-backing activation, bounded allocation, read accessors, pseudonymous
//! events, touched-entry TTL extension), task 9.2 (admin-authorized merchant
//! authorization plus signed-invoice redemption with beneficiary authorization,
//! merchant/category/limit/expiry enforcement, one-time nonces, and atomic SAC
//! settlement), and task 9.3 (merchant-authorized refund with cumulative
//! bounds, admin wallet rotation with old-wallet revocation and stable-entitlement
//! daily limits, non-seizing emergency pause/resume, and expiry/refund-window
//! closure returning unused escrow). There is intentionally no `upgrade`
//! function.
//!
//! # Financial invariants (checked before and after every value change)
//! * `total_funded == contract_balance + (gross_redeemed - refunded) + returned_to_treasury`
//! * `allocated_outstanding <= contract_balance`
//!
//! After full backing `total_funded == funded_budget`, giving the design's
//! headline identity
//! `funded_budget = contract_balance + net_merchant_settlement + returned_to_treasury`.

use soroban_sdk::{
    contract, contractimpl, symbol_short, token, Address, Bytes, BytesN, Env, Symbol,
};

mod error;
mod events;
mod invoice;
mod storage;
mod types;

/// Seconds in a rolling daily-limit bucket (design: daily spend keyed by
/// `(entitlement, day)`; testnet uses UTC calendar days).
const SECONDS_PER_DAY: u64 = 86_400;

pub use error::Error;
pub use types::{
    Entitlement, InvoiceV1, Lifecycle, MerchantAuthorization, ProgramConfig, Redemption, Totals,
};

#[contract]
pub struct VoucherContract;

#[contractimpl]
impl VoucherContract {
    // ------------------------------------------------------------------
    // Initialization & configuration (immutable)
    // ------------------------------------------------------------------

    /// Store the immutable program configuration exactly once.
    ///
    /// The configured `admin` must authorize initialization, binding the
    /// program to its administrator. Configuration is written to instance
    /// storage and never rewritten; there is no setter and no upgrade path.
    pub fn initialize(env: Env, config: ProgramConfig) -> Result<(), Error> {
        if storage::has_config(&env) {
            return Err(Error::AlreadyInitialized);
        }
        Self::validate_config(&config)?;

        // The administrator consents to the frozen policy.
        config.admin.require_auth();

        let totals = Totals::new(config.funded_budget);
        storage::set_config(&env, &config);
        storage::set_lifecycle(&env, &Lifecycle::Draft);
        storage::set_totals(&env, &totals);
        storage::extend_instance_ttl(&env);
        Ok(())
    }

    // ------------------------------------------------------------------
    // Funding (Draft only)
    // ------------------------------------------------------------------

    /// Escrow `amount` stroops of the backing asset from the source treasury.
    ///
    /// Requires the configured treasury's authorization; funds are pulled via
    /// the SAC into this contract. Only permitted while `Draft`, so the full
    /// backing is in place before entitlements can be issued.
    pub fn fund(env: Env, from: Address, amount: i128) -> Result<(), Error> {
        let config = Self::require_config(&env)?;
        Self::require_lifecycle(&env, Lifecycle::Draft)?;

        if from != config.treasury {
            return Err(Error::NotAuthorized);
        }
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        from.require_auth();

        // Pull the asset into escrow through the SAC.
        let sac = token::TokenClient::new(&env, &config.sac);
        sac.transfer(&from, &env.current_contract_address(), &amount);

        let mut totals = Self::require_totals(&env)?;
        totals.total_funded = totals
            .total_funded
            .checked_add(amount)
            .ok_or(Error::ConservationViolation)?;
        totals.contract_balance = totals
            .contract_balance
            .checked_add(amount)
            .ok_or(Error::ConservationViolation)?;
        Self::assert_conservation(&totals)?;
        storage::set_totals(&env, &totals);

        events::funded(&env, &from, amount, totals.total_funded);
        storage::extend_instance_ttl(&env);
        Ok(())
    }

    // ------------------------------------------------------------------
    // Activation (full backing gate)
    // ------------------------------------------------------------------

    /// Transition `Draft -> Active` once the full budget is escrowed.
    ///
    /// Fails with [`Error::InsufficientBacking`] unless the escrowed balance is
    /// at least the approved `funded_budget`. After activation the policy is
    /// frozen and entitlements may be allocated.
    pub fn activate(env: Env) -> Result<(), Error> {
        let config = Self::require_config(&env)?;
        Self::require_lifecycle(&env, Lifecycle::Draft)?;
        config.admin.require_auth();

        let totals = Self::require_totals(&env)?;
        if totals.total_funded < config.funded_budget {
            return Err(Error::InsufficientBacking);
        }
        // Defensive: escrow must actually hold the backing before activation.
        if totals.contract_balance < config.funded_budget {
            return Err(Error::InsufficientBacking);
        }

        storage::set_lifecycle(&env, &Lifecycle::Active);
        events::activated(
            &env,
            &config.program_id,
            config.funded_budget,
            totals.total_funded,
        );
        storage::extend_instance_ttl(&env);
        Ok(())
    }

    // ------------------------------------------------------------------
    // Allocation (bounded by escrowed budget)
    // ------------------------------------------------------------------

    /// Allocate a beneficiary entitlement, bounded by the escrowed budget.
    ///
    /// Requires the program administrator. The new allocation plus all
    /// outstanding allocations may not exceed the escrowed balance
    /// ([`Error::BudgetExceeded`]), so published commitments can never exceed
    /// available funds. The entitlement expiry must be in the future and must
    /// not outlive the program.
    pub fn allocate(
        env: Env,
        entitlement_id: BytesN<32>,
        beneficiary: Address,
        amount: i128,
        expires_at: u64,
    ) -> Result<(), Error> {
        let config = Self::require_config(&env)?;
        Self::require_lifecycle(&env, Lifecycle::Active)?;
        config.admin.require_auth();

        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        let now = env.ledger().timestamp();
        if expires_at <= now || expires_at > config.program_expires_at {
            return Err(Error::InvalidExpiry);
        }
        if storage::has_entitlement(&env, &entitlement_id) {
            return Err(Error::EntitlementExists);
        }

        let mut totals = Self::require_totals(&env)?;
        let new_outstanding = totals
            .allocated_outstanding
            .checked_add(amount)
            .ok_or(Error::ConservationViolation)?;
        // Bound: never allocate more than is escrowed.
        if new_outstanding > totals.contract_balance {
            return Err(Error::BudgetExceeded);
        }
        totals.allocated_outstanding = new_outstanding;
        Self::assert_conservation(&totals)?;

        let entitlement = Entitlement {
            entitlement_id: entitlement_id.clone(),
            beneficiary: beneficiary.clone(),
            allocated: amount,
            remaining: amount,
            expires_at,
            active: true,
        };
        storage::set_entitlement(&env, &entitlement);
        storage::set_totals(&env, &totals);

        events::entitlement_allocated(&env, &entitlement_id, &beneficiary, amount, expires_at);
        storage::extend_instance_ttl(&env);
        Ok(())
    }

    // ------------------------------------------------------------------
    // Read accessors (extend TTL of touched entries)
    // ------------------------------------------------------------------

    /// The immutable program configuration.
    pub fn get_config(env: Env) -> Result<ProgramConfig, Error> {
        let config = Self::require_config(&env)?;
        storage::extend_instance_ttl(&env);
        Ok(config)
    }

    /// Aggregate financial totals (the conservation ledger).
    pub fn get_totals(env: Env) -> Result<Totals, Error> {
        let totals = Self::require_totals(&env)?;
        storage::extend_instance_ttl(&env);
        Ok(totals)
    }

    /// Current lifecycle state.
    pub fn get_lifecycle(env: Env) -> Result<Lifecycle, Error> {
        let lifecycle = storage::get_lifecycle(&env).ok_or(Error::NotInitialized)?;
        storage::extend_instance_ttl(&env);
        Ok(lifecycle)
    }

    /// An entitlement by opaque id, if present.
    pub fn get_entitlement(env: Env, entitlement_id: BytesN<32>) -> Option<Entitlement> {
        storage::get_entitlement(&env, &entitlement_id)
    }

    /// A merchant authorization by opaque id, if present (populated in task 9.2).
    pub fn get_merchant(env: Env, merchant_id: BytesN<32>) -> Option<MerchantAuthorization> {
        storage::get_merchant(&env, &merchant_id)
    }

    /// A redemption record by opaque id, if present (populated in task 9.2).
    pub fn get_redemption(env: Env, redemption_id: BytesN<32>) -> Option<Redemption> {
        storage::get_redemption(&env, &redemption_id)
    }

    // ------------------------------------------------------------------
    // Merchant authorization (task 9.2)
    // ------------------------------------------------------------------

    /// Add, update, or revoke a program merchant authorization.
    ///
    /// Requires the program administrator (design: "`set_merchant` ... require
    /// the configured program administrator"). Merchants are added or revoked
    /// after activation without altering completed payments (Requirement 5.9,
    /// 9.5). The record is PII-free: a stable pseudonymous `merchant_id`, the
    /// verified settlement wallet, the authorized invoice-signer key, an
    /// accreditation category, and a validity deadline (Requirement 9.1–9.4).
    ///
    /// Revocation is expressed by setting `active = false` (or letting
    /// `valid_until` lapse); it never reverses previously settled value
    /// (Requirement 9.7).
    pub fn set_merchant(env: Env, merchant: MerchantAuthorization) -> Result<(), Error> {
        let config = Self::require_config(&env)?;
        Self::require_lifecycle(&env, Lifecycle::Active)?;
        config.admin.require_auth();

        // A merchant with no validity window can never authorize a redemption;
        // reject it rather than store a dead record.
        if merchant.valid_until == 0 {
            return Err(Error::InvalidConfig);
        }

        storage::set_merchant(&env, &merchant);
        events::merchant_changed(
            &env,
            &merchant.merchant_id,
            &merchant.settlement_wallet,
            merchant.active,
            merchant.valid_until,
        );
        storage::extend_instance_ttl(&env);
        Ok(())
    }

    // ------------------------------------------------------------------
    // Redemption (task 9.2)
    // ------------------------------------------------------------------

    /// Redeem an entitlement against a signed merchant invoice, settling the
    /// backing asset atomically to the merchant settlement wallet.
    ///
    /// Enforcement (Requirement 7.4–7.9, 9.5–9.7, 10.6, 11.5, 12.1, 17.1):
    /// 1. `beneficiary.require_auth()` over the exact invocation — fee
    ///    sponsorship can never substitute for this (Requirement 3.6, 11.5).
    /// 2. The program must be `Active` and unexpired; the entitlement must be
    ///    active, owned by `beneficiary`, and unexpired.
    /// 3. The invoice must be bound to this contract, network, and backing
    ///    asset, and must not have passed its own expiry.
    /// 4. The merchant must exist, be active, be within its validity window,
    ///    match the invoice settlement wallet and category, and be the invoice
    ///    signer; the merchant signature must verify.
    /// 5. The amount must fit the entitlement balance, the per-transaction
    ///    limit, and the rolling daily limit (keyed by the stable entitlement).
    /// 6. The one-time invoice nonce must be unused (replay rejected).
    ///
    /// Only after every check passes does the contract settle value through the
    /// SAC and record the nonce, so a nonce is consumed only in the same
    /// successful invocation that settles value. Any failure (including a bad
    /// signature or a failed transfer) reverts the whole invocation, preserving
    /// the conservation invariants.
    pub fn redeem(
        env: Env,
        beneficiary: Address,
        entitlement_id: BytesN<32>,
        invoice: InvoiceV1,
        merchant_signature: BytesN<64>,
    ) -> Result<(), Error> {
        let config = Self::require_config(&env)?;
        Self::require_lifecycle(&env, Lifecycle::Active)?;

        // (1) The current beneficiary wallet authorizes this exact invocation.
        beneficiary.require_auth();

        let now = env.ledger().timestamp();

        // (2) Program and entitlement liveness / expiry (Requirement 7.7).
        if now >= config.program_expires_at {
            return Err(Error::ProgramExpired);
        }
        let mut entitlement =
            storage::get_entitlement(&env, &entitlement_id).ok_or(Error::EntitlementNotFound)?;
        if !entitlement.active {
            return Err(Error::EntitlementInactive);
        }
        if entitlement.beneficiary != beneficiary {
            // Only the currently authorized wallet may redeem (Requirement 7.4).
            return Err(Error::NotAuthorized);
        }
        if now >= entitlement.expires_at {
            return Err(Error::EntitlementExpired);
        }

        // (3) Invoice binding to this program (Requirement 10.6). `program_id`
        // is a display string; the cryptographic binding is `contract_id`.
        if invoice.version != 1 {
            return Err(Error::InvalidInvoice);
        }
        if invoice.kind != symbol_short!("voucher") {
            return Err(Error::InvalidInvoice);
        }
        if invoice.contract_id != env.current_contract_address() {
            return Err(Error::InvalidInvoice);
        }
        if invoice.sac != config.sac {
            return Err(Error::InvalidInvoice);
        }
        if invoice.network != symbol_short!("testnet") {
            return Err(Error::WrongNetwork);
        }
        if invoice.asset_code != config.asset_code {
            return Err(Error::WrongAsset);
        }
        if invoice.amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        if now >= invoice.expires_at {
            return Err(Error::InvoiceExpired);
        }

        // (4) Merchant authorization (Requirement 7.4, 7.5, 9.5, 9.6, 17.1).
        let merchant =
            storage::get_merchant(&env, &invoice.merchant_id).ok_or(Error::MerchantNotFound)?;
        if !merchant.active {
            return Err(Error::MerchantInactive);
        }
        if now >= merchant.valid_until {
            return Err(Error::MerchantExpired);
        }
        if merchant.settlement_wallet != invoice.settlement_wallet {
            return Err(Error::MerchantWalletMismatch);
        }
        if merchant.category != invoice.category {
            return Err(Error::CategoryMismatch);
        }
        if merchant.invoice_signer != invoice.invoice_signer {
            return Err(Error::SignerMismatch);
        }
        // Verify the merchant's detached signature (traps on a bad signature).
        invoice::verify_signature(&env, &invoice, &merchant_signature)?;

        // (5) Amount / limits (Requirement 7.6). `0` means "no limit".
        let amount = invoice.amount;
        if config.per_tx_limit > 0 && amount > config.per_tx_limit {
            return Err(Error::PerTxLimitExceeded);
        }
        if amount > entitlement.remaining {
            return Err(Error::InsufficientEntitlement);
        }
        let day = now / SECONDS_PER_DAY;
        let spent_today = storage::get_daily_spend(&env, &entitlement_id, day);
        let new_daily = spent_today
            .checked_add(amount)
            .ok_or(Error::ConservationViolation)?;
        if config.daily_limit > 0 && new_daily > config.daily_limit {
            return Err(Error::DailyLimitExceeded);
        }

        // (6) One-time nonce (Requirement 7.8, 10.6).
        if storage::is_nonce_used(&env, &invoice.nonce) {
            return Err(Error::NonceAlreadyUsed);
        }

        // ---- All checks passed: settle atomically ----
        let mut totals = Self::require_totals(&env)?;
        totals.allocated_outstanding = totals
            .allocated_outstanding
            .checked_sub(amount)
            .ok_or(Error::ConservationViolation)?;
        totals.contract_balance = totals
            .contract_balance
            .checked_sub(amount)
            .ok_or(Error::ConservationViolation)?;
        totals.gross_redeemed = totals
            .gross_redeemed
            .checked_add(amount)
            .ok_or(Error::ConservationViolation)?;
        Self::assert_conservation(&totals)?;

        entitlement.remaining = entitlement
            .remaining
            .checked_sub(amount)
            .ok_or(Error::ConservationViolation)?;
        if entitlement.remaining == 0 {
            entitlement.active = false;
        }

        // Release the backing asset to the merchant. A contract is implicitly
        // authorized to move its own escrowed balance; if this transfer traps,
        // the entire invocation reverts and nothing above is persisted.
        let sac = token::TokenClient::new(&env, &config.sac);
        sac.transfer(
            &env.current_contract_address(),
            &merchant.settlement_wallet,
            &amount,
        );

        // Persist the new state, the one-time nonce, the daily spend, and the
        // redemption record — all within this same successful invocation.
        storage::set_totals(&env, &totals);
        storage::set_entitlement(&env, &entitlement);
        storage::mark_nonce_used(&env, &invoice.nonce);
        storage::set_daily_spend(&env, &entitlement_id, day, new_daily);

        let redemption_id = Self::derive_redemption_id(&env, &entitlement_id, &invoice.nonce);
        let redemption = Redemption {
            redemption_id: redemption_id.clone(),
            entitlement_id: entitlement_id.clone(),
            merchant_id: merchant.merchant_id.clone(),
            amount,
            refunded: 0,
            settled_at: now,
        };
        storage::set_redemption(&env, &redemption);

        events::redeemed(
            &env,
            &entitlement_id,
            &merchant.merchant_id,
            &redemption_id,
            &merchant.settlement_wallet,
            amount,
            entitlement.remaining,
            now,
        );
        storage::extend_instance_ttl(&env);
        Ok(())
    }

    // ------------------------------------------------------------------
    // Refund (task 9.3)
    // ------------------------------------------------------------------

    /// Refund `amount` stroops from a confirmed redemption back to the original
    /// beneficiary entitlement, pulling the asset from the merchant settlement
    /// wallet into escrow.
    ///
    /// Enforcement (Requirement 15.3, 15.4):
    /// 1. Requires the program to be `Active`; a `Paused` program rejects
    ///    refunds (non-seizing pause blocks value movement, Requirement 7.11).
    /// 2. `merchant.require_auth()` — the merchant settlement wallet must
    ///    authorize returning the value (design: "`refund` requires the merchant
    ///    settlement wallet").
    /// 3. The supplied `merchant` address must be the settlement wallet bound to
    ///    the redemption's merchant record.
    /// 4. Cumulative refunds for a redemption may never exceed the original
    ///    redemption amount ([`Error::RefundExceedsRedemption`], Requirement
    ///    15.4).
    /// 5. The `refund_nonce` is one-time; a replay is rejected.
    ///
    /// The value is pulled back through the SAC and re-credited to the original
    /// entitlement (re-activating it so the beneficiary can re-spend), and the
    /// conservation invariants are preserved: `contract_balance` and
    /// `allocated_outstanding` each rise by `amount` while
    /// `net_merchant_settlement` (`gross_redeemed - refunded`) falls by `amount`.
    pub fn refund(
        env: Env,
        merchant: Address,
        redemption_id: BytesN<32>,
        amount: i128,
        refund_nonce: BytesN<32>,
    ) -> Result<(), Error> {
        let config = Self::require_config(&env)?;
        // Active-only: a Paused program rejects refunds (Requirement 7.11).
        Self::require_lifecycle(&env, Lifecycle::Active)?;

        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }

        // (5) One-time refund nonce (shares the used-nonce keyspace with invoice
        // nonces so neither can be replayed as the other).
        if storage::is_nonce_used(&env, &refund_nonce) {
            return Err(Error::RefundNonceUsed);
        }

        let mut redemption =
            storage::get_redemption(&env, &redemption_id).ok_or(Error::RedemptionNotFound)?;

        // (3) The authorizing wallet must be the redemption merchant's bound
        // settlement wallet.
        let merchant_auth =
            storage::get_merchant(&env, &redemption.merchant_id).ok_or(Error::MerchantNotFound)?;
        if merchant != merchant_auth.settlement_wallet {
            return Err(Error::NotAuthorized);
        }
        // (2) The merchant settlement wallet authorizes this exact invocation.
        merchant.require_auth();

        // (4) Cumulative refund bound (Requirement 15.4).
        let new_cumulative = redemption
            .refunded
            .checked_add(amount)
            .ok_or(Error::ConservationViolation)?;
        if new_cumulative > redemption.amount {
            return Err(Error::RefundExceedsRedemption);
        }

        let mut entitlement = storage::get_entitlement(&env, &redemption.entitlement_id)
            .ok_or(Error::EntitlementNotFound)?;

        // Pull the asset back from the merchant into escrow through the SAC. The
        // merchant is the `from`, so the SAC requires the merchant's auth; if the
        // transfer traps the whole invocation reverts.
        let sac = token::TokenClient::new(&env, &config.sac);
        sac.transfer(&merchant, &env.current_contract_address(), &amount);

        // Update aggregate totals, preserving conservation.
        let mut totals = Self::require_totals(&env)?;
        totals.refunded = totals
            .refunded
            .checked_add(amount)
            .ok_or(Error::ConservationViolation)?;
        totals.contract_balance = totals
            .contract_balance
            .checked_add(amount)
            .ok_or(Error::ConservationViolation)?;
        totals.allocated_outstanding = totals
            .allocated_outstanding
            .checked_add(amount)
            .ok_or(Error::ConservationViolation)?;
        Self::assert_conservation(&totals)?;

        // Re-credit the original entitlement so the beneficiary can re-spend.
        entitlement.remaining = entitlement
            .remaining
            .checked_add(amount)
            .ok_or(Error::ConservationViolation)?;
        entitlement.active = true;

        redemption.refunded = new_cumulative;

        storage::set_totals(&env, &totals);
        storage::set_entitlement(&env, &entitlement);
        storage::set_redemption(&env, &redemption);
        storage::mark_nonce_used(&env, &refund_nonce);

        events::refunded(
            &env,
            &redemption_id,
            &redemption.entitlement_id,
            &merchant,
            amount,
            new_cumulative,
            entitlement.remaining,
        );
        storage::extend_instance_ttl(&env);
        Ok(())
    }

    // ------------------------------------------------------------------
    // Wallet rotation (task 9.3)
    // ------------------------------------------------------------------

    /// Migrate an entitlement to a newly authorized wallet and revoke the old
    /// wallet's ability to redeem.
    ///
    /// Enforcement (Requirement 16.3, 16.4):
    /// * Requires the program administrator (design: "testnet wallet rotation
    ///   require the configured program administrator").
    /// * `old_wallet` must match the entitlement's current beneficiary wallet;
    ///   `new_wallet` must differ from it.
    /// * The entitlement's `beneficiary` is repointed to `new_wallet`. Because
    ///   `redeem` checks `entitlement.beneficiary == beneficiary`, the old
    ///   wallet can no longer authorize a redemption after this call — its
    ///   ability is revoked (Requirement 16.4).
    /// * The rolling daily limit is keyed by the stable `entitlement_id`, not by
    ///   wallet, so rotation cannot reset a beneficiary's daily limit
    ///   (Requirement 16.3, 16.4; design: "Daily spend is keyed by stable
    ///   entitlement rather than wallet"). No spend state is touched here.
    pub fn rotate_entitlement(
        env: Env,
        entitlement_id: BytesN<32>,
        old_wallet: Address,
        new_wallet: Address,
    ) -> Result<(), Error> {
        let config = Self::require_config(&env)?;
        Self::require_lifecycle(&env, Lifecycle::Active)?;
        config.admin.require_auth();

        if old_wallet == new_wallet {
            return Err(Error::InvalidRotation);
        }

        let mut entitlement =
            storage::get_entitlement(&env, &entitlement_id).ok_or(Error::EntitlementNotFound)?;
        if entitlement.beneficiary != old_wallet {
            return Err(Error::WalletMismatch);
        }

        // Repoint the entitlement to the new wallet; the old wallet is thereby
        // revoked from authorizing future redemptions. Daily spend (keyed by
        // entitlement id) is intentionally left untouched.
        entitlement.beneficiary = new_wallet.clone();
        storage::set_entitlement(&env, &entitlement);

        events::beneficiary_rotated(&env, &entitlement_id, &old_wallet, &new_wallet);
        storage::extend_instance_ttl(&env);
        Ok(())
    }

    // ------------------------------------------------------------------
    // Emergency pause / resume (non-seizing) (task 9.3)
    // ------------------------------------------------------------------

    /// Pause the program. Blocks redemption and refund while leaving all reads
    /// available.
    ///
    /// Requires the configured emergency authority (design; on testnet a single
    /// admin, on production multi-party — enforced off-chain, Requirement 7.12).
    /// The pause is **non-seizing**: it never transfers, seizes, rewrites, or
    /// destroys any balance (Requirement 7.11); it only flips the lifecycle so
    /// value-moving operations refuse to run.
    pub fn pause(env: Env, reason_hash: BytesN<32>) -> Result<(), Error> {
        let config = Self::require_config(&env)?;
        Self::require_lifecycle(&env, Lifecycle::Active)?;
        config.emergency_authority.require_auth();

        storage::set_lifecycle(&env, &Lifecycle::Paused);
        events::paused(&env, &reason_hash);
        storage::extend_instance_ttl(&env);
        Ok(())
    }

    /// Resume a paused program, restoring redemption and refund.
    ///
    /// Requires the configured emergency authority and that the program is
    /// currently `Paused` ([`Error::NotPaused`] otherwise). Like `pause`, this
    /// moves no value.
    pub fn resume(env: Env, reason_hash: BytesN<32>) -> Result<(), Error> {
        let config = Self::require_config(&env)?;
        let current = storage::get_lifecycle(&env).ok_or(Error::NotInitialized)?;
        if current != Lifecycle::Paused {
            return Err(Error::NotPaused);
        }
        config.emergency_authority.require_auth();

        storage::set_lifecycle(&env, &Lifecycle::Active);
        events::resumed(&env, &reason_hash);
        storage::extend_instance_ttl(&env);
        Ok(())
    }

    // ------------------------------------------------------------------
    // Closure (task 9.3)
    // ------------------------------------------------------------------

    /// Close the program and return the remaining escrow to the treasury.
    ///
    /// Enforcement (Requirement 15.7, 15.8):
    /// * Requires the program authority (the configured admin).
    /// * Permitted only after the program expiry **and** the refund window have
    ///   elapsed (`now >= program_expires_at + refund_window_secs`); otherwise
    ///   [`Error::ClosureNotAllowed`]. May be invoked from `Active` or `Paused`,
    ///   but never twice ([`Error::AlreadyClosed`]).
    /// * The entire remaining `contract_balance` is unused/expired escrow (all
    ///   confirmed merchant settlement already left the contract at redemption,
    ///   and the refund window has closed so nothing is still refundable). It is
    ///   returned to the treasury through the SAC.
    /// * This contract only ever holds escrow, so closure never reclaims
    ///   confirmed unrestricted cash or confirmed merchant settlement
    ///   (Requirement 15.8).
    ///
    /// Conservation is preserved: `returned_to_treasury` rises by the returned
    /// amount while `contract_balance` falls to zero; remaining entitlement
    /// commitments are voided (`allocated_outstanding` set to zero).
    pub fn close(env: Env) -> Result<(), Error> {
        let config = Self::require_config(&env)?;
        let current = storage::get_lifecycle(&env).ok_or(Error::NotInitialized)?;
        if current == Lifecycle::Closed {
            return Err(Error::AlreadyClosed);
        }
        config.admin.require_auth();

        // Closure gate: expiry plus refund window must have elapsed.
        let now = env.ledger().timestamp();
        let closable_at = config
            .program_expires_at
            .checked_add(config.refund_window_secs)
            .ok_or(Error::ClosureNotAllowed)?;
        if now < closable_at {
            return Err(Error::ClosureNotAllowed);
        }

        let mut totals = Self::require_totals(&env)?;
        let return_amount = totals.contract_balance;
        if return_amount > 0 {
            // Return remaining escrow to the treasury through the SAC.
            let sac = token::TokenClient::new(&env, &config.sac);
            sac.transfer(
                &env.current_contract_address(),
                &config.treasury,
                &return_amount,
            );

            totals.contract_balance = 0;
            totals.returned_to_treasury = totals
                .returned_to_treasury
                .checked_add(return_amount)
                .ok_or(Error::ConservationViolation)?;
        }
        // Remaining entitlement commitments are void once closed.
        totals.allocated_outstanding = 0;
        Self::assert_conservation(&totals)?;
        storage::set_totals(&env, &totals);
        storage::set_lifecycle(&env, &Lifecycle::Closed);

        events::closed(
            &env,
            return_amount,
            totals.returned_to_treasury,
            totals.contract_balance,
        );
        storage::extend_instance_ttl(&env);
        Ok(())
    }

    // ------------------------------------------------------------------
    // Internal helpers
    // ------------------------------------------------------------------

    /// Derive a stable, unique redemption id from the entitlement and the
    /// one-time invoice nonce. The nonce is unique per invoice and consumed
    /// exactly once, so the SHA-256 of `entitlement_id || nonce` is a unique,
    /// pseudonymous redemption key that carries no PII.
    fn derive_redemption_id(
        env: &Env,
        entitlement_id: &BytesN<32>,
        nonce: &BytesN<32>,
    ) -> BytesN<32> {
        let mut preimage = Bytes::new(env);
        preimage.extend_from_array(&entitlement_id.to_array());
        preimage.extend_from_array(&nonce.to_array());
        env.crypto().sha256(&preimage).to_bytes()
    }

    fn require_config(env: &Env) -> Result<ProgramConfig, Error> {
        storage::get_config(env).ok_or(Error::NotInitialized)
    }

    fn require_totals(env: &Env) -> Result<Totals, Error> {
        storage::get_totals(env).ok_or(Error::NotInitialized)
    }

    fn require_lifecycle(env: &Env, expected: Lifecycle) -> Result<(), Error> {
        let current = storage::get_lifecycle(env).ok_or(Error::NotInitialized)?;
        if current == expected {
            Ok(())
        } else {
            Err(Error::InvalidLifecycle)
        }
    }

    fn validate_config(config: &ProgramConfig) -> Result<(), Error> {
        if config.funded_budget <= 0 {
            return Err(Error::InvalidConfig);
        }
        if config.per_tx_limit < 0 || config.daily_limit < 0 {
            return Err(Error::InvalidConfig);
        }
        if config.program_expires_at == 0 {
            return Err(Error::InvalidConfig);
        }
        Ok(())
    }

    /// Assert the two conservation invariants hold for `totals`.
    fn assert_conservation(totals: &Totals) -> Result<(), Error> {
        // total_funded == contract_balance + net_settlement + returned_to_treasury
        let net_settlement = totals
            .gross_redeemed
            .checked_sub(totals.refunded)
            .ok_or(Error::ConservationViolation)?;
        let accounted = totals
            .contract_balance
            .checked_add(net_settlement)
            .and_then(|v| v.checked_add(totals.returned_to_treasury))
            .ok_or(Error::ConservationViolation)?;
        if accounted != totals.total_funded {
            return Err(Error::ConservationViolation);
        }
        // allocated_outstanding <= contract_balance
        if totals.allocated_outstanding > totals.contract_balance {
            return Err(Error::ConservationViolation);
        }
        // No negative aggregates.
        if totals.contract_balance < 0
            || totals.allocated_outstanding < 0
            || totals.gross_redeemed < 0
            || totals.refunded < 0
            || totals.returned_to_treasury < 0
        {
            return Err(Error::ConservationViolation);
        }
        Ok(())
    }
}

/// Descriptive asset code helper used by tests/tools; keeps the `Symbol` import
/// meaningful at the crate root without leaking construction details.
pub fn asset_code_symbol(env: &Env, code: &str) -> Symbol {
    Symbol::new(env, code)
}

#[cfg(test)]
mod test;

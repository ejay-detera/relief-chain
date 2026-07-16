//! Stable, machine-readable contract error codes.
//!
//! Codes are frozen: reconciliation, Edge Functions, and tests map to these
//! numeric values, so existing variants MUST keep their discriminants. New
//! failure modes append new variants with new numbers.

use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    // --- Lifecycle / initialization ---
    /// `initialize` was called more than once.
    AlreadyInitialized = 1,
    /// A call requires configuration that has not been stored yet.
    NotInitialized = 2,
    /// The operation is not permitted in the current lifecycle state.
    InvalidLifecycle = 3,

    // --- Authorization ---
    /// The caller is not the party required to authorize this operation.
    NotAuthorized = 4,

    // --- Value / arithmetic ---
    /// An amount was zero or negative where a positive value is required.
    InvalidAmount = 5,
    /// Activation attempted before the full backing budget was escrowed.
    InsufficientBacking = 6,
    /// An allocation would exceed the escrowed, funded budget.
    BudgetExceeded = 7,
    /// A value-changing operation would break a conservation invariant.
    ConservationViolation = 8,

    // --- Entitlements ---
    /// An entitlement with the same id already exists.
    EntitlementExists = 9,
    /// The referenced entitlement does not exist.
    EntitlementNotFound = 10,
    /// An expiry timestamp is in the past or after the program expiry.
    InvalidExpiry = 11,

    // --- Configuration ---
    /// A configuration field failed validation.
    InvalidConfig = 12,

    // --- Redemption / merchant enforcement (task 9.2) ---
    /// Redemption attempted at or after the program expiry.
    ProgramExpired = 13,
    /// Redemption attempted at or after the entitlement expiry.
    EntitlementExpired = 14,
    /// The referenced entitlement is not active (fully spent or revoked).
    EntitlementInactive = 15,
    /// The invoice references a merchant that is not authorized in this program.
    MerchantNotFound = 16,
    /// The referenced merchant authorization has been revoked.
    MerchantInactive = 17,
    /// The referenced merchant authorization has passed its validity deadline.
    MerchantExpired = 18,
    /// The invoice settlement wallet does not match the merchant's authorized
    /// settlement wallet.
    MerchantWalletMismatch = 19,
    /// The invoice category is incompatible with the merchant's accreditation
    /// category (Requirement 7.5, 17.1).
    CategoryMismatch = 20,
    /// The invoice signer key does not match the merchant's authorized invoice
    /// signer.
    SignerMismatch = 21,
    /// The invoice is structurally invalid or not bound to this contract.
    InvalidInvoice = 22,
    /// The invoice is bound to a network other than the pilot testnet.
    WrongNetwork = 23,
    /// The invoice asset is not the program's backing asset.
    WrongAsset = 24,
    /// The invoice has passed its own (ten-minute) expiry.
    InvoiceExpired = 25,
    /// The invoice nonce has already been consumed (replay rejected;
    /// Requirement 7.8, 10.6).
    NonceAlreadyUsed = 26,
    /// The redemption exceeds the program per-transaction limit (Requirement 7.6).
    PerTxLimitExceeded = 27,
    /// The redemption exceeds the entitlement's remaining balance (Requirement 7.6).
    InsufficientEntitlement = 28,
    /// The redemption exceeds the rolling daily limit for the entitlement
    /// (Requirement 7.6).
    DailyLimitExceeded = 29,

    // --- Refund / rotation / lifecycle (task 9.3) ---
    /// The referenced redemption does not exist.
    RedemptionNotFound = 30,
    /// Cumulative refunds would exceed the original redemption amount
    /// (Requirement 15.4).
    RefundExceedsRedemption = 31,
    /// The refund nonce has already been consumed (replay rejected).
    RefundNonceUsed = 32,
    /// The supplied old wallet does not match the entitlement's current wallet
    /// (Requirement 16.3, 16.4).
    WalletMismatch = 33,
    /// The rotation target wallet must differ from the current wallet.
    InvalidRotation = 34,
    /// `resume` was called while the program was not paused.
    NotPaused = 35,
    /// `close` was called before the program expiry and refund window elapsed
    /// (Requirement 15.7).
    ClosureNotAllowed = 36,
    /// The program is already closed.
    AlreadyClosed = 37,

    // --- Not-yet-implemented surface ---
    /// The operation is defined in the public interface but implemented in a
    /// later task.
    NotImplemented = 99,
}

//! Example tests for task 9.1: configuration, funding, activation, bounded
//! allocation, reads, events, and the deferred interface surface.
//!
//! These exercise the happy paths and the safety-critical rejections that
//! task 9.1 owns. Redemption / refund / rotation / pause / close behavior is
//! tested with tasks 9.2 and 9.3.

#![cfg(test)]

extern crate alloc;

use alloc::vec::Vec;

use ed25519_dalek::{Signer, SigningKey};
use soroban_sdk::{
    symbol_short,
    testutils::{Address as _, Events as _, Ledger as _},
    token, Address, Bytes, BytesN, Env, IntoVal, String, Symbol, Val,
};

use crate::{
    storage::{DataKey, INSTANCE_BUMP_LEDGERS, PERSISTENT_BUMP_LEDGERS},
    Error, InvoiceV1, Lifecycle, MerchantAuthorization, ProgramConfig, Redemption, Totals,
    VoucherContract, VoucherContractClient,
};

const DAY: u64 = 86_400;

/// Fixed 32-byte Ed25519 secret used to sign test invoices. Testnet-only, no
/// value; the corresponding public key is bound as the merchant invoice signer.
const MERCHANT_SECRET: [u8; 32] = [7u8; 32];

struct Harness<'a> {
    env: Env,
    client: VoucherContractClient<'a>,
    treasury: Address,
    admin: Address,
    sac_address: Address,
    funded_budget: i128,
}

fn id(env: &Env, byte: u8) -> BytesN<32> {
    BytesN::from_array(env, &[byte; 32])
}

fn setup(funded_budget: i128, mint_amount: i128) -> Harness<'static> {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1_000);

    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let emergency = Address::generate(&env);
    let issuer = Address::generate(&env);

    // Deploy an RCPHP-like SAC and mint the treasury its balance.
    let sac = env.register_stellar_asset_contract_v2(issuer.clone());
    let sac_address = sac.address();
    let sac_admin = token::StellarAssetClient::new(&env, &sac_address);
    sac_admin.mint(&treasury, &mint_amount);

    let contract_id = env.register(VoucherContract, ());
    let client = VoucherContractClient::new(&env, &contract_id);

    let config = ProgramConfig {
        admin: admin.clone(),
        treasury: treasury.clone(),
        emergency_authority: emergency,
        sac: sac_address.clone(),
        program_id: id(&env, 0xAB),
        asset_code: Symbol::new(&env, "RCPHP"),
        funded_budget,
        program_expires_at: 1_000 + 90 * DAY,
        refund_window_secs: 30 * DAY,
        per_tx_limit: funded_budget,
        daily_limit: funded_budget,
        contract_version: 1,
    };
    client.initialize(&config);

    Harness {
        env,
        client,
        treasury,
        admin,
        sac_address,
        funded_budget,
    }
}

#[test]
fn initialize_sets_immutable_config_and_zeroed_totals() {
    let h = setup(1_000_000_000, 1_000_000_000);
    let config = h.client.get_config();
    assert_eq!(config.funded_budget, h.funded_budget);
    assert_eq!(config.contract_version, 1);

    let lifecycle = h.client.get_lifecycle();
    assert_eq!(lifecycle, Lifecycle::Draft);

    let totals = h.client.get_totals();
    assert_eq!(totals.funded_budget, h.funded_budget);
    assert_eq!(totals.total_funded, 0);
    assert_eq!(totals.contract_balance, 0);
    assert_eq!(totals.allocated_outstanding, 0);
}

#[test]
fn initialize_is_one_time() {
    let h = setup(1_000_000_000, 1_000_000_000);
    let config = h.client.get_config();
    let res = h.client.try_initialize(&config);
    assert_eq!(res, Err(Ok(Error::AlreadyInitialized)));
}

#[test]
fn fund_escrows_asset_and_tracks_totals() {
    let h = setup(1_000_000_000, 1_000_000_000);
    h.client.fund(&h.treasury, &400_000_000);
    h.client.fund(&h.treasury, &600_000_000);

    let totals = h.client.get_totals();
    assert_eq!(totals.total_funded, 1_000_000_000);
    assert_eq!(totals.contract_balance, 1_000_000_000);

    // The asset actually moved into the contract.
    let token_client = token::TokenClient::new(&h.env, &h.sac_address);
    assert_eq!(
        token_client.balance(&h.client.address),
        1_000_000_000
    );
    assert_eq!(token_client.balance(&h.treasury), 0);
}

#[test]
fn fund_rejects_non_treasury_source() {
    let h = setup(1_000_000_000, 1_000_000_000);
    let stranger = Address::generate(&h.env);
    let res = h.client.try_fund(&stranger, &100);
    assert_eq!(res, Err(Ok(Error::NotAuthorized)));
}

#[test]
fn fund_rejects_non_positive_amount() {
    let h = setup(1_000_000_000, 1_000_000_000);
    let res = h.client.try_fund(&h.treasury, &0);
    assert_eq!(res, Err(Ok(Error::InvalidAmount)));
}

#[test]
fn activate_requires_full_backing() {
    let h = setup(1_000_000_000, 1_000_000_000);
    h.client.fund(&h.treasury, &999_999_999);
    let res = h.client.try_activate();
    assert_eq!(res, Err(Ok(Error::InsufficientBacking)));

    // Lifecycle stays Draft; no spendable entitlements possible yet.
    assert_eq!(h.client.get_lifecycle(), Lifecycle::Draft);
}

#[test]
fn activate_after_full_backing_succeeds() {
    let h = setup(1_000_000_000, 1_000_000_000);
    h.client.fund(&h.treasury, &1_000_000_000);
    h.client.activate();
    assert_eq!(h.client.get_lifecycle(), Lifecycle::Active);
}

#[test]
fn allocate_requires_active() {
    let h = setup(1_000_000_000, 1_000_000_000);
    h.client.fund(&h.treasury, &1_000_000_000);
    let beneficiary = Address::generate(&h.env);
    let res = h
        .client
        .try_allocate(&id(&h.env, 1), &beneficiary, &100, &(1_000 + DAY));
    assert_eq!(res, Err(Ok(Error::InvalidLifecycle)));
}

#[test]
fn allocate_is_bounded_by_escrowed_budget() {
    let h = setup(1_000_000_000, 1_000_000_000);
    h.client.fund(&h.treasury, &1_000_000_000);
    h.client.activate();

    let b1 = Address::generate(&h.env);
    let b2 = Address::generate(&h.env);
    h.client
        .allocate(&id(&h.env, 1), &b1, &600_000_000, &(1_000 + DAY));

    // Second allocation exceeds remaining escrow.
    let res = h
        .client
        .try_allocate(&id(&h.env, 2), &b2, &500_000_000, &(1_000 + DAY));
    assert_eq!(res, Err(Ok(Error::BudgetExceeded)));

    // A fitting allocation succeeds and totals reflect it.
    h.client
        .allocate(&id(&h.env, 2), &b2, &400_000_000, &(1_000 + DAY));
    let totals = h.client.get_totals();
    assert_eq!(totals.allocated_outstanding, 1_000_000_000);
    assert!(totals.allocated_outstanding <= totals.contract_balance);
}

#[test]
fn allocate_rejects_duplicate_entitlement() {
    let h = setup(1_000_000_000, 1_000_000_000);
    h.client.fund(&h.treasury, &1_000_000_000);
    h.client.activate();

    let b1 = Address::generate(&h.env);
    h.client
        .allocate(&id(&h.env, 7), &b1, &100_000_000, &(1_000 + DAY));
    let res = h
        .client
        .try_allocate(&id(&h.env, 7), &b1, &1, &(1_000 + DAY));
    assert_eq!(res, Err(Ok(Error::EntitlementExists)));
}

#[test]
fn allocate_rejects_bad_expiry() {
    let h = setup(1_000_000_000, 1_000_000_000);
    h.client.fund(&h.treasury, &1_000_000_000);
    h.client.activate();
    let b1 = Address::generate(&h.env);

    // Already expired (<= now).
    let res = h.client.try_allocate(&id(&h.env, 3), &b1, &100, &500);
    assert_eq!(res, Err(Ok(Error::InvalidExpiry)));

    // Beyond the program expiry.
    let res = h
        .client
        .try_allocate(&id(&h.env, 4), &b1, &100, &(1_000 + 1_000 * DAY));
    assert_eq!(res, Err(Ok(Error::InvalidExpiry)));
}

#[test]
fn get_entitlement_returns_stored_record() {
    let h = setup(1_000_000_000, 1_000_000_000);
    h.client.fund(&h.treasury, &1_000_000_000);
    h.client.activate();

    let beneficiary = Address::generate(&h.env);
    let eid = id(&h.env, 9);
    h.client
        .allocate(&eid, &beneficiary, &250_000_000, &(1_000 + DAY));

    let entitlement = h.client.get_entitlement(&eid).unwrap();
    assert_eq!(entitlement.beneficiary, beneficiary);
    assert_eq!(entitlement.allocated, 250_000_000);
    assert_eq!(entitlement.remaining, 250_000_000);
    assert!(entitlement.active);

    // Unknown id yields None.
    assert!(h.client.get_entitlement(&id(&h.env, 200)).is_none());
}

#[test]
fn conservation_holds_across_funding_and_allocation() {
    let h = setup(1_000_000_000, 1_000_000_000);
    h.client.fund(&h.treasury, &1_000_000_000);
    h.client.activate();
    let b1 = Address::generate(&h.env);
    h.client
        .allocate(&id(&h.env, 1), &b1, &1_000_000_000, &(1_000 + DAY));

    let t = h.client.get_totals();
    let net = t.gross_redeemed - t.refunded;
    assert_eq!(
        t.total_funded,
        t.contract_balance + net + t.returned_to_treasury
    );
    assert!(t.allocated_outstanding <= t.contract_balance);
}

#[test]
fn pause_resume_and_close_require_correct_lifecycle() {
    // A fresh Draft program cannot be paused (only Active), resumed (only
    // Paused), or closed before its expiry/refund window.
    let h = setup(1_000_000_000, 1_000_000_000);
    let reason = id(&h.env, 0x11);
    assert_eq!(
        h.client.try_pause(&reason),
        Err(Ok(Error::InvalidLifecycle))
    );
    assert_eq!(h.client.try_resume(&reason), Err(Ok(Error::NotPaused)));
    // Draft close is rejected because the closure window has not elapsed.
    assert_eq!(h.client.try_close(), Err(Ok(Error::ClosureNotAllowed)));
}

// ---------------------------------------------------------------------------
// Task 9.2: merchant authorization + signed-invoice redemption
// ---------------------------------------------------------------------------

fn merchant_signing_key() -> SigningKey {
    SigningKey::from_bytes(&MERCHANT_SECRET)
}

/// The merchant's Ed25519 public key as an on-chain `BytesN<32>`.
fn merchant_pubkey(env: &Env) -> BytesN<32> {
    BytesN::from_array(env, &merchant_signing_key().verifying_key().to_bytes())
}

/// A built + signed voucher invoice paired with its detached merchant signature.
struct SignedInvoice {
    invoice: InvoiceV1,
    signature: BytesN<64>,
}

/// Build a voucher invoice for the given parameters and sign its canonical
/// unsigned bytes with the merchant key, producing a signature the contract's
/// host-side `ed25519_verify` accepts.
#[allow(clippy::too_many_arguments)]
fn build_signed_invoice(
    env: &Env,
    contract_id: &Address,
    sac: &Address,
    merchant_id: &BytesN<32>,
    settlement_wallet: &Address,
    amount: i128,
    category: &str,
    nonce_byte: u8,
    issued_at: u64,
    expires_at: u64,
) -> SignedInvoice {
    let invoice = InvoiceV1 {
        version: 1,
        kind: Symbol::new(env, "voucher"),
        network: Symbol::new(env, "testnet"),
        asset_code: Symbol::new(env, "RCPHP"),
        asset_issuer: String::from_str(env, "GISSUERPLACEHOLDERTESTNETONLY"),
        sac: sac.clone(),
        program_id: String::from_str(env, "program_pilot"),
        contract_id: contract_id.clone(),
        merchant_id: merchant_id.clone(),
        settlement_wallet: settlement_wallet.clone(),
        invoice_signer: merchant_pubkey(env),
        amount,
        category: Symbol::new(env, category),
        nonce: id(env, nonce_byte),
        issued_at,
        expires_at,
    };
    let message = crate::invoice::signing_message(env, &invoice).unwrap();
    let msg_bytes: Vec<u8> = message.iter().collect();
    let sig = merchant_signing_key().sign(&msg_bytes);
    SignedInvoice {
        invoice,
        signature: BytesN::from_array(env, &sig.to_bytes()),
    }
}

struct RedeemHarness<'a> {
    env: Env,
    client: VoucherContractClient<'a>,
    beneficiary: Address,
    entitlement_id: BytesN<32>,
    merchant_id: BytesN<32>,
    settlement_wallet: Address,
    treasury: Address,
    contract_id: Address,
    sac_address: Address,
}

/// A fully activated program with one funded entitlement and one authorized
/// merchant, ready for redemption. `per_tx_limit`/`daily_limit` are configurable
/// so limit-rejection cases can be exercised directly.
fn setup_redeem(
    entitlement_amount: i128,
    per_tx_limit: i128,
    daily_limit: i128,
) -> RedeemHarness<'static> {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1_000);

    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let emergency = Address::generate(&env);
    let issuer = Address::generate(&env);
    let beneficiary = Address::generate(&env);
    let settlement_wallet = Address::generate(&env);

    let sac = env.register_stellar_asset_contract_v2(issuer);
    let sac_address = sac.address();
    token::StellarAssetClient::new(&env, &sac_address).mint(&treasury, &entitlement_amount);

    let contract_id = env.register(VoucherContract, ());
    let client = VoucherContractClient::new(&env, &contract_id);

    let config = ProgramConfig {
        admin,
        treasury: treasury.clone(),
        emergency_authority: emergency,
        sac: sac_address.clone(),
        program_id: id(&env, 0xAB),
        asset_code: Symbol::new(&env, "RCPHP"),
        funded_budget: entitlement_amount,
        program_expires_at: 1_000 + 90 * DAY,
        refund_window_secs: 30 * DAY,
        per_tx_limit,
        daily_limit,
        contract_version: 1,
    };
    client.initialize(&config);
    client.fund(&treasury, &entitlement_amount);
    client.activate();

    let merchant_id = id(&env, 0x2A);
    client.set_merchant(&MerchantAuthorization {
        merchant_id: merchant_id.clone(),
        settlement_wallet: settlement_wallet.clone(),
        invoice_signer: merchant_pubkey(&env),
        category: Symbol::new(&env, "food"),
        valid_until: 1_000 + 60 * DAY,
        active: true,
    });

    let entitlement_id = id(&env, 0x01);
    client.allocate(
        &entitlement_id,
        &beneficiary,
        &entitlement_amount,
        &(1_000 + 30 * DAY),
    );

    RedeemHarness {
        env,
        client,
        beneficiary,
        entitlement_id,
        merchant_id,
        settlement_wallet,
        treasury,
        contract_id,
        sac_address,
    }
}

#[test]
fn set_merchant_stores_pii_free_authorization() {
    let h = setup_redeem(1_000_000_000, 1_000_000_000, 1_000_000_000);
    let merchant = h.client.get_merchant(&h.merchant_id).unwrap();
    assert_eq!(merchant.settlement_wallet, h.settlement_wallet);
    assert_eq!(merchant.category, Symbol::new(&h.env, "food"));
    assert_eq!(merchant.invoice_signer, merchant_pubkey(&h.env));
    assert!(merchant.active);
}

#[test]
fn redeem_settles_to_merchant_and_conserves_value() {
    let budget = 1_000_000_000;
    let h = setup_redeem(budget, budget, budget);
    let amount = 250_000_000;

    let signed = build_signed_invoice(
        &h.env,
        &h.contract_id,
        &h.sac_address,
        &h.merchant_id,
        &h.settlement_wallet,
        amount,
        "food",
        0x11,
        1_000,
        1_000 + 600,
    );
    h.client
        .redeem(&h.beneficiary, &h.entitlement_id, &signed.invoice, &signed.signature);

    // The backing asset actually moved to the merchant settlement wallet.
    let token_client = token::TokenClient::new(&h.env, &h.sac_address);
    assert_eq!(token_client.balance(&h.settlement_wallet), amount);
    assert_eq!(token_client.balance(&h.contract_id), budget - amount);

    // Totals reflect the settlement and conservation still holds.
    let t = h.client.get_totals();
    assert_eq!(t.gross_redeemed, amount);
    assert_eq!(t.contract_balance, budget - amount);
    assert_eq!(t.allocated_outstanding, budget - amount);
    let net = t.gross_redeemed - t.refunded;
    assert_eq!(
        t.total_funded,
        t.contract_balance + net + t.returned_to_treasury
    );

    // The entitlement balance decreased; it remains active (partial spend).
    let ent = h.client.get_entitlement(&h.entitlement_id).unwrap();
    assert_eq!(ent.remaining, budget - amount);
    assert!(ent.active);

    // A redemption record was written, keyed by the derived id.
    let mut preimage = Bytes::new(&h.env);
    preimage.extend_from_array(&h.entitlement_id.to_array());
    preimage.extend_from_array(&signed.invoice.nonce.to_array());
    let redemption_id = h.env.crypto().sha256(&preimage).to_bytes();
    let redemption: Redemption = h.client.get_redemption(&redemption_id).unwrap();
    assert_eq!(redemption.amount, amount);
    assert_eq!(redemption.entitlement_id, h.entitlement_id);
    assert_eq!(redemption.merchant_id, h.merchant_id);
    assert_eq!(redemption.refunded, 0);
}

#[test]
fn redeem_full_balance_deactivates_entitlement() {
    let budget = 500_000_000;
    let h = setup_redeem(budget, budget, budget);
    let signed = build_signed_invoice(
        &h.env,
        &h.contract_id,
        &h.sac_address,
        &h.merchant_id,
        &h.settlement_wallet,
        budget,
        "food",
        0x12,
        1_000,
        1_000 + 600,
    );
    h.client
        .redeem(&h.beneficiary, &h.entitlement_id, &signed.invoice, &signed.signature);

    let ent = h.client.get_entitlement(&h.entitlement_id).unwrap();
    assert_eq!(ent.remaining, 0);
    assert!(!ent.active);
}

#[test]
fn redeem_rejects_wrong_beneficiary_wallet() {
    let h = setup_redeem(1_000_000_000, 1_000_000_000, 1_000_000_000);
    let stranger = Address::generate(&h.env);
    let signed = build_signed_invoice(
        &h.env,
        &h.contract_id,
        &h.sac_address,
        &h.merchant_id,
        &h.settlement_wallet,
        100_000_000,
        "food",
        0x21,
        1_000,
        1_000 + 600,
    );
    let res = h
        .client
        .try_redeem(&stranger, &h.entitlement_id, &signed.invoice, &signed.signature);
    assert_eq!(res, Err(Ok(Error::NotAuthorized)));
}

#[test]
fn redeem_rejects_unknown_merchant() {
    let h = setup_redeem(1_000_000_000, 1_000_000_000, 1_000_000_000);
    let signed = build_signed_invoice(
        &h.env,
        &h.contract_id,
        &h.sac_address,
        &id(&h.env, 0x99), // never authorized
        &h.settlement_wallet,
        100_000_000,
        "food",
        0x22,
        1_000,
        1_000 + 600,
    );
    let res = h
        .client
        .try_redeem(&h.beneficiary, &h.entitlement_id, &signed.invoice, &signed.signature);
    assert_eq!(res, Err(Ok(Error::MerchantNotFound)));
}

#[test]
fn redeem_rejects_revoked_merchant() {
    let h = setup_redeem(1_000_000_000, 1_000_000_000, 1_000_000_000);
    // Revoke the merchant (audited authorization change; Requirement 9.6).
    h.client.set_merchant(&MerchantAuthorization {
        merchant_id: h.merchant_id.clone(),
        settlement_wallet: h.settlement_wallet.clone(),
        invoice_signer: merchant_pubkey(&h.env),
        category: Symbol::new(&h.env, "food"),
        valid_until: 1_000 + 60 * DAY,
        active: false,
    });
    let signed = build_signed_invoice(
        &h.env,
        &h.contract_id,
        &h.sac_address,
        &h.merchant_id,
        &h.settlement_wallet,
        100_000_000,
        "food",
        0x23,
        1_000,
        1_000 + 600,
    );
    let res = h
        .client
        .try_redeem(&h.beneficiary, &h.entitlement_id, &signed.invoice, &signed.signature);
    assert_eq!(res, Err(Ok(Error::MerchantInactive)));
}

#[test]
fn redeem_rejects_category_mismatch() {
    let h = setup_redeem(1_000_000_000, 1_000_000_000, 1_000_000_000);
    let signed = build_signed_invoice(
        &h.env,
        &h.contract_id,
        &h.sac_address,
        &h.merchant_id,
        &h.settlement_wallet,
        100_000_000,
        "medicine", // merchant is accredited for "food"
        0x24,
        1_000,
        1_000 + 600,
    );
    let res = h
        .client
        .try_redeem(&h.beneficiary, &h.entitlement_id, &signed.invoice, &signed.signature);
    assert_eq!(res, Err(Ok(Error::CategoryMismatch)));
}

#[test]
fn redeem_rejects_per_transaction_limit() {
    let h = setup_redeem(1_000_000_000, 100_000_000, 1_000_000_000);
    let signed = build_signed_invoice(
        &h.env,
        &h.contract_id,
        &h.sac_address,
        &h.merchant_id,
        &h.settlement_wallet,
        200_000_000, // exceeds per-tx limit of 100_000_000
        "food",
        0x25,
        1_000,
        1_000 + 600,
    );
    let res = h
        .client
        .try_redeem(&h.beneficiary, &h.entitlement_id, &signed.invoice, &signed.signature);
    assert_eq!(res, Err(Ok(Error::PerTxLimitExceeded)));
}

#[test]
fn redeem_rejects_daily_limit_across_transactions() {
    let h = setup_redeem(1_000_000_000, 1_000_000_000, 300_000_000);

    // First redemption within the daily limit succeeds.
    let first = build_signed_invoice(
        &h.env,
        &h.contract_id,
        &h.sac_address,
        &h.merchant_id,
        &h.settlement_wallet,
        200_000_000,
        "food",
        0x26,
        1_000,
        1_000 + 600,
    );
    h.client
        .redeem(&h.beneficiary, &h.entitlement_id, &first.invoice, &first.signature);

    // Second same-day redemption pushes cumulative spend over the daily limit.
    let second = build_signed_invoice(
        &h.env,
        &h.contract_id,
        &h.sac_address,
        &h.merchant_id,
        &h.settlement_wallet,
        200_000_000,
        "food",
        0x27,
        1_100,
        1_100 + 600,
    );
    let res = h
        .client
        .try_redeem(&h.beneficiary, &h.entitlement_id, &second.invoice, &second.signature);
    assert_eq!(res, Err(Ok(Error::DailyLimitExceeded)));
}

#[test]
fn redeem_rejects_expired_entitlement() {
    let h = setup_redeem(1_000_000_000, 1_000_000_000, 1_000_000_000);
    let now = 1_000 + 31 * DAY; // past the entitlement expiry, before program expiry
    h.env.ledger().set_timestamp(now);
    let signed = build_signed_invoice(
        &h.env,
        &h.contract_id,
        &h.sac_address,
        &h.merchant_id,
        &h.settlement_wallet,
        100_000_000,
        "food",
        0x28,
        now,
        now + 600,
    );
    let res = h
        .client
        .try_redeem(&h.beneficiary, &h.entitlement_id, &signed.invoice, &signed.signature);
    assert_eq!(res, Err(Ok(Error::EntitlementExpired)));
}

#[test]
fn redeem_rejects_expired_invoice() {
    let h = setup_redeem(1_000_000_000, 1_000_000_000, 1_000_000_000);
    let now = 5_000;
    h.env.ledger().set_timestamp(now);
    // Invoice already expired at the current ledger time.
    let signed = build_signed_invoice(
        &h.env,
        &h.contract_id,
        &h.sac_address,
        &h.merchant_id,
        &h.settlement_wallet,
        100_000_000,
        "food",
        0x29,
        1_000,
        1_600, // < now
    );
    let res = h
        .client
        .try_redeem(&h.beneficiary, &h.entitlement_id, &signed.invoice, &signed.signature);
    assert_eq!(res, Err(Ok(Error::InvoiceExpired)));
}

#[test]
fn redeem_rejects_replayed_invoice_nonce_and_stays_atomic() {
    let budget = 1_000_000_000;
    let h = setup_redeem(budget, budget, budget);
    let amount = 100_000_000;
    let signed = build_signed_invoice(
        &h.env,
        &h.contract_id,
        &h.sac_address,
        &h.merchant_id,
        &h.settlement_wallet,
        amount,
        "food",
        0x30,
        1_000,
        1_000 + 600,
    );

    // First redemption succeeds and consumes the nonce.
    h.client
        .redeem(&h.beneficiary, &h.entitlement_id, &signed.invoice, &signed.signature);

    // Replaying the identical signed invoice is rejected.
    let res = h
        .client
        .try_redeem(&h.beneficiary, &h.entitlement_id, &signed.invoice, &signed.signature);
    assert_eq!(res, Err(Ok(Error::NonceAlreadyUsed)));

    // Exactly one settlement occurred — the replay changed nothing.
    let token_client = token::TokenClient::new(&h.env, &h.sac_address);
    assert_eq!(token_client.balance(&h.settlement_wallet), amount);
    assert_eq!(token_client.balance(&h.contract_id), budget - amount);
    let t = h.client.get_totals();
    assert_eq!(t.gross_redeemed, amount);
    assert_eq!(t.contract_balance, budget - amount);
}

#[test]
fn redeem_rejects_invoice_bound_to_other_contract() {
    let h = setup_redeem(1_000_000_000, 1_000_000_000, 1_000_000_000);
    let other_contract = Address::generate(&h.env);
    let signed = build_signed_invoice(
        &h.env,
        &other_contract, // not this contract
        &h.sac_address,
        &h.merchant_id,
        &h.settlement_wallet,
        100_000_000,
        "food",
        0x31,
        1_000,
        1_000 + 600,
    );
    let res = h
        .client
        .try_redeem(&h.beneficiary, &h.entitlement_id, &signed.invoice, &signed.signature);
    assert_eq!(res, Err(Ok(Error::InvalidInvoice)));
}

// ---------------------------------------------------------------------------
// Task 9.3: refund, wallet rotation, pause/resume, closure
// ---------------------------------------------------------------------------

/// Redeem `amount` from the harness entitlement using a fresh invoice nonce and
/// return the derived redemption id.
fn redeem_amount(h: &RedeemHarness<'_>, amount: i128, nonce_byte: u8) -> BytesN<32> {
    let signed = build_signed_invoice(
        &h.env,
        &h.contract_id,
        &h.sac_address,
        &h.merchant_id,
        &h.settlement_wallet,
        amount,
        "food",
        nonce_byte,
        h.env.ledger().timestamp(),
        h.env.ledger().timestamp() + 600,
    );
    h.client
        .redeem(&h.beneficiary, &h.entitlement_id, &signed.invoice, &signed.signature);
    let mut preimage = Bytes::new(&h.env);
    preimage.extend_from_array(&h.entitlement_id.to_array());
    preimage.extend_from_array(&signed.invoice.nonce.to_array());
    h.env.crypto().sha256(&preimage).to_bytes()
}

#[test]
fn refund_returns_value_to_entitlement_and_conserves_value() {
    let budget = 1_000_000_000;
    let h = setup_redeem(budget, budget, budget);
    let redeemed = 400_000_000;
    let refund_amt = 150_000_000;

    let redemption_id = redeem_amount(&h, redeemed, 0x40);
    let token = token::TokenClient::new(&h.env, &h.sac_address);
    assert_eq!(token.balance(&h.settlement_wallet), redeemed);

    // Merchant refunds part of the redemption back to the entitlement.
    h.client
        .refund(&h.settlement_wallet, &redemption_id, &refund_amt, &id(&h.env, 0x41));

    // Value was pulled back out of the merchant wallet into escrow.
    assert_eq!(token.balance(&h.settlement_wallet), redeemed - refund_amt);
    assert_eq!(token.balance(&h.contract_id), budget - redeemed + refund_amt);

    // The original entitlement was re-credited and re-activated.
    let ent = h.client.get_entitlement(&h.entitlement_id).unwrap();
    assert_eq!(ent.remaining, budget - redeemed + refund_amt);
    assert!(ent.active);

    // Totals reflect the refund and conservation still holds.
    let t = h.client.get_totals();
    assert_eq!(t.gross_redeemed, redeemed);
    assert_eq!(t.refunded, refund_amt);
    assert_eq!(t.contract_balance, budget - redeemed + refund_amt);
    let net = t.gross_redeemed - t.refunded;
    assert_eq!(
        t.total_funded,
        t.contract_balance + net + t.returned_to_treasury
    );
    assert!(t.allocated_outstanding <= t.contract_balance);

    // The redemption record tracks cumulative refunds.
    let redemption: Redemption = h.client.get_redemption(&redemption_id).unwrap();
    assert_eq!(redemption.refunded, refund_amt);
}

#[test]
fn refund_rejects_cumulative_over_original_amount() {
    let budget = 1_000_000_000;
    let h = setup_redeem(budget, budget, budget);
    let redeemed = 300_000_000;
    let redemption_id = redeem_amount(&h, redeemed, 0x42);

    // First refund of the full redemption is allowed.
    h.client
        .refund(&h.settlement_wallet, &redemption_id, &redeemed, &id(&h.env, 0x43));

    // Any further refund would exceed the original redemption amount (Req 15.4).
    let res = h
        .client
        .try_refund(&h.settlement_wallet, &redemption_id, &1, &id(&h.env, 0x44));
    assert_eq!(res, Err(Ok(Error::RefundExceedsRedemption)));
}

#[test]
fn refund_rejects_replayed_nonce() {
    let budget = 1_000_000_000;
    let h = setup_redeem(budget, budget, budget);
    let redemption_id = redeem_amount(&h, 200_000_000, 0x45);
    let nonce = id(&h.env, 0x46);

    h.client
        .refund(&h.settlement_wallet, &redemption_id, &50_000_000, &nonce);
    // Reusing the same refund nonce is rejected.
    let res =
        h.client
            .try_refund(&h.settlement_wallet, &redemption_id, &10_000_000, &nonce);
    assert_eq!(res, Err(Ok(Error::RefundNonceUsed)));
}

#[test]
fn refund_rejects_wrong_merchant_wallet() {
    let budget = 1_000_000_000;
    let h = setup_redeem(budget, budget, budget);
    let redemption_id = redeem_amount(&h, 200_000_000, 0x47);
    let stranger = Address::generate(&h.env);
    let res = h
        .client
        .try_refund(&stranger, &redemption_id, &10_000_000, &id(&h.env, 0x48));
    assert_eq!(res, Err(Ok(Error::NotAuthorized)));
}

#[test]
fn rotate_entitlement_revokes_old_wallet_and_preserves_daily_limit() {
    let budget = 1_000_000_000;
    // Daily limit smaller than the entitlement so we can prove it persists
    // across rotation (keyed by the stable entitlement, not by wallet).
    let daily_limit = 300_000_000;
    let h = setup_redeem(budget, budget, daily_limit);

    // Old wallet spends within the daily limit.
    redeem_amount(&h, 200_000_000, 0x50);

    let new_wallet = Address::generate(&h.env);
    h.client
        .rotate_entitlement(&h.entitlement_id, &h.beneficiary, &new_wallet);

    // The entitlement now belongs to the new wallet.
    let ent = h.client.get_entitlement(&h.entitlement_id).unwrap();
    assert_eq!(ent.beneficiary, new_wallet);

    // The old wallet can no longer redeem (revoked; Req 16.4).
    let old_signed = build_signed_invoice(
        &h.env,
        &h.contract_id,
        &h.sac_address,
        &h.merchant_id,
        &h.settlement_wallet,
        10_000_000,
        "food",
        0x51,
        1_000,
        1_600,
    );
    let res = h.client.try_redeem(
        &h.beneficiary,
        &h.entitlement_id,
        &old_signed.invoice,
        &old_signed.signature,
    );
    assert_eq!(res, Err(Ok(Error::NotAuthorized)));

    // The new wallet inherits the SAME daily counter: 200M already spent today,
    // so a 200M redemption pushes cumulative spend over the 300M daily limit.
    let new_signed = build_signed_invoice(
        &h.env,
        &h.contract_id,
        &h.sac_address,
        &h.merchant_id,
        &h.settlement_wallet,
        200_000_000,
        "food",
        0x52,
        1_100,
        1_700,
    );
    let res = h.client.try_redeem(
        &new_wallet,
        &h.entitlement_id,
        &new_signed.invoice,
        &new_signed.signature,
    );
    assert_eq!(res, Err(Ok(Error::DailyLimitExceeded)));
}

#[test]
fn rotate_entitlement_rejects_old_wallet_mismatch() {
    let h = setup_redeem(1_000_000_000, 1_000_000_000, 1_000_000_000);
    let wrong_old = Address::generate(&h.env);
    let new_wallet = Address::generate(&h.env);
    let res = h
        .client
        .try_rotate_entitlement(&h.entitlement_id, &wrong_old, &new_wallet);
    assert_eq!(res, Err(Ok(Error::WalletMismatch)));
}

#[test]
fn pause_is_non_seizing_and_blocks_redemption() {
    let budget = 1_000_000_000;
    let h = setup_redeem(budget, budget, budget);
    let token = token::TokenClient::new(&h.env, &h.sac_address);
    let balance_before = token.balance(&h.contract_id);

    h.client.pause(&id(&h.env, 0x60));
    assert_eq!(h.client.get_lifecycle(), Lifecycle::Paused);

    // Pause moves no value (Req 7.11): escrow is untouched.
    assert_eq!(token.balance(&h.contract_id), balance_before);

    // Redemption is blocked while paused.
    let signed = build_signed_invoice(
        &h.env,
        &h.contract_id,
        &h.sac_address,
        &h.merchant_id,
        &h.settlement_wallet,
        100_000_000,
        "food",
        0x61,
        1_000,
        1_600,
    );
    let res = h.client.try_redeem(
        &h.beneficiary,
        &h.entitlement_id,
        &signed.invoice,
        &signed.signature,
    );
    assert_eq!(res, Err(Ok(Error::InvalidLifecycle)));

    // Reads still work while paused.
    assert!(h.client.get_entitlement(&h.entitlement_id).is_some());
    // No value moved during the blocked redemption.
    assert_eq!(token.balance(&h.contract_id), balance_before);
    assert_eq!(token.balance(&h.settlement_wallet), 0);

    // Resume restores redemption.
    h.client.resume(&id(&h.env, 0x62));
    assert_eq!(h.client.get_lifecycle(), Lifecycle::Active);
    let signed = build_signed_invoice(
        &h.env,
        &h.contract_id,
        &h.sac_address,
        &h.merchant_id,
        &h.settlement_wallet,
        100_000_000,
        "food",
        0x63,
        1_000,
        1_600,
    );
    h.client
        .redeem(&h.beneficiary, &h.entitlement_id, &signed.invoice, &signed.signature);
    assert_eq!(token.balance(&h.settlement_wallet), 100_000_000);
}

#[test]
fn refund_blocked_while_paused() {
    let budget = 1_000_000_000;
    let h = setup_redeem(budget, budget, budget);
    let redemption_id = redeem_amount(&h, 200_000_000, 0x64);
    h.client.pause(&id(&h.env, 0x65));
    let res = h
        .client
        .try_refund(&h.settlement_wallet, &redemption_id, &50_000_000, &id(&h.env, 0x66));
    assert_eq!(res, Err(Ok(Error::InvalidLifecycle)));
}

#[test]
fn close_returns_unused_escrow_to_treasury() {
    let budget = 1_000_000_000;
    let h = setup_redeem(budget, budget, budget);
    let redeemed = 400_000_000;
    redeem_amount(&h, redeemed, 0x70);

    // Advance past program expiry + refund window (1000 + 90d + 30d).
    let after_window = 1_000 + 90 * DAY + 30 * DAY;
    h.env.ledger().set_timestamp(after_window);

    h.client.close();
    assert_eq!(h.client.get_lifecycle(), Lifecycle::Closed);

    // Remaining escrow (unused + expired) was returned to the treasury; the
    // confirmed merchant settlement was NOT reclaimed (Req 15.8).
    let token = token::TokenClient::new(&h.env, &h.sac_address);
    assert_eq!(token.balance(&h.treasury), budget - redeemed);
    assert_eq!(token.balance(&h.contract_id), 0);
    assert_eq!(token.balance(&h.settlement_wallet), redeemed);

    // Totals conserve: returned rises, contract balance falls to zero.
    let t = h.client.get_totals();
    assert_eq!(t.returned_to_treasury, budget - redeemed);
    assert_eq!(t.contract_balance, 0);
    assert_eq!(t.allocated_outstanding, 0);
    let net = t.gross_redeemed - t.refunded;
    assert_eq!(
        t.total_funded,
        t.contract_balance + net + t.returned_to_treasury
    );
}

#[test]
fn close_rejected_before_refund_window_elapses() {
    let budget = 1_000_000_000;
    let h = setup_redeem(budget, budget, budget);

    // Past program expiry but still within the refund window.
    h.env.ledger().set_timestamp(1_000 + 100 * DAY);
    let res = h.client.try_close();
    assert_eq!(res, Err(Ok(Error::ClosureNotAllowed)));
    assert_eq!(h.client.get_lifecycle(), Lifecycle::Active);
}

#[test]
fn close_is_idempotent_guarded() {
    let budget = 1_000_000_000;
    let h = setup_redeem(budget, budget, budget);
    h.env.ledger().set_timestamp(1_000 + 90 * DAY + 30 * DAY);
    h.client.close();
    // A second close is rejected.
    assert_eq!(h.client.try_close(), Err(Ok(Error::AlreadyClosed)));
}

// ---------------------------------------------------------------------------
// Task 9.4: Property 1 — Value Conservation
//
// **Validates: Requirements 5.3, 5.4, 5.5, 7.9, 15.7**
//
// This is the property-based test for Property 1 from the design document:
//
//   "For every program, confirmed treasury, escrow, beneficiary, merchant,
//    refund, and returned amounts reconcile exactly to the funded amount."
//
// Strategy (design "Testing Strategy" -> Soroban: "Property-style tests
// generate operation sequences and assert conservation after every step"):
//
//   * A deterministic seeded PRNG generates randomized *operation histories*
//     against a fresh contract instance. Each history interleaves fund,
//     activate, allocate, set_merchant, redeem, invoice replay, refund,
//     rotate, pause/resume, time advance, and close.
//   * A parallel in-test MODEL mirrors the contract's `Totals`, reacting only
//     to operations the contract ACCEPTS. After every step we assert:
//       1. The conservation identity
//          `funded_budget = contract_balance + gross_redeemed - refunded
//                           + returned_to_treasury`
//          (with `total_funded == funded_budget` after full backing).
//       2. The allocation bound `allocated_outstanding <= contract_balance`.
//       3. The model and the on-chain totals agree exactly (no value invented
//          or lost — no double counting).
//       4. On a REJECTED operation, the on-chain totals are UNCHANGED.
//       5. The actual escrowed SAC balance equals `contract_balance` (the
//          ledger identity is backed by real asset movement).
//   * A replayed (already-consumed) invoice that ever settles a second time is
//     an immediate failure — this is the "no double-counting" guard.
//
// A separate lightweight cash-program model (`prop_cash_rail_conservation_model`)
// asserts the cash rail's conservation and that beneficiary cash is never
// double-counted, per the task's "focus the on-chain assertions on the voucher
// contract" guidance.
//
// Property-based generators of this kind are the on-chain analogue of a
// TypeScript fast-check property: fixed seeds give reproducible, replayable
// counterexamples (a failing seed pins the exact history for debugging).

/// A tiny deterministic xorshift64 PRNG. No external crate is pulled into the
/// contract test harness; fixed seeds make every generated history reproducible
/// (a failing seed is the replayable counterexample).
struct Xorshift {
    state: u64,
}

impl Xorshift {
    fn new(seed: u64) -> Self {
        // Avoid the all-zero state (which xorshift cannot leave).
        Self {
            state: (seed ^ 0x9E37_79B9_7F4A_7C15) | 1,
        }
    }

    fn next(&mut self) -> u64 {
        let mut x = self.state;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.state = x;
        x
    }

    /// A value in `[0, n)`. `n` must be non-zero.
    fn below(&mut self, n: u64) -> u64 {
        self.next() % n
    }

    /// A positive amount in `[1, max]` (returns 1 if `max <= 0`).
    fn pos_amount(&mut self, max: i128) -> i128 {
        if max <= 0 {
            return 1;
        }
        (self.below(max as u64) as i128) + 1
    }
}

/// Model view of one entitlement (mirrors the fields conservation depends on).
#[derive(Clone)]
struct MEnt {
    id: BytesN<32>,
    beneficiary: Address,
    remaining: i128,
    active: bool,
}

/// Model view of one confirmed redemption.
#[derive(Clone)]
struct MRed {
    id: BytesN<32>,
    ent_idx: usize,
    amount: i128,
    refunded: i128,
}

/// The parallel conservation model. Fields mirror `Totals`; it is only ever
/// advanced by operations the contract ACCEPTS, so equality with the on-chain
/// totals proves the contract neither invented nor lost value.
struct VModel {
    lifecycle: Lifecycle,
    funded_budget: i128,
    total_funded: i128,
    contract_balance: i128,
    allocated_outstanding: i128,
    gross_redeemed: i128,
    refunded: i128,
    returned_to_treasury: i128,
    /// Asset still available in the treasury to fund with (mint == funded_budget),
    /// tracked so generated `fund` amounts never exceed the SAC balance.
    treasury_remaining: i128,
    ents: Vec<MEnt>,
    reds: Vec<MRed>,
    next_nonce: u32,
    next_ent: u32,
    /// The most recent successfully redeemed invoice, retained to test replay.
    last_signed: Option<(Address, BytesN<32>, InvoiceV1, BytesN<64>)>,
}

impl VModel {
    fn new(funded_budget: i128) -> Self {
        Self {
            lifecycle: Lifecycle::Draft,
            funded_budget,
            total_funded: 0,
            contract_balance: 0,
            allocated_outstanding: 0,
            gross_redeemed: 0,
            refunded: 0,
            returned_to_treasury: 0,
            treasury_remaining: funded_budget,
            ents: Vec::new(),
            reds: Vec::new(),
            next_nonce: 1,
            next_ent: 1,
            last_signed: None,
        }
    }

    fn pick_redeemable(&self, rng: &mut Xorshift) -> Option<usize> {
        let cands: Vec<usize> = (0..self.ents.len())
            .filter(|&i| self.ents[i].active && self.ents[i].remaining > 0)
            .collect();
        if cands.is_empty() {
            None
        } else {
            Some(cands[self.below_len(rng, cands.len())])
        }
    }

    fn pick_refundable(&self, rng: &mut Xorshift) -> Option<usize> {
        let cands: Vec<usize> = (0..self.reds.len())
            .filter(|&i| self.reds[i].amount - self.reds[i].refunded > 0)
            .collect();
        if cands.is_empty() {
            None
        } else {
            Some(cands[self.below_len(rng, cands.len())])
        }
    }

    fn pick_any_ent(&self, rng: &mut Xorshift) -> Option<usize> {
        if self.ents.is_empty() {
            None
        } else {
            Some(self.below_len(rng, self.ents.len()))
        }
    }

    fn below_len(&self, rng: &mut Xorshift, len: usize) -> usize {
        (rng.below(len as u64)) as usize
    }
}

/// Assert the two financial invariants the contract must maintain, plus basic
/// non-negativity and the funded-budget cap (design "Financial Invariants").
fn assert_voucher_conservation(t: &Totals) {
    // funded/total_funded conservation identity.
    let net = t.gross_redeemed - t.refunded;
    assert_eq!(
        t.total_funded,
        t.contract_balance + net + t.returned_to_treasury,
        "conservation identity broken: total_funded != contract_balance + (gross_redeemed - refunded) + returned_to_treasury"
    );
    // Allocation may never exceed escrowed value.
    assert!(
        t.allocated_outstanding <= t.contract_balance,
        "allocation bound broken: allocated_outstanding > contract_balance"
    );
    // No aggregate may go negative.
    assert!(t.contract_balance >= 0);
    assert!(t.allocated_outstanding >= 0);
    assert!(t.gross_redeemed >= 0);
    assert!(t.refunded >= 0);
    assert!(t.returned_to_treasury >= 0);
    assert!(t.total_funded >= 0);
    // Escrow can never exceed the approved funded budget.
    assert!(
        t.total_funded <= t.funded_budget,
        "escrow exceeded the approved funded budget"
    );
}

/// Assert the parallel model and the on-chain totals agree field-for-field.
/// Divergence means the contract created or destroyed value relative to the
/// operations it accepted (double-count / lost-count).
fn assert_totals_match(m: &VModel, t: &Totals) {
    assert_eq!(t.funded_budget, m.funded_budget, "funded_budget diverged");
    assert_eq!(t.total_funded, m.total_funded, "total_funded diverged");
    assert_eq!(
        t.contract_balance, m.contract_balance,
        "contract_balance diverged"
    );
    assert_eq!(
        t.allocated_outstanding, m.allocated_outstanding,
        "allocated_outstanding diverged"
    );
    assert_eq!(t.gross_redeemed, m.gross_redeemed, "gross_redeemed diverged");
    assert_eq!(t.refunded, m.refunded, "refunded diverged");
    assert_eq!(
        t.returned_to_treasury, m.returned_to_treasury,
        "returned_to_treasury diverged"
    );
}

/// Build a 32-byte nonce from a counter (counter in the FIRST four bytes).
fn nonce_from(env: &Env, n: u32) -> BytesN<32> {
    let mut a = [0u8; 32];
    a[..4].copy_from_slice(&n.to_be_bytes());
    BytesN::from_array(env, &a)
}

/// Build a 32-byte entitlement id from a counter (counter in the LAST four
/// bytes) so ids never coincide with the counter-in-front nonce space.
fn ent_id_from(env: &Env, n: u32) -> BytesN<32> {
    let mut a = [0u8; 32];
    a[28..].copy_from_slice(&n.to_be_bytes());
    BytesN::from_array(env, &a)
}

/// Re-derive the contract's redemption id (`sha256(entitlement_id || nonce)`).
fn derive_rid(env: &Env, entitlement_id: &BytesN<32>, nonce: &BytesN<32>) -> BytesN<32> {
    let mut preimage = Bytes::new(env);
    preimage.extend_from_array(&entitlement_id.to_array());
    preimage.extend_from_array(&nonce.to_array());
    env.crypto().sha256(&preimage).to_bytes()
}

/// Like [`build_signed_invoice`] but accepts an explicit 32-byte nonce so the
/// generator can mint arbitrarily many unique invoices.
#[allow(clippy::too_many_arguments)]
fn build_signed_invoice_nonce(
    env: &Env,
    contract_id: &Address,
    sac: &Address,
    merchant_id: &BytesN<32>,
    settlement_wallet: &Address,
    amount: i128,
    category: &str,
    nonce: BytesN<32>,
    issued_at: u64,
    expires_at: u64,
) -> SignedInvoice {
    let invoice = InvoiceV1 {
        version: 1,
        kind: Symbol::new(env, "voucher"),
        network: Symbol::new(env, "testnet"),
        asset_code: Symbol::new(env, "RCPHP"),
        asset_issuer: String::from_str(env, "GISSUERPLACEHOLDERTESTNETONLY"),
        sac: sac.clone(),
        program_id: String::from_str(env, "program_pilot"),
        contract_id: contract_id.clone(),
        merchant_id: merchant_id.clone(),
        settlement_wallet: settlement_wallet.clone(),
        invoice_signer: merchant_pubkey(env),
        amount,
        category: Symbol::new(env, category),
        nonce,
        issued_at,
        expires_at,
    };
    let message = crate::invoice::signing_message(env, &invoice).unwrap();
    let msg_bytes: Vec<u8> = message.iter().collect();
    let sig = merchant_signing_key().sign(&msg_bytes);
    SignedInvoice {
        invoice,
        signature: BytesN::from_array(env, &sig.to_bytes()),
    }
}

struct PropHarness<'a> {
    env: Env,
    client: VoucherContractClient<'a>,
    treasury: Address,
    contract_id: Address,
    sac_address: Address,
    merchant_id: BytesN<32>,
    settlement_wallet: Address,
}

/// A freshly initialized (Draft) program whose treasury holds exactly
/// `funded_budget` of the backing asset. Per-tx and daily limits are set to the
/// full budget so limit rules never mask a conservation error; the merchant is
/// authorized by a generator step once the program is Active.
fn setup_prop(funded_budget: i128) -> PropHarness<'static> {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1_000);

    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let emergency = Address::generate(&env);
    let issuer = Address::generate(&env);
    let settlement_wallet = Address::generate(&env);

    let sac = env.register_stellar_asset_contract_v2(issuer);
    let sac_address = sac.address();
    token::StellarAssetClient::new(&env, &sac_address).mint(&treasury, &funded_budget);

    let contract_id = env.register(VoucherContract, ());
    let client = VoucherContractClient::new(&env, &contract_id);

    let config = ProgramConfig {
        admin,
        treasury: treasury.clone(),
        emergency_authority: emergency,
        sac: sac_address.clone(),
        program_id: id(&env, 0xAB),
        asset_code: Symbol::new(&env, "RCPHP"),
        funded_budget,
        program_expires_at: 1_000 + 90 * DAY,
        refund_window_secs: 30 * DAY,
        per_tx_limit: funded_budget,
        daily_limit: funded_budget,
        contract_version: 1,
    };
    client.initialize(&config);

    // Compute before the struct literal: the `env` field shorthand moves `env`,
    // so it must not be referenced afterward inside the literal.
    let merchant_id = id(&env, 0x2A);

    PropHarness {
        env,
        client,
        treasury,
        contract_id,
        sac_address,
        merchant_id,
        settlement_wallet,
    }
}

/// Drive one randomized operation history and assert conservation after every
/// step. `seed` fully determines the history (replayable counterexample).
fn run_voucher_conservation_history(seed: u64, steps: u32) {
    let funded_budget: i128 = 1_000_000_000;
    let h = setup_prop(funded_budget);
    let env = &h.env;
    let token = token::TokenClient::new(env, &h.sac_address);
    let mut rng = Xorshift::new(seed);
    let mut m = VModel::new(funded_budget);

    for _ in 0..steps {
        let before = h.client.get_totals();
        let mut called_contract = true;
        let mut op_ok = false;

        let choice = rng.below(100);
        if choice < 15 {
            // ---- fund (only accepted while Draft, from the treasury) ----
            match rng.below(3) {
                0 => {
                    // Unauthorized source: rejected before any asset moves.
                    let stranger = Address::generate(env);
                    let amt = rng.pos_amount(m.treasury_remaining.max(1));
                    op_ok = h.client.try_fund(&stranger, &amt).is_ok();
                    debug_assert!(!op_ok);
                }
                _ => {
                    let cap = m.treasury_remaining;
                    if cap <= 0 {
                        // Nothing left to fund; a zero amount is rejected before
                        // any transfer, so no trap can occur.
                        op_ok = h.client.try_fund(&h.treasury, &0).is_ok();
                    } else {
                        let amt = rng.pos_amount(cap);
                        op_ok = h.client.try_fund(&h.treasury, &amt).is_ok();
                        if op_ok {
                            m.total_funded += amt;
                            m.contract_balance += amt;
                            m.treasury_remaining -= amt;
                        }
                    }
                }
            }
        } else if choice < 20 {
            // ---- activate ----
            op_ok = h.client.try_activate().is_ok();
            if op_ok {
                m.lifecycle = Lifecycle::Active;
            }
        } else if choice < 35 {
            // ---- allocate ----
            let ent_id = ent_id_from(env, m.next_ent);
            m.next_ent += 1;
            let beneficiary = Address::generate(env);
            let remaining_budget = m.contract_balance - m.allocated_outstanding;
            let amt = if rng.below(4) == 0 {
                // Deliberately exceed the remaining budget (expect BudgetExceeded).
                remaining_budget.max(0) + rng.pos_amount(1_000_000)
            } else {
                rng.pos_amount(remaining_budget.max(1))
            };
            let expires = 1_000 + 30 * DAY;
            op_ok = h
                .client
                .try_allocate(&ent_id, &beneficiary, &amt, &expires)
                .is_ok();
            if op_ok {
                m.allocated_outstanding += amt;
                m.ents.push(MEnt {
                    id: ent_id,
                    beneficiary,
                    remaining: amt,
                    active: true,
                });
            }
        } else if choice < 40 {
            // ---- set_merchant (does not move value) ----
            let active = rng.below(4) != 0;
            op_ok = h
                .client
                .try_set_merchant(&MerchantAuthorization {
                    merchant_id: h.merchant_id.clone(),
                    settlement_wallet: h.settlement_wallet.clone(),
                    invoice_signer: merchant_pubkey(env),
                    category: Symbol::new(env, "food"),
                    valid_until: 1_000 + 60 * DAY,
                    active,
                })
                .is_ok();
        } else if choice < 60 {
            // ---- redeem a fresh invoice ----
            let nonce = nonce_from(env, m.next_nonce);
            m.next_nonce += 1;
            let now = env.ledger().timestamp();
            let picked = m.pick_redeemable(&mut rng);
            let (ben, ent_id, amount, ent_idx) = match picked {
                Some(i) => {
                    let e = &m.ents[i];
                    (
                        e.beneficiary.clone(),
                        e.id.clone(),
                        rng.pos_amount(e.remaining),
                        Some(i),
                    )
                }
                None => (
                    Address::generate(env),
                    ent_id_from(env, 9_999),
                    rng.pos_amount(1_000),
                    None,
                ),
            };
            let signed = build_signed_invoice_nonce(
                env,
                &h.contract_id,
                &h.sac_address,
                &h.merchant_id,
                &h.settlement_wallet,
                amount,
                "food",
                nonce.clone(),
                now,
                now + 600,
            );
            op_ok = h
                .client
                .try_redeem(&ben, &ent_id, &signed.invoice, &signed.signature)
                .is_ok();
            if op_ok {
                let i = ent_idx.expect("a redeemable entitlement was targeted");
                m.ents[i].remaining -= amount;
                if m.ents[i].remaining == 0 {
                    m.ents[i].active = false;
                }
                m.allocated_outstanding -= amount;
                m.contract_balance -= amount;
                m.gross_redeemed += amount;
                let rid = derive_rid(env, &ent_id, &nonce);
                m.reds.push(MRed {
                    id: rid,
                    ent_idx: i,
                    amount,
                    refunded: 0,
                });
                m.last_signed = Some((ben, ent_id, signed.invoice, signed.signature));
            }
        } else if choice < 65 {
            // ---- replay the last successful invoice (must NEVER settle twice) ----
            match m.last_signed.clone() {
                Some((ben, ent_id, invoice, signature)) => {
                    op_ok = h
                        .client
                        .try_redeem(&ben, &ent_id, &invoice, &signature)
                        .is_ok();
                    if op_ok {
                        panic!(
                            "double settlement: a consumed invoice nonce settled a second time (seed {seed})"
                        );
                    }
                }
                None => {
                    called_contract = false;
                }
            }
        } else if choice < 75 {
            // ---- refund ----
            let nonce = nonce_from(env, m.next_nonce);
            m.next_nonce += 1;
            match m.pick_refundable(&mut rng) {
                Some(i) => {
                    let outstanding = m.reds[i].amount - m.reds[i].refunded;
                    let amt = if rng.below(4) == 0 {
                        // Over-refund (expect RefundExceedsRedemption).
                        outstanding + rng.pos_amount(1_000)
                    } else {
                        rng.pos_amount(outstanding)
                    };
                    let rid = m.reds[i].id.clone();
                    op_ok = h
                        .client
                        .try_refund(&h.settlement_wallet, &rid, &amt, &nonce)
                        .is_ok();
                    if op_ok {
                        m.reds[i].refunded += amt;
                        let ent_i = m.reds[i].ent_idx;
                        m.ents[ent_i].remaining += amt;
                        m.ents[ent_i].active = true;
                        m.refunded += amt;
                        m.contract_balance += amt;
                        m.allocated_outstanding += amt;
                    }
                }
                None => {
                    // No redemption to refund: a random id is rejected.
                    let rid = derive_rid(env, &ent_id_from(env, 7_777), &nonce);
                    op_ok = h
                        .client
                        .try_refund(&h.settlement_wallet, &rid, &rng.pos_amount(1_000), &nonce)
                        .is_ok();
                    debug_assert!(!op_ok);
                }
            }
        } else if choice < 80 {
            // ---- rotate an entitlement (does not move value) ----
            match m.pick_any_ent(&mut rng) {
                Some(i) => {
                    let old = m.ents[i].beneficiary.clone();
                    let new = Address::generate(env);
                    let ent_id = m.ents[i].id.clone();
                    op_ok = h
                        .client
                        .try_rotate_entitlement(&ent_id, &old, &new)
                        .is_ok();
                    if op_ok {
                        m.ents[i].beneficiary = new;
                    }
                }
                None => {
                    op_ok = h
                        .client
                        .try_rotate_entitlement(
                            &ent_id_from(env, 8_888),
                            &Address::generate(env),
                            &Address::generate(env),
                        )
                        .is_ok();
                    debug_assert!(!op_ok);
                }
            }
        } else if choice < 85 {
            // ---- pause / resume (does not move value) ----
            match m.lifecycle {
                Lifecycle::Active => {
                    op_ok = h.client.try_pause(&id(env, 0x60)).is_ok();
                    if op_ok {
                        m.lifecycle = Lifecycle::Paused;
                    }
                }
                Lifecycle::Paused => {
                    op_ok = h.client.try_resume(&id(env, 0x62)).is_ok();
                    if op_ok {
                        m.lifecycle = Lifecycle::Active;
                    }
                }
                _ => {
                    op_ok = h.client.try_pause(&id(env, 0x61)).is_ok();
                    debug_assert!(!op_ok);
                }
            }
        } else if choice < 93 {
            // ---- advance ledger time (no contract call) ----
            let now = env.ledger().timestamp();
            let delta = match rng.below(4) {
                0 => rng.below(3_600),
                1 => rng.below(DAY),
                2 => 100 * DAY, // past program expiry
                _ => 200 * DAY, // past expiry + refund window (enables close)
            };
            env.ledger().set_timestamp(now + delta);
            called_contract = false;
        } else {
            // ---- close ----
            op_ok = h.client.try_close().is_ok();
            if op_ok {
                let returned = m.contract_balance;
                m.contract_balance = 0;
                m.returned_to_treasury += returned;
                m.allocated_outstanding = 0;
                m.treasury_remaining += returned;
                m.lifecycle = Lifecycle::Closed;
            }
        }

        // ---- Invariants after every step ----
        let after = h.client.get_totals();
        assert_voucher_conservation(&after);
        assert_totals_match(&m, &after);
        assert_eq!(
            token.balance(&h.contract_id),
            after.contract_balance,
            "escrowed SAC balance diverged from the tracked contract_balance (seed {seed})"
        );
        if called_contract && !op_ok {
            // A rejected operation must leave the aggregate totals untouched.
            assert_eq!(
                after, before,
                "a rejected operation changed the totals (seed {seed})"
            );
        }
    }
}

#[test]
fn prop_value_conservation_random_histories() {
    // A spread of fixed seeds; each is a reproducible, replayable history.
    for seed in [
        1u64, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 2024, 90_909, 123_456_789,
    ] {
        run_voucher_conservation_history(seed, 160);
    }
}

#[test]
fn prop_value_conservation_scripted_full_lifecycle() {
    // A deterministic full-lifecycle history that guarantees the meaningful
    // path (fund -> activate -> allocate -> redeem -> refund -> rotate ->
    // pause/resume -> redeem -> close) is exercised, asserting conservation
    // after every value-changing step regardless of the PRNG.
    let budget: i128 = 1_000_000_000;
    let h = setup_prop(budget);
    let env = &h.env;
    let token = token::TokenClient::new(env, &h.sac_address);

    let check = |label: &str| {
        let t = h.client.get_totals();
        assert_voucher_conservation(&t);
        assert_eq!(
            token.balance(&h.contract_id),
            t.contract_balance,
            "escrow balance diverged after {label}"
        );
        t
    };

    h.client.fund(&h.treasury, &budget);
    check("fund");
    h.client.activate();
    check("activate");

    let ent = ent_id_from(env, 1);
    let beneficiary = Address::generate(env);
    h.client
        .allocate(&ent, &beneficiary, &budget, &(1_000 + 30 * DAY));
    let t = check("allocate");
    assert_eq!(t.allocated_outstanding, budget);

    // Redeem a portion.
    let redeem_amt = 400_000_000;
    let signed = build_signed_invoice_nonce(
        env,
        &h.contract_id,
        &h.sac_address,
        &h.merchant_id,
        &h.settlement_wallet,
        redeem_amt,
        "food",
        nonce_from(env, 1),
        1_000,
        1_600,
    );
    // Merchant must be authorized first.
    h.client.set_merchant(&MerchantAuthorization {
        merchant_id: h.merchant_id.clone(),
        settlement_wallet: h.settlement_wallet.clone(),
        invoice_signer: merchant_pubkey(env),
        category: Symbol::new(env, "food"),
        valid_until: 1_000 + 60 * DAY,
        active: true,
    });
    check("set_merchant");
    h.client
        .redeem(&beneficiary, &ent, &signed.invoice, &signed.signature);
    let t = check("redeem");
    assert_eq!(t.gross_redeemed, redeem_amt);
    assert_eq!(t.contract_balance, budget - redeem_amt);

    // Refund part of it.
    let rid = derive_rid(env, &ent, &nonce_from(env, 1));
    h.client
        .refund(&h.settlement_wallet, &rid, &150_000_000, &nonce_from(env, 2));
    let t = check("refund");
    assert_eq!(t.refunded, 150_000_000);

    // Rotate the entitlement to a new wallet (no value moves).
    let new_wallet = Address::generate(env);
    h.client
        .rotate_entitlement(&ent, &beneficiary, &new_wallet);
    check("rotate");

    // Pause then resume (no value moves).
    h.client.pause(&id(env, 0x01));
    check("pause");
    h.client.resume(&id(env, 0x02));
    check("resume");

    // Close after the program expiry + refund window; unused escrow returns.
    env.ledger().set_timestamp(1_000 + 90 * DAY + 30 * DAY);
    h.client.close();
    let t = check("close");
    assert_eq!(t.contract_balance, 0);
    assert_eq!(t.allocated_outstanding, 0);
    // Everything reconciles to the funded budget: what settled to the merchant
    // (net) plus what returned to the treasury equals the funded budget.
    assert_eq!(
        t.gross_redeemed - t.refunded + t.returned_to_treasury,
        budget
    );
}

// ---------------------------------------------------------------------------
// Cash-rail conservation (lightweight model)
//
// The cash rail is a database/ledger property (design: "the conservation is a
// database/ledger property — a lightweight model assertion is acceptable").
// This pure-Rust model simulates a cash program: an organization reserves the
// funded budget into a program treasury, distributes final (never reclaimed)
// cash to beneficiaries, and beneficiaries pay merchants. Every reserved stroop
// lives in exactly one bucket (treasury / beneficiary / merchant) at all times
// — no value is created and beneficiary cash is never double-counted.
// ---------------------------------------------------------------------------

fn run_cash_conservation_history(seed: u64, steps: u32) {
    let funded: i128 = 1_000_000_000;
    let mut rng = Xorshift::new(seed);

    let mut treasury: i128 = 0; // reserved-but-undistributed program treasury
    let mut total_reserved: i128 = 0; // cumulative org -> program treasury (<= funded)
    let mut ben: [i128; 8] = [0; 8]; // confirmed, final beneficiary cash
    let mut mer: [i128; 4] = [0; 4]; // merchant settled cash

    for _ in 0..steps {
        // Snapshot before the step so a rejected operation can be proven inert.
        let before = (treasury, total_reserved, ben, mer);
        let mut rejected = false;

        match rng.below(4) {
            0 => {
                // Reserve budget into the program treasury (bounded by funded).
                let room = funded - total_reserved;
                if room > 0 {
                    let amt = ((rng.below(room as u64) as i128) + 1).min(room);
                    total_reserved += amt;
                    treasury += amt;
                } else {
                    rejected = true; // fully reserved: reservation rejected
                }
            }
            1 => {
                // Distribute cash to a beneficiary (final; never reclaimed).
                if treasury > 0 {
                    let amt = ((rng.below(treasury as u64) as i128) + 1).min(treasury);
                    let b = (rng.below(ben.len() as u64)) as usize;
                    treasury -= amt;
                    ben[b] += amt;
                } else {
                    rejected = true; // empty treasury: distribution rejected
                }
            }
            2 => {
                // Beneficiary pays a merchant: value moves, it is not recreated.
                let b = (rng.below(ben.len() as u64)) as usize;
                if ben[b] > 0 {
                    let amt = ((rng.below(ben[b] as u64) as i128) + 1).min(ben[b]);
                    let mi = (rng.below(mer.len() as u64)) as usize;
                    ben[b] -= amt;
                    mer[mi] += amt;
                } else {
                    rejected = true; // no beneficiary cash: payment rejected
                }
            }
            _ => {
                // An over-distribution (more than the treasury holds) is always
                // rejected and must leave every balance untouched.
                rejected = true;
            }
        }

        // A rejected operation moves nothing.
        if rejected {
            assert_eq!(
                (treasury, total_reserved, ben, mer),
                before,
                "a rejected cash operation changed a balance (seed {seed})"
            );
        }

        // Conservation after every step: reserved value is partitioned exactly
        // across treasury / beneficiaries / merchants — no stroop is created or
        // double-counted.
        let ben_sum: i128 = ben.iter().sum();
        let mer_sum: i128 = mer.iter().sum();
        assert_eq!(
            total_reserved,
            treasury + ben_sum + mer_sum,
            "cash conservation broken (seed {seed})"
        );
        assert!(total_reserved <= funded, "reserved exceeded funded budget");
        assert!(treasury >= 0 && ben_sum >= 0 && mer_sum >= 0);
    }
}

#[test]
fn prop_cash_rail_conservation_model() {
    for seed in [1u64, 2, 3, 7, 11, 13, 42, 99, 2024, 555_555] {
        run_cash_conservation_history(seed, 400);
    }
}

// ---------------------------------------------------------------------------
// Task 9.5: Property 2 — No Duplicate Settlement (contract layer)
//
// **Validates: Requirements 7.8, 8.5, 10.6, 11.7**
//
// This is the CONTRACT layer of Property 2 from the design document:
//
//   "Reusing a business idempotency key, invoice nonce, signed payload, or
//    transaction attempt cannot produce a second transfer."
//
// The on-chain analogues of the backend's business idempotency key are the
// contract's one-time invoice nonce (redeem) and refund nonce (refund). This
// seeded-generator property (the on-chain analogue of the TypeScript fast-check
// suite scripts/tests/no-duplicate-settlement.property.test.mjs) generates
// retries that REUSE and VARY invoice nonces, refund nonces, and signed payloads
// against a fresh contract instance and asserts, after every step:
//
//   1. A fresh invoice nonce settles EXACTLY ONCE: `gross_redeemed` advances by
//      the redeemed amount and the escrow (real SAC balance) drops by it — one
//      value movement per logical redemption.
//   2. Replaying a previously consumed invoice (same nonce + same signed payload)
//      is ALWAYS rejected and moves no value — a second settlement is impossible.
//   3. Reusing a consumed invoice nonce with a DIFFERENT (re-signed) payload is
//      likewise rejected and moves no value — the nonce, not the payload bytes,
//      is the one-time key, so varying the signed payload cannot mint a second
//      transfer.
//   4. A fresh refund nonce refunds EXACTLY ONCE (`refunded` advances by the
//      amount, escrow returns by it); replaying a consumed refund nonce is always
//      rejected and moves no value.
//   5. Every rejected operation leaves the aggregate totals and the escrowed SAC
//      balance UNCHANGED.
//
// A parallel in-test model tracks the settlement count per logical operation; if
// any consumed nonce ever settles a second time the test panics immediately.
// Fixed seeds make each generated history a reproducible, replayable
// counterexample (a failing seed pins the exact history for debugging).
//
// NOTE: `cargo test` requires the Rust/WASM toolchain, which is unavailable in
// the authoring environment. This test is authored to the conventions of the
// task 9.4 property suite above and is run wherever the contract toolchain is
// present (see the task 9 verification gate).

/// One successfully redeemed invoice, retained so the generator can replay its
/// exact signed payload or reuse its consumed nonce with a fresh payload.
struct SettledInvoice {
    signed: SignedInvoice,
    nonce: BytesN<32>,
    rid: BytesN<32>,
    amount: i128,
    refunded: i128,
}

/// One consumed refund nonce paired with the redemption it applied to, retained
/// so the generator can replay the refund nonce (which must never settle twice).
struct SettledRefund {
    rid: BytesN<32>,
    nonce: BytesN<32>,
}

/// Drive one randomized reuse/vary history and assert no logical operation ever
/// settles twice. `seed` fully determines the history (replayable counterexample).
fn run_no_duplicate_settlement_history(seed: u64, steps: u32) {
    let budget: i128 = 1_000_000_000;
    // A fully activated program with one authorized merchant and a single
    // entitlement holding the entire budget; limits are the full budget so only
    // nonce reuse (never a limit) can reject a settlement.
    let h = setup_redeem(budget, budget, budget);
    let env = &h.env;
    let token = token::TokenClient::new(env, &h.sac_address);
    let mut rng = Xorshift::new(seed);

    // Parallel model, advanced only by ACCEPTED operations.
    let mut remaining: i128 = budget; // entitlement remaining
    let mut contract_balance: i128 = budget; // escrowed value
    let mut gross_redeemed: i128 = 0;
    let mut refunded: i128 = 0;

    let mut settled: Vec<SettledInvoice> = Vec::new();
    let mut refunds: Vec<SettledRefund> = Vec::new();
    let mut next_invoice_nonce: u32 = 1;
    let mut next_refund_nonce: u32 = 1;

    for _ in 0..steps {
        let before = h.client.get_totals();
        let mut called_contract = true;

        let choice = rng.below(100);
        if choice < 35 {
            // ---- fresh redeem (a new logical operation) ----
            if remaining <= 0 {
                called_contract = false;
            } else {
                let cap = remaining.min(budget / 8).max(1);
                let amount = rng.pos_amount(cap);
                let nonce = nonce_from(env, next_invoice_nonce);
                next_invoice_nonce += 1;
                let now = env.ledger().timestamp();
                let signed = build_signed_invoice_nonce(
                    env,
                    &h.contract_id,
                    &h.sac_address,
                    &h.merchant_id,
                    &h.settlement_wallet,
                    amount,
                    "food",
                    nonce.clone(),
                    now,
                    now + 600,
                );
                let ok = h
                    .client
                    .try_redeem(&h.beneficiary, &h.entitlement_id, &signed.invoice, &signed.signature)
                    .is_ok();
                if ok {
                    remaining -= amount;
                    contract_balance -= amount;
                    gross_redeemed += amount;
                    let rid = derive_rid(env, &h.entitlement_id, &nonce);
                    // Exactly one value movement for this fresh nonce.
                    let after = h.client.get_totals();
                    assert_eq!(
                        after.gross_redeemed,
                        before.gross_redeemed + amount,
                        "a fresh redemption must move value exactly once (seed {seed})"
                    );
                    settled.push(SettledInvoice {
                        signed,
                        nonce,
                        rid,
                        amount,
                        refunded: 0,
                    });
                }
            }
        } else if choice < 60 {
            // ---- replay a consumed invoice: SAME nonce + SAME signed payload ----
            if settled.is_empty() {
                called_contract = false;
            } else {
                let i = (rng.below(settled.len() as u64)) as usize;
                let s = &settled[i];
                let res = h
                    .client
                    .try_redeem(&h.beneficiary, &h.entitlement_id, &s.signed.invoice, &s.signed.signature)
                    .is_ok();
                if res {
                    panic!(
                        "double settlement: a consumed invoice nonce settled a second time (seed {seed})"
                    );
                }
            }
        } else if choice < 75 {
            // ---- reuse a consumed nonce with a DIFFERENT re-signed payload ----
            // The nonce is the one-time key; varying the signed payload must not
            // mint a second transfer.
            if settled.is_empty() {
                called_contract = false;
            } else {
                let i = (rng.below(settled.len() as u64)) as usize;
                let nonce = settled[i].nonce.clone();
                // A fresh, otherwise-valid amount so the ONLY dedup reason is the
                // consumed nonce (a rejection for any reason still moves no value).
                let amt = rng.pos_amount(remaining.max(1));
                let now = env.ledger().timestamp();
                let varied = build_signed_invoice_nonce(
                    env,
                    &h.contract_id,
                    &h.sac_address,
                    &h.merchant_id,
                    &h.settlement_wallet,
                    amt,
                    "food",
                    nonce,
                    now,
                    now + 600,
                );
                let res = h
                    .client
                    .try_redeem(&h.beneficiary, &h.entitlement_id, &varied.invoice, &varied.signature)
                    .is_ok();
                if res {
                    panic!(
                        "double settlement: a consumed nonce settled again under a varied payload (seed {seed})"
                    );
                }
            }
        } else if choice < 90 {
            // ---- fresh refund (a new logical refund operation) ----
            let refundable: Vec<usize> = (0..settled.len())
                .filter(|&i| settled[i].amount - settled[i].refunded > 0)
                .collect();
            if refundable.is_empty() {
                called_contract = false;
            } else {
                let i = refundable[(rng.below(refundable.len() as u64)) as usize];
                let outstanding = settled[i].amount - settled[i].refunded;
                let amount = rng.pos_amount(outstanding);
                let nonce = nonce_from(env, 1_000_000 + next_refund_nonce);
                next_refund_nonce += 1;
                let rid = settled[i].rid.clone();
                let ok = h
                    .client
                    .try_refund(&h.settlement_wallet, &rid, &amount, &nonce)
                    .is_ok();
                if ok {
                    settled[i].refunded += amount;
                    refunded += amount;
                    contract_balance += amount;
                    remaining += amount;
                    let after = h.client.get_totals();
                    assert_eq!(
                        after.refunded,
                        before.refunded + amount,
                        "a fresh refund must move value exactly once (seed {seed})"
                    );
                    refunds.push(SettledRefund { rid, nonce });
                }
            }
        } else {
            // ---- replay a consumed refund nonce (must never settle twice) ----
            if refunds.is_empty() {
                called_contract = false;
            } else {
                let i = (rng.below(refunds.len() as u64)) as usize;
                let r = &refunds[i];
                let res = h
                    .client
                    .try_refund(&h.settlement_wallet, &r.rid, &1, &r.nonce)
                    .is_ok();
                if res {
                    panic!(
                        "double refund: a consumed refund nonce settled a second time (seed {seed})"
                    );
                }
            }
        }

        // ---- Invariants after every step ----
        let after = h.client.get_totals();
        assert_eq!(
            after.gross_redeemed, gross_redeemed,
            "gross_redeemed diverged from the model (seed {seed})"
        );
        assert_eq!(after.refunded, refunded, "refunded diverged from the model (seed {seed})");
        assert_eq!(
            after.contract_balance, contract_balance,
            "contract_balance diverged from the model (seed {seed})"
        );
        assert_eq!(
            token.balance(&h.contract_id),
            contract_balance,
            "escrowed SAC balance diverged from the tracked contract_balance (seed {seed})"
        );
        // A rejected operation must leave the aggregate totals untouched.
        if called_contract {
            let moved = after.gross_redeemed != before.gross_redeemed
                || after.refunded != before.refunded;
            if !moved {
                assert_eq!(
                    after, before,
                    "a rejected operation changed the totals (seed {seed})"
                );
            }
        }
    }

    // Global guard: net settled value never exceeds the funded budget, and every
    // consumed nonce accounts for exactly one movement (model equals chain).
    let t = h.client.get_totals();
    assert!(t.gross_redeemed - t.refunded <= budget);
    assert_eq!(t.gross_redeemed, gross_redeemed);
    assert_eq!(t.refunded, refunded);
}

#[test]
fn prop_no_duplicate_settlement_random_histories() {
    // A spread of fixed seeds; each is a reproducible, replayable history.
    for seed in [
        1u64, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 2024, 90_909, 123_456_789,
    ] {
        run_no_duplicate_settlement_history(seed, 200);
    }
}

#[test]
fn prop_no_duplicate_settlement_scripted_replays() {
    // A deterministic history that guarantees the meaningful replay paths are
    // exercised regardless of the PRNG: one fresh redemption settles once, then
    // the same signed payload, the same nonce under a varied payload, one fresh
    // refund, and the same refund nonce are all replayed and must never settle
    // a second time.
    let budget: i128 = 1_000_000_000;
    let h = setup_redeem(budget, budget, budget);
    let env = &h.env;
    let token = token::TokenClient::new(env, &h.sac_address);

    let amount = 250_000_000;
    let nonce = nonce_from(env, 1);
    let now = env.ledger().timestamp();
    let signed = build_signed_invoice_nonce(
        env,
        &h.contract_id,
        &h.sac_address,
        &h.merchant_id,
        &h.settlement_wallet,
        amount,
        "food",
        nonce.clone(),
        now,
        now + 600,
    );

    // 1. Fresh redemption settles exactly once.
    h.client
        .redeem(&h.beneficiary, &h.entitlement_id, &signed.invoice, &signed.signature);
    let t = h.client.get_totals();
    assert_eq!(t.gross_redeemed, amount);
    assert_eq!(t.contract_balance, budget - amount);
    assert_eq!(token.balance(&h.contract_id), budget - amount);

    // 2. Replaying the exact signed payload is rejected and moves no value.
    let replay = h
        .client
        .try_redeem(&h.beneficiary, &h.entitlement_id, &signed.invoice, &signed.signature);
    assert_eq!(replay, Err(Ok(Error::NonceAlreadyUsed)));
    assert_eq!(h.client.get_totals(), t);

    // 3. Reusing the consumed nonce under a DIFFERENT re-signed payload is also
    //    rejected — the nonce is the one-time key, not the payload bytes.
    let varied = build_signed_invoice_nonce(
        env,
        &h.contract_id,
        &h.sac_address,
        &h.merchant_id,
        &h.settlement_wallet,
        amount / 2,
        "food",
        nonce,
        now,
        now + 600,
    );
    let varied_res = h
        .client
        .try_redeem(&h.beneficiary, &h.entitlement_id, &varied.invoice, &varied.signature);
    assert_eq!(varied_res, Err(Ok(Error::NonceAlreadyUsed)));
    assert_eq!(h.client.get_totals(), t);

    // 4. A fresh refund nonce refunds exactly once.
    let rid = derive_rid(env, &h.entitlement_id, &nonce_from(env, 1));
    let refund_nonce = nonce_from(env, 1_000_001);
    h.client
        .refund(&h.settlement_wallet, &rid, &100_000_000, &refund_nonce);
    let t2 = h.client.get_totals();
    assert_eq!(t2.refunded, 100_000_000);

    // 5. Replaying the consumed refund nonce is rejected and moves no value.
    let refund_replay = h
        .client
        .try_refund(&h.settlement_wallet, &rid, &1, &refund_nonce);
    assert_eq!(refund_replay, Err(Ok(Error::RefundNonceUsed)));
    assert_eq!(h.client.get_totals(), t2);
}

// ===========================================================================
// Task 9.6: consolidated example + state-machine coverage
//
// This section adds the coverage enumerated by the design's
// "Testing Strategy -> Soroban" that the 9.1/9.2/9.3 example tests and the
// 9.4/9.5 property tests above do NOT already assert:
//
//   * an explicit lifecycle STATE-MACHINE transition matrix that proves every
//     illegal transition is rejected from each of `Draft`, `Active`, `Paused`,
//     and `Closed` (Requirement 5.7, 7.10; design "State Machines");
//   * a TTL-EXTENSION assertion proving every call bumps the instance and any
//     touched persistent entry back to the target TTL (design "Storage and
//     Events": "Every call extends the TTL of touched live entries";
//     Requirement 18.7, 22.5);
//   * a PRIVACY assertion proving on-chain events and stored records carry only
//     pseudonymous identifiers, wallet addresses, and amounts — never PII
//     (design Property 6 / "Storage and Events"; Requirement 7.3, 19.1); and
//   * a RESTORE-SAFETY assertion proving an archived persistent entitlement is
//     auto-restored with its value intact and that restoration can never enable
//     a duplicate settlement (design "Storage and Events": "Archived contract
//     data is treated as an operational incident requiring restore and
//     reconciliation"; Requirement 23.8).
//
// Every safety-critical failure assertion below confirms value conservation and
// that no duplicate settlement occurs (Requirement 23.8): a rejected operation
// leaves both the aggregate `Totals` and the real escrowed SAC balance exactly
// as they were.
//
// NOTE: `cargo test` requires the Rust/WASM toolchain, which is unavailable in
// the authoring environment, so these tests could not be executed here. They are
// authored to the conventions of the example/property suites above (shared
// `Env`, `mock_all_auths`, ed25519-dalek signing helpers, deterministic ledger
// settings) and run wherever the contract toolchain is present (task 9
// verification gate).
// ---------------------------------------------------------------------------

/// Build a throwaway signed invoice bound to the given harness, used only to
/// drive a `redeem` call whose lifecycle guard fires before any invoice or
/// entitlement checks (so the invoice never needs to be otherwise valid).
fn dummy_signed(
    env: &Env,
    contract_id: &Address,
    sac: &Address,
    merchant_id: &BytesN<32>,
    settlement_wallet: &Address,
    nonce_byte: u8,
) -> SignedInvoice {
    build_signed_invoice(
        env,
        contract_id,
        sac,
        merchant_id,
        settlement_wallet,
        1,
        "food",
        nonce_byte,
        1_000,
        1_600,
    )
}

#[test]
fn state_machine_rejects_illegal_transitions_from_draft() {
    // A fresh program is `Draft`: only `fund` and `activate` are legal. Every
    // allocation, merchant, value-moving, rotation, pause, resume, and close
    // operation must be rejected, and nothing may move.
    let h = setup(1_000_000_000, 1_000_000_000);
    let env = &h.env;
    let before = h.client.get_totals();
    assert_eq!(h.client.get_lifecycle(), Lifecycle::Draft);

    let beneficiary = Address::generate(env);
    let new_wallet = Address::generate(env);
    let merchant_id = id(env, 0x2A);
    let settlement_wallet = Address::generate(env);
    let eid = id(env, 0x01);
    let reason = id(env, 0xE0);

    // Active-only operations are rejected before activation.
    assert_eq!(
        h.client.try_allocate(&eid, &beneficiary, &100, &(1_000 + DAY)),
        Err(Ok(Error::InvalidLifecycle))
    );
    assert_eq!(
        h.client.try_set_merchant(&MerchantAuthorization {
            merchant_id: merchant_id.clone(),
            settlement_wallet: settlement_wallet.clone(),
            invoice_signer: merchant_pubkey(env),
            category: Symbol::new(env, "food"),
            valid_until: 1_000 + 60 * DAY,
            active: true,
        }),
        Err(Ok(Error::InvalidLifecycle))
    );
    let signed = dummy_signed(
        env,
        &h.client.address,
        &h.sac_address,
        &merchant_id,
        &settlement_wallet,
        0xE1,
    );
    assert_eq!(
        h.client
            .try_redeem(&beneficiary, &eid, &signed.invoice, &signed.signature),
        Err(Ok(Error::InvalidLifecycle))
    );
    assert_eq!(
        h.client
            .try_refund(&settlement_wallet, &id(env, 0xE2), &10, &id(env, 0xE3)),
        Err(Ok(Error::InvalidLifecycle))
    );
    assert_eq!(
        h.client
            .try_rotate_entitlement(&eid, &beneficiary, &new_wallet),
        Err(Ok(Error::InvalidLifecycle))
    );

    // Emergency and closure transitions are not reachable from Draft.
    assert_eq!(h.client.try_pause(&reason), Err(Ok(Error::InvalidLifecycle)));
    assert_eq!(h.client.try_resume(&reason), Err(Ok(Error::NotPaused)));
    assert_eq!(h.client.try_close(), Err(Ok(Error::ClosureNotAllowed)));

    // Nothing moved; the program is still Draft with untouched totals.
    assert_eq!(h.client.get_lifecycle(), Lifecycle::Draft);
    assert_eq!(h.client.get_totals(), before);
    assert_voucher_conservation(&h.client.get_totals());
}

#[test]
fn state_machine_rejects_illegal_transitions_from_active_paused_closed() {
    // Walk one program through Active -> Paused -> Closed, asserting the illegal
    // transitions out of each state and that every rejection conserves value and
    // settles nothing (Requirement 23.8).
    let budget = 1_000_000_000;
    let h = setup_redeem(budget, budget, budget);
    let env = &h.env;
    let token = token::TokenClient::new(env, &h.sac_address);

    // ---- Active ----
    assert_eq!(h.client.get_lifecycle(), Lifecycle::Active);
    let active_before = h.client.get_totals();
    let escrow_before = token.balance(&h.contract_id);

    // Funding and (re-)activation belong to Draft only.
    assert_eq!(
        h.client.try_fund(&h.treasury, &1),
        Err(Ok(Error::InvalidLifecycle))
    );
    assert_eq!(h.client.try_activate(), Err(Ok(Error::InvalidLifecycle)));
    // Resume is only valid from Paused.
    assert_eq!(
        h.client.try_resume(&id(env, 0xA0)),
        Err(Ok(Error::NotPaused))
    );
    assert_eq!(h.client.get_totals(), active_before);
    assert_eq!(token.balance(&h.contract_id), escrow_before);

    // ---- Paused ----
    h.client.pause(&id(env, 0xA1));
    assert_eq!(h.client.get_lifecycle(), Lifecycle::Paused);
    let paused_before = h.client.get_totals();

    let signed = dummy_signed(
        env,
        &h.contract_id,
        &h.sac_address,
        &h.merchant_id,
        &h.settlement_wallet,
        0xA2,
    );
    let stranger = Address::generate(env);
    // Every draft-only, active-only, and pause operation is rejected while paused.
    assert_eq!(
        h.client.try_fund(&h.treasury, &1),
        Err(Ok(Error::InvalidLifecycle))
    );
    assert_eq!(h.client.try_activate(), Err(Ok(Error::InvalidLifecycle)));
    assert_eq!(
        h.client
            .try_allocate(&id(env, 0xA3), &stranger, &100, &(1_000 + DAY)),
        Err(Ok(Error::InvalidLifecycle))
    );
    assert_eq!(
        h.client.try_set_merchant(&MerchantAuthorization {
            merchant_id: h.merchant_id.clone(),
            settlement_wallet: h.settlement_wallet.clone(),
            invoice_signer: merchant_pubkey(env),
            category: Symbol::new(env, "food"),
            valid_until: 1_000 + 60 * DAY,
            active: true,
        }),
        Err(Ok(Error::InvalidLifecycle))
    );
    assert_eq!(
        h.client
            .try_redeem(&h.beneficiary, &h.entitlement_id, &signed.invoice, &signed.signature),
        Err(Ok(Error::InvalidLifecycle))
    );
    assert_eq!(
        h.client
            .try_refund(&h.settlement_wallet, &id(env, 0xA4), &10, &id(env, 0xA5)),
        Err(Ok(Error::InvalidLifecycle))
    );
    assert_eq!(
        h.client
            .try_rotate_entitlement(&h.entitlement_id, &h.beneficiary, &stranger),
        Err(Ok(Error::InvalidLifecycle))
    );
    // Pausing an already-paused program is rejected.
    assert_eq!(
        h.client.try_pause(&id(env, 0xA6)),
        Err(Ok(Error::InvalidLifecycle))
    );
    // The pause moved no value and left every total untouched.
    assert_eq!(h.client.get_totals(), paused_before);
    assert_eq!(token.balance(&h.contract_id), escrow_before);
    assert_eq!(token.balance(&h.settlement_wallet), 0);

    // ---- Closed ----
    // Resume, advance past expiry + refund window, and close (close is legal
    // from Active or Paused; here we resume first to close from Active).
    h.client.resume(&id(env, 0xA7));
    env.ledger()
        .set_timestamp(1_000 + 90 * DAY + 30 * DAY);
    h.client.close();
    assert_eq!(h.client.get_lifecycle(), Lifecycle::Closed);
    let closed_totals = h.client.get_totals();
    assert_voucher_conservation(&closed_totals);
    // Unused escrow returned to the treasury; nothing settled to a merchant.
    assert_eq!(closed_totals.returned_to_treasury, budget);
    assert_eq!(closed_totals.gross_redeemed, 0);
    let escrow_closed = token.balance(&h.contract_id);

    let signed_closed = dummy_signed(
        env,
        &h.contract_id,
        &h.sac_address,
        &h.merchant_id,
        &h.settlement_wallet,
        0xA8,
    );
    // Closed is terminal: no operation may reopen or move value.
    assert_eq!(
        h.client.try_fund(&h.treasury, &1),
        Err(Ok(Error::InvalidLifecycle))
    );
    assert_eq!(h.client.try_activate(), Err(Ok(Error::InvalidLifecycle)));
    assert_eq!(
        h.client
            .try_allocate(&id(env, 0xA9), &stranger, &100, &(1_000 + DAY)),
        Err(Ok(Error::InvalidLifecycle))
    );
    assert_eq!(
        h.client.try_set_merchant(&MerchantAuthorization {
            merchant_id: h.merchant_id.clone(),
            settlement_wallet: h.settlement_wallet.clone(),
            invoice_signer: merchant_pubkey(env),
            category: Symbol::new(env, "food"),
            valid_until: 1_000 + 60 * DAY,
            active: true,
        }),
        Err(Ok(Error::InvalidLifecycle))
    );
    assert_eq!(
        h.client.try_redeem(
            &h.beneficiary,
            &h.entitlement_id,
            &signed_closed.invoice,
            &signed_closed.signature
        ),
        Err(Ok(Error::InvalidLifecycle))
    );
    assert_eq!(
        h.client
            .try_refund(&h.settlement_wallet, &id(env, 0xAA), &10, &id(env, 0xAB)),
        Err(Ok(Error::InvalidLifecycle))
    );
    assert_eq!(
        h.client
            .try_rotate_entitlement(&h.entitlement_id, &h.beneficiary, &stranger),
        Err(Ok(Error::InvalidLifecycle))
    );
    assert_eq!(
        h.client.try_pause(&id(env, 0xAC)),
        Err(Ok(Error::InvalidLifecycle))
    );
    assert_eq!(
        h.client.try_resume(&id(env, 0xAD)),
        Err(Ok(Error::NotPaused))
    );
    // A second close is rejected as already closed.
    assert_eq!(h.client.try_close(), Err(Ok(Error::AlreadyClosed)));

    // Terminal state is inert: totals and escrow are exactly as at closure.
    assert_eq!(h.client.get_totals(), closed_totals);
    assert_eq!(token.balance(&h.contract_id), escrow_closed);
}

// ---------------------------------------------------------------------------
// TTL extension + restore safety
//
// These use a dedicated environment with explicit TTL network settings so the
// assertions are deterministic (the SDK's default settings are "subject to
// change"; the Stellar docs recommend pinning them in tests).
// ---------------------------------------------------------------------------

/// A fully activated program (one entitlement, one authorized merchant) built in
/// an environment with pinned TTL network settings so `get_ttl` assertions are
/// exact. The current ledger sequence starts at `100_000`.
fn setup_ttl(entitlement_amount: i128) -> RedeemHarness<'static> {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|li| {
        // TTL is measured in ledgers from `sequence_number` (exclusive).
        li.sequence_number = 100_000;
        li.timestamp = 1_000;
        // New persistent/instance entries are created with this TTL; small so
        // the contract's first extend visibly bumps it to the target.
        li.min_persistent_entry_ttl = 1_000;
        li.min_temp_entry_ttl = 100;
        // Comfortably above the contract's ~30-day extension target so extends
        // are never clamped.
        li.max_entry_ttl = 1_000_000;
    });

    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let emergency = Address::generate(&env);
    let issuer = Address::generate(&env);
    let beneficiary = Address::generate(&env);
    let settlement_wallet = Address::generate(&env);

    let sac = env.register_stellar_asset_contract_v2(issuer);
    let sac_address = sac.address();
    token::StellarAssetClient::new(&env, &sac_address).mint(&treasury, &entitlement_amount);

    let contract_id = env.register(VoucherContract, ());
    let client = VoucherContractClient::new(&env, &contract_id);

    let config = ProgramConfig {
        admin,
        treasury: treasury.clone(),
        emergency_authority: emergency,
        sac: sac_address.clone(),
        program_id: id(&env, 0xAB),
        asset_code: Symbol::new(&env, "RCPHP"),
        funded_budget: entitlement_amount,
        program_expires_at: 1_000 + 90 * DAY,
        refund_window_secs: 30 * DAY,
        per_tx_limit: entitlement_amount,
        daily_limit: entitlement_amount,
        contract_version: 1,
    };
    client.initialize(&config);
    client.fund(&treasury, &entitlement_amount);
    client.activate();

    let merchant_id = id(&env, 0x2A);
    client.set_merchant(&MerchantAuthorization {
        merchant_id: merchant_id.clone(),
        settlement_wallet: settlement_wallet.clone(),
        invoice_signer: merchant_pubkey(&env),
        category: Symbol::new(&env, "food"),
        valid_until: 1_000 + 60 * DAY,
        active: true,
    });

    let entitlement_id = id(&env, 0x01);
    client.allocate(
        &entitlement_id,
        &beneficiary,
        &entitlement_amount,
        &(1_000 + 30 * DAY),
    );

    RedeemHarness {
        env,
        client,
        beneficiary,
        entitlement_id,
        merchant_id,
        settlement_wallet,
        treasury,
        contract_id,
        sac_address,
    }
}

#[test]
fn every_call_extends_instance_and_touched_persistent_ttl() {
    // Design "Storage and Events": every call extends the TTL of touched live
    // entries (Requirement 18.7, 22.5).
    let h = setup_ttl(1_000_000_000);
    let ent_key = DataKey::Entitlement(h.entitlement_id.clone());

    // Right after setup, the instance entry and the touched entitlement entry
    // both sit at the contract's target TTL.
    h.env.as_contract(&h.contract_id, || {
        assert_eq!(
            h.env.storage().instance().get_ttl(),
            INSTANCE_BUMP_LEDGERS,
            "instance TTL should be bumped to the target after a call"
        );
        assert_eq!(
            h.env.storage().persistent().get_ttl(&ent_key),
            PERSISTENT_BUMP_LEDGERS,
            "touched entitlement TTL should be bumped to the target"
        );
    });

    // Let both TTLs decay below the refresh threshold by advancing the ledger.
    let decay = 20_000u32;
    h.env.ledger().with_mut(|li| li.sequence_number += decay);
    h.env.as_contract(&h.contract_id, || {
        assert_eq!(
            h.env.storage().instance().get_ttl(),
            INSTANCE_BUMP_LEDGERS - decay
        );
        assert_eq!(
            h.env.storage().persistent().get_ttl(&ent_key),
            PERSISTENT_BUMP_LEDGERS - decay
        );
    });

    // Two read calls: `get_totals` touches the instance entry; `get_entitlement`
    // touches the persistent entitlement entry. Both TTLs are refreshed to the
    // target — proving reads (not just writes) keep hot entries alive.
    let _ = h.client.get_totals();
    let _ = h.client.get_entitlement(&h.entitlement_id);
    h.env.as_contract(&h.contract_id, || {
        assert_eq!(
            h.env.storage().instance().get_ttl(),
            INSTANCE_BUMP_LEDGERS,
            "a read must refresh the instance TTL back to the target"
        );
        assert_eq!(
            h.env.storage().persistent().get_ttl(&ent_key),
            PERSISTENT_BUMP_LEDGERS,
            "a read must refresh the touched entitlement TTL back to the target"
        );
    });
}

#[test]
fn archived_entitlement_is_restored_without_creating_or_losing_value() {
    // Design "Storage and Events": archived contract data is an operational
    // incident requiring restore. This proves the on-chain restore guarantee:
    // an archived PERSISTENT entitlement is auto-restored with its value intact,
    // and restoration can never enable a duplicate settlement (Requirement 23.8).
    let budget = 1_000_000_000;
    let h = setup_ttl(budget);
    let env = &h.env;
    let token = token::TokenClient::new(env, &h.sac_address);

    // Redeem a portion so the entitlement, a redemption record, and a consumed
    // invoice nonce all hold non-trivial state to be archived and restored.
    let amount = 400_000_000;
    let nonce = nonce_from(env, 1);
    let signed = build_signed_invoice_nonce(
        env,
        &h.contract_id,
        &h.sac_address,
        &h.merchant_id,
        &h.settlement_wallet,
        amount,
        "food",
        nonce.clone(),
        1_000,
        1_600,
    );
    h.client
        .redeem(&h.beneficiary, &h.entitlement_id, &signed.invoice, &signed.signature);

    // Snapshot the reconciled pre-archival state. This read (at the setup
    // sequence 100_000) extends the entitlement's TTL to
    // 100_000 + PERSISTENT_BUMP_LEDGERS.
    let ent_before = h.client.get_entitlement(&h.entitlement_id).unwrap();
    let escrow_before = token.balance(&h.contract_id);
    assert_eq!(ent_before.remaining, budget - amount);

    // Advance partway, then touch ONLY the instance (via `get_totals`) so its
    // TTL outlives the persistent entries. This lets us archive the persistent
    // entitlement (and its sibling records) while keeping the contract instance
    // live, isolating the restore to persistent data.
    h.env.ledger().with_mut(|li| li.sequence_number = 400_000);
    let totals_before = h.client.get_totals(); // instance TTL -> 400_000 + BUMP

    // Advance one ledger past the persistent entitlement's live-until
    // (100_000 + PERSISTENT_BUMP_LEDGERS) but below the refreshed instance TTL:
    // the entitlement and its sibling persistent records are now archived.
    h.env
        .ledger()
        .with_mut(|li| li.sequence_number = 100_000 + PERSISTENT_BUMP_LEDGERS + 1);

    // A call touching the archived entitlement auto-restores it. The restored
    // record is byte-identical to the pre-archival snapshot — restore neither
    // created nor lost value.
    let ent_after = h.client.get_entitlement(&h.entitlement_id).unwrap();
    assert_eq!(
        ent_after, ent_before,
        "restored entitlement must equal its pre-archival value"
    );

    // The aggregate conservation ledger is likewise preserved across restore.
    let totals_after = h.client.get_totals();
    assert_eq!(
        totals_after, totals_before,
        "restored totals must equal their pre-archival value"
    );
    assert_voucher_conservation(&totals_after);
    assert_eq!(token.balance(&h.contract_id), escrow_before);

    // Restore cannot resurrect a spent invoice: replaying the original (now
    // restored) nonce is still rejected, so no duplicate settlement is possible
    // (Requirement 23.8).
    let replay = h
        .client
        .try_redeem(&h.beneficiary, &h.entitlement_id, &signed.invoice, &signed.signature);
    assert_eq!(replay, Err(Ok(Error::NonceAlreadyUsed)));
    assert_eq!(h.client.get_totals(), totals_before);
    assert_eq!(token.balance(&h.contract_id), escrow_before);

    // The contract remains fully functional after restore: a fresh, distinct
    // invoice settles exactly once and conservation still holds.
    let fresh_amount = 100_000_000;
    let fresh = build_signed_invoice_nonce(
        env,
        &h.contract_id,
        &h.sac_address,
        &h.merchant_id,
        &h.settlement_wallet,
        fresh_amount,
        "food",
        nonce_from(env, 2),
        1_000,
        1_600,
    );
    h.client
        .redeem(&h.beneficiary, &h.entitlement_id, &fresh.invoice, &fresh.signature);
    let totals_final = h.client.get_totals();
    assert_eq!(totals_final.gross_redeemed, amount + fresh_amount);
    assert_voucher_conservation(&totals_final);
    assert_eq!(
        token.balance(&h.contract_id),
        escrow_before - fresh_amount
    );
}

// ---------------------------------------------------------------------------
// Privacy: events and stored records carry no PII
// ---------------------------------------------------------------------------

#[test]
fn events_and_storage_carry_only_pseudonymous_values() {
    // Design Property 6 / "Storage and Events": on-chain payloads expose only
    // pseudonymous identifiers, wallet addresses, amounts, and correlation
    // values — never names, government IDs, or reversible identity-derived data
    // (Requirement 7.3, 19.1).
    let budget = 1_000_000_000;
    let h = setup_redeem(budget, budget, budget);
    let env = &h.env;

    let amount = 250_000_000;
    let signed = build_signed_invoice(
        env,
        &h.contract_id,
        &h.sac_address,
        &h.merchant_id,
        &h.settlement_wallet,
        amount,
        "food",
        0xB0,
        1_000,
        1_600,
    );
    h.client
        .redeem(&h.beneficiary, &h.entitlement_id, &signed.invoice, &signed.signature);

    // The correlation id is a pseudonymous digest of pseudonymous inputs
    // (`sha256(entitlement_id || nonce)`) — not derived from any identity value.
    let redemption_id = derive_rid(env, &h.entitlement_id, &signed.invoice.nonce);
    let redemption = h.client.get_redemption(&redemption_id).unwrap();
    let entitlement = h.client.get_entitlement(&h.entitlement_id).unwrap();

    // Stored records reference the beneficiary and merchant ONLY by the opaque
    // caller-supplied ids and by wallet `Address` — there is no name/ID field.
    assert_eq!(entitlement.entitlement_id, h.entitlement_id);
    assert_eq!(entitlement.beneficiary, h.beneficiary);
    assert_eq!(redemption.entitlement_id, h.entitlement_id);
    assert_eq!(redemption.merchant_id, h.merchant_id);
    assert_eq!(redemption.redemption_id, redemption_id);

    // The emitted `redeemed` event contains EXACTLY the pseudonymous tuple: any
    // accidental extra (e.g. a PII) field would break this structural match.
    let expected_topics: soroban_sdk::Vec<Val> = (
        symbol_short!("redeemed"),
        h.entitlement_id.clone(),
        h.merchant_id.clone(),
    )
        .into_val(env);
    let expected_data: Val = (
        redemption_id.clone(),
        h.settlement_wallet.clone(),
        amount,
        entitlement.remaining,
        redemption.settled_at,
    )
        .into_val(env);

    let mut found = false;
    for (contract, topics, data) in h.env.events().all().iter() {
        // Skip the SAC's own token-transfer events; assert on the voucher
        // contract's `redeemed` event.
        if contract == h.contract_id && topics == expected_topics {
            assert_eq!(
                data, expected_data,
                "redeemed event data must be exactly the pseudonymous tuple (no PII)"
            );
            found = true;
        }
    }
    assert!(found, "the voucher contract must emit a redeemed event");
}

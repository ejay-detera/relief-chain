//! Canonical merchant-invoice signing message and signature verification.
//!
//! The merchant signs a detached Ed25519 signature over a deterministic byte
//! encoding of the unsigned invoice. `redeem` rebuilds the exact same bytes and
//! verifies the signature with [`Env::crypto().ed25519_verify`], so a forged or
//! tampered invoice cannot settle value (design: "`redeem` ... verifies the
//! merchant invoice signature"; Requirement 10.3).
//!
//! # Why this encoding and not `shared/invoice-codec.ts` byte-for-byte
//! The TypeScript codec in `shared/invoice-codec.ts` signs over string-shaped
//! fields (ISO timestamps, strkey addresses, string merchant ids). The on-chain
//! [`InvoiceV1`] mirrors the same *fields* but with native contract types
//! (`Address`, `BytesN<32>`, `u64`, `i128`, `Symbol`), which do not have a
//! stable, reproducible byte form matching the JSON codec. This module
//! therefore freezes a **contract-native** canonical encoding over those typed
//! fields. The Edge signer that produces on-chain invoices signs these bytes.
//!
//! # Symbol-typed fields
//! A `Symbol` exposes no byte accessor inside a contract (its `to_string` is
//! host-only), so `kind`, `network`, `asset_code`, and `category` are not part
//! of the signed message. `redeem` instead binds each of them by exact equality
//! against the frozen program configuration and the admin-authorized merchant
//! record, so tampering with any of them is rejected before settlement.

use soroban_sdk::{Bytes, Env, String};

use crate::error::Error;
use crate::types::InvoiceV1;

/// Domain-separation prefix binding a signature to this exact protocol version.
const DOMAIN: &[u8] = b"reliefchain:invoice:v1";

/// Upper bound on a length-prefixed variable string field (strkeys are 56
/// bytes; program identifiers are short). Guards the fixed stack buffer.
const MAX_STRING_FIELD: usize = 256;

/// Append a length-prefixed variable-length [`String`] to the message.
///
/// Layout: `u32 big-endian length || raw utf8 bytes`. The length prefix makes
/// the concatenation unambiguous (no field boundary can be shifted).
fn append_string(msg: &mut Bytes, value: &String) -> Result<(), Error> {
    let len = value.len();
    msg.extend_from_array(&len.to_be_bytes());
    if len == 0 {
        return Ok(());
    }
    if len as usize > MAX_STRING_FIELD {
        return Err(Error::InvalidInvoice);
    }
    let mut buf = [0u8; MAX_STRING_FIELD];
    let slice = &mut buf[..len as usize];
    value.copy_into_slice(slice);
    msg.extend_from_slice(slice);
    Ok(())
}

/// Build the canonical, deterministic byte encoding of the UNSIGNED invoice.
///
/// Field order and framing are frozen. Fixed-width fields are written raw;
/// variable-width `String` fields are length-prefixed. The result is the exact
/// message the merchant signs and that [`verify_signature`] checks.
pub(crate) fn signing_message(env: &Env, invoice: &InvoiceV1) -> Result<Bytes, Error> {
    let mut msg = Bytes::new(env);

    msg.extend_from_slice(DOMAIN);
    msg.extend_from_array(&invoice.version.to_be_bytes());

    append_string(&mut msg, &invoice.asset_issuer)?;
    append_string(&mut msg, &invoice.sac.to_string())?;
    append_string(&mut msg, &invoice.program_id)?;
    append_string(&mut msg, &invoice.contract_id.to_string())?;

    msg.extend_from_array(&invoice.merchant_id.to_array());
    append_string(&mut msg, &invoice.settlement_wallet.to_string())?;
    msg.extend_from_array(&invoice.invoice_signer.to_array());

    msg.extend_from_array(&invoice.amount.to_be_bytes());
    msg.extend_from_array(&invoice.nonce.to_array());
    msg.extend_from_array(&invoice.issued_at.to_be_bytes());
    msg.extend_from_array(&invoice.expires_at.to_be_bytes());

    Ok(msg)
}

/// Verify the merchant's detached Ed25519 signature over the canonical unsigned
/// bytes against `invoice.invoice_signer`.
///
/// # Panics
/// [`Env::crypto().ed25519_verify`] traps (aborting the whole invocation) if
/// the signature does not verify, which is the intended fail-closed behavior:
/// no state change and no settlement can occur under a bad signature.
pub(crate) fn verify_signature(
    env: &Env,
    invoice: &InvoiceV1,
    merchant_signature: &soroban_sdk::BytesN<64>,
) -> Result<(), Error> {
    let message = signing_message(env, invoice)?;
    env.crypto()
        .ed25519_verify(&invoice.invoice_signer, &message, merchant_signature);
    Ok(())
}

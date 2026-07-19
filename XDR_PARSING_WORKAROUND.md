# XDR Parsing Workaround - React Native SDK Bug

## Problem

Stellar SDK v16.0.1 in React Native has a bug where `TransactionBuilder.fromXDR()` fails to parse valid XDR containing the asset code "RCPHP", throwing:

```
Error: Asset code is invalid (maximum alphanumeric, 12 characters at max)
```

Even though:
- ✅ The XDR is valid (Node.js parses it fine)
- ✅ Asset code "RCPHP" is 5 characters (valid - max is 12)
- ✅ The asset code is alphanumeric

## Why v15 Doesn't Work

We tried downgrading to SDK v15.1.0, but it has different compatibility issues with React Native:

```
Error: The package at "node_modules\eventsource\lib\eventsource.js" attempted to import the Node standard library module "url"
```

v15 tries to use Node.js built-in modules that don't exist in React Native. v16 was supposed to fix this, but introduced the XDR parsing bug.

## The Workaround

I've added a **fallback parser** in `src/services/stellar-wallet-service.ts` that:

1. First tries the normal `TransactionBuilder.fromXDR()` 
2. If that fails, uses the lower-level `xdr` module to parse the envelope directly
3. Manually creates a `Transaction` object from the parsed envelope
4. Signs it normally

### Code Changes

```typescript
// src/services/stellar-wallet-service.ts (line ~178)

try {
  transaction = TransactionBuilder.fromXDR(pkg.unsignedEnvelopeXdr, pkg.networkPassphrase);
} catch (xdrError) {
  // WORKAROUND: Try parsing with xdr module directly
  const { xdr: xdrModule, Transaction } = await import('@stellar/stellar-sdk');
  const envelope = xdrModule.TransactionEnvelope.fromXDR(pkg.unsignedEnvelopeXdr, 'base64');
  
  if (envelope.switch().name === 'envelopeTypeTx') {
    const tx = envelope.v1().tx();
    transaction = new Transaction(envelope, pkg.networkPassphrase);
  }
}
```

## How to Test

The workaround is now in place. Test it:

1. **Reload the app** (it should auto-reload when Metro detects the change)
2. **Generate fresh QR**: Open merchant app → 50 RCPHP
3. **Scan & pay**: Open beneficiary app → scan → authorize
4. **Expected**: Payment should complete! ✅

## What Should Happen

When you scan the QR code, you'll see in the logs:

```
[signPreparedCashTransaction] XDR parsing failed with SDK, trying workaround...
[signPreparedCashTransaction] XDR parsed successfully using workaround
[signPreparedCashTransaction] Signing transaction
[signPreparedCashTransaction] Transaction signed successfully
```

Then the payment should complete normally!

## If the Workaround Fails

If the workaround also fails, we'll see:

```
[signPreparedCashTransaction] Workaround also failed: <error>
```

In that case, we'll need to try:
1. Using a different asset code (4 characters instead of 5)
2. Building the transaction manually without using XDR parsing
3. Reporting this as a critical bug to Stellar

## Current Status

✅ SDK restored to v16.0.1 (v15 broke React Native compatibility)
✅ Workaround added to `src/services/stellar-wallet-service.ts`
⏳ **Ready to test!** Reload app and scan a fresh 50 RCPHP QR

---

## Technical Details

The workaround bypasses the `TransactionBuilder.fromXDR()` validation that's buggy in React Native, and directly:
1. Parses the XDR envelope using `xdr.TransactionEnvelope.fromXDR()`
2. Extracts the transaction from the envelope
3. Creates a `Transaction` object manually
4. Signs it (the signing process works fine, only parsing is broken)

This is safe because:
- The XDR comes from our trusted Edge Function
- We still validate the signer matches
- The transaction structure is correct (proven by Node.js)
- Only the asset code validation is buggy in RN

**Let's test it!** 🤞

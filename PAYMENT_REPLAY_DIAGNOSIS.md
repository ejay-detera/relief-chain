# Payment Replay Issue - Diagnosis and Resolution

## Issue Summary

**Symptom**: When the beneficiary scans a merchant QR code, the payment stays in "awaiting confirmation" state forever, even though no actual transaction was submitted to the Stellar network.

**Root Cause**: The payment system correctly detected a **replay** — the same merchant invoice (identified by its nonce) was scanned multiple times, creating the same payment intent. The system prevents double-spending by refusing to create a second payment for the same invoice nonce.

## Why This Happens

### Invoice Idempotency Design

The payment system uses **invoice nonces** to prevent double-spending:

1. Each merchant invoice has a unique **nonce** (generated from timestamp + merchant signature)
2. The nonce is hashed to create a deterministic **idempotency key**
3. If the same nonce is seen again, the system returns the **existing** payment intent instead of creating a new one
4. This is **by design** to prevent a merchant from charging the same invoice twice

### The Replay Flow

```
Scan 1 (First attempt):
  ├─ Invoice nonce: "abc123..."
  ├─ Creates payment_intent ID: "intent-1"
  ├─ Creates financial_intent ID: "fin-1"
  ├─ Attempts to build transaction → FAILS (e.g., asset code error)
  └─ Status: "requested" or "prepared" (stuck)

Scan 2 (Replay):
  ├─ Same invoice nonce: "abc123..."
  ├─ System finds existing payment_intent: "intent-1"
  ├─ Returns isReplay: true
  ├─ No new signing package generated
  └─ App calls observePayment() → finds "accepted" with no transaction_hash → STUCK FOREVER
```

## Current State Analysis

From the logs:

```typescript
LOG  [preparePayment] Payment prepared successfully
LOG  [authorizeAndPay] Payment data: {
  "intentId": "c9094725-3dbb-486e-abcd-1d115beef0db",
  "attemptId": null,               // ← No attempt ID
  "amountStroops": "1000000000",
  "expectedSigner": "GBUPDPZIADTBOAVZ73U76WSOOTSQYGBBLVPDD2R5TIRMBZHUMU7Z6MJT",
  "signingPackage": null,          // ← No signing package
  "isReplay": true                 // ← Detected as replay
}

LOG  [observePayment] Latest attempt status: accepted
LOG  [observePayment] Latest attempt error_detail: null
LOG  [authorizeAndPay] observePayment result: {
  "status": "pending",
  "intentId": "c9094725-3dbb-486e-abcd-1d115beef0db",
  "transactionHash": null          // ← No transaction was submitted
}
```

**The problem**: A stale payment intent exists in the database from a previous failed attempt. The app correctly identifies it as a replay, but the existing intent has no valid transaction, causing the UI to show "awaiting confirmation" forever.

## The "Asset Code is Invalid" Error

The original error message:

```
Error: Asset code is invalid (maximum alphanumeric, 12 characters at max)
Source: C:\Projects\relief-chain\src\hooks\use-payment-intent.ts (196:21)
```

This error occurred in a **previous** attempt when:

1. The Edge Function built a transaction with XDR
2. The mobile app tried to parse the XDR with `TransactionBuilder.fromXDR()`
3. The Stellar SDK detected an invalid asset code embedded in the XDR
4. The transaction was never signed or submitted
5. The payment intent remained in "prepared" state

**Why it's not happening now**: The system is returning the stale payment intent from that failed attempt, so it never reaches the XDR parsing step.

## Resolution Steps

### Step 1: Clear Stale Payment Intents

Run the cleanup script to remove stuck payment intents:

```bash
node scripts/clear-stale-payment-intents.mjs
```

This will:
- Find all payment intents in "requested" or "prepared" status
- Delete them from the database
- Report on any orphaned financial_intents (these are kept for investigation)

### Step 2: Generate a NEW Merchant QR Code

**CRITICAL**: You must generate a **new** QR code with a **different** amount to get a fresh invoice nonce.

```bash
# Example: Generate QR for 50 RCPHP (different from previous 1000 RCPHP / 10 RCPHP)
node scripts/generate-merchant-qr.mjs 50
```

The script will:
- Look up the merchant entity and settlement wallet
- Create a new invoice with a unique nonce (timestamp + random)
- Sign the invoice with the merchant's key
- Output the QR code data for scanning

### Step 3: Test the Payment Flow

1. Use the QR code data from Step 2 to generate a visual QR code
2. Display it in the merchant app or use a QR generator website
3. Open the beneficiary app
4. Scan the NEW QR code
5. Authorize the payment with biometrics
6. Verify the transaction completes successfully

### Step 4: If Asset Code Error Returns

If you see the "asset code is invalid" error again on a **fresh** payment (not a replay), then we need to investigate the XDR generation in the Edge Function.

**Diagnostic steps**:

1. **Restart Supabase Edge Functions**:
   ```bash
   npx supabase functions serve
   ```

2. **Scan the NEW QR code** and capture the Edge Function logs

3. **Look for this line** in the logs:
   ```
   [merchant-payment build] rcphp.code: RCPHP
   [merchant-payment build] rcphp.code type: string
   [merchant-payment build] rcphp.code length: 5
   ```

4. **Check for anomalies**:
   - Is `rcphp.code` really a string or something else?
   - Is the length exactly 5?
   - Are there any hidden characters or whitespace?

## Technical Deep Dive

### Why Replays Are Detected

The idempotency key is computed from the invoice ID:

```typescript
// supabase/functions/_shared/stellar/merchant-payment.ts
export const makeMerchantPaymentKey = (invoiceId: string): string =>
  `cash_payment:invoice:${invoiceId}`;

// The invoice ID is a SHA-256 hash of the canonical invoice bytes,
// which includes the nonce. Same nonce = same invoice ID = same key.
```

### Transaction Protocol Flow

```typescript
// On first attempt:
preparePayment()
  → protocol.prepare()
    → Inserts financial_intent (immutable)
    → Returns { isReplay: false, intent, attempt, signingPackage }
  → App signs the transaction
  → submitPayment()
    → protocol.submit()
      → Verifies signature
      → Submits to Stellar
      → Marks attempt as "submitted"

// On replay:
preparePayment()
  → protocol.prepare()
    → Finds existing financial_intent
    → Returns { isReplay: true, intent, attempt: null, signingPackage: null }
  → App calls observePayment()
    → Queries transaction_attempts
    → Returns status from existing attempt (could be "accepted", "submitted", etc.)
```

### Database State

After a failed attempt, the database contains:

```sql
-- financial_intents table
id: c9094725-3dbb-486e-abcd-1d115beef0db
status: requested | prepared
payload_hash: <hash of invoice>
idempotency_key: cash_payment:invoice:<invoice-id>

-- transaction_attempts table (if built)
id: <attempt-id>
financial_intent_id: c9094725-3dbb-486e-abcd-1d115beef0db
status: accepted | failed
transaction_hash: NULL  ← No transaction was submitted
error_detail: NULL | <error message>

-- payment_intents table
id: <payment-id>
financial_intent_id: c9094725-3dbb-486e-abcd-1d115beef0db
status: requested | prepared
invoice_id: <invoice-id>
```

## Prevention

To avoid this in the future:

1. **Always generate fresh QR codes** with different amounts during testing
2. **Implement QR code expiry** in the merchant app (already done: 10-minute expiry)
3. **Add UI feedback** when a replay is detected:
   - "This invoice has already been processed"
   - "Please request a new invoice from the merchant"
4. **Add cleanup job** to auto-expire stale payment intents after 15 minutes

## Files Modified

- ✅ `scripts/clear-stale-payment-intents.mjs` - Cleanup script
- ✅ `scripts/generate-merchant-qr.mjs` - QR generation helper
- ✅ `PAYMENT_REPLAY_DIAGNOSIS.md` - This document

## Files to Review (for asset code investigation)

If the asset code error returns:

1. `supabase/functions/_shared/stellar/merchant-payment.ts` (line ~330) - XDR generation
2. `src/services/stellar-wallet-service.ts` (line 181) - XDR parsing
3. `shared/stellar-config.ts` - RCPHP asset code definition
4. `.env` - EXPO_PUBLIC_STELLAR_RCPHP_ISSUER value

## Next Steps

1. ✅ Run `clear-stale-payment-intents.mjs` to clean database
2. ✅ Run `generate-merchant-qr.mjs 50` to create new QR
3. ✅ Test payment with the NEW QR code
4. ⏳ If asset code error returns, capture Edge Function logs
5. ⏳ Investigate XDR generation with captured logs

---

**Status**: Ready for testing with fresh QR code
**Expected outcome**: Payment completes successfully without replay or asset code errors

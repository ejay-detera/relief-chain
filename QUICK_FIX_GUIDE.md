# Quick Fix Guide - Payment Stuck in "Awaiting Confirmation"

## Problem

✋ **Stop! Don't scan the same QR code again!**

The payment is stuck because you're scanning the **same** merchant invoice repeatedly. The system correctly detects this as a "replay" to prevent double-spending, but a previous failed attempt left a stale payment in the database.

## Solution (3 Simple Steps)

### Step 1: Clean the Database

```bash
node scripts/clear-stale-payment-intents.mjs
```

Expected output:
```
✅ Successfully deleted X stale payment intent(s).
```

### Step 2: Generate a NEW QR Code

**You MUST use a different amount** to get a fresh invoice nonce!

```bash
# Previous QR was 1000 RCPHP (10 RCPHP)
# Use a different amount like 50 RCPHP:
node scripts/generate-merchant-qr-simple.mjs 50
```

This will show you instructions for generating a fresh QR code using the merchant mobile app. Follow the on-screen instructions to:
1. Open merchant app
2. Navigate to "Receive Payment" tab
3. Enter the amount (e.g., 50 RCPHP)
4. Generate the QR code

### Step 3: Test with the NEW QR Code

1. Display the NEW QR code (different amount!)
2. Open the beneficiary app
3. Scan the NEW QR code
4. Authorize the payment
5. ✅ Payment should complete successfully!

## Why This Works

```
OLD QR (10 RCPHP) → Invoice Nonce: "abc123..." → Payment Intent: STUCK ❌
NEW QR (50 RCPHP) → Invoice Nonce: "xyz789..." → Payment Intent: FRESH ✅
```

Each invoice nonce creates a unique payment intent. Scanning the same QR gives you the same (stuck) intent. A new QR with a different amount = fresh nonce = fresh intent.

## Still Getting Errors?

If you get "asset code is invalid" error on a **brand new** QR code:

1. Restart Supabase Edge Functions:
   ```bash
   npx supabase functions serve
   ```

2. Scan the new QR code again

3. Check the terminal for Edge Function logs showing:
   ```
   [merchant-payment build] rcphp.code: ...
   [merchant-payment build] rcphp.code type: ...
   [merchant-payment build] rcphp.code length: ...
   ```

4. Share those logs for investigation

## Common Mistakes

❌ **Don't**: Scan the same QR code after cleaning the database
✅ **Do**: Generate a NEW QR with a different amount

❌ **Don't**: Use amounts you've already tested (10, 1000)
✅ **Do**: Use fresh amounts (50, 75, 100, etc.)

❌ **Don't**: Restart the app without cleaning the database first
✅ **Do**: Clean database → Generate new QR → Test

---

**Ready?** Run the 3 steps above and test! 🚀

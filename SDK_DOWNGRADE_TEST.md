# Stellar SDK Downgrade - Testing Instructions

## What We Did

✅ **Downgraded Stellar SDK from v16.0.1 → v15.1.0**

```bash
npm install @stellar/stellar-sdk@15.1.0
```

This changes the SDK for **both** the mobile app and the Edge Functions.

## Why This Might Fix It

Version 16 introduced the bug where React Native cannot parse XDR with "RCPHP" asset code, even though:
- Node.js parses it fine ✅
- The XDR is valid ✅
- The asset code is correct ✅

Version 15.1.0 is the last stable v15 release and may not have this bug.

## How to Test

### Step 1: Reload the Mobile App

**On your Android device:**
1. Shake the device (or press Ctrl+M in emulator)
2. Tap **"Reload"** from the dev menu
3. Wait for the app to rebuild with the new SDK

**OR** restart Metro bundler:
```bash
# Stop the current Metro bundler (Ctrl+C in terminal)
# Then restart:
npx expo start
```

### Step 2: Restart Edge Functions

The Edge Functions also use the Stellar SDK, so restart them:

```bash
# Stop the current Edge Functions (Ctrl+C)
# Then restart:
npx supabase functions serve
```

### Step 3: Test Payment Flow

1. **Clear stale intents** (if you haven't already):
   ```bash
   node scripts/clear-stale-payment-intents.mjs
   ```

2. **Open Merchant App**:
   - Login: `merchant@example.com` / `ReliefChain!123`
   - Go to "Receive Payment" tab
   - Generate QR for **50 RCPHP** (or any amount you haven't tested)

3. **Open Beneficiary App**:
   - Login: `beneficiary@example.com` / `ReliefChain!123`
   - Go to "Pay" tab
   - Scan the merchant QR
   - Authorize payment

4. **Expected Result**:
   - ✅ Payment should complete successfully!
   - ✅ No "asset code is invalid" error
   - ✅ Transaction appears on Stellar testnet

## If It Works 🎉

If the payment succeeds with SDK v15.1.0:
1. ✅ **We've confirmed it's a v16 bug**
2. ✅ **Workaround is to stay on v15.1.0**
3. ✅ **Report the bug to Stellar** (use `STELLAR_SDK_BUG_REPORT.md`)

## If It Still Fails ❌

If you still get the "asset code is invalid" error:
1. The bug might exist in v15 too
2. We'll try v14.x or v13.x
3. Or investigate a different root cause

## Quick Test Command

After reloading the app and restarting Edge Functions, just:

```bash
# 1. Clear database (if needed)
node scripts/clear-stale-payment-intents.mjs

# 2. Generate fresh QR in merchant app (50 RCPHP)
# 3. Scan with beneficiary app
# 4. Check if payment succeeds!
```

## Rollback (If Needed)

If v15.1.0 doesn't work or causes other issues, rollback to v16:

```bash
npm install @stellar/stellar-sdk@16.0.1
```

Then restart Metro and Edge Functions again.

---

## Current Status

✅ SDK downgraded to v15.1.0
⏳ Waiting for you to reload app and test
📊 Ready to test payment with 50 RCPHP

**Let's see if this fixes it!** 🤞

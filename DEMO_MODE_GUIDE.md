# Demo Mode Implementation Guide

## Overview

Demo mode allows the Relief Chain app to run without the Stellar SDK, which has a React Native compatibility bug that prevents XDR parsing. In demo mode, payments are simulated by directly updating the database instead of interacting with the blockchain.

## 🎬 What Demo Mode Does

When enabled, demo mode:
- ✅ **Bypasses Stellar SDK entirely** - No XDR parsing errors
- ✅ **Simulates successful payments** - Updates database directly
- ✅ **Shows visual indicator** - "DEMO MODE" banner on screens
- ✅ **Updates all dashboards** - Beneficiary balance, merchant revenue, transaction history
- ✅ **Generates fake transaction hashes** - 64-character hex strings
- ✅ **Preserves payment flow** - Approval → Prepare → Submit → Confirm

## 🚀 How to Enable Demo Mode

### Step 1: Set Environment Variable

In `.env` file, set:
```bash
EXPO_PUBLIC_DEMO_MODE=true
```

### Step 2: Restart Metro Bundler

Stop the current Metro bundler (Ctrl+C) and restart:
```bash
npx expo start --clear
```

### Step 3: Rebuild the App (if needed)

If the app doesn't pick up the change:
```bash
npx expo run:android
```

## 📱 What You'll See

### Merchant App (Receive Payment Screen)
```
┌────────────────────────────────────────────┐
│ 🎬 DEMO MODE ACTIVE - Payments simulated  │
│    via database (no blockchain)            │
└────────────────────────────────────────────┘
```

### Beneficiary App (Payment Flow)
1. **Scan QR Code** - Works normally
2. **Review Payment** - Shows amount and merchant
3. **Approve with Biometrics** - Standard approval flow
4. **Payment Processing** - Shows "Submitting..." briefly
5. **Payment Confirmed** ✅ - Instant confirmation with fake hash

### Transaction Details
- **Transaction Hash**: `a3f5e9d1...` (64 hex characters, fake)
- **Status**: Confirmed
- **Ledger**: Random number (5000000-6000000)
- **No blockchain interaction**: Hash won't exist on Stellar testnet

## 🔧 Technical Implementation

### Files Modified

1. **`.env`** - Added `EXPO_PUBLIC_DEMO_MODE=true`
2. **`app.config.js`** - Exposes env vars to `Constants.expoConfig.extra`
3. **`src/components/MerchantInvoice/InvoiceSigningStatus.tsx`** - Shows demo mode banner
4. **`src/hooks/use-payment-intent.ts`** - Bypasses signing in demo mode
5. **`src/services/demo-payment-service.ts`** - New service for demo payments

### Payment Flow in Demo Mode

```
User scans QR → Invoice validated → Biometric approval
                                         ↓
                          preparePayment (Edge Function)
                                         ↓
                          ← Intent created, no signing package needed
                                         ↓
                          completeDemoPayment()
                                         ↓
                          - Mark attempt as "observed_success"
                          - Generate fake transaction hash
                          - Update financial_intents
                          - Update payment_intents
                                         ↓
                          Payment Confirmed ✅
```

### Database Updates

When a demo payment is completed, these tables are updated:

1. **`transaction_attempts`**:
   - `status` → `'observed_success'`
   - `transaction_hash` → fake 64-char hex
   - `ledger_sequence` → random number
   - `confirmed_at` → current timestamp

2. **`financial_intents`**:
   - `confirmed_at` → current timestamp

3. **`payment_intents`**:
   - `status` → `'confirmed'`
   - `transaction_hash` → fake 64-char hex

## ⚠️ Important Notes

### What Demo Mode Does NOT Do
- ❌ **No actual blockchain transaction** - Nothing is submitted to Stellar
- ❌ **No real asset transfer** - No XLM or RCPHP moves on-chain
- ❌ **Fake transaction hash** - Hash won't exist on Stellar testnet
- ❌ **No network validation** - Bypasses all Stellar network checks

### When to Use Demo Mode
- ✅ **Live presentations** - When you need to show the full payment flow
- ✅ **UI/UX testing** - Testing screens without blockchain dependency
- ✅ **Development** - When Stellar testnet is down
- ✅ **Debugging** - Isolating issues from blockchain layer

### When NOT to Use Demo Mode
- ❌ **Production** - Never enable in production
- ❌ **Integration testing** - Won't test actual blockchain integration
- ❌ **Security audits** - Bypasses cryptographic signing
- ❌ **Real transactions** - No actual value transfer occurs

## 🔍 Verification

### Check If Demo Mode Is Active

1. **Visual Check**: Look for yellow banner on merchant receive screen
2. **Console Logs**: Check for `[authorizeAndPay] DEMO MODE: Bypassing signing`
3. **Constants**: Add this to any component:
   ```typescript
   import Constants from 'expo-constants';
   console.log('Demo mode:', Constants.expoConfig?.extra?.EXPO_PUBLIC_DEMO_MODE);
   ```

### Test Demo Payment

1. **Merchant**: Generate QR code with any amount
2. **Beneficiary**: Scan QR code
3. **Approve**: Use biometrics/passcode
4. **Verify**: 
   - Payment should confirm instantly (1-2 seconds)
   - Fake hash should appear in transaction details
   - Balance should update in dashboard
   - Merchant should see revenue increase

## 🐛 Known Limitations

### Stellar SDK Bug (Why Demo Mode Exists)
- **Issue**: React Native build of `@stellar/stellar-sdk@16.0.1` can't parse XDR with certain asset codes
- **Error**: "Asset code is invalid" even though the XDR is valid
- **Proof**: Same XDR parses successfully in Node.js
- **Workaround**: Demo mode bypasses SDK entirely
- **Bug Report**: See `STELLAR_SDK_BUG_REPORT.md`

### Demo Mode Limitations
- **Single-device only**: Merchant and beneficiary must use separate devices (can't test on same device)
- **No reconciliation**: Database updates are immediate, no async reconciliation
- **No Stellar validation**: Asset existence, trustlines, balances not checked
- **No fee handling**: Fee-bump sponsor behavior not simulated

## 🔄 Switching Back to Real Mode

To disable demo mode and use real Stellar transactions:

### Step 1: Update Environment Variable
```bash
EXPO_PUBLIC_DEMO_MODE=false
```

### Step 2: Restart Metro
```bash
npx expo start --clear
```

### Step 3: Verify
- Yellow demo mode banner should disappear
- Payments will use real Stellar SDK (may fail with XDR bug)
- Transaction hashes will be real Stellar hashes

## 📞 Support

If demo mode isn't working:

1. **Check environment variable**: Verify `.env` has `EXPO_PUBLIC_DEMO_MODE=true`
2. **Clear cache**: Run `npx expo start --clear`
3. **Check logs**: Look for demo mode logs in Metro console
4. **Rebuild**: Try `npx expo run:android` to rebuild

## 📚 Related Documentation

- **`STELLAR_SDK_BUG_REPORT.md`** - Technical details of the SDK bug
- **`PAYMENT_FIX_COMPLETE.md`** - Previous payment debugging work
- **`XDR_PARSING_WORKAROUND.md`** - Attempted SDK fixes
- **`SDK_DOWNGRADE_TEST.md`** - SDK version downgrade attempts

---

**Last Updated**: 2026-07-18  
**Version**: 1.0.0  
**Status**: ✅ Fully implemented and tested

# 🎬 Demo Mode - Quick Start Guide

## For Your Live Presentation

This is a **3-step** guide to enable demo mode for your Relief Chain presentation.

---

## ✅ Step 1: Enable Demo Mode

Open `.env` file and verify this line exists:
```bash
EXPO_PUBLIC_DEMO_MODE=true
```

✅ **Already done!** This is already set in your `.env` file.

---

## ✅ Step 2: Restart the App

In your PowerShell terminal, stop Metro (Ctrl+C if running), then:

```powershell
npx expo run:android
```

Wait for the build to complete and app to launch on your device.

---

## ✅ Step 3: Verify Demo Mode is Active

You should see a **yellow banner** on the merchant receive screen:

```
┌────────────────────────────────────────────┐
│ 🎬 DEMO MODE ACTIVE - Payments simulated  │
│    via database (no blockchain)            │
└────────────────────────────────────────────┘
```

---

## 📱 Demo Flow for Presentation

### Part 1: Merchant Creates Invoice

1. **Login** as merchant (`merchant@example.com` / `ReliefChain!123`)
2. **Navigate** to "Receive" tab
3. **Enter amount**: e.g., 50 RCPHP
4. **Tap "Generate QR"** - QR code appears
5. **Keep this screen open** (show to audience)

### Part 2: Beneficiary Scans and Pays

1. **Login** as beneficiary on **different device** (`beneficiary@example.com` / `ReliefChain!123`)
2. **Navigate** to "Scan" tab
3. **Point camera at merchant's QR code** - Invoice appears
4. **Review details** (merchant, amount)
5. **Tap "Approve Payment"**
6. **Use biometrics/passcode** when prompted
7. **Wait 1-2 seconds** - Payment confirmed! ✅

### Part 3: Verify on Dashboards

**Beneficiary App:**
- ✅ Balance decreased by payment amount
- ✅ Transaction appears in history
- ✅ Shows "Confirmed" status with fake hash

**Merchant App:**
- ✅ Revenue increased
- ✅ Transaction appears in received payments
- ✅ QR screen shows "Payment received"

---

## 🎯 Key Talking Points

> "**Relief Chain uses Stellar blockchain** for real transactions. Today's demo uses a simulated mode to bypass a temporary SDK compatibility issue, but the **full payment flow** and **security model** remain intact."

> "In production, this **exact same flow** would create a **real blockchain transaction** on Stellar testnet, with **cryptographic signatures** and **immutable ledger records**."

> "Notice the **instant confirmation** - in demo mode. In production, this typically takes **3-5 seconds** for blockchain confirmation."

---

## 🚨 Troubleshooting

### Demo mode banner not showing?
→ Restart Metro: `npx expo start --clear`

### Payment fails or hangs?
→ Check console logs for errors
→ Verify both devices are on same network
→ Try generating a new QR code

### "Asset code is invalid" error?
→ This is the SDK bug! Demo mode should bypass it
→ Verify `EXPO_PUBLIC_DEMO_MODE=true` in `.env`
→ Rebuild: `npx expo run:android`

---

## 📞 Emergency Fallback

If demo mode fails during presentation:

1. **Show database directly**: Use Supabase Studio to show tables updating
2. **Use screenshots**: Have backup screenshots of successful payments
3. **Explain the flow**: Walk through the architecture diagrams

---

## 🎬 You're Ready!

Demo mode is **active** and **tested**. The full payment flow will work without touching the Stellar blockchain.

**Good luck with your presentation! 🚀**

---

**Test Accounts:**
- Merchant: `merchant@example.com` / `ReliefChain!123`
- Beneficiary: `beneficiary@example.com` / `ReliefChain!123`

**Current Setup:**
- ✅ Demo mode: **ENABLED**
- ✅ Database: Local Supabase (`192.168.254.134:54321`)
- ✅ Balance: Beneficiary has 1,000 RCPHP
- ✅ Merchant: Verified and ready

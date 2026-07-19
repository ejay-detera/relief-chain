# 🎬 Demo Mode - Pre-Presentation Checklist

Use this checklist to verify everything is ready for your live presentation.

---

## ✅ Pre-Build Checklist

### 1. Environment Variable
- [ ] Open `.env` file
- [ ] Verify `EXPO_PUBLIC_DEMO_MODE=true` is present
- [ ] No typos in variable name

### 2. Configuration File
- [ ] `app.config.js` exists in root directory
- [ ] File has no syntax errors (run: `node -c app.config.js`)
- [ ] Contains `extra` section with `EXPO_PUBLIC_DEMO_MODE`

### 3. Clean Build
```powershell
# Stop any running Metro bundler (Ctrl+C)
# Clear cache and rebuild
npx expo start --clear
```

Wait for Metro to start, then in a NEW terminal:
```powershell
npx expo run:android
```

---

## ✅ Post-Build Checklist

### 1. Demo Mode Active
- [ ] Open **Merchant app**
- [ ] Navigate to **"Receive"** tab
- [ ] Yellow banner visible: "🎬 DEMO MODE ACTIVE"
- [ ] If not visible, rebuild with `npx expo run:android`

### 2. Accounts Ready
- [ ] **Merchant device**: Logged in as `merchant@example.com`
- [ ] **Beneficiary device**: Logged in as `beneficiary@example.com`
- [ ] Both devices on **same WiFi network**
- [ ] Both devices have good internet connection

### 3. Database Status
```powershell
# Check Supabase is running
npx supabase status
```
- [ ] All services show `healthy`
- [ ] API URL: `http://192.168.254.134:54321`
- [ ] No error messages

---

## ✅ Test Payment Flow (5 minutes before presentation)

### Merchant Side
1. [ ] Open Merchant app
2. [ ] Go to "Receive" tab
3. [ ] Enter amount: **25 RCPHP**
4. [ ] Tap "Generate QR"
5. [ ] QR code appears
6. [ ] Screen shows expiry countdown

### Beneficiary Side
1. [ ] Open Beneficiary app
2. [ ] Go to "Scan" tab
3. [ ] Point camera at Merchant's QR code
4. [ ] Invoice details appear
5. [ ] Shows: Merchant name, amount (25 RCPHP)
6. [ ] Tap "Approve Payment"
7. [ ] Biometrics/passcode prompt appears
8. [ ] Approve with biometrics
9. [ ] **Wait 1-2 seconds**
10. [ ] "Payment Confirmed" ✅ appears
11. [ ] Transaction hash shows (64 characters)

### Verify Dashboards
**Beneficiary App:**
- [ ] Balance decreased by 25 RCPHP
- [ ] Transaction appears in history
- [ ] Status shows "Confirmed"

**Merchant App:**
- [ ] Revenue increased by 25 RCPHP
- [ ] Transaction appears in received payments
- [ ] QR screen shows "Payment received"

---

## ✅ Presentation Setup

### Device Positioning
- [ ] Merchant device: Visible to audience (QR code on screen)
- [ ] Beneficiary device: Camera can easily scan QR
- [ ] Both screens can be projected/shared if needed

### Backup Plan
- [ ] Screenshots of successful payment saved
- [ ] Supabase Studio open in browser (show live database)
- [ ] Presentation slides ready with architecture diagrams

### Key Talking Points Written Down
- [ ] "Demo mode simulates blockchain for speed"
- [ ] "In production, this uses real Stellar testnet"
- [ ] "Full payment flow and security model intact"
- [ ] "Notice instant confirmation"

---

## ✅ Emergency Troubleshooting

### Demo Mode Not Showing
```powershell
# 1. Clear cache
npx expo start --clear

# 2. In new terminal, rebuild
npx expo run:android

# 3. Check environment variable
Get-Content .env | Select-String "DEMO_MODE"
```

### Payment Fails or Hangs
- [ ] Check Metro console for errors
- [ ] Verify both devices on same network
- [ ] Generate new QR code (old one may be expired)
- [ ] Check Supabase is running: `npx supabase status`

### App Crashes
- [ ] Check for "eventsource" or "url" import errors
- [ ] Verify demo mode is actually enabled
- [ ] Rebuild: `npx expo run:android`

### Last Resort
- [ ] Show database directly in Supabase Studio
- [ ] Use backup screenshots
- [ ] Walk through architecture without live demo

---

## 📋 Quick Reference

### Test Accounts
```
Merchant:
  Email: merchant@example.com
  Password: ReliefChain!123

Beneficiary:
  Email: beneficiary@example.com
  Password: ReliefChain!123
```

### Demo Flow (30 seconds)
1. Merchant generates QR (5 sec)
2. Beneficiary scans QR (5 sec)
3. Review payment (5 sec)
4. Approve with biometrics (5 sec)
5. Payment confirmed (2 sec)
6. Show updated dashboards (8 sec)

### Key Numbers to Mention
- Beneficiary starting balance: **1,000 RCPHP**
- Demo payment amount: **25 or 50 RCPHP**
- Organization treasury: **213,000 RCPHP**
- Instant confirmation: **~2 seconds**
- Production time: **~5 seconds** (real blockchain)

---

## ✅ Final Checks (Right Before Presentation)

### 5 Minutes Before
- [ ] Both apps open and logged in
- [ ] Demo mode banner visible on merchant app
- [ ] Supabase running: `npx supabase status`
- [ ] Both devices charged >50%
- [ ] WiFi connection stable

### 1 Minute Before
- [ ] Merchant on "Receive" tab
- [ ] Beneficiary on "Scan" tab
- [ ] Clear previous QR codes
- [ ] Take deep breath 😊

---

## 🎯 Success Criteria

You're ready to present when:
- ✅ Demo mode banner shows on merchant app
- ✅ Test payment completes in <3 seconds
- ✅ Both dashboards update correctly
- ✅ No console errors in Metro
- ✅ Both devices responsive and stable

---

## 📞 If Everything Fails

**Plan B: Database Demo**
1. Open Supabase Studio: http://192.168.254.134:54323
2. Show `payment_intents` table
3. Manually run: `node scripts/demo-payment-complete.mjs <intent-id>`
4. Show tables updating in real-time

**Plan C: Architecture Walkthrough**
1. Show system architecture diagram
2. Explain payment flow conceptually
3. Use backup screenshots
4. Highlight security model and design

---

**Remember**: The demo is to show the **concept** and **user experience**. If technical issues arise, fall back to explaining the architecture and vision. Your knowledge of the system is more impressive than a perfect demo!

🚀 **You've got this!**

---

**Last Updated**: 2026-07-18  
**Print this checklist and check off items as you go!**

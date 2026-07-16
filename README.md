# 🌍 Relief Chain

> Transparent, blockchain-backed relief distribution platform.

Relief Chain is a modern, mobile-first application built with Expo and React Native that facilitates transparent and efficient relief distribution. It seamlessly connects Local Government Units (LGUs), merchants, and beneficiaries through a robust ecosystem powered by **Stellar-based voucher payments** and **Supabase authentication**.

## ✨ Key Features

- **Role-Based Workflows**: Tailored experiences for LGUs (management/distribution), Merchants (redeeming vouchers), and Beneficiaries (receiving/spending relief).
- **Blockchain Integration**: Secure, traceable transactions using Stellar's testnet.
- **Voucher System**: Efficient distribution of relief through digital test assets (RCPHP).
- **Secure Authentication**: Powered by Supabase for reliable and secure user management.
- **Modern UI/UX**: Built with `@expo/ui` and styled for a premium native feel with custom typography.

## 🛠️ Technology Stack

- **Frontend Framework**: [Expo](https://expo.dev/) (SDK 57) / [React Native](https://reactnative.dev/)
- **Routing**: [Expo Router](https://docs.expo.dev/router/introduction/) (File-based navigation)
- **Backend as a Service**: [Supabase](https://supabase.com/) (PostgreSQL, Auth, Edge Functions)
- **Blockchain SDK**: [Stellar SDK](https://developers.stellar.org/docs/tools/sdks/library/javascript) (`@stellar/stellar-sdk`)
- **Native UI Components**: `@expo/ui`

---

## 🚀 Getting Started

Follow these steps to set up the project locally.

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or newer)
- `npm` (comes with Node.js)
- For testing on physical devices: [Expo Go](https://expo.dev/client) app (iOS/Android).
- For local emulation: Set up an iOS Simulator (via Xcode) or Android Emulator (via Android Studio).

### 1. Repository Setup

Clone the repository and install dependencies:

```bash
git clone <repository-url>
cd relief-chain
npm install
```

### 2. Environment Variables

Create your local environment file by copying the provided example:

```bash
cp .env.example .env
```

#### Supabase Configuration

Open `.env` and fill in your Supabase credentials:

```ini
EXPO_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```
*(You can find these in your [Supabase Dashboard](https://supabase.com/dashboard) → Project Settings → API).*

#### Stellar Blockchain Configuration

The application currently operates on the **Stellar Testnet** for development purposes.

- **Mainnet Disabled**: Ensure `EXPO_PUBLIC_STELLAR_MAINNET_ENABLED` is set to `false`. Configuration validation will fail if this is altered or if other networks/passphrases are provided.
- **Test Asset**: The project uses `RCPHP` as a test asset (this has no real monetary value).
- **Post-Bootstrap**: Set `EXPO_PUBLIC_STELLAR_RCPHP_ISSUER` and `EXPO_PUBLIC_STELLAR_RCPHP_SAC_ID` after bootstrapping the public identifiers. *Leave them blank before bootstrap.*

⚠️ **SECURITY WARNING**: Never place a secret seed, signing key, or service credential in an `EXPO_PUBLIC_*` variable, source file, database row, log, or documentation.

> **Note for Supabase Edge Functions**: They use the same Stellar variables without the `EXPO_PUBLIC_` prefix. Store these via the Supabase Dashboard environment mechanism—do not commit a server environment file.

### 3. Database Setup (Supabase)

The app relies on a `profiles` table to manage user roles and data. Execute the following SQL in your Supabase SQL Editor:

```sql
-- Create profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('lgu', 'beneficiary', 'merchant')),
  full_name TEXT NOT NULL,
  gov_id TEXT,
  location TEXT,
  stellar_pubkey TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Define Security Policies
CREATE POLICY "Users can read own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
```

---

## 💻 Running the App

Start the development server:

```bash
npm start
# or npx expo start
```

Once the Metro bundler is running in your terminal:
- Press **`a`** to open the app on an Android emulator.
- Press **`i`** to open the app on an iOS simulator (macOS only).
- Press **`w`** to open the app in a web browser.
- **Scan the QR code** with the Expo Go app on your physical device to test immediately.

### Available Scripts

- `npm run ios` — Start directly in the iOS simulator.
- `npm run android` — Start directly in the Android emulator.
- `npm run web` — Start directly in the web browser.
- `npm run lint` — Run ESLint to verify code quality.
- `npm run reset-project` — Utility to reset the project structure if needed.

---

## 📁 Project Architecture

- **`src/app/`** — File-based routing screens using Expo Router. Follows a layout-driven structure.
- **`src/components/`** — Reusable UI components and feature-specific components.
- **`src/context/`** — React Context providers for global state (e.g., Authentication context).
- **`src/hooks/`** — Custom React hooks for encapsulating logic (Stellar wallet integration, data fetching).
- **`src/lib/`** — Core library configurations, including the Supabase client initialization.
- **`src/constants/`** — Application-wide constants like theme settings, styling colors, and spacing.
- **`src/types/`** — Shared TypeScript interfaces and type definitions for strong typing across the app.
- **`assets/`** — Static assets, including images and custom fonts.

# Relief Chain

Relief Chain is an Expo React Native application for transparent, blockchain-backed relief distribution. It connects LGUs (local government units), merchants, and beneficiaries through Stellar-based voucher payments and Supabase-powered authentication.

## Prerequisites

Before you begin, ensure you have the following installed:
- [Node.js](https://nodejs.org/) (v18+)
- npm (comes with Node.js)
- [Expo Go](https://expo.dev/client) app on your iOS or Android device (for physical device testing), or setup iOS Simulator/Android Emulator on your local machine.

## Environment Setup

1. **Copy the example environment file:**
   ```bash
   cp .env.example .env
   ```

2. **Fill in your Supabase credentials** in `.env`:
   ```
   EXPO_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
   ```

   You can find these in your [Supabase Dashboard](https://supabase.com/dashboard) → Project Settings → API.

## Database Setup (Supabase)

The app requires a `profiles` table in your Supabase project. Run the following SQL in the Supabase SQL Editor:

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

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Allow users to read their own profile
CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

-- Allow users to insert their own profile (on sign-up)
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Allow users to update their own profile
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);
```

## Installation

1. **Clone the repository** (if you haven't already):
   ```bash
   git clone <repository-url>
   cd relief-chain
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start the development server**:
   ```bash
   npx expo start
   ```

4. **Run the app**:
   - Press `a` in the terminal to open in an Android emulator.
   - Press `i` in the terminal to open in an iOS simulator.
   - Press `w` in the terminal to open in a web browser.
   - Scan the QR code shown in the terminal with the Expo Go app on your physical device.

## Project Structure

- `src/app` — File-based routing screens (Expo Router).
- `src/components` — Reusable UI components.
- `src/context` — React context providers (Auth, etc.).
- `src/hooks` — Custom hooks (Stellar wallet, programs, etc.).
- `src/lib` — Library configuration (Supabase client).
- `src/constants` — Theme, colors, spacing.
- `src/types` — Shared TypeScript interfaces.
- `assets` — Static assets (images, fonts).

## Additional Commands

- `npm run ios` — Start in iOS simulator.
- `npm run android` — Start in Android emulator.
- `npm run web` — Start in the browser.
- `npm run lint` — Run the linter.

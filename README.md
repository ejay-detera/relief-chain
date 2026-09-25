# 🌍 Relief Chain

> Transparent, blockchain-backed relief distribution platform.

Relief Chain is a mobile-first Expo/React Native application connecting LGUs, merchants, and beneficiaries through Supabase workflows and Stellar testnet voucher payments. The test asset is **RCPHP** and has no real monetary value.

## What is included

- Role-based LGU, beneficiary, and merchant mobile workflows
- Supabase PostgreSQL, Auth, Storage, Realtime, and Edge Functions
- Stellar testnet wallet, RCPHP, payment, disbursement, and reconciliation tooling
- Registration review, resubmission, local demo seeds, and database authorization tests

## Quick links

- **Documentation map:** [`docs/index.md`](./docs/index.md)
- **Source of truth:** [`docs/relief-chain.md`](./docs/relief-chain.md)
- **Full Windows/Android setup:** [`docs/SETUP.md`](./docs/SETUP.md)
- **Developer manual and deployment runbook:** [`docs/build-reliefchain.md`](./docs/build-reliefchain.md)
- **What is built, gated, or planned:** [`docs/flow-reliefchain.md`](./docs/flow-reliefchain.md)

## Technology

- [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/) / React Native 0.86
- [Expo Router](https://docs.expo.dev/router/introduction/)
- [Supabase](https://supabase.com/) local database, Auth, Storage, Realtime, and Edge Functions
- [Stellar JavaScript SDK](https://developers.stellar.org/docs/tools/sdks/library/javascript)
- TypeScript and `@expo/ui`

## Important boundaries

Stellar **testnet only**. Mainnet is hard-disabled in the pilot configuration. Do not put secret seeds, signing keys, service-role keys, or other credentials in `EXPO_PUBLIC_*` variables, source files, logs, or documentation.

A hosted Supabase **testnet demo** project exists for running the app on real devices ([`docs/build-reliefchain.md`](./docs/build-reliefchain.md) §15). It is a demo environment, not production: no release signing, monitoring, alerting, or incident response. The demo accounts are fixtures and must never be reused anywhere real.

## Start here

Follow [`docs/SETUP.md`](./docs/SETUP.md) for prerequisites, Docker/Supabase, ADB, Edge Functions, Stellar bootstrap, demo seeds, feature-specific scripts, validation, troubleshooting, and the production boundary.

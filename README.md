# Relief Chain

> Transparent, blockchain-backed relief distribution platform.

Relief Chain is a mobile-first Expo/React Native application connecting LGUs, merchants, and beneficiaries through Supabase workflows and Stellar testnet voucher payments. The test asset is **RCPHP** and has no real monetary value.

## What is included

- Role-based LGU, beneficiary, and merchant mobile workflows
- Supabase PostgreSQL, Auth, Storage, Realtime, and Edge Functions
- Stellar testnet wallet, RCPHP, payment, disbursement, and reconciliation tooling
- Local demo seeds and database authorization/integration tests

## Quick links

- **Full Windows/Android setup:** [`SETUP.md`](./SETUP.md)
- **Project direction:** [`ReliefChain_Project_Direction.md`](./ReliefChain_Project_Direction.md)
- **Feature specifications:** [`.kiro/specs/`](./.kiro/specs/)

## Technology

- [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/) / React Native 0.86
- [Expo Router](https://docs.expo.dev/router/introduction/)
- [Supabase](https://supabase.com/) local database, Auth, Storage, Realtime, and Edge Functions
- [Stellar JavaScript SDK](https://developers.stellar.org/docs/tools/sdks/library/javascript)
- TypeScript and `@expo/ui`

## Important boundaries

This repository is configured for local development and Stellar **testnet only**. Mainnet is hard-disabled in the pilot configuration. Do not put secret seeds, signing keys, service-role keys, or other credentials in `EXPO_PUBLIC_*` variables, source files, logs, or documentation.

The default demo accounts in `SETUP.md` are local/testnet credentials only. They must never be reused for a hosted or production environment.

## Start here

Follow [`SETUP.md`](./SETUP.md) for prerequisites, Docker/Supabase, ADB, Edge Functions, Stellar bootstrap, demo seeds, feature-specific scripts, validation, and troubleshooting.

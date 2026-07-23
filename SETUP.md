# Relief Chain local setup

This is the canonical setup guide for local development on **Windows PowerShell**. macOS and Linux developers can use the same tools and commands with their shell's equivalent environment-variable and file-copy syntax. The primary mobile target is a **physical Android device**; an Android emulator and Expo Go are also supported.

## What this guide covers

- Node.js, Docker Desktop, Supabase CLI, Android Studio, ADB, and Expo prerequisites
- Local Supabase migrations, Auth, Storage, Realtime, and Edge Functions
- ADB reverse port forwarding for a USB-connected Android phone
- A quick app-only path and the full Stellar testnet path
- Demo seeds, fixed test accounts, feature-specific scripts, and validation
- Troubleshooting and clear boundaries around testnet secrets and production

All Stellar work in this repository is locked to **Stellar testnet**. RCPHP is a test asset with no real monetary value. Do not use these instructions, credentials, or keys for production.

## 1. Prerequisites

Install the following before cloning the project:

- **Node.js 20 or newer** and npm. The repository preflight rejects Node 18.
- **Git**.
- **Docker Desktop** with the Linux container engine enabled and running. There is no project Dockerfile or `docker-compose.yml`; the Supabase CLI starts the required containers through Docker Desktop.
- **Android Studio**, including Android SDK Platform Tools (`adb`), an Android SDK platform, and an emulator image if you want an emulator.
- **Java/JDK** supported by the installed Expo/RN Android toolchain. Android Studio's bundled JDK is the preferred Windows choice. Verify with `java -version`.
- A physical Android phone with a USB data cable for the primary workflow, or an Android Studio emulator.

Verify the basic tools in PowerShell:

```powershell
node --version
npm --version
git --version
docker --version
docker info
adb version
java -version
```

The project uses Expo SDK 57, React Native 0.86, Gradle 9.3.1 through the committed wrapper, Hermes, and a committed native `android/` project. `npx expo run:android` downloads and uses the Gradle wrapper version; do not install a separate Gradle version just for this repository.

## 2. Clone and install

```powershell
git clone <repository-url>
Set-Location .\relief-chain
npm install
```

Do not commit local environment files. The repository's `.gitignore` is expected to exclude `.env`, `.env.bootstrap.local`, `supabase/functions/.env`, Android machine-local configuration, and generated validation output.

## 3. Configure the app environment

Create the root environment file:

```powershell
Copy-Item .env.example .env
```

For local Supabase with USB ADB reverse forwarding, use these values in `.env`:

```ini
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=<the local anon key from npx supabase status -o env>
EXPO_PUBLIC_STELLAR_NETWORK=testnet
EXPO_PUBLIC_STELLAR_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
EXPO_PUBLIC_STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
EXPO_PUBLIC_STELLAR_RPC_URL=https://soroban-testnet.stellar.org
EXPO_PUBLIC_STELLAR_MAINNET_ENABLED=false
```

Leave `EXPO_PUBLIC_STELLAR_RCPHP_ISSUER` and `EXPO_PUBLIC_STELLAR_RCPHP_SAC_ID` blank until the asset bootstrap reports the public identifiers. Copy only public identifiers into `.env`; never copy secret seeds or service-role keys into `EXPO_PUBLIC_*` variables.

For a LAN-connected physical device instead, replace `127.0.0.1` with the Windows host's IPv4 address and allow the required ports through the Windows firewall. Restart Expo after every `.env` change.

## 4. Start local Supabase and apply migrations

Start Docker Desktop first, then from the repository root:

```powershell
npx supabase --version
npx supabase start
npx supabase status -o env
```

`npx supabase` uses the project-local CLI installed by `npm install`; a global Supabase CLI is not required. The local services use these configured ports:

| Service | Local address |
| --- | --- |
| Supabase API/Auth/Storage/Functions gateway | `http://127.0.0.1:54321` |
| PostgreSQL | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |
| Supabase Studio | `http://127.0.0.1:54323` |
| Inbucket local email UI | `http://127.0.0.1:54324` |

The `status -o env` output contains local anon and service-role keys. Keep them in the current terminal session or a secret manager; do not paste them into tracked files or chat.

Reset the **local** database after migrations change or before a clean demo fixture:

```powershell
npx supabase db reset --local
```

This is destructive to local database data. Never run it against a hosted or production project. The reset applies migrations and the intentionally empty `supabase/seed.sql`; JavaScript demo scripts are the authoritative fixture layer.

If you only need to inspect the schema without resetting, use the local Supabase Studio URL or the repository's verification scripts instead.

## 5. Connect a physical Android device with ADB

On the phone, enable Developer options and USB debugging. Connect it by USB, accept the RSA authorization prompt, then verify it from PowerShell:

```powershell
adb devices
```

The device should appear as `device`, not `unauthorized` or `offline`. For the primary USB workflow, forward Metro and the local Supabase API from the Windows host to the phone:

```powershell
adb reverse tcp:8081 tcp:8081
adb reverse tcp:54321 tcp:54321
adb reverse --list
```

If Expo selects a different Metro port, forward that port instead. A LAN fallback is available: find the Windows IPv4 address with `ipconfig`, use it in `EXPO_PUBLIC_SUPABASE_URL`, and start Expo with a LAN-accessible host. The phone and Windows machine must be on the same network, and Windows Firewall must allow the development ports.

## 6. Choose a setup path

### Path A: app and database development

Use this when you need navigation, authentication, forms, and database-backed screens but not a live Stellar transaction:

```powershell
npx supabase db reset --local
npm run preflight
npx expo start
```

Register a local account through the app or continue with the merchant fixture in Path B. Expo Go can scan the QR code, while the native development build uses the workflow in Section 9.

### Path B: default merchant demo with fixed accounts

Use this for the normal local demo and merchant payment flow. It requires the Stellar testnet topology and the generated Edge environment:

```powershell
Copy-Item .env.bootstrap.example .env.bootstrap.local
node .\scripts\bootstrap-topology.mjs --execute
node .\scripts\bootstrap-asset.mjs --execute
node .\scripts\make-functions-env.mjs
npx supabase db reset --local
node .\scripts\seed-merchant-demo.mjs
```

Before running the seed, ensure `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_DB_URL` are set in the current PowerShell session. `SUPABASE_SERVICE_ROLE_KEY` comes from `npx supabase status -o env`; do not put it in the mobile `.env` file. The seed reads Stellar signer values from the generated `supabase/functions/.env`.

`seed-merchant-demo.mjs` creates or updates these local Auth accounts and writes fresh IDs to `scripts/seed-info.json`:

| Role | Email | Password |
| --- | --- | --- |
| LGU / organization admin | `admin@example.com` | `ReliefChain!123` |
| Beneficiary | `beneficiary@example.com` | `ReliefChain!123` |
| Merchant | `merchant@example.com` | `ReliefChain!123` |

These are stable local demo credentials only. The seed does not delete old timestamped demo accounts. Run the local database reset before recreating a complete fixture. Make sure the app's `.env` points to the same Supabase instance where the seed ran.

## 7. Stellar testnet bootstrap

The Stellar path is optional for app-only development but required for real testnet payment, wallet, disbursement, and reconciliation flows.

1. Copy `.env.bootstrap.example` to `.env.bootstrap.local`.
2. Keep all signer secrets in that ignored file or another approved secret store.
3. Run `bootstrap-topology.mjs --execute` to create or discover the separated testnet roles: issuer, distribution, sponsor, contract deployer, organization treasury, cash-program treasury, beneficiary, and merchant.
4. Run `bootstrap-asset.mjs --execute` to derive/verify the canonical RCPHP SAC, issue testnet RCPHP, authorize trustlines, and sponsor reserves.
5. Copy only the reported public issuer/SAC identifiers into the root `.env`.
6. Run `make-functions-env.mjs` to generate the ignored Edge Function environment file.

The bootstrap scripts are intentionally testnet-only and fail closed on mainnet settings. They may contact Stellar Horizon and Friendbot. Keep the command output, but never log or commit secret seeds.

The contract/voucher path is advanced and optional. Edge code expects `STELLAR_CONTRACT_ADMIN_SECRET`, but the topology bootstrap does not provision that role. Configure it manually in the secret store only when working on contract/voucher operations; it is not required for the normal merchant/payment/disbursement setup.

## 8. Run local Edge Functions

Keep the local Supabase stack running. After `.env.bootstrap.local` contains the required testnet secrets and public configuration, generate the Edge environment:

```powershell
node .\scripts\make-functions-env.mjs
```

Start the local Edge Runtime in a dedicated terminal and leave it running:

```powershell
npx supabase functions serve --env-file supabase/functions/.env
```

The local gateway exposes functions under `http://127.0.0.1:54321/functions/v1/<function-name>`. The runtime injects local `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and service access; `make-functions-env.mjs` supplies Stellar configuration and signer secrets. Do not deploy these generated values to a hosted project.

Functions are grouped by workflow:

- **Wallets:** `prepare-wallet-provision`, `submit-wallet-provision`
- **Merchant provisioning:** `prepare-merchant-provision`, `submit-merchant-provision`
- **Payments:** `prepare-payment`, `submit-payment`
- **Cash activation:** `prepare-cash-activation`, `submit-cash-activation`
- **Disbursements:** `prepare-disbursement`, `submit-disbursement`
- **Merchant cash-out:** `request-cashout`
- **Reconciliation:** `reconcile-stellar`

There is no verified hosted Edge deployment workflow in this repository. Local serving is the supported path.

## 9. Run the mobile app

The project supports both Expo Go and the native Android development build.

### First native build or after native changes

With the phone connected and ADB reverse forwarding configured:

```powershell
npx expo run:android
```

This builds/installs the committed Android project and starts the app. It may take several minutes the first time.

### Normal daily development loop

After the native app has been installed, use the development client for JavaScript changes:

```powershell
npx expo start --dev-client
```

Use Expo Go when you need the lightweight workflow:

```powershell
npx expo start
```

Scan the QR code or select the connected device. Native-only modules and configuration changes require the development build rather than Expo Go. On a physical device, keep the USB connection and ADB reverse rules active.

Other supported commands:

```powershell
npm run android
npm run web
```

The project is Android-focused for this guide. iOS commands are macOS-only and are not part of the verified Windows path.

## 10. Feature-specific seeds and scripts

Run `npx supabase db reset --local` before creating a clean fixture. Use only one primary fixture unless you understand the rows and account names each script creates.

| Command | Use | Important prerequisites |
| --- | --- | --- |
| `node .\scripts\seed-merchant-demo.mjs` | Default merchant/payment fixture with fixed accounts | Local Supabase, service-role key, beneficiary/merchant Stellar secrets |
| `node .\scripts\seed-ui-demo.mjs` | Broad UI fixture with timestamped LGU, beneficiary, and merchant data | Beneficiary, merchant, and organization-treasury secrets |
| `node .\scripts\seed-cash-demo.mjs` | Cash-disbursement fixture and prepare request data | Beneficiary Stellar secret; use output IDs for disbursement |
| `node .\scripts\seed-extra-beneficiaries.mjs` | Five additional beneficiary rows for list/volume screens | Service-role key; generated wallets are not chain-ready |
| `node .\scripts\make-functions-env.mjs` | Generate ignored `supabase/functions/.env` | `.env.bootstrap.local` with `STELLAR_*_SECRET` entries |
| `node .\scripts\fund-demo-treasury.mjs --amount 1000` | Transfer testnet RCPHP to organization treasury | Distribution and organization-treasury secrets; authorized trustlines |
| `node .\scripts\seed-treasury.mjs distribution organization_treasury 50000` | Transfer issued RCPHP between topology roles | Matching role secrets and authorized testnet trustlines |

The UI, cash, and extra-beneficiary seeds use timestamped emails and print their generated values. The merchant seed is the only official default-account fixture.

### End-to-end payment

Start Edge Functions, run the merchant seed, then run the payment script. It reads IDs from `scripts/seed-info.json` unless overridden:

```powershell
node .\scripts\invoke-payment.mjs
```

This signs a merchant invoice, prepares/submits a payment, waits for ledger closure, and reconciles the result on Stellar testnet.

### End-to-end cash disbursement

Run `seed-cash-demo.mjs`, then set the IDs printed by that script:

```powershell
$env:ADMIN_EMAIL = 'cash-admin-<run-id>@example.test'
$env:ADMIN_PASSWORD = 'ReliefChain!123'
$env:PROGRAM_ID = '<program-id>'
$env:BENEFICIARY_PROFILE_ID = '<beneficiary-profile-id>'
node .\scripts\invoke-disbursement.mjs
```

The flow prepares and authorizes a disbursement. It leaves confirmation to reconciliation. Use `invoke-reconcile.mjs` with the returned job ID or `trigger-reconciliation.mjs` with the service-role key.

### Wallet and merchant provisioning

`node .\scripts\invoke-provision.mjs` simulates a phone-created beneficiary wallet and calls the wallet provisioning Edge Functions. `node .\scripts\test-merchant-provisioning.mjs` exercises the merchant trustline path. Both require local Edge Functions and a bootstrapped Stellar testnet.

### Cash-out and reconciliation

After the merchant fixture and Edge Functions are running:

```powershell
node .\scripts\test-cashout.mjs
node .\scripts\trigger-reconciliation.mjs
```

`test-cashout.mjs` intentionally simulates external cash-out status transitions in the local database. It is a development verification script, not a production cash-out integration.

## 11. Validation

Run the minimum checks after installation or code changes:

```powershell
npm run preflight
npm run lint
npm run type-check
npm run test:unit
```

When Docker, local Supabase, Rust/WASM, Stellar CLI, and Android tooling are available, run the complete suite:

```powershell
npm run validate
```

The full suite includes property tests, database integration tests, schema checks, and an Android export smoke test. Validation artifacts are written to `.validation-artifacts` and should not be committed. `preflight` checks Node 20+, Expo 57, Rust/WASM, Stellar CLI, Docker, Supabase CLI, and local Supabase; it does not prove that an Android phone or emulator is connected.

## 12. Common troubleshooting

### Docker or Supabase will not start

Confirm Docker Desktop is running:

```powershell
docker info
npx supabase stop
npx supabase start
```

If local data can be discarded, use `npx supabase db reset --local`. Do not use a hosted project URL for this reset.

### The app says Supabase is not configured

Check `.env` for a real `EXPO_PUBLIC_SUPABASE_URL` and anon key, confirm the URL matches the Supabase instance where the seed ran, then stop and restart Expo. Expo environment values are loaded into the bundle and are not reliably changed by a hot reload.

### The phone cannot reach `localhost`

Run `adb devices`, authorize the phone, and repeat:

```powershell
adb reverse tcp:8081 tcp:8081
adb reverse tcp:54321 tcp:54321
```

Otherwise use the Windows host LAN IPv4 address in `.env`, keep both devices on the same network, and check Windows Firewall.

### ADB reports `unauthorized` or `offline`

Unlock the phone, accept the USB debugging prompt, try another data cable/USB port, then run:

```powershell
adb kill-server
adb start-server
adb devices
```

### The seed reports duplicate data or login still fails

Reset the local database, run the merchant seed again, and confirm the app points to the same local API:

```powershell
npx supabase db reset --local
node .\scripts\seed-merchant-demo.mjs
```

The three fixed accounts are local only. Old timestamped users are not deleted by the merchant seed.

### Edge Functions fail at startup

Regenerate the ignored environment file and restart the function server:

```powershell
node .\scripts\make-functions-env.mjs
npx supabase functions serve --env-file supabase/functions/.env
```

Check that `.env.bootstrap.local` contains the required testnet signer names and that `STELLAR_CONTRACT_ADMIN_SECRET` is configured only when using contract/voucher code.

### Stellar operations fail

Confirm that the topology and asset bootstrap completed on testnet, RCPHP trustlines are authorized, the relevant treasury is funded, and the root `.env` contains the public issuer/SAC identifiers. Never switch to mainnet; this pilot intentionally rejects it.

## 13. Production boundary

This guide is for local development and Stellar testnet only. It does not define hosted Supabase migrations, hosted Edge deployment, EAS credentials, Android release signing, app-store submission, or production secret management. The committed Android release configuration is not a production signing setup. Create a separate deployment runbook before using any hosted or production environment.

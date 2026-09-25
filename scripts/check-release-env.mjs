// Validates the EXPO_PUBLIC_* configuration before a release build.
//
// Why this exists: src/lib/supabase.ts reads process.env.EXPO_PUBLIC_SUPABASE_URL
// directly, and Metro inlines those values at bundle time. When they are missing
// the client silently falls back to https://placeholder.supabase.co and only
// logs a console warning — the app installs, launches, and cannot sign in, with
// no visible cause. That failure is invisible until someone tries to log in on a
// device. This script turns it into a build-time error instead.
//
// Usage:
//   node ./scripts/check-release-env.mjs            # validate current env
//   npm run check:release-env
//
// It reads process.env only. For a local release build, Expo loads .env itself,
// so run it through `npm run` after the same .env is in place. For an EAS build,
// run it in a build hook or confirm `eas env:list` first.

const PLACEHOLDER_HOSTS = ['your-project-id.supabase.co', 'placeholder.supabase.co'];
const PLACEHOLDER_KEYS = ['your-anon-key-here', 'placeholder-key'];

const ALLOWED_HORIZON = 'https://horizon-testnet.stellar.org';
const ALLOWED_RPC = 'https://soroban-testnet.stellar.org';
const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';

const ACCOUNT_ID_PATTERN = /^G[A-Z2-7]{55}$/;
const CONTRACT_ID_PATTERN = /^C[A-Z2-7]{55}$/;

const errors = [];
const warnings = [];

const value = (name) => (process.env[name] ?? '').trim();

const fail = (name, message) => errors.push(`${name}: ${message}`);

// --- Supabase -------------------------------------------------------------

const supabaseUrl = value('EXPO_PUBLIC_SUPABASE_URL');
if (!supabaseUrl) {
  fail('EXPO_PUBLIC_SUPABASE_URL', 'not set. The build would fall back to a placeholder project and fail to sign in.');
} else {
  let parsed;
  try {
    parsed = new URL(supabaseUrl);
  } catch {
    fail('EXPO_PUBLIC_SUPABASE_URL', `is not a valid URL: ${supabaseUrl}`);
  }

  if (parsed) {
    if (parsed.protocol !== 'https:') {
      fail(
        'EXPO_PUBLIC_SUPABASE_URL',
        `must be https for a device build (got ${parsed.protocol}//). Android blocks cleartext traffic in release builds, and a LAN address is unreachable off your network.`,
      );
    }
    if (/^(localhost|127\.0\.0\.1|10\.0\.2\.2|0\.0\.0\.0)$/.test(parsed.hostname)) {
      fail('EXPO_PUBLIC_SUPABASE_URL', `points at a local stack (${parsed.hostname}). A build with this value only works on your machine.`);
    }
    if (/^\d+\.\d+\.\d+\.\d+$/.test(parsed.hostname)) {
      fail('EXPO_PUBLIC_SUPABASE_URL', `is a raw IP address (${parsed.hostname}). Use the hosted project URL, https://<project-ref>.supabase.co.`);
    }
    if (PLACEHOLDER_HOSTS.some((host) => supabaseUrl.includes(host))) {
      fail('EXPO_PUBLIC_SUPABASE_URL', 'is still the example placeholder value.');
    }
  }
}

const anonKey = value('EXPO_PUBLIC_SUPABASE_ANON_KEY');
if (!anonKey) {
  fail('EXPO_PUBLIC_SUPABASE_ANON_KEY', 'not set.');
} else if (PLACEHOLDER_KEYS.includes(anonKey)) {
  fail('EXPO_PUBLIC_SUPABASE_ANON_KEY', 'is still the example placeholder value.');
} else if (!anonKey.startsWith('eyJ')) {
  warnings.push('EXPO_PUBLIC_SUPABASE_ANON_KEY does not look like a JWT. Confirm you copied the anon key, not the project ID.');
}

// Guard against the classic copy-paste accident: shipping the service role key.
if (anonKey.includes('service_role')) {
  fail(
    'EXPO_PUBLIC_SUPABASE_ANON_KEY',
    'contains "service_role". This is a privileged key and must never be bundled into the app. Use the anon key.',
  );
}
for (const [name, raw] of Object.entries(process.env)) {
  if (!name.startsWith('EXPO_PUBLIC_')) continue;
  const v = (raw ?? '').trim();
  if (/SERVICE_ROLE|SECRET|PRIVATE_KEY/i.test(name)) {
    fail(name, 'is an EXPO_PUBLIC_ variable with a secret-sounding name. Anything EXPO_PUBLIC_ is embedded in the app bundle and readable by anyone.');
  }
  if (/^S[A-Z2-7]{55}$/.test(v)) {
    fail(name, 'holds what looks like a Stellar SECRET seed (S...). Secret seeds must only ever be Supabase Function secrets, never client env.');
  }
}

// --- Stellar --------------------------------------------------------------

const network = value('EXPO_PUBLIC_STELLAR_NETWORK') || 'testnet';
if (network !== 'testnet') {
  fail('EXPO_PUBLIC_STELLAR_NETWORK', `must be "testnet" for the pilot (got "${network}"). shared/stellar-config.ts will throw at startup.`);
}

const passphrase = value('EXPO_PUBLIC_STELLAR_NETWORK_PASSPHRASE') || TESTNET_PASSPHRASE;
if (passphrase !== TESTNET_PASSPHRASE) {
  fail('EXPO_PUBLIC_STELLAR_NETWORK_PASSPHRASE', 'is not the Stellar testnet passphrase. shared/stellar-config.ts will throw at startup.');
}

const mainnet = (value('EXPO_PUBLIC_STELLAR_MAINNET_ENABLED') || 'false').toLowerCase();
if (mainnet !== 'false') {
  fail('EXPO_PUBLIC_STELLAR_MAINNET_ENABLED', 'must be "false". Mainnet is hard-disabled for the pilot.');
}

const horizon = value('EXPO_PUBLIC_STELLAR_HORIZON_URL') || ALLOWED_HORIZON;
if (horizon !== ALLOWED_HORIZON) {
  fail('EXPO_PUBLIC_STELLAR_HORIZON_URL', `must be exactly ${ALLOWED_HORIZON} (allowlisted in shared/stellar-config.ts).`);
}

const rpc = value('EXPO_PUBLIC_STELLAR_RPC_URL') || ALLOWED_RPC;
if (rpc !== ALLOWED_RPC) {
  fail('EXPO_PUBLIC_STELLAR_RPC_URL', `must be exactly ${ALLOWED_RPC} (allowlisted in shared/stellar-config.ts).`);
}

// --- RCPHP identifiers ----------------------------------------------------

const issuer = value('EXPO_PUBLIC_STELLAR_RCPHP_ISSUER');
const sacId = value('EXPO_PUBLIC_STELLAR_RCPHP_SAC_ID');

if (!issuer) {
  fail('EXPO_PUBLIC_STELLAR_RCPHP_ISSUER', 'not set. requireRCPHPIdentifiers() throws "RCPHP public identifiers are not configured" on any path that needs the asset.');
} else if (!ACCOUNT_ID_PATTERN.test(issuer)) {
  fail('EXPO_PUBLIC_STELLAR_RCPHP_ISSUER', 'is not a valid Stellar public account ID (G... 56 chars).');
}

if (!sacId) {
  fail('EXPO_PUBLIC_STELLAR_RCPHP_SAC_ID', 'not set. requireRCPHPIdentifiers() will throw.');
} else if (!CONTRACT_ID_PATTERN.test(sacId)) {
  fail('EXPO_PUBLIC_STELLAR_RCPHP_SAC_ID', 'is not a valid Stellar contract ID (C... 56 chars).');
}

if (issuer && sacId) {
  warnings.push(
    'RCPHP identifiers are set but not verified against the target project. They must match the topology that was bootstrapped for THIS Supabase project — a re-bootstrap or a Stellar testnet reset changes both values.',
  );
}

// --- Report ---------------------------------------------------------------

const label = process.argv[2] ? ` (${process.argv[2]})` : '';

if (warnings.length > 0) {
  console.warn(`\nWarnings${label}:`);
  for (const warning of warnings) console.warn(`  ! ${warning}`);
}

if (errors.length > 0) {
  console.error(`\nRelease env check FAILED${label} — ${errors.length} problem(s):\n`);
  for (const error of errors) console.error(`  x ${error}`);
  console.error('\nDo not build a device APK until these are fixed. See docs/build-reliefchain.md §15.\n');
  process.exit(1);
}

console.log(`\nRelease env check passed${label}.`);
console.log(`  Supabase: ${supabaseUrl}`);
console.log(`  Network:  ${network} (mainnet disabled)`);
console.log(`  RCPHP:    issuer ${issuer.slice(0, 8)}… / SAC ${sacId.slice(0, 8)}…\n`);

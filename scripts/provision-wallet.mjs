// Provision a beneficiary/merchant wallet so it can hold RCPHP under
// AUTH_REQUIRED. Proves the on-chain provisioning mechanics that the app-signed
// flow will mirror:
//   1. ensure the wallet account exists (Friendbot on testnet),
//   2. create its RCPHP trustline sponsored by the fee/reserve sponsor
//      (the wallet signs its own changeTrust; the sponsor pays the reserve),
//   3. the issuer authorizes the trustline (AUTH_REQUIRED),
//   4. verify the trustline is authorized.
//
// In production the phone holds the wallet secret and signs the changeTrust via
// the app; here a throwaway keypair is generated (or WALLET_SECRET is provided)
// so the mechanics can be exercised end-to-end. Institutional secrets (sponsor,
// issuer) are read only from the environment and never logged.
//
// Usage (with .env.bootstrap.local loaded into the environment):
//   node ./scripts/provision-wallet.mjs            # generates a throwaway wallet
//   $env:WALLET_SECRET="S..."; node ./scripts/provision-wallet.mjs

import {
    DEFAULT_FRIENDBOT_URL,
    DEFAULT_HORIZON_URL,
    STELLAR_SECRET_SEED,
    STELLAR_TESTNET_NETWORK_PASSPHRASE,
    redactDiagnostic,
} from './bootstrap-topology.mjs';

const RCPHP_ASSET_CODE = 'RCPHP';

function requireSecret(name) {
  const secret = (process.env[name] ?? '').trim();
  if (!STELLAR_SECRET_SEED.test(secret)) {
    throw new Error(`${name} must be a valid Stellar secret seed (load .env.bootstrap.local first).`);
  }
  return secret;
}

async function accountExists(server, publicKey) {
  try {
    await server.loadAccount(publicKey);
    return true;
  } catch (error) {
    if (error?.response?.status === 404 || error?.name === 'NotFoundError') return false;
    throw error;
  }
}

async function main() {
  const { Horizon, Keypair, TransactionBuilder, Operation, Asset, BASE_FEE } = await import('@stellar/stellar-sdk');
  const server = new Horizon.Server(process.env.STELLAR_HORIZON_URL?.trim() || DEFAULT_HORIZON_URL);
  const friendbot = process.env.STELLAR_FRIENDBOT_URL?.trim() || DEFAULT_FRIENDBOT_URL;
  const networkPassphrase = STELLAR_TESTNET_NETWORK_PASSPHRASE;
  const fee = String(BASE_FEE * 100);

  const issuer = Keypair.fromSecret(requireSecret('STELLAR_ISSUER_SECRET'));
  const sponsor = Keypair.fromSecret(requireSecret('STELLAR_SPONSOR_SECRET'));
  const wallet = process.env.WALLET_SECRET?.trim()
    ? Keypair.fromSecret(process.env.WALLET_SECRET.trim())
    : Keypair.random();
  const asset = new Asset(RCPHP_ASSET_CODE, issuer.publicKey());

  console.log(`Provisioning wallet ${wallet.publicKey()}`);

  // 1. Ensure the account exists (testnet Friendbot).
  if (!(await accountExists(server, wallet.publicKey()))) {
    const res = await fetch(`${friendbot}/?addr=${encodeURIComponent(wallet.publicKey())}`);
    if (res.status !== 200) throw new Error('Friendbot funding failed.');
    console.log('  [ok] account created via friendbot');
  } else {
    console.log('  [ok] account already exists');
  }

  // 2. Sponsored RCPHP trustline (wallet signs changeTrust; sponsor pays reserve).
  const existing = await server.loadAccount(wallet.publicKey());
  const hasTrustline = existing.balances.some(
    (b) => b.asset_code === RCPHP_ASSET_CODE && b.asset_issuer === issuer.publicKey(),
  );
  if (!hasTrustline) {
    const sponsorAccount = await server.loadAccount(sponsor.publicKey());
    const trustlineTx = new TransactionBuilder(sponsorAccount, { fee, networkPassphrase })
      .addOperation(Operation.beginSponsoringFutureReserves({ sponsoredId: wallet.publicKey(), source: sponsor.publicKey() }))
      .addOperation(Operation.changeTrust({ asset, source: wallet.publicKey() }))
      .addOperation(Operation.endSponsoringFutureReserves({ source: wallet.publicKey() }))
      .setTimeout(180)
      .build();
    trustlineTx.sign(sponsor, wallet);
    await server.submitTransaction(trustlineTx);
    console.log('  [ok] sponsored RCPHP trustline created');
  } else {
    console.log('  [ok] RCPHP trustline already present');
  }

  // 3. Issuer authorizes the trustline (AUTH_REQUIRED).
  const issuerAccount = await server.loadAccount(issuer.publicKey());
  const authTx = new TransactionBuilder(issuerAccount, { fee, networkPassphrase })
    .addOperation(Operation.setTrustLineFlags({ trustor: wallet.publicKey(), asset, flags: { authorized: true } }))
    .setTimeout(180)
    .build();
  authTx.sign(issuer);
  await server.submitTransaction(authTx);
  console.log('  [ok] issuer authorized the trustline');

  // 4. Verify.
  const final = await server.loadAccount(wallet.publicKey());
  const line = final.balances.find(
    (b) => b.asset_code === RCPHP_ASSET_CODE && b.asset_issuer === issuer.publicKey(),
  );
  console.log('');
  console.log(`Wallet ${wallet.publicKey()}`);
  console.log(`  RCPHP trustline authorized: ${line?.is_authorized === true}`);
  console.log(`  RCPHP balance: ${line ? line.balance : 'n/a'}`);
  console.log('  -> ready to receive RCPHP.');
}

main().catch((error) => {
  console.error(`provision-wallet failed: ${redactDiagnostic(error instanceof Error ? error.message : String(error))}`);
  process.exitCode = 1;
});

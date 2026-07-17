// Unit tests for the guarded Stellar Edge clients and isolated signer adapters.
//
// Covers the pure, injectable logic of:
//   supabase/functions/_shared/stellar/network-guard.ts (fail-closed overrides)
//   supabase/functions/_shared/stellar/signers.ts        (authority isolation)
//   supabase/functions/_shared/stellar/xdr.ts             (exact XDR parsing)
//   supabase/functions/_shared/stellar/soroban-auth.ts    (auth-entry verification)
//
// Validates: Requirements 1.3, 1.4, 1.7, 18.7, 20.5, 24.1
//
// Loading convention (repo test harness, mirrors edge-shared-security.test.mjs):
// the TypeScript modules are transpiled in-memory and imported as data: URLs.
// Relative dependencies are recursively transpiled; the bare `@stellar/stellar-sdk`
// specifier is remapped to the real installed package (resolved to a file URL)
// so the XDR/auth helpers parse genuine ledger bytes while the signer tests
// inject a fake keypair factory and never touch real secret material.

import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const sharedDir = fileURLToPath(new URL('../../supabase/functions/_shared/', import.meta.url));
const STELLAR_SDK_URL = pathToFileURL(require.resolve('@stellar/stellar-sdk')).href;

const SUPABASE_STUB_URL =
  'data:text/javascript;base64,' +
  Buffer.from(
    'export const createClient = () => { throw new Error("createClient stub must not be called"); };',
  ).toString('base64');

const cache = new Map();
const toDataUrl = (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;

async function loadModule(absPath) {
  if (cache.has(absPath)) return cache.get(absPath);
  const source = await readFile(absPath, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });

  const specifierRe = /\bfrom\s*(['"])([^'"]+)\1/g;
  const specifiers = new Set();
  let match;
  while ((match = specifierRe.exec(outputText)) !== null) specifiers.add(match[2]);

  const replacements = new Map();
  for (const specifier of specifiers) {
    if (specifier === '@supabase/supabase-js') {
      replacements.set(specifier, SUPABASE_STUB_URL);
    } else if (specifier === '@stellar/stellar-sdk') {
      replacements.set(specifier, STELLAR_SDK_URL);
    } else if (specifier.startsWith('.')) {
      replacements.set(specifier, await loadModule(path.resolve(path.dirname(absPath), specifier)));
    }
  }

  const rewritten = outputText.replace(specifierRe, (whole, quote, specifier) => {
    const replacement = replacements.get(specifier);
    return replacement ? `from ${quote}${replacement}${quote}` : whole;
  });

  const url = toDataUrl(rewritten);
  cache.set(absPath, url);
  return url;
}

const importShared = async (relativePath) =>
  import(await loadModule(path.join(sharedDir, relativePath)));

const sdk = await import('@stellar/stellar-sdk');
const sharedConfig = await importShared('../../../shared/stellar-config.ts');
const guardModule = await importShared('stellar/network-guard.ts');
const signersModule = await importShared('stellar/signers.ts');
const xdrModule = await importShared('stellar/xdr.ts');
const sorobanAuth = await importShared('stellar/soroban-auth.ts');

const ISSUER = 'G' + 'A'.repeat(55);
const OTHER_ISSUER = 'G' + 'B'.repeat(55);
const SAC = 'C' + 'A'.repeat(55);
const OTHER_CONTRACT = 'C' + 'B'.repeat(55);
const HORIZON = 'https://horizon-testnet.stellar.org';
const RPC = 'https://soroban-testnet.stellar.org';
const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';
const WASM_HASH = 'a'.repeat(64);

const testnetConfig = () =>
  sharedConfig.createStellarTestnetConfig({
    horizonUrl: HORIZON,
    rpcUrl: RPC,
    rcphpIssuer: ISSUER,
    rcphpSacId: SAC,
  });

// ---------------------------------------------------------------------------
// network-guard.ts
// ---------------------------------------------------------------------------

test('network-guard: a request without infrastructure fields is accepted', () => {
  const guard = guardModule.createNetworkGuard(testnetConfig());
  assert.doesNotThrow(() => guard.rejectInfrastructureOverride({}));
  assert.doesNotThrow(() => guard.assertTestnetConfig());
});

test('network-guard: values that exactly match the trusted config are tolerated', () => {
  const guard = guardModule.createNetworkGuard(testnetConfig());
  assert.doesNotThrow(() =>
    guard.rejectInfrastructureOverride({
      network: 'testnet',
      networkPassphrase: TESTNET_PASSPHRASE,
      horizonUrl: HORIZON,
      rpcUrl: RPC,
      assetCode: 'RCPHP',
      assetIssuer: ISSUER,
      sacId: SAC,
      mainnetEnabled: 'false',
    }),
  );
});

test('network-guard: rejects network, endpoint, and mainnet overrides (fail-closed)', () => {
  const guard = guardModule.createNetworkGuard(testnetConfig());
  assert.throws(() => guard.rejectInfrastructureOverride({ network: 'mainnet' }), /network cannot be overridden/i);
  assert.throws(
    () => guard.rejectInfrastructureOverride({ networkPassphrase: 'Public Global Stellar Network ; September 2015' }),
    /not the configured testnet passphrase/i,
  );
  assert.throws(() => guard.rejectInfrastructureOverride({ horizonUrl: 'https://horizon.stellar.org' }), /Horizon/i);
  assert.throws(() => guard.rejectInfrastructureOverride({ rpcUrl: 'https://evil.example.com' }), /RPC/i);
  assert.throws(() => guard.rejectInfrastructureOverride({ mainnetEnabled: 'true' }), /Mainnet cannot be enabled/i);
});

test('network-guard: rejects asset identity overrides', () => {
  const guard = guardModule.createNetworkGuard(testnetConfig());
  assert.throws(() => guard.rejectInfrastructureOverride({ assetCode: 'XLM' }), /asset code/i);
  assert.throws(() => guard.rejectInfrastructureOverride({ assetIssuer: OTHER_ISSUER }), /issuer/i);
  assert.throws(() => guard.rejectInfrastructureOverride({ issuer: OTHER_ISSUER }), /issuer/i);
  assert.throws(() => guard.rejectInfrastructureOverride({ sacId: OTHER_CONTRACT }), /SAC/i);
  assert.throws(() => guard.rejectInfrastructureOverride({ stellarAssetContractId: OTHER_CONTRACT }), /SAC/i);
});

test('network-guard: WASM hash override is checked against the approved hash', () => {
  const withHash = guardModule.createNetworkGuard(testnetConfig(), { expectedWasmHash: WASM_HASH });
  assert.doesNotThrow(() => withHash.rejectInfrastructureOverride({ wasmHash: WASM_HASH }));
  assert.throws(() => withHash.rejectInfrastructureOverride({ wasmHash: 'b'.repeat(64) }), /not the approved hash/i);
  assert.throws(() => withHash.rejectInfrastructureOverride({ contractWasmHash: 'c'.repeat(64) }), /not the approved hash/i);

  // With no approved hash configured, any WASM override fails closed.
  const noHash = guardModule.createNetworkGuard(testnetConfig());
  assert.throws(() => noHash.rejectInfrastructureOverride({ wasmHash: WASM_HASH }), /No approved voucher WASM hash/i);
});

test('network-guard: origin and contract assertions fail closed', () => {
  const guard = guardModule.createNetworkGuard(testnetConfig(), { allowedContractIds: [OTHER_CONTRACT] });
  assert.equal(guard.assertHorizonOrigin(HORIZON), HORIZON);
  assert.equal(guard.assertRpcOrigin(RPC), RPC);
  assert.throws(() => guard.assertHorizonOrigin('not a url'), /valid URL|allowlisted/i);
  assert.throws(() => guard.assertRpcOrigin('https://horizon-testnet.stellar.org'), /allowlisted/i);
  // The configured SAC and any explicitly allowlisted contract are accepted.
  assert.doesNotThrow(() => guard.assertContractAllowed(SAC));
  assert.doesNotThrow(() => guard.assertContractAllowed(OTHER_CONTRACT));
  assert.throws(() => guard.assertContractAllowed('C' + 'D'.repeat(55)), /not an allowlisted contract/i);
});

// ---------------------------------------------------------------------------
// signers.ts
// ---------------------------------------------------------------------------

// A deterministic fake keypair factory: a "secret" maps to a stable public key
// without any real cryptography, so tests never handle real secret material.
const fakeKeypairFactory = () => (secret) => ({
  publicKey: () => `PUB(${secret})`,
  signTransaction: (transaction) => {
    transaction.signedBy.push(`PUB(${secret})`);
  },
});

const perRoleResolver = () => (role) => `secret-${role}`;

test('signers: registry exposes an isolated signer per configured role', () => {
  const registry = signersModule.createInstitutionalSignerRegistry(perRoleResolver(), {
    keypairFromSecret: fakeKeypairFactory(),
  });
  assert.deepEqual([...registry.roles()].sort(), [...signersModule.INSTITUTIONAL_SIGNER_ROLES].sort());
  assert.equal(registry.has('issuer'), true);
  assert.equal(registry.get('sponsor').role, 'sponsor');
  assert.equal(registry.publicKeyOf('contract_admin'), 'PUB(secret-contract_admin)');
});

test('signers: a signer adds only its own signature and never stores the secret', () => {
  const registry = signersModule.createInstitutionalSignerRegistry(perRoleResolver(), {
    keypairFromSecret: fakeKeypairFactory(),
  });
  const signer = registry.get('cash_program_treasury');
  const tx = { signedBy: [] };
  signer.signTransaction(tx);
  assert.deepEqual(tx.signedBy, ['PUB(secret-cash_program_treasury)']);

  // The signer object exposes only role + functions; the secret is not retained.
  assert.deepEqual(Object.keys(signer).sort(), ['publicKey', 'role', 'signTransaction']);
  assert.ok(!JSON.stringify(signer).includes('secret-cash_program_treasury'));
});

test('signers: the reconciliation authority must never sign', () => {
  assert.throws(() => signersModule.assertSigningRole('reconciliation'), /must not hold a signing key/i);
  assert.throws(
    () => signersModule.createTestnetSigner('reconciliation', perRoleResolver(), { keypairFromSecret: fakeKeypairFactory() }),
    /must not hold a signing key/i,
  );
  assert.equal(signersModule.RECONCILIATION_AUTHORITY, 'reconciliation');
});

test('signers: unknown role and missing secret fail closed', () => {
  assert.throws(() => signersModule.assertSigningRole('treasurer'), /Unknown institutional signer role/i);

  const registry = signersModule.createInstitutionalSignerRegistry((role) =>
    role === 'issuer' ? 'secret-issuer' : undefined,
  { keypairFromSecret: fakeKeypairFactory() });
  assert.equal(registry.has('issuer'), true);
  assert.equal(registry.has('sponsor'), false);
  assert.throws(() => registry.get('sponsor'), /No signer is configured/i);
});

test('signers: two roles sharing one account collapse separation and are rejected', () => {
  // Every role resolves to the same secret => the same derived public key.
  const sharedResolver = () => 'one-shared-secret';
  assert.throws(
    () =>
      signersModule.createInstitutionalSignerRegistry(sharedResolver, {
        keypairFromSecret: fakeKeypairFactory(),
      }),
    /must not share the same account/i,
  );
});

// ---------------------------------------------------------------------------
// xdr.ts (real SDK)
// ---------------------------------------------------------------------------

const buildSignedPayment = () => {
  const source = sdk.Keypair.random();
  const account = new sdk.Account(source.publicKey(), '10');
  const tx = new sdk.TransactionBuilder(account, { fee: '100', networkPassphrase: sdk.Networks.TESTNET })
    .addOperation(sdk.Operation.payment({ destination: sdk.Keypair.random().publicKey(), asset: sdk.Asset.native(), amount: '1' }))
    .setTimeout(60)
    .build();
  tx.sign(source);
  return { tx, source };
};

test('xdr: parses a testnet envelope and computes its hash', () => {
  const { tx } = buildSignedPayment();
  const parsed = xdrModule.parseTransactionEnvelope(tx.toXDR(), sdk.Networks.TESTNET);
  assert.equal(parsed.isFeeBump, false);
  assert.equal(parsed.networkPassphrase, sdk.Networks.TESTNET);
  assert.equal(xdrModule.transactionHashHex(parsed.transaction), tx.hash().toString('hex'));
  assert.deepEqual(xdrModule.authorizationEntriesOf(xdrModule.innerTransactionOf(parsed.transaction)), []);
});

test('xdr: malformed XDR fails closed with XdrParseError', () => {
  assert.throws(() => xdrModule.parseTransactionEnvelope('not-valid-xdr', sdk.Networks.TESTNET), /Unable to parse transaction envelope/i);
});

test('xdr: unwraps a fee-bump to its inner transaction', () => {
  const { tx } = buildSignedPayment();
  const feeSource = sdk.Keypair.random();
  const feeBump = sdk.TransactionBuilder.buildFeeBumpTransaction(feeSource, '200', tx, sdk.Networks.TESTNET);
  const parsed = xdrModule.parseTransactionEnvelope(feeBump.toXDR(), sdk.Networks.TESTNET);
  assert.equal(parsed.isFeeBump, true);
  const inner = xdrModule.innerTransactionOf(parsed.transaction);
  assert.equal(xdrModule.transactionHashHex(inner), tx.hash().toString('hex'));
});

// ---------------------------------------------------------------------------
// soroban-auth.ts (real SDK)
// ---------------------------------------------------------------------------

const buildAuthEntry = ({ authorizer, contractId, functionName = 'redeem', sigExp = 1000, nonce = 123 }) => {
  const cred = sdk.xdr.SorobanCredentials.sorobanCredentialsAddress(
    new sdk.xdr.SorobanAddressCredentials({
      address: sdk.Address.fromString(authorizer).toScAddress(),
      nonce: new sdk.xdr.Int64(nonce),
      signatureExpirationLedger: sigExp,
      signature: sdk.xdr.ScVal.scvVoid(),
    }),
  );
  const invocation = new sdk.xdr.SorobanAuthorizedInvocation({
    function: sdk.xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
      new sdk.xdr.InvokeContractArgs({
        contractAddress: sdk.Address.fromString(contractId).toScAddress(),
        functionName,
        args: [],
      }),
    ),
    subInvocations: [],
  });
  return new sdk.xdr.SorobanAuthorizationEntry({ credentials: cred, rootInvocation: invocation }).toXDR('base64');
};

test('soroban-auth: reads address credentials and the invoked contract function', () => {
  const authorizer = sdk.Keypair.random().publicKey();
  const contractId = sdk.Address.contract(Buffer.alloc(32, 1)).toString();
  const parsed = sorobanAuth.parseAndReadAuthorizationEntry(buildAuthEntry({ authorizer, contractId }));
  assert.equal(parsed.credentials.credentialType, 'address');
  assert.equal(parsed.credentials.address, authorizer);
  assert.equal(parsed.credentials.nonce, '123');
  assert.equal(parsed.credentials.signatureExpirationLedger, 1000);
  assert.equal(parsed.rootInvocation.contractId, contractId);
  assert.equal(parsed.rootInvocation.functionName, 'redeem');
});

test('soroban-auth: assertAuthorizationMatches accepts the exact expected invocation', () => {
  const authorizer = sdk.Keypair.random().publicKey();
  const contractId = sdk.Address.contract(Buffer.alloc(32, 2)).toString();
  const parsed = sorobanAuth.parseAndReadAuthorizationEntry(buildAuthEntry({ authorizer, contractId }));
  assert.doesNotThrow(() =>
    sorobanAuth.assertAuthorizationMatches(parsed, {
      authorizer,
      contractId,
      functionName: 'redeem',
      currentLedger: 999,
    }),
  );
});

test('soroban-auth: mismatched wallet, contract, function, or expiry fail closed', () => {
  const authorizer = sdk.Keypair.random().publicKey();
  const contractId = sdk.Address.contract(Buffer.alloc(32, 3)).toString();
  const parsed = sorobanAuth.parseAndReadAuthorizationEntry(buildAuthEntry({ authorizer, contractId }));

  assert.throws(
    () => sorobanAuth.assertAuthorizationMatches(parsed, { authorizer: sdk.Keypair.random().publicKey(), contractId, functionName: 'redeem' }),
    /not signed by the expected wallet/i,
  );
  assert.throws(
    () => sorobanAuth.assertAuthorizationMatches(parsed, { authorizer, contractId: sdk.Address.contract(Buffer.alloc(32, 9)).toString(), functionName: 'redeem' }),
    /different contract/i,
  );
  assert.throws(
    () => sorobanAuth.assertAuthorizationMatches(parsed, { authorizer, contractId, functionName: 'refund' }),
    /different contract function/i,
  );
  assert.throws(
    () => sorobanAuth.assertAuthorizationMatches(parsed, { authorizer, contractId, functionName: 'redeem', currentLedger: 1000 }),
    /signature has expired/i,
  );
});

test('soroban-auth: malformed entry fails closed', () => {
  assert.throws(() => sorobanAuth.parseAndReadAuthorizationEntry('bogus'), /Unable to parse Soroban authorization entry/i);
});

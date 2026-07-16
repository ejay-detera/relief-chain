// Isolated institutional testnet signer adapters.
//
// The account topology keeps issuer, distribution, fee/reserve sponsor,
// organization treasury, cash-program treasury, contract deployer, and
// contract-admin authorities logically separated, and the reconciler holds NO
// signing key at all. This module encodes that separation in code:
//
//   - Each institutional role has its own isolated signer. A signer exposes its
//     public key and can add ITS role's signature to a transaction — nothing
//     more.
//   - Server secret keys are injected at RUNTIME through a resolver and used
//     only inside a signing call. A signer never stores the secret as a field,
//     and this module never logs secret material (the redaction utility from
//     Task 6.1 is the last line of defense for anything that is logged).
//   - The registry refuses a configuration in which two distinct roles resolve
//     to the same account, because that would collapse authority separation.
//   - `reconciliation` is modelled as a NON-signing authority and is rejected by
//     the signing surface.
//
// Configuration is injected; this module reads no Deno globals. The keypair
// factory is injectable so the isolation and secret-handling logic is unit
// testable without the real signing library.
//
// Validates: Requirements 1.4, 1.7, 20.5, 24.1

import { Keypair } from '@stellar/stellar-sdk';

import { safeLog } from '../redaction.ts';

/** Institutional roles that hold a server-only signing secret. */
export type InstitutionalSignerRole =
  | 'issuer'
  | 'distribution'
  | 'sponsor'
  | 'organization_treasury'
  | 'cash_program_treasury'
  | 'contract_deployer'
  | 'contract_admin';

export const INSTITUTIONAL_SIGNER_ROLES: readonly InstitutionalSignerRole[] = Object.freeze([
  'issuer',
  'distribution',
  'sponsor',
  'organization_treasury',
  'cash_program_treasury',
  'contract_deployer',
  'contract_admin',
]);

/**
 * The reconciliation authority observes the ledger and writes projections; it
 * MUST NOT hold a signing key. It is intentionally excluded from
 * {@link InstitutionalSignerRole}.
 */
export const RECONCILIATION_AUTHORITY = 'reconciliation' as const;
export type NonSigningAuthorityRole = typeof RECONCILIATION_AUTHORITY;

export class SignerConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SignerConfigurationError';
  }
}

/**
 * Minimal structural view of a signable Stellar transaction. Declaring `sign`
 * as a method keeps the real SDK `Transaction`/`FeeBumpTransaction` assignable
 * without importing their types at runtime.
 */
export interface SignableTransaction {
  sign(...keypairs: unknown[]): void;
}

/**
 * A capability to sign with a single account's secret. Created transiently from
 * a secret inside a signing call; never retained beyond it.
 */
export interface KeypairAdapter {
  publicKey(): string;
  signTransaction(transaction: SignableTransaction): void;
}

/** Builds a {@link KeypairAdapter} from a raw secret. Injectable for tests. */
export type KeypairFromSecret = (secret: string) => KeypairAdapter;

/**
 * Resolves the RUNTIME secret for a role, or `undefined` when the role is not
 * configured. The returned value is treated as sensitive: it is never stored or
 * logged. In production this reads from the injected environment; it is never
 * sourced from the mobile bundle or the database.
 */
export type SignerSecretResolver = (role: InstitutionalSignerRole) => string | undefined;

/** An isolated signer bound to exactly one institutional role. */
export interface TestnetSigner {
  readonly role: InstitutionalSignerRole;
  /** The public key for this role. Safe to log and expose. */
  publicKey(): string;
  /** Adds this role's signature to the transaction, in place. */
  signTransaction(transaction: SignableTransaction): void;
}

export interface SignerDependencies {
  readonly keypairFromSecret?: KeypairFromSecret;
}

const defaultKeypairFromSecret: KeypairFromSecret = (secret) => {
  const keypair = Keypair.fromSecret(secret);
  return {
    publicKey: () => keypair.publicKey(),
    signTransaction: (transaction) => transaction.sign(keypair),
  };
};

const isSigningRole = (role: string): role is InstitutionalSignerRole =>
  (INSTITUTIONAL_SIGNER_ROLES as readonly string[]).includes(role);

/** Throws if `role` is not a signing role (e.g. the reconciliation authority). */
export const assertSigningRole = (role: string): InstitutionalSignerRole => {
  if (role === RECONCILIATION_AUTHORITY) {
    throw new SignerConfigurationError('The reconciliation authority must not hold a signing key.');
  }
  if (!isSigningRole(role)) {
    throw new SignerConfigurationError(`Unknown institutional signer role: ${role}`);
  }
  return role;
};

/**
 * Creates an isolated signer for a role. The secret is resolved at construction
 * only to derive and cache the PUBLIC key, then discarded; each signing call
 * re-resolves the secret, uses it transiently, and lets it fall out of scope.
 * The secret is never stored on the returned object.
 */
export const createTestnetSigner = (
  role: InstitutionalSignerRole,
  resolveSecret: SignerSecretResolver,
  deps: SignerDependencies = {},
): TestnetSigner => {
  assertSigningRole(role);
  const keypairFromSecret = deps.keypairFromSecret ?? defaultKeypairFromSecret;

  const deriveAdapter = (): KeypairAdapter => {
    const secret = resolveSecret(role);
    if (secret === undefined || secret === '') {
      throw new SignerConfigurationError(`No signer secret is configured for role: ${role}`);
    }
    try {
      return keypairFromSecret(secret);
    } catch {
      // Never include the secret or the raw error (which may echo it).
      throw new SignerConfigurationError(`The configured secret for role ${role} is invalid.`);
    }
  };

  // Derive the public key once; the secret used here is not retained.
  const cachedPublicKey = deriveAdapter().publicKey();

  return Object.freeze({
    role,
    publicKey: () => cachedPublicKey,
    signTransaction: (transaction: SignableTransaction) => {
      deriveAdapter().signTransaction(transaction);
    },
  });
};

export interface InstitutionalSignerRegistry {
  /** True when the role has a configured secret. */
  has(role: InstitutionalSignerRole): boolean;
  /** Returns the isolated signer for a role; throws if it is not configured. */
  get(role: InstitutionalSignerRole): TestnetSigner;
  /** Returns the public key for a role without exposing its secret. */
  publicKeyOf(role: InstitutionalSignerRole): string;
  /** The configured signing roles. */
  roles(): readonly InstitutionalSignerRole[];
}

/**
 * Builds a registry of isolated signers for every configured institutional
 * role. Roles with no configured secret are simply absent. The registry fails
 * closed if two distinct roles resolve to the same account, which would break
 * the required authority separation.
 */
export const createInstitutionalSignerRegistry = (
  resolveSecret: SignerSecretResolver,
  deps: SignerDependencies = {},
): InstitutionalSignerRegistry => {
  const signers = new Map<InstitutionalSignerRole, TestnetSigner>();
  const publicKeyToRole = new Map<string, InstitutionalSignerRole>();

  for (const role of INSTITUTIONAL_SIGNER_ROLES) {
    let secretPresent = false;
    try {
      secretPresent = Boolean(resolveSecret(role));
    } catch {
      secretPresent = false;
    }
    if (!secretPresent) {
      continue;
    }

    const signer = createTestnetSigner(role, resolveSecret, deps);
    const publicKey = signer.publicKey();
    const existingRole = publicKeyToRole.get(publicKey);
    if (existingRole !== undefined && existingRole !== role) {
      // Two authorities sharing one account collapses separation of duties.
      safeLog('institutional signer separation violation', { role, conflictsWith: existingRole });
      throw new SignerConfigurationError(
        `Signer roles ${existingRole} and ${role} must not share the same account.`,
      );
    }
    publicKeyToRole.set(publicKey, role);
    signers.set(role, signer);
  }

  const get = (role: InstitutionalSignerRole): TestnetSigner => {
    assertSigningRole(role);
    const signer = signers.get(role);
    if (signer === undefined) {
      throw new SignerConfigurationError(`No signer is configured for role: ${role}`);
    }
    return signer;
  };

  return Object.freeze({
    has: (role: InstitutionalSignerRole) => signers.has(role),
    get,
    publicKeyOf: (role: InstitutionalSignerRole) => get(role).publicKey(),
    roles: () => Object.freeze([...signers.keys()]),
  });
};

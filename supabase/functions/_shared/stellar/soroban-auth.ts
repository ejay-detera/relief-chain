// Soroban authorization-entry parsing and verification helpers.
//
// For a voucher redemption the sponsor is the transaction source while the
// BENEFICIARY authorizes the exact contract invocation. The beneficiary signs a
// Soroban authorization entry (invocation tree, nonce, signature-expiration
// ledger, network) and returns it; the orchestrator must verify that entry
// matches the intended contract, function, and address BEFORE it signs and
// submits the envelope. A fee-bump never supplies this authorization.
//
// These helpers read the structured fields of an authorization entry and assert
// they equal the expected values, failing closed on any mismatch. They do not
// perform signature cryptography — that is delegated to the SDK during signing
// (see signers.ts / xdr.ts) — they enforce that the entry authorizes exactly
// what the server intends.
//
// Validates: Requirements 18.7, 20.5

import { Address, xdr } from '@stellar/stellar-sdk';

import { parseAuthorizationEntry, XdrParseError } from './xdr.ts';

export interface AddressCredentialFields {
  readonly credentialType: 'address' | 'source_account';
  /** Authorizing address (G... or C...) for address credentials; null otherwise. */
  readonly address: string | null;
  /** Nonce as a decimal string, for address credentials; null otherwise. */
  readonly nonce: string | null;
  /** Ledger after which the signature is invalid; null for source-account creds. */
  readonly signatureExpirationLedger: number | null;
}

export interface InvocationTarget {
  /** Invoked contract id (C...). */
  readonly contractId: string;
  /** Invoked contract function name. */
  readonly functionName: string;
}

export interface ParsedAuthorizationEntry {
  readonly credentials: AddressCredentialFields;
  readonly rootInvocation: InvocationTarget;
  readonly entry: xdr.SorobanAuthorizationEntry;
}

const scAddressToString = (address: xdr.ScAddress): string =>
  Address.fromScAddress(address).toString();

const readCredentials = (
  credentials: xdr.SorobanCredentials,
): AddressCredentialFields => {
  if (credentials.switch() === xdr.SorobanCredentialsType.sorobanCredentialsAddress()) {
    const address = credentials.address();
    return Object.freeze({
      credentialType: 'address' as const,
      address: scAddressToString(address.address()),
      // nonce is an xdr Int64; toString yields the exact decimal value.
      nonce: address.nonce().toString(),
      signatureExpirationLedger: address.signatureExpirationLedger(),
    });
  }
  return Object.freeze({
    credentialType: 'source_account' as const,
    address: null,
    nonce: null,
    signatureExpirationLedger: null,
  });
};

const readRootInvocation = (
  invocation: xdr.SorobanAuthorizedInvocation,
): InvocationTarget => {
  const fn = invocation.function();
  if (fn.switch() !== xdr.SorobanAuthorizedFunctionType.sorobanAuthorizedFunctionTypeContractFn()) {
    throw new XdrParseError('Authorization entry does not authorize a contract invocation.');
  }
  const contractFn = fn.contractFn();
  return Object.freeze({
    contractId: scAddressToString(contractFn.contractAddress()),
    functionName: contractFn.functionName().toString(),
  });
};

/** Reads the structured, comparable fields of an authorization entry. */
export const readAuthorizationEntry = (
  entry: xdr.SorobanAuthorizationEntry,
): ParsedAuthorizationEntry =>
  Object.freeze({
    credentials: readCredentials(entry.credentials()),
    rootInvocation: readRootInvocation(entry.rootInvocation()),
    entry,
  });

/** Parses a base64 authorization entry and reads its structured fields. */
export const parseAndReadAuthorizationEntry = (
  entryXdr: string,
): ParsedAuthorizationEntry => readAuthorizationEntry(parseAuthorizationEntry(entryXdr));

export interface ExpectedAuthorization {
  /** The address that must authorize the invocation (the beneficiary wallet). */
  readonly authorizer: string;
  /** The contract the invocation must target (the voucher program instance). */
  readonly contractId: string;
  /** The contract function that must be invoked (e.g. `redeem`). */
  readonly functionName: string;
  /**
   * The current ledger. When provided, the signature-expiration ledger must be
   * strictly greater so an already-expired authorization is rejected.
   */
  readonly currentLedger?: number;
}

export class SorobanAuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SorobanAuthorizationError';
  }
}

/**
 * Asserts a parsed authorization entry authorizes exactly the expected
 * beneficiary, contract, and function, and (when a current ledger is supplied)
 * has not expired. Throws {@link SorobanAuthorizationError} on any mismatch.
 * Returns the parsed entry for convenient chaining.
 */
export const assertAuthorizationMatches = (
  parsed: ParsedAuthorizationEntry,
  expected: ExpectedAuthorization,
): ParsedAuthorizationEntry => {
  if (parsed.credentials.credentialType !== 'address') {
    throw new SorobanAuthorizationError('Redemption requires an address-scoped authorization.');
  }
  if (parsed.credentials.address !== expected.authorizer) {
    throw new SorobanAuthorizationError('Authorization is not signed by the expected wallet.');
  }
  if (parsed.rootInvocation.contractId !== expected.contractId) {
    throw new SorobanAuthorizationError('Authorization targets a different contract.');
  }
  if (parsed.rootInvocation.functionName !== expected.functionName) {
    throw new SorobanAuthorizationError('Authorization targets a different contract function.');
  }
  if (
    expected.currentLedger !== undefined &&
    parsed.credentials.signatureExpirationLedger !== null &&
    parsed.credentials.signatureExpirationLedger <= expected.currentLedger
  ) {
    throw new SorobanAuthorizationError('Authorization signature has expired.');
  }
  return parsed;
};

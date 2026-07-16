// Exact transaction, envelope, and auth-entry XDR parsing helpers.
//
// A submission response is never trusted, and neither is a signed object
// returned by a client. Before the orchestrator adds an institutional or
// sponsor signature, it must parse the exact bytes the client returned and
// compare every field against the stored intent (design: prepare/build/
// authorize/submit). These helpers do the low-level, fail-closed decoding:
//
//   - parse a base64 transaction envelope, bound to the configured network;
//   - distinguish and unwrap fee-bump transactions;
//   - compute the canonical transaction hash;
//   - extract Soroban authorization entries from an invocation.
//
// Parsing never falls back to a default: malformed input throws. Network
// binding is explicit so a transaction built for another network cannot be
// mistaken for a testnet transaction.
//
// Validates: Requirements 18.7, 20.5

import {
    FeeBumpTransaction,
    Transaction,
    TransactionBuilder,
    xdr,
} from '@stellar/stellar-sdk';

export class XdrParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'XdrParseError';
  }
}

export interface ParsedEnvelope {
  /** The decoded transaction. Fee-bump transactions are reported separately. */
  readonly transaction: Transaction | FeeBumpTransaction;
  readonly isFeeBump: boolean;
  /** The network passphrase the transaction is bound to. */
  readonly networkPassphrase: string;
}

/**
 * Decodes a base64 transaction envelope and binds it to `networkPassphrase`.
 * Throws {@link XdrParseError} on malformed input or a network mismatch. The
 * caller must pass the trusted configured passphrase so a foreign-network
 * transaction is rejected here rather than deeper in the pipeline.
 */
export const parseTransactionEnvelope = (
  envelopeXdr: string,
  networkPassphrase: string,
): ParsedEnvelope => {
  let transaction: Transaction | FeeBumpTransaction;
  try {
    transaction = TransactionBuilder.fromXDR(envelopeXdr, networkPassphrase);
  } catch (cause) {
    throw new XdrParseError(
      `Unable to parse transaction envelope: ${(cause as Error).message ?? 'invalid XDR'}`,
    );
  }

  // Defense in depth: the SDK stamps the passphrase used to parse; assert it.
  if (transaction.networkPassphrase !== networkPassphrase) {
    throw new XdrParseError('Transaction is not bound to the expected network.');
  }

  return Object.freeze({
    transaction,
    isFeeBump: transaction instanceof FeeBumpTransaction,
    networkPassphrase,
  });
};

/**
 * Returns the inner classic transaction, unwrapping a fee-bump if present. A
 * fee-bump only pays fees; the inner transaction carries the real operations and
 * signatures the orchestrator must verify against intent.
 */
export const innerTransactionOf = (
  transaction: Transaction | FeeBumpTransaction,
): Transaction =>
  transaction instanceof FeeBumpTransaction ? transaction.innerTransaction : transaction;

/** Lowercase hex transaction hash of a classic transaction. */
export const transactionHashHex = (transaction: Transaction | FeeBumpTransaction): string =>
  transaction.hash().toString('hex');

/**
 * Decodes a base64 Soroban authorization entry, failing closed on malformed
 * input. Used to verify a beneficiary-returned auth entry before submission.
 */
export const parseAuthorizationEntry = (entryXdr: string): xdr.SorobanAuthorizationEntry => {
  try {
    return xdr.SorobanAuthorizationEntry.fromXDR(entryXdr, 'base64');
  } catch (cause) {
    throw new XdrParseError(
      `Unable to parse Soroban authorization entry: ${(cause as Error).message ?? 'invalid XDR'}`,
    );
  }
};

/**
 * Extracts the Soroban authorization entries carried by an
 * `invokeHostFunction` operation in a classic transaction. Returns an empty
 * array when the transaction has no such operation.
 */
export const authorizationEntriesOf = (transaction: Transaction): xdr.SorobanAuthorizationEntry[] => {
  const entries: xdr.SorobanAuthorizationEntry[] = [];
  for (const operation of transaction.operations) {
    if (operation.type === 'invokeHostFunction') {
      const auth = (operation as { auth?: xdr.SorobanAuthorizationEntry[] }).auth;
      if (Array.isArray(auth)) {
        entries.push(...auth);
      }
    }
  }
  return entries;
};

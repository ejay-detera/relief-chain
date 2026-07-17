// Beneficiary wallet provisioning (sponsored, authorized RCPHP trustline).
//
// A fresh beneficiary wallet cannot hold RCPHP until it has an issuer-authorized
// trustline (the issuer runs AUTH_REQUIRED). Creating the trustline requires the
// wallet's OWN signature (it is the trustor), so provisioning is a client-signed
// flow: the server builds the exact sponsored trustline transaction, the phone
// signs its changeTrust, and the server adds the sponsor signature and submits,
// then the issuer authorizes the trustline in a second transaction.
//
// This module holds the pure build + structural-verification logic; the account
// existence check, submission, issuer authorization, and wallet-row binding live
// in the per-function index.ts entrypoints.

import {
    Asset,
    BASE_FEE,
    Operation,
    TransactionBuilder,
    type Transaction,
} from '@stellar/stellar-sdk';

import {
    requireRCPHPIdentifiers,
    type StellarTestnetConfig,
} from '../../../../shared/stellar-config.ts';
import { FinancialErrorException } from '../errors.ts';
import { verifyTransactionSignedBy } from './cash-activation.ts';

export const STELLAR_ACCOUNT_PATTERN = /^G[A-Z2-7]{55}$/;
const DEFAULT_VALIDITY_SECONDS = 180;

/** A minimal account shape (sequence provider) accepted by TransactionBuilder. */
export interface SequenceAccount {
  accountId(): string;
  sequenceNumber(): string;
  incrementSequenceNumber(): void;
}

/**
 * Builds the exact sponsored RCPHP trustline transaction for a beneficiary
 * wallet: the fee/reserve sponsor is the source (pays fee + reserve) and wraps
 * the wallet's changeTrust in begin/end sponsoring. The wallet must sign it.
 */
export const buildSponsoredTrustlineTransaction = (params: {
  readonly config: StellarTestnetConfig;
  readonly sponsorPublicKey: string;
  readonly sponsorAccount: SequenceAccount;
  readonly walletAddress: string;
  readonly validitySeconds?: number;
}): Transaction => {
  const rcphp = requireRCPHPIdentifiers(params.config);
  return new TransactionBuilder(params.sponsorAccount, {
    fee: String(Number(BASE_FEE) * 100),
    networkPassphrase: params.config.networkPassphrase,
  })
    .addOperation(
      Operation.beginSponsoringFutureReserves({
        sponsoredId: params.walletAddress,
        source: params.sponsorPublicKey,
      }),
    )
    .addOperation(Operation.changeTrust({ asset: new Asset(rcphp.code, rcphp.issuer), source: params.walletAddress }))
    .addOperation(Operation.endSponsoringFutureReserves({ source: params.walletAddress }))
    .setTimeout(params.validitySeconds ?? DEFAULT_VALIDITY_SECONDS)
    .build();
};

/**
 * Asserts a client-signed transaction is EXACTLY the sponsored RCPHP trustline
 * for `walletAddress`, sourced by the sponsor, and carries the wallet's
 * signature. Any deviation is rejected before the sponsor co-signs and submits.
 */
export const assertSignedTrustlineMatches = (
  transaction: Transaction,
  params: {
    readonly config: StellarTestnetConfig;
    readonly sponsorPublicKey: string;
    readonly walletAddress: string;
    readonly correlationId: string;
  },
): void => {
  const rcphp = requireRCPHPIdentifiers(params.config);
  const reject = (detail: string): never => {
    throw FinancialErrorException.of('validation_failed', detail, { correlationId: params.correlationId });
  };

  if (transaction.source !== params.sponsorPublicKey) {
    reject('The provisioning transaction must be sourced by the fee/reserve sponsor.');
  }
  if (transaction.operations.length !== 3) {
    reject('The provisioning transaction must contain exactly the sponsored trustline operations.');
  }
  const [begin, trust, end] = transaction.operations;

  if (begin.type !== 'beginSponsoringFutureReserves' || begin.sponsoredId !== params.walletAddress) {
    reject('The provisioning transaction must begin sponsoring the wallet reserve.');
  }
  if (trust.type !== 'changeTrust') {
    reject('The provisioning transaction must create a trustline.');
  }
  const line = (trust as Extract<typeof trust, { type: 'changeTrust' }>).line as {
    getCode?: () => string;
    getIssuer?: () => string;
  };
  if (line.getCode?.() !== rcphp.code || line.getIssuer?.() !== rcphp.issuer) {
    reject('The provisioning trustline must be for the configured RCPHP asset.');
  }
  if (((trust as { source?: string }).source ?? transaction.source) !== params.walletAddress) {
    reject('The trustline must be created by the beneficiary wallet.');
  }
  if (end.type !== 'endSponsoringFutureReserves' || ((end as { source?: string }).source ?? transaction.source) !== params.walletAddress) {
    reject('The provisioning transaction must end sponsoring on the wallet.');
  }
  if (!verifyTransactionSignedBy(transaction, params.walletAddress)) {
    throw FinancialErrorException.of('authorization_failed', 'The provisioning transaction is missing the wallet signature.', {
      correlationId: params.correlationId,
    });
  }
};

/** Builds the issuer's setTrustLineFlags transaction authorizing the wallet trustline. */
export const buildIssuerAuthorizationTransaction = (params: {
  readonly config: StellarTestnetConfig;
  readonly issuerPublicKey: string;
  readonly issuerAccount: SequenceAccount;
  readonly walletAddress: string;
  readonly validitySeconds?: number;
}): Transaction => {
  const rcphp = requireRCPHPIdentifiers(params.config);
  return new TransactionBuilder(params.issuerAccount, {
    fee: String(Number(BASE_FEE) * 100),
    networkPassphrase: params.config.networkPassphrase,
  })
    .addOperation(
      Operation.setTrustLineFlags({
        trustor: params.walletAddress,
        asset: new Asset(rcphp.code, rcphp.issuer),
        flags: { authorized: true },
      }),
    )
    .setTimeout(params.validitySeconds ?? DEFAULT_VALIDITY_SECONDS)
    .build();
};

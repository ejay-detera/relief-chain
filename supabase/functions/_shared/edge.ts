// Edge Function composition root.
//
// The shared modules under `_shared/` are pure and dependency-injected; they
// read no runtime globals. This module is the single wiring layer that assembles
// them into the concrete collaborators a per-function `index.ts` needs:
//   - runtime + Stellar testnet config (from the Deno environment);
//   - a fail-closed network guard;
//   - the caller-scoped (RLS) client + authenticated session;
//   - the narrow append-only service writer + service client;
//   - the isolated institutional signer registry (secrets from the environment);
//   - the reusable prepare/build/authorize/submit transaction protocol.
//
// It also provides `handleEdgeRequest`, a top-level wrapper that authenticates,
// runs the handler, and converts any thrown value into the typed error envelope
// so no catch path can turn a failure into a success.
//
// Validates: Requirements 1.3, 2.5, 18.3, 18.4, 20.5, 20.6, 24.1

import type { StellarTestnetConfig } from '../../../shared/stellar-config.ts';
import {
    authenticateRequest,
    createServiceClient,
    createServiceWriter,
    loadEdgeRuntimeConfig,
    type EdgeRuntimeConfig,
    type EdgeSession,
    type ServiceWriter,
    type TypedSupabaseClient,
} from './auth.ts';
import {
    newCorrelationId,
    toFinancialError,
} from './errors.ts';
import { safeLog } from './redaction.ts';
import { errorResponse } from './response.ts';
import { readEnv } from './runtime.ts';
import { loadEdgeStellarConfig } from './stellar/config.ts';
import { createNetworkGuard, type NetworkGuard } from './stellar/network-guard.ts';
import {
    createServiceAttemptStore,
    createServiceIdempotencyClaim,
    createServiceIntentStore,
    createTransactionProtocol,
    type ReconciliationGateway,
    type TransactionProtocol,
} from './stellar/protocol.ts';
import {
    createInstitutionalSignerRegistry,
    type InstitutionalSignerRegistry,
    type InstitutionalSignerRole,
} from './stellar/signers.ts';

/** Immutable per-process configuration shared by every request. */
export interface EdgeContext {
  readonly runtime: EdgeRuntimeConfig;
  readonly stellar: StellarTestnetConfig;
  readonly guard: NetworkGuard;
}

/**
 * Loads and validates runtime + Stellar configuration once. The network guard
 * hard-fails on any non-testnet configuration, so a misconfigured build cannot
 * serve financial traffic (Requirement 1.3, 24.1).
 */
export const loadEdgeContext = (): EdgeContext => {
  const runtime = loadEdgeRuntimeConfig(readEnv);
  const stellar = loadEdgeStellarConfig(readEnv);
  const guard = createNetworkGuard(stellar);
  guard.assertTestnetConfig();
  return { runtime, stellar, guard };
};

// The environment variable that carries each institutional signer's secret seed.
// These mirror the names the topology bootstrap persists, so a single secret
// store feeds both the operator scripts and the Edge runtime. Secrets are read
// only here, only at signing time, and never logged (Requirement 1.7, 20.5).
const SIGNER_SECRET_ENV: Readonly<Record<InstitutionalSignerRole, string>> = {
  issuer: 'STELLAR_ISSUER_SECRET',
  distribution: 'STELLAR_DISTRIBUTION_SECRET',
  sponsor: 'STELLAR_SPONSOR_SECRET',
  organization_treasury: 'STELLAR_ORGANIZATION_TREASURY_SECRET',
  cash_program_treasury: 'STELLAR_CASH_PROGRAM_TREASURY_SECRET',
  contract_deployer: 'STELLAR_CONTRACT_DEPLOYER_SECRET',
  contract_admin: 'STELLAR_CONTRACT_ADMIN_SECRET',
};

/** Builds the isolated institutional signer registry from environment secrets. */
export const createEdgeSignerRegistry = (): InstitutionalSignerRegistry =>
  createInstitutionalSignerRegistry((role) => readEnv(SIGNER_SECRET_ENV[role]));

/** Service-role client + narrow append-only writer, constructed server-side only. */
export interface EdgeServiceBinding {
  readonly serviceClient: TypedSupabaseClient;
  readonly serviceWriter: ServiceWriter;
}

/** Builds the service-role client and its narrow writer for one request. */
export const createEdgeServiceBinding = (
  context: EdgeContext,
  correlationId: string,
): EdgeServiceBinding => {
  const serviceClient = createServiceClient(context.runtime);
  const serviceWriter = createServiceWriter(serviceClient, correlationId);
  return { serviceClient, serviceWriter };
};

/** Dependencies for the reusable transaction protocol on the cash rail. */
export interface EdgeProtocolBinding {
  readonly service: EdgeServiceBinding;
  readonly correlationId: string;
  readonly reconciler: ReconciliationGateway;
}

/**
 * Assembles the reusable prepare/build/authorize/submit protocol bound to the
 * request's service stores, institutional signers, and a reconciliation gateway
 * (used only by the retry path). Confirmation stays reconciliation-owned.
 */
export const createEdgeTransactionProtocol = (
  context: EdgeContext,
  binding: EdgeProtocolBinding,
): TransactionProtocol =>
  createTransactionProtocol({
    config: context.stellar,
    guard: context.guard,
    signers: createEdgeSignerRegistry(),
    claim: createServiceIdempotencyClaim(binding.service.serviceClient),
    intents: createServiceIntentStore({
      serviceClient: binding.service.serviceClient,
      serviceWriter: binding.service.serviceWriter,
      correlationId: binding.correlationId,
    }),
    attempts: createServiceAttemptStore({
      serviceClient: binding.service.serviceClient,
      serviceWriter: binding.service.serviceWriter,
      correlationId: binding.correlationId,
    }),
    reconciler: binding.reconciler,
  });

/** Parses a JSON request body, returning `{}` for an empty body. */
export const parseJsonBody = async <T>(request: Request): Promise<T> => {
  const text = await request.text();
  if (text.trim() === '') {
    return {} as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    return {} as T;
  }
};

/** The authenticated collaborators handed to an Edge handler. */
export interface EdgeRequestScope {
  readonly request: Request;
  readonly context: EdgeContext;
  readonly client: TypedSupabaseClient;
  readonly session: EdgeSession;
  readonly correlationId: string;
}

/** A user-facing Edge handler that runs after authentication succeeds. */
export type EdgeHandler = (scope: EdgeRequestScope) => Promise<Response>;

/**
 * Top-level request wrapper for a user-invoked Edge Function. It loads config,
 * authenticates the caller through a caller-scoped RLS client, runs the handler,
 * and converts ANY thrown value into the typed error envelope. A single catch
 * guarantees no failure is ever represented as a success (Requirement 21.4).
 */
export const handleEdgeRequest = async (
  request: Request,
  handler: EdgeHandler,
): Promise<Response> => {
  const correlationId = newCorrelationId();
  try {
    const context = loadEdgeContext();
    const { client, session } = await authenticateRequest(request, context.runtime, {
      correlationId,
    });
    return await handler({ request, context, client, session, correlationId });
  } catch (error) {
    safeLog('edge request failed', { correlationId, error });
    try {
      const fs = require('fs');
      if (fs.appendFileSync) fs.appendFileSync('edge_errors.log', JSON.stringify({correlationId, error: String(error)}) + '\n');
    } catch(e){}
    try {
      Deno.writeTextFileSync('edge_errors.log', JSON.stringify({correlationId, error: String(error), stack: error?.stack}) + '\n', {append: true});
    } catch(e){}
    return errorResponse(toFinancialError(error, correlationId));
  }
};

// Shared authentication and authorization for user-facing Edge Functions.
//
// Every user-invoked function:
//   1. requires a valid Supabase user JWT (verify_jwt is also enabled at the
//      platform), resolved through the Auth server rather than trusted blindly;
//   2. runs its authorization reads through a CALLER-SCOPED client so Postgres
//      Row Level Security is the authoritative isolation boundary; and
//   3. enforces organization membership, role, and AAL / recent-step-up
//      requirements before any privileged work begins.
//
// Service-role credentials bypass RLS, so they are never handed to callers.
// They are exposed only through a narrow writer (see createServiceWriter) that
// permits append-only intent/attempt/event writes and projection upserts and
// refuses everything else, encoding least privilege at the code boundary.
//
// This module deliberately avoids Deno-global access. Runtime configuration is
// injected (matching stellar/config.ts), which keeps the project-wide type
// check clean and makes the pure logic unit-testable.
//
// Validates: Requirements 2.5, 18.3, 20.5, 20.6

import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

import type { Database } from '../../../src/types/database.types.ts';
import {
    FinancialErrorException,
    makeFinancialError,
    newCorrelationId,
} from './errors.ts';
import { safeLog } from './redaction.ts';
import type {
    AuthenticatorAssuranceLevel,
    OrganizationRole,
} from './tenant-authorization.ts';

export type TypedSupabaseClient = SupabaseClient<Database>;

/** Reads a named environment value; injected so this module never touches Deno. */
export type EdgeEnvironmentReader = (name: string) => string | undefined;

/** Factory type matching @supabase/supabase-js `createClient`, injectable for tests. */
export type CreateClientFn = typeof createClient;

export interface EdgeRuntimeConfig {
  readonly supabaseUrl: string;
  readonly supabaseAnonKey: string;
  /** Present only where service writes are required; never sent to clients. */
  readonly supabaseServiceRoleKey?: string;
}

const requireEnv = (read: EdgeEnvironmentReader, name: string): string => {
  const value = read(name);
  if (value === undefined || value === '') {
    // Misconfiguration is an internal fault, not a user error.
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

/** Loads Edge runtime configuration from an injected environment reader. */
export const loadEdgeRuntimeConfig = (read: EdgeEnvironmentReader): EdgeRuntimeConfig => ({
  supabaseUrl: requireEnv(read, 'SUPABASE_URL'),
  supabaseAnonKey: requireEnv(read, 'SUPABASE_ANON_KEY'),
  supabaseServiceRoleKey: read('SUPABASE_SERVICE_ROLE_KEY'),
});

// ---------------------------------------------------------------------------
// JWT claim parsing (pure).
// ---------------------------------------------------------------------------

export interface AuthMethodReference {
  readonly method: string;
  /** Unix seconds when the method was satisfied, when present. */
  readonly timestamp: number | null;
}

export interface JwtClaims {
  readonly sub: string | null;
  readonly aal: string | null;
  readonly amr: readonly AuthMethodReference[];
  readonly exp: number | null;
}

const authRequired = (message: string, correlationId?: string): FinancialErrorException =>
  FinancialErrorException.of('authentication_required', message, { correlationId });

/** Extracts the bearer token from an Authorization header value. */
export const extractBearerToken = (authorizationHeader: string | null): string => {
  if (!authorizationHeader) {
    throw authRequired('A valid authentication token is required.');
  }
  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim());
  if (!match) {
    throw authRequired('The authentication token is malformed.');
  }
  return match[1].trim();
};

const decodeBase64UrlToString = (segment: string): string => {
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  const binary = atob(normalized + padding);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

const toAuthMethods = (raw: unknown): AuthMethodReference[] => {
  if (!Array.isArray(raw)) {
    return [];
  }
  const methods: AuthMethodReference[] = [];
  for (const entry of raw) {
    if (entry && typeof entry === 'object' && typeof (entry as { method?: unknown }).method === 'string') {
      const rawTimestamp = (entry as { timestamp?: unknown }).timestamp;
      const timestamp = typeof rawTimestamp === 'number' && Number.isFinite(rawTimestamp)
        ? rawTimestamp
        : null;
      methods.push({ method: (entry as { method: string }).method, timestamp });
    }
  }
  return methods;
};

/**
 * Decodes (does not verify) the claims segment of a JWT. Signature verification
 * is performed by the platform's verify_jwt and by resolving the user through
 * the Auth server; these claims are read only for AAL / step-up evaluation.
 */
export const decodeJwtClaims = (token: string): JwtClaims => {
  const segments = token.split('.');
  if (segments.length !== 3) {
    throw authRequired('The authentication token is malformed.');
  }
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(decodeBase64UrlToString(segments[1])) as Record<string, unknown>;
  } catch {
    throw authRequired('The authentication token is malformed.');
  }
  return {
    sub: typeof payload.sub === 'string' ? payload.sub : null,
    aal: typeof payload.aal === 'string' ? payload.aal : null,
    amr: toAuthMethods(payload.amr),
    exp: typeof payload.exp === 'number' ? payload.exp : null,
  };
};

// ---------------------------------------------------------------------------
// Session model.
// ---------------------------------------------------------------------------

export interface EdgeSession {
  readonly userId: string;
  readonly aal: AuthenticatorAssuranceLevel;
  readonly authMethods: readonly AuthMethodReference[];
  readonly token: string;
  readonly correlationId: string;
}

const normalizeAal = (aal: string | null): AuthenticatorAssuranceLevel =>
  aal === 'aal2' ? 'aal2' : 'aal1';

// Step-up methods that satisfy AAL2, mirroring private.has_recent_step_up.
const STEP_UP_METHODS: ReadonlySet<string> = new Set(['totp', 'otp', 'webauthn']);

// Default and clamp bounds mirror the database function exactly.
export const DEFAULT_STEP_UP_MAX_AGE_SECONDS = 10 * 60;
const STEP_UP_MAX_AGE_CEILING_SECONDS = 60 * 60;
const STEP_UP_CLOCK_SKEW_SECONDS = 60;

/**
 * Mirrors private.has_recent_step_up: an AAL2 session with a step-up method
 * satisfied within the allowed window. The database restrictive policies remain
 * authoritative; this enables an early, user-safe rejection.
 */
export const hasRecentStepUp = (
  session: EdgeSession,
  now: Date = new Date(),
  maxAgeSeconds: number = DEFAULT_STEP_UP_MAX_AGE_SECONDS,
): boolean => {
  if (maxAgeSeconds <= 0 || maxAgeSeconds > STEP_UP_MAX_AGE_CEILING_SECONDS) {
    return false;
  }
  if (session.aal !== 'aal2') {
    return false;
  }
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const lowerBound = nowSeconds - maxAgeSeconds;
  const upperBound = nowSeconds + STEP_UP_CLOCK_SKEW_SECONDS;
  return session.authMethods.some(
    (method) =>
      STEP_UP_METHODS.has(method.method) &&
      method.timestamp !== null &&
      method.timestamp >= lowerBound &&
      method.timestamp <= upperBound,
  );
};

const sessionFromClaims = (user: User, claims: JwtClaims, token: string, correlationId: string): EdgeSession => ({
  userId: user.id,
  aal: normalizeAal(claims.aal),
  authMethods: claims.amr,
  token,
  correlationId,
});

// ---------------------------------------------------------------------------
// Caller-scoped client and authentication.
// ---------------------------------------------------------------------------

export interface AuthDependencies {
  /** Injectable client factory (defaults to @supabase/supabase-js). */
  readonly createClientFn?: CreateClientFn;
  /** Correlation id to thread through the request; a new one is minted otherwise. */
  readonly correlationId?: string;
}

/**
 * Builds a Supabase client that carries the caller's JWT on every request, so
 * database access is scoped by RLS to exactly what that user may see or do.
 */
export const createCallerClient = (
  token: string,
  config: EdgeRuntimeConfig,
  deps: AuthDependencies = {},
): TypedSupabaseClient => {
  const factory = deps.createClientFn ?? createClient;
  return factory<Database>(config.supabaseUrl, config.supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
};

/**
 * Resolves the authenticated user through the Auth server and returns a
 * caller-scoped client plus the session. Throws an authentication error when no
 * valid user can be resolved.
 */
export const authenticateRequest = async (
  request: Request,
  config: EdgeRuntimeConfig,
  deps: AuthDependencies = {},
): Promise<{ client: TypedSupabaseClient; session: EdgeSession }> => {
  const correlationId = deps.correlationId ?? newCorrelationId();
  const token = extractBearerToken(request.headers.get('Authorization'));
  const claims = decodeJwtClaims(token);
  const client = createCallerClient(token, config, deps);

  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) {
    throw authRequired('The authentication token is invalid or expired.', correlationId);
  }
  // Defense in depth: the resolved subject must match the presented claim.
  if (claims.sub !== null && claims.sub !== data.user.id) {
    throw authRequired('The authentication token is invalid.', correlationId);
  }

  return { client, session: sessionFromClaims(data.user, claims, token, correlationId) };
};

// ---------------------------------------------------------------------------
// Authorization assertions (RLS-scoped reads + AAL enforcement).
// ---------------------------------------------------------------------------

/**
 * Confirms the caller holds an ACTIVE membership in the organization and returns
 * their role. The read runs under RLS, so it can only observe memberships the
 * caller is permitted to see. Absence of a membership is an authorization error.
 */
export const requireOrganizationMembership = async (
  client: TypedSupabaseClient,
  session: EdgeSession,
  organizationId: string,
): Promise<OrganizationRole> => {
  const { data, error } = await client
    .from('organization_memberships')
    .select('role')
    .eq('organization_id', organizationId)
    .eq('user_id', session.userId)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    safeLog('requireOrganizationMembership read failed', {
      correlationId: session.correlationId,
      organizationId,
      error,
    });
    throw new FinancialErrorException(
      makeFinancialError('dependency_unavailable', 'Unable to verify organization access right now.', {
        correlationId: session.correlationId,
        retryable: true,
      }),
    );
  }

  if (!data) {
    throw FinancialErrorException.of(
      'authorization_failed',
      'You do not have access to this organization.',
      { correlationId: session.correlationId },
    );
  }

  return data.role as OrganizationRole;
};

/**
 * Confirms the caller holds one of the required roles in the organization.
 * Returns the satisfied role.
 */
export const requireOrganizationRole = async (
  client: TypedSupabaseClient,
  session: EdgeSession,
  organizationId: string,
  roles: readonly OrganizationRole[],
): Promise<OrganizationRole> => {
  const role = await requireOrganizationMembership(client, session, organizationId);
  if (!roles.includes(role)) {
    throw FinancialErrorException.of(
      'authorization_failed',
      'Your role does not permit this action.',
      { correlationId: session.correlationId },
    );
  }
  return role;
};

/** Requires an AAL2 session (multi-factor), independent of recency. */
export const requireAAL2 = (session: EdgeSession): void => {
  if (session.aal !== 'aal2') {
    throw FinancialErrorException.of(
      'authentication_required',
      'This action requires multi-factor authentication.',
      { correlationId: session.correlationId },
    );
  }
};

/**
 * Requires a freshly stepped-up AAL2 session for a sensitive financial action,
 * mirroring the database's recent-step-up rule.
 */
export const requireRecentStepUp = (
  session: EdgeSession,
  now: Date = new Date(),
  maxAgeSeconds: number = DEFAULT_STEP_UP_MAX_AGE_SECONDS,
): void => {
  requireAAL2(session);
  if (!hasRecentStepUp(session, now, maxAgeSeconds)) {
    throw FinancialErrorException.of(
      'authentication_required',
      'This action requires recent step-up authentication. Please re-verify and try again.',
      { correlationId: session.correlationId },
    );
  }
};

// ---------------------------------------------------------------------------
// Narrow service writer (least privilege for RLS-bypassing credentials).
// ---------------------------------------------------------------------------

// Append-only operational and audit tables: service credentials may INSERT but
// never update or delete. Confirmed ledger, event, redemption, settlement,
// refund, and audit rows are monotonic (design: Property 7).
export const APPEND_ONLY_TABLES = [
  'financial_intents',
  'transaction_attempts',
  'ledger_transactions',
  'contract_events',
  'audit_events',
  'voucher_redemptions',
  'settlements',
  'refunds',
  'reconciliation_runs',
  'reconciliation_issues',
] as const;

// Reconciled read models: service credentials may INSERT or UPSERT to correct or
// quarantine a projection.
export const PROJECTION_TABLES = [
  'beneficiary_balance_projection',
  'merchant_balance_projection',
  'program_financial_projection',
  'distribution_job_projection',
] as const;

export type AppendOnlyTable = (typeof APPEND_ONLY_TABLES)[number];
export type ProjectionTable = (typeof PROJECTION_TABLES)[number];

type InsertRow<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];

const APPEND_ONLY_SET: ReadonlySet<string> = new Set(APPEND_ONLY_TABLES);
const PROJECTION_SET: ReadonlySet<string> = new Set(PROJECTION_TABLES);

export interface ServiceWriter {
  /** Inserts one or more rows into an append-only table. */
  appendRows<T extends AppendOnlyTable>(table: T, rows: InsertRow<T> | InsertRow<T>[]): Promise<void>;
  /** Upserts a projection row, correcting or quarantining a read model. */
  writeProjection<T extends ProjectionTable>(
    table: T,
    rows: InsertRow<T> | InsertRow<T>[],
    options?: { readonly onConflict?: string },
  ): Promise<void>;
}

/**
 * Creates a service-role client. This bypasses RLS and MUST NOT be exposed to a
 * caller; wrap it in {@link createServiceWriter} to constrain its surface.
 */
export const createServiceClient = (
  config: EdgeRuntimeConfig,
  deps: AuthDependencies = {},
): TypedSupabaseClient => {
  if (!config.supabaseServiceRoleKey) {
    throw new Error('Service-role key is not configured for this function.');
  }
  const factory = deps.createClientFn ?? createClient;
  return factory<Database>(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
};

const raiseServiceWriteFailure = (table: string, error: unknown, correlationId: string): never => {
  safeLog('service write failed', { table, error, correlationId });
  throw new FinancialErrorException(
    makeFinancialError('dependency_unavailable', 'A required write could not be completed.', {
      correlationId,
      retryable: true,
    }),
  );
};

/**
 * Wraps a service-role client in a narrow writer. Only append-only inserts and
 * projection upserts are reachable; any attempt to use a table outside the
 * allowlists throws before a query is issued. This confines RLS-bypassing
 * credentials to their least-privilege purpose.
 */
export const createServiceWriter = (
  serviceClient: TypedSupabaseClient,
  correlationId: string = newCorrelationId(),
): ServiceWriter => {
  async function appendRows<T extends AppendOnlyTable>(
    table: T,
    rows: InsertRow<T> | InsertRow<T>[],
  ): Promise<void> {
    if (!APPEND_ONLY_SET.has(table)) {
      throw new Error(`Service writer refused non-append-only table: ${table}`);
    }
    const values = (Array.isArray(rows) ? rows : [rows]) as InsertRow<T>[];
    // The row type is checked against the table for callers above; the internal
    // cast only bridges the generic table to Supabase's mapped insert overloads.
    const { error } = await serviceClient.from(table).insert(values as never);
    if (error) {
      raiseServiceWriteFailure(table, error, correlationId);
    }
  }

  async function writeProjection<T extends ProjectionTable>(
    table: T,
    rows: InsertRow<T> | InsertRow<T>[],
    options?: { readonly onConflict?: string },
  ): Promise<void> {
    if (!PROJECTION_SET.has(table)) {
      throw new Error(`Service writer refused non-projection table: ${table}`);
    }
    const values = (Array.isArray(rows) ? rows : [rows]) as InsertRow<T>[];
    // See appendRows: the cast bridges the generic table to Supabase's overloads.
    const { error } = await serviceClient
      .from(table)
      .upsert(values as never, options?.onConflict ? { onConflict: options.onConflict } : undefined);
    if (error) {
      raiseServiceWriteFailure(table, error, correlationId);
    }
  }

  return { appendRows, writeProjection };
};

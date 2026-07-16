// Generated-types schema contract for the blockchain fund-transfer domain.
//
// This module is a pure, dependency-free parser and verifier for the committed
// Supabase-generated TypeScript definitions (src/types/database.types.ts). It
// asserts that the complete additive migration set is reflected in the checked
// types: every blockchain-domain table, projection table (with its
// reconciliation metadata fields), enum, and privileged RPC signature.
//
// It never connects to Supabase and never touches the hosted project; it only
// reads the text of a generated-types file. The drift runner
// (schema-types-drift.mjs) uses it against both the committed file and a fresh
// local replay, and the unit tests use it directly.

// Blockchain-domain core tables (Design: Data Models -> Core Tables). The
// pre-existing geography/lookup tables (areas, cities, barangays, ...) are
// intentionally excluded; this contract guards only the additive financial
// domain.
export const REQUIRED_TABLES = Object.freeze([
  'organizations',
  'organization_memberships',
  'beneficiary_identities',
  'wallets',
  'merchant_entities',
  'merchant_accreditations',
  'program_merchants',
  'programs',
  'enrollments',
  'distribution_jobs',
  'distribution_recipients',
  'financial_intents',
  'transaction_attempts',
  'idempotency_keys',
  'invoices',
  'voucher_redemptions',
  'settlements',
  'refunds',
  'cashout_requests',
  'ledger_transactions',
  'contract_events',
  'reconciliation_runs',
  'reconciliation_issues',
  'audit_events',
]);

// Indexed reconciled projection tables (Design: Data Models -> Projection
// Tables). Each must expose the reconciliation metadata below.
export const REQUIRED_PROJECTIONS = Object.freeze([
  'beneficiary_balance_projection',
  'merchant_balance_projection',
  'program_financial_projection',
  'distribution_job_projection',
]);

// Every projection carries as_of_ledger, reconciled_at, is_stale, and
// is_quarantined so screens can render honest stale/quarantined state.
export const REQUIRED_PROJECTION_FIELDS = Object.freeze([
  'as_of_ledger',
  'reconciled_at',
  'is_stale',
  'is_quarantined',
]);

// Core blockchain-domain enums that back the topology and state machines.
export const REQUIRED_ENUMS = Object.freeze([
  'wallet_network',
  'wallet_purpose',
  'wallet_owner_type',
  'wallet_verification_status',
  'wallet_rotation_status',
  'program_aid_type',
  'program_funding_status',
  'distribution_job_status',
  'distribution_recipient_status',
  'transaction_attempt_status',
  'financial_operation_type',
  'invoice_kind',
  'invoice_status',
  'redemption_status',
  'settlement_status',
  'refund_status',
  'reconciliation_run_status',
  'reconciliation_issue_status',
  'reconciliation_quarantine_state',
  'cashout_request_status',
  'organization_membership_role',
  'payment_funding_source',
  'payment_intent_status',
]);

// Privileged append/projection/idempotency RPCs. The value is the subset of
// argument names that must be present in the RPC signature; a superset is fine.
export const REQUIRED_RPCS = Object.freeze({
  append_audit_event: [
    'p_action',
    'p_actor_user_id',
    'p_organization_id',
    'p_correlation_id',
    'p_sensitive_data_access',
  ],
  claim_financial_idempotency_key: [
    'p_idempotency_key',
    'p_scope',
    'p_operation_type',
    'p_organization_id',
    'p_payload_hash',
    'p_correlation_id',
  ],
  advance_reconciliation_cursor: [
    'p_stream_name',
    'p_cursor_value',
    'p_network',
    'p_correlation_id',
  ],
  record_reconciliation_issue: ['p_correlation_id', 'p_issue_type', 'p_network'],
  complete_wallet_proof: [
    'p_wallet_id',
    'p_challenge_digest',
    'p_signature_digest',
    'p_verified_by',
  ],
  issue_wallet_proof_challenge: [
    'p_wallet_id',
    'p_address',
    'p_challenge_digest',
    'p_owner_id',
    'p_owner_type',
    'p_purpose',
  ],
  request_wallet_rotation: [
    'p_beneficiary_identity_id',
    'p_current_wallet_id',
    'p_replacement_wallet_id',
    'p_correlation_id',
  ],
  transition_wallet_rotation_intent: [
    'p_wallet_rotation_intent_id',
    'p_status',
    'p_actor_id',
  ],
  upsert_organization_membership: [
    'p_organization_id',
    'p_user_id',
    'p_role',
    'p_actor_id',
  ],
});

// --- Parsing helpers ------------------------------------------------------
//
// Supabase gen types emits deterministic 2-space-indented TypeScript. We isolate
// the `public` schema block (never graphql_public) and read keys at their known
// indentation depth. These parsers are tolerant of trailing whitespace and
// CRLF because the drift runner normalizes before comparison, but the contract
// check itself is independent of line endings.

function publicBlock(text) {
  const source = String(text ?? '').replace(/\r\n/g, '\n');
  const start = source.indexOf('\n  public: {');
  if (start < 0) return '';
  const constantsAt = source.indexOf('\nexport const Constants', start);
  return source.slice(start, constantsAt < 0 ? source.length : constantsAt);
}

const SECTION_ORDER = ['Tables', 'Views', 'Functions', 'Enums', 'CompositeTypes'];

function sectionSlice(block, section) {
  const startMarker = `\n    ${section}: {`;
  const startAt = block.indexOf(startMarker);
  if (startAt < 0) return '';
  let endAt = block.length;
  for (const other of SECTION_ORDER) {
    if (other === section) continue;
    const otherAt = block.indexOf(`\n    ${other}: {`, startAt + startMarker.length);
    if (otherAt > startAt && otherAt < endAt) endAt = otherAt;
  }
  return block.slice(startAt, endAt);
}

// Keys of a section are members indented six spaces (`      name:`).
function topLevelKeys(sectionText) {
  return [...sectionText.matchAll(/^ {6}([a-z_][a-z0-9_]*):/gm)].map((match) => match[1]);
}

export function parsePublicTableNames(text) {
  return topLevelKeys(sectionSlice(publicBlock(text), 'Tables'));
}

export function parsePublicViewNames(text) {
  return topLevelKeys(sectionSlice(publicBlock(text), 'Views'));
}

export function parsePublicFunctionNames(text) {
  return topLevelKeys(sectionSlice(publicBlock(text), 'Functions'));
}

// Enum names come from the `public.Enums` block; each is `name:` at six spaces.
export function parsePublicEnumNames(text) {
  return topLevelKeys(sectionSlice(publicBlock(text), 'Enums'));
}

// Field names of a table's `Row` shape (ten-space indented keys).
export function parseTableRowFields(text, tableName) {
  const tables = sectionSlice(publicBlock(text), 'Tables');
  const tableAt = tables.search(new RegExp(`^ {6}${tableName}:`, 'm'));
  if (tableAt < 0) return null;
  const rowAt = tables.indexOf('Row: {', tableAt);
  if (rowAt < 0) return [];
  const rowEnd = tables.indexOf('\n        }', rowAt);
  const rowBlock = tables.slice(rowAt, rowEnd < 0 ? tables.length : rowEnd);
  return [...rowBlock.matchAll(/^ {10}([a-z_][a-z0-9_]*)\??:/gm)].map((match) => match[1]);
}

// Argument names of an RPC signature (between `Args:` and `Returns:`).
export function parseFunctionArgNames(text, functionName) {
  const functions = sectionSlice(publicBlock(text), 'Functions');
  const fnAt = functions.search(new RegExp(`^ {6}${functionName}:`, 'm'));
  if (fnAt < 0) return null;
  const argsAt = functions.indexOf('Args:', fnAt);
  if (argsAt < 0) return [];
  const returnsAt = functions.indexOf('Returns:', argsAt);
  const argsBlock = functions.slice(argsAt, returnsAt < 0 ? functions.length : returnsAt);
  if (/Args:\s*never/.test(argsBlock)) return [];
  return [...new Set([...argsBlock.matchAll(/([a-z_][a-z0-9_]*)\??:/g)].map((match) => match[1]))]
    .filter((name) => name !== 'Args' && name !== 'Returns');
}

// --- Verification ---------------------------------------------------------

export function verifySchemaContract(text) {
  const failures = [];

  const tables = new Set(parsePublicTableNames(text));
  for (const table of REQUIRED_TABLES) {
    if (!tables.has(table)) failures.push(`Missing blockchain-domain table: ${table}`);
  }

  for (const projection of REQUIRED_PROJECTIONS) {
    if (!tables.has(projection)) {
      failures.push(`Missing projection table: ${projection}`);
      continue;
    }
    const fields = parseTableRowFields(text, projection) ?? [];
    const fieldSet = new Set(fields);
    for (const field of REQUIRED_PROJECTION_FIELDS) {
      if (!fieldSet.has(field)) {
        failures.push(`Projection ${projection} is missing reconciliation field: ${field}`);
      }
    }
  }

  const enums = new Set(parsePublicEnumNames(text));
  for (const name of REQUIRED_ENUMS) {
    if (!enums.has(name)) failures.push(`Missing enum: ${name}`);
  }

  const functions = new Set(parsePublicFunctionNames(text));
  for (const [rpc, requiredArgs] of Object.entries(REQUIRED_RPCS)) {
    if (!functions.has(rpc)) {
      failures.push(`Missing RPC signature: ${rpc}`);
      continue;
    }
    const args = new Set(parseFunctionArgNames(text, rpc) ?? []);
    for (const arg of requiredArgs) {
      if (!args.has(arg)) failures.push(`RPC ${rpc} is missing argument: ${arg}`);
    }
  }

  return { ok: failures.length === 0, failures };
}

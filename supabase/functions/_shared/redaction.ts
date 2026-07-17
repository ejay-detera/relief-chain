// Log redaction utility.
//
// Trusted server code frequently needs to log context for diagnosis, but logs
// must never contain secrets, recoverable key material, personally identifiable
// information, identity documents, or full signed authorization payloads. This
// module deep-copies a value and replaces sensitive content — matched both by
// key name and by value shape — with an opaque placeholder before anything is
// handed to a logger.
//
// The database and the isolated signer remain the authoritative secret
// boundaries; this is defense in depth so an accidental `console.log(context)`
// cannot exfiltrate sensitive data.
//
// Validates: Requirements 1.7, 20.8

export const REDACTED = '[REDACTED]';

// Substrings that mark a key as sensitive (matched case-insensitively against a
// normalized key with separators removed).
const SENSITIVE_KEY_FRAGMENTS: readonly string[] = [
  // Secrets and recoverable key material.
  'secret',
  'seed',
  'privatekey',
  'privkey',
  'mnemonic',
  'passphrase',
  'password',
  'apikey',
  'accesskey',
  'servicerolekey',
  'token',
  'jwt',
  'authorization',
  'bearer',
  'signature',
  'signedxdr',
  'signedpayload',
  'signedenvelope',
  'envelopexdr',
  'authentry',
  // Personally identifiable information and identity documents.
  'fullname',
  'firstname',
  'lastname',
  'givenname',
  'familyname',
  'email',
  'phone',
  'mobilenumber',
  // Postal / physical address only. A bare "address" is intentionally NOT
  // redacted because in this domain it overwhelmingly denotes a public Stellar
  // wallet or settlement address, which the design preserves for diagnosis and
  // may expose on-chain (Requirement 19.2).
  'streetaddress',
  'homeaddress',
  'mailingaddress',
  'postaladdress',
  'residentialaddress',
  'physicaladdress',
  'birthdate',
  'dateofbirth',
  'dob',
  'governmentid',
  'nationalid',
  'passportnumber',
  'ssn',
  'taxid',
  'document',
  'documentnumber',
];

// A Stellar secret seed: 'S' followed by 55 base32 characters. Public keys
// begin with 'G' and are intentionally not redacted.
const STELLAR_SECRET_SEED = /^S[A-Z2-7]{55}$/;

// A compact JSON Web Token: three base64url segments separated by dots.
const JWT_PATTERN = /^[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}$/;

const normalizeKey = (key: string): string =>
  key.toLowerCase().replace(/[^a-z0-9]/g, '');

/** True when a property name indicates sensitive content. */
export const isSensitiveKey = (key: string): boolean => {
  const normalized = normalizeKey(key);
  return SENSITIVE_KEY_FRAGMENTS.some((fragment) => normalized.includes(fragment));
};

/** True when a string value looks like a secret regardless of its key. */
export const isSensitiveValue = (value: string): boolean =>
  STELLAR_SECRET_SEED.test(value) || JWT_PATTERN.test(value);

const MAX_DEPTH = 8;

const redactValue = (value: unknown, depth: number, seen: WeakSet<object>): unknown => {
  if (typeof value === 'string') {
    return isSensitiveValue(value) ? REDACTED : value;
  }

  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (depth >= MAX_DEPTH) {
    return '[TRUNCATED]';
  }

  if (seen.has(value as object)) {
    return '[CIRCULAR]';
  }
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, depth + 1, seen));
  }

  // Errors would otherwise serialize to `{}`; preserve a safe, redacted summary.
  if (value instanceof Error) {
    return { name: value.name, message: redactValue(value.message, depth + 1, seen) };
  }

  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    output[key] = isSensitiveKey(key) ? REDACTED : redactValue(entry, depth + 1, seen);
  }
  return output;
};

/**
 * Returns a deep copy of `value` with sensitive keys and secret-shaped strings
 * replaced by {@link REDACTED}. Safe to pass directly to a logger. Cyclic and
 * excessively deep structures are collapsed rather than throwing.
 */
export const redact = <T>(value: T): unknown =>
  redactValue(value, 0, new WeakSet<object>());

export interface RedactingLogger {
  (message: string, context?: unknown): void;
}

/**
 * Logs a message with redacted context. When no sink is provided the message is
 * written with `console.log`; context is always redacted first.
 */
export const safeLog = (
  message: string,
  context?: unknown,
  sink: RedactingLogger = (m, c) => (c === undefined ? console.log(m) : console.log(m, c)),
): void => {
  if (context === undefined) {
    sink(message);
    return;
  }
  sink(message, redact(context));
};

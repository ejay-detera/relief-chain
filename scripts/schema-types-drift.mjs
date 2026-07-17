import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifySchemaContract } from './schema-types-contract.mjs';
import { repositoryRoot } from './validation-commands.mjs';
import { redactText } from './validation-runner.mjs';

// Generated-types drift check for the one-shot validation runner.
//
// The committed application types in src/types/database.types.ts must always
// match a clean local replay of the complete additive migration set. This
// command:
//
//   1. verifies the committed types satisfy the blockchain-domain schema
//      contract (all required tables, projections + reconciliation fields,
//      enums, and privileged RPC signatures);
//   2. regenerates types from the local database with
//      `supabase gen types typescript --local`; and
//   3. asserts the regenerated output satisfies the same contract and is
//      byte-identical (after whitespace normalization) to the committed file.
//
// It never logs in, links, pulls, pushes, or otherwise connects to the hosted
// project. Type generation reads only the local replay started by the developer
// (`supabase start` + `supabase db reset --local`). When that local stack is
// unavailable, the check fails with an actionable message rather than silently
// passing.

const COMMITTED_TYPES_PATH = resolve(repositoryRoot, 'src', 'types', 'database.types.ts');
const DEFAULT_CLI_VERSION = '2.109.1';
const GENERATE_TIMEOUT_MS = 150_000;
const MAX_DIFF_LINES = 40;

// Normalize line endings and trailing whitespace so a drift signal reflects a
// real schema change rather than an editor or platform newline difference.
export function normalizeTypes(text) {
  return String(text ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n+$/, '\n');
}

// Produce a bounded, human-readable summary of the first differing lines.
export function diffSummary(committed, generated, { maxLines = MAX_DIFF_LINES } = {}) {
  const committedLines = normalizeTypes(committed).split('\n');
  const generatedLines = normalizeTypes(generated).split('\n');
  const total = Math.max(committedLines.length, generatedLines.length);
  const differences = [];
  for (let index = 0; index < total && differences.length < maxLines; index += 1) {
    const left = committedLines[index];
    const right = generatedLines[index];
    if (left !== right) {
      differences.push(`  L${index + 1}`);
      differences.push(`    committed: ${left === undefined ? '<absent>' : left}`);
      differences.push(`    replayed : ${right === undefined ? '<absent>' : right}`);
    }
  }
  return {
    identical: differences.length === 0,
    committedLineCount: committedLines.length,
    generatedLineCount: generatedLines.length,
    lines: differences,
  };
}

// Regenerate types from the local replay. Static, non-user arguments; the CLI
// version is pinned but overridable through SUPABASE_CLI_VERSION.
export function generateLocalTypes({
  environment = process.env,
  cliVersion = process.env.SUPABASE_CLI_VERSION || DEFAULT_CLI_VERSION,
  timeoutMs = GENERATE_TIMEOUT_MS,
  runner = spawnSync,
} = {}) {
  // Windows exposes npx as npx.cmd; the fixed arguments make a shell safe.
  const useShell = process.platform === 'win32';
  const executable = useShell ? 'npx.cmd' : 'npx';
  const args = ['--yes', `supabase@${cliVersion}`, 'gen', 'types', 'typescript', '--local'];
  const result = runner(executable, args, {
    cwd: repositoryRoot,
    env: environment,
    shell: useShell,
    encoding: 'utf8',
    windowsHide: true,
    timeout: timeoutMs,
    maxBuffer: 32 * 1024 * 1024,
  });
  const stdout = result.stdout ?? '';
  const stderr = redactText(result.stderr ?? '', environment).trim();
  const timedOut = result.error?.code === 'ETIMEDOUT' || result.signal === 'SIGTERM';
  // gen types prints the module to stdout; a valid run starts with the Json type.
  const looksLikeTypes = /export type (Json|Database)\b/.test(stdout);
  return {
    ok: !result.error && result.status === 0 && looksLikeTypes,
    status: result.status ?? null,
    timedOut,
    stdout,
    stderr,
    error: result.error ? { code: result.error.code ?? null } : null,
    looksLikeTypes,
  };
}

function formatContractFailures(title, failures) {
  return [title, ...failures.map((failure) => `  - ${failure}`)].join('\n');
}

export function runDriftCheck(options = {}) {
  const {
    committedPath = COMMITTED_TYPES_PATH,
    generate = generateLocalTypes,
    environment = process.env,
  } = options;
  const lines = ['Relief Chain generated-types drift check', ''];

  if (!existsSync(committedPath)) {
    lines.push(`[FAIL] Committed types not found at ${committedPath}.`);
    lines.push('    fix: generate them with `supabase gen types typescript --local > src/types/database.types.ts`.');
    return { exitCode: 1, report: lines.join('\n') };
  }
  const committed = readFileSync(committedPath, 'utf8');

  // 1. Committed types must satisfy the schema contract.
  const committedContract = verifySchemaContract(committed);
  if (!committedContract.ok) {
    lines.push(formatContractFailures('[FAIL] Committed types are missing required blockchain-domain symbols:', committedContract.failures));
    lines.push('');
    lines.push('    fix: regenerate committed types from a clean local replay and commit the result.');
    return { exitCode: 1, report: lines.join('\n') };
  }
  lines.push('[OK] Committed types satisfy the blockchain-domain schema contract.');

  // 2. Regenerate from the local replay (never the hosted project).
  const generated = generate({ environment });
  if (!generated.ok) {
    lines.push('[FAIL] Could not regenerate types from the local Supabase replay.');
    if (generated.timedOut) {
      lines.push('    The generation command timed out.');
    } else if (generated.error?.code === 'ENOENT') {
      lines.push('    npx / the Supabase CLI was not found on PATH.');
    } else if (!generated.looksLikeTypes) {
      lines.push('    The command did not return a generated types module (is the local database running?).');
    } else {
      lines.push(`    The command exited with status ${generated.status}.`);
    }
    if (generated.stderr) lines.push(`    stderr: ${generated.stderr.split('\n').slice(0, 6).join('\n            ')}`);
    lines.push('    This check reads only the local replay and never connects to the hosted project.');
    lines.push('    fix: start the local stack (`supabase start` then `supabase db reset --local`) and re-run.');
    return { exitCode: 1, report: lines.join('\n') };
  }

  // 3. Regenerated output must satisfy the same contract...
  const generatedContract = verifySchemaContract(generated.stdout);
  if (!generatedContract.ok) {
    lines.push(formatContractFailures('[FAIL] Local replay is missing required blockchain-domain symbols:', generatedContract.failures));
    lines.push('    The local migration set does not match the expected schema contract.');
    return { exitCode: 1, report: lines.join('\n') };
  }
  lines.push('[OK] Local replay satisfies the blockchain-domain schema contract.');

  // ...and match the committed file after normalization.
  const diff = diffSummary(committed, generated.stdout);
  if (!diff.identical) {
    lines.push('[FAIL] Committed types drifted from the local replay.');
    lines.push(`    committed lines: ${diff.committedLineCount}; replayed lines: ${diff.generatedLineCount}`);
    lines.push('    first differences:');
    lines.push(...diff.lines);
    lines.push('    fix: `supabase gen types typescript --local > src/types/database.types.ts` and commit the update.');
    return { exitCode: 1, report: lines.join('\n') };
  }

  lines.push('[OK] Committed types match the clean local replay. No drift.');
  return { exitCode: 0, report: lines.join('\n') };
}

function main() {
  const { exitCode, report } = runDriftCheck();
  (exitCode === 0 ? console.log : console.error)(report);
  process.exitCode = exitCode;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  main();
}

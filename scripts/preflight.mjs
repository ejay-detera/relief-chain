import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { repositoryRoot } from './validation-commands.mjs';
import { redactText } from './validation-runner.mjs';

// Non-interactive prerequisite preflight.
//
// Reports the availability of every local prerequisite the pilot needs before
// contract or Edge work: Node, Expo 57, Rust, the WASM target, Stellar CLI,
// Docker, Supabase CLI, and the local Supabase project. Missing required tools
// are retained as actionable failures (non-zero exit). Linked hosted-project
// access is deliberately treated as unavailable until separately authorized; it
// is never probed here, never blocks local implementation, and never implies
// hosted parity. No credentials are printed: every probe result is passed
// through the shared redactor before being surfaced.

const STATUS = Object.freeze({
  AVAILABLE: 'available',
  MISSING: 'missing',
  UNAVAILABLE: 'unavailable',
});

const PROBE_TIMEOUT_MS = 15_000;

// Windows exposes most of these CLIs as .cmd/.bat shims that a shell-less spawn
// cannot resolve. The arguments below are fixed constants (never user input),
// so enabling the shell on win32 is safe and required for correct detection.
const useShell = process.platform === 'win32';

function probe(executable, args, { environment = process.env } = {}) {
  const result = spawnSync(executable, args, {
    cwd: repositoryRoot,
    env: environment,
    shell: useShell,
    encoding: 'utf8',
    windowsHide: true,
    timeout: PROBE_TIMEOUT_MS,
  });
  const stdout = redactText(result.stdout ?? '', environment).trim();
  const stderr = redactText(result.stderr ?? '', environment).trim();
  return {
    ok: !result.error && result.status === 0,
    status: result.status ?? null,
    timedOut: result.error?.code === 'ETIMEDOUT' || result.signal === 'SIGTERM',
    stdout,
    stderr,
    error: result.error ? { code: result.error.code ?? null } : null,
  };
}

function firstLine(text) {
  return String(text ?? '').split(/\r?\n/, 1)[0].trim();
}

// --- Individual checks. Each returns a plain result object. ---------------

export function checkNode() {
  const version = process.versions.node;
  const major = Number.parseInt(version.split('.')[0], 10);
  const available = Number.isFinite(major) && major >= 20;
  return {
    id: 'node',
    label: 'Node.js runtime',
    required: true,
    status: available ? STATUS.AVAILABLE : STATUS.MISSING,
    version: available ? version : null,
    detail: available ? `Node ${version}` : `Node ${version} is below the required major version 20`,
    remediation: 'Install Node.js 20 or newer (https://nodejs.org).',
  };
}

export function classifyExpoVersion(rawVersion) {
  const version = String(rawVersion ?? '').trim();
  const major = Number.parseInt(version.split('.')[0], 10);
  return { version: version || null, isExpo57: major === 57 };
}

export function checkExpo({ root = repositoryRoot } = {}) {
  const manifestPath = resolve(root, 'node_modules', 'expo', 'package.json');
  const base = { id: 'expo', label: 'Expo SDK 57', required: true };
  if (!existsSync(manifestPath)) {
    return {
      ...base,
      status: STATUS.MISSING,
      version: null,
      detail: 'The expo package is not installed under node_modules.',
      remediation: 'Run `npm install` to install the pinned Expo SDK 57 dependency.',
    };
  }
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch {
    return {
      ...base,
      status: STATUS.MISSING,
      version: null,
      detail: 'The installed expo package manifest could not be parsed.',
      remediation: 'Reinstall dependencies with `npm install`.',
    };
  }
  const { version, isExpo57 } = classifyExpoVersion(manifest.version);
  return {
    ...base,
    status: isExpo57 ? STATUS.AVAILABLE : STATUS.MISSING,
    version,
    detail: isExpo57
      ? `Expo SDK ${version}`
      : `Installed Expo SDK ${version ?? 'unknown'} is not the required major version 57`,
    remediation: 'Install Expo SDK 57 (`npx expo install expo@^57`).',
  };
}

export function checkRust({ environment = process.env } = {}) {
  const base = { id: 'rust', label: 'Rust toolchain', required: true };
  const result = probe('rustc', ['--version'], { environment });
  if (result.ok) {
    return {
      ...base,
      status: STATUS.AVAILABLE,
      version: firstLine(result.stdout),
      detail: firstLine(result.stdout),
      remediation: 'Install Rust via rustup (https://rustup.rs).',
    };
  }
  return {
    ...base,
    status: STATUS.MISSING,
    version: null,
    detail: result.timedOut ? 'rustc timed out.' : 'rustc was not found on PATH.',
    remediation: 'Install Rust via rustup (https://rustup.rs).',
  };
}

export function classifyWasmTarget(installedTargetsOutput) {
  const text = String(installedTargetsOutput ?? '');
  // Accept either the classic Soroban target or the newer wasm32v1 target.
  const found = /wasm32-unknown-unknown/.test(text) || /wasm32v1-none/.test(text);
  const matched = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line === 'wasm32-unknown-unknown' || line === 'wasm32v1-none');
  return { found, target: matched ?? null };
}

export function checkWasmTarget({ environment = process.env } = {}) {
  const base = { id: 'wasm-target', label: 'Rust WASM target', required: true };
  const result = probe('rustup', ['target', 'list', '--installed'], { environment });
  if (!result.ok) {
    return {
      ...base,
      status: STATUS.MISSING,
      version: null,
      detail: result.timedOut ? 'rustup timed out.' : 'rustup was not found on PATH.',
      remediation: 'Install rustup, then add the target with `rustup target add wasm32-unknown-unknown`.',
    };
  }
  const { found, target } = classifyWasmTarget(result.stdout);
  return {
    ...base,
    status: found ? STATUS.AVAILABLE : STATUS.MISSING,
    version: target,
    detail: found ? `Installed target ${target}` : 'No wasm32 build target is installed.',
    remediation: 'Add the target with `rustup target add wasm32-unknown-unknown`.',
  };
}

export function checkStellarCli({ environment = process.env } = {}) {
  const base = { id: 'stellar-cli', label: 'Stellar CLI', required: true };
  const result = probe('stellar', ['--version'], { environment });
  if (result.ok) {
    return {
      ...base,
      status: STATUS.AVAILABLE,
      version: firstLine(result.stdout),
      detail: firstLine(result.stdout),
      remediation: 'Install the Stellar CLI (`cargo install --locked stellar-cli`).',
    };
  }
  return {
    ...base,
    status: STATUS.MISSING,
    version: null,
    detail: result.timedOut ? 'stellar timed out.' : 'stellar was not found on PATH.',
    remediation: 'Install the Stellar CLI (`cargo install --locked stellar-cli`).',
  };
}

export function checkDocker({ environment = process.env } = {}) {
  const base = { id: 'docker', label: 'Docker CLI', required: true };
  // `docker --version` reports only the client and needs no running daemon,
  // keeping the probe non-interactive and fast.
  const result = probe('docker', ['--version'], { environment });
  if (result.ok) {
    return {
      ...base,
      status: STATUS.AVAILABLE,
      version: firstLine(result.stdout),
      detail: firstLine(result.stdout),
      remediation: 'Install Docker Desktop or the Docker engine (https://docs.docker.com/get-docker/).',
    };
  }
  return {
    ...base,
    status: STATUS.MISSING,
    version: null,
    detail: result.timedOut ? 'docker timed out.' : 'docker was not found on PATH.',
    remediation: 'Install Docker Desktop or the Docker engine (https://docs.docker.com/get-docker/).',
  };
}

export function checkSupabaseCli({ environment = process.env } = {}) {
  const base = { id: 'supabase-cli', label: 'Supabase CLI', required: true };
  const result = probe('supabase', ['--version'], { environment });
  if (result.ok) {
    return {
      ...base,
      status: STATUS.AVAILABLE,
      version: firstLine(result.stdout),
      detail: `Supabase CLI ${firstLine(result.stdout)}`,
      remediation: 'Install the Supabase CLI (https://supabase.com/docs/guides/local-development).',
    };
  }
  return {
    ...base,
    status: STATUS.MISSING,
    version: null,
    detail: result.timedOut ? 'supabase timed out.' : 'supabase was not found on PATH.',
    remediation: 'Install the Supabase CLI (https://supabase.com/docs/guides/local-development).',
  };
}

export function checkLocalProject({ root = repositoryRoot } = {}) {
  const configPath = resolve(root, 'supabase', 'config.toml');
  const available = existsSync(configPath);
  return {
    id: 'local-project',
    label: 'Local Supabase project',
    required: true,
    status: available ? STATUS.AVAILABLE : STATUS.MISSING,
    version: null,
    detail: available
      ? 'Local project detected at supabase/config.toml.'
      : 'No local Supabase project found (supabase/config.toml is missing).',
    remediation: 'Initialize a local project with `supabase init`.',
  };
}

export function checkLinkedProject() {
  // Linked hosted-project access is intentionally not probed. It stays
  // unavailable until separately authorized, must not block local
  // implementation, and must not imply hosted parity. It is reported as a
  // non-required, non-failing status only.
  return {
    id: 'linked-project',
    label: 'Linked hosted Supabase project',
    required: false,
    status: STATUS.UNAVAILABLE,
    version: null,
    detail: 'Not checked. Hosted access requires separate authorization and is out of scope for local work.',
    remediation: 'No action required for local development; authorize hosted access separately when needed.',
  };
}

export function collectChecks(options = {}) {
  return [
    checkNode(options),
    checkExpo(options),
    checkRust(options),
    checkWasmTarget(options),
    checkStellarCli(options),
    checkDocker(options),
    checkSupabaseCli(options),
    checkLocalProject(options),
    checkLinkedProject(options),
  ];
}

export function summarize(checks) {
  const failures = checks.filter((check) => check.required && check.status !== STATUS.AVAILABLE);
  return {
    total: checks.length,
    available: checks.filter((check) => check.status === STATUS.AVAILABLE).length,
    failures,
    exitCode: failures.length > 0 ? 1 : 0,
  };
}

const STATUS_LABEL = Object.freeze({
  [STATUS.AVAILABLE]: 'OK',
  [STATUS.MISSING]: 'MISSING',
  [STATUS.UNAVAILABLE]: 'UNAVAILABLE',
});

export function formatReport(checks, summary) {
  const lines = ['Relief Chain prerequisite preflight', ''];
  for (const check of checks) {
    const marker = STATUS_LABEL[check.status] ?? check.status.toUpperCase();
    const version = check.version ? ` (${check.version})` : '';
    lines.push(`[${marker}] ${check.label}${version}`);
    if (check.detail) lines.push(`    ${check.detail}`);
    if (check.required && check.status !== STATUS.AVAILABLE && check.remediation) {
      lines.push(`    fix: ${check.remediation}`);
    }
  }
  lines.push('');
  if (summary.failures.length === 0) {
    lines.push(`All ${summary.available} required prerequisites are available.`);
  } else {
    const missing = summary.failures.map((check) => check.label).join(', ');
    lines.push(`${summary.failures.length} required prerequisite(s) missing: ${missing}.`);
  }
  return lines.join('\n');
}

export function runPreflight(options = {}) {
  const checks = collectChecks(options);
  const summary = summarize(checks);
  return { checks, summary, report: formatReport(checks, summary) };
}

function main() {
  const { summary, report } = runPreflight();
  const write = summary.exitCode === 0 ? console.log : console.error;
  write(report);
  process.exitCode = summary.exitCode;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  main();
}

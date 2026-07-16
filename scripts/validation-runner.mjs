import { spawn } from 'node:child_process';
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { repositoryRoot, validationCommandNames, validationCommands } from './validation-commands.mjs';

const ARTIFACT_SCHEMA_VERSION = 1;
const REDACTED = '[REDACTED]';
const secretNamePattern = /(secret|token|password|passwd|api[_-]?key|private[_-]?key|seed|mnemonic|authorization|credential|jwt)/i;
const structuredSecretPattern = /((?:"?)(?:secret|token|password|passwd|api[_-]?key|private[_-]?key|seed|mnemonic|authorization|credential|jwt|signed[_-]?(?:payload|authorization)|xdr|envelope)(?:"?)\s*[=:]\s*)(["']?)([^\s,"'}]+)\2/gi;

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function redactText(value, environment = process.env) {
  let redacted = String(value ?? '');
  const environmentSecrets = Object.entries(environment)
    .filter(([name, secret]) => secretNamePattern.test(name) && typeof secret === 'string' && secret.length >= 4)
    .map(([, secret]) => secret)
    .sort((left, right) => right.length - left.length);

  for (const secret of environmentSecrets) {
    redacted = redacted.replace(new RegExp(escapeRegExp(secret), 'g'), REDACTED);
  }

  return redacted
    .replace(/\bS[A-Z2-7]{55}\b/g, REDACTED)
    .replace(/(Authorization\s*[:=]\s*Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, `$1${REDACTED}`)
    .replace(/(Authorization\s*[:=]\s*)(?!Bearer\b)[^\s,]+/gi, `$1${REDACTED}`)
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, `$1${REDACTED}`)
    .replace(structuredSecretPattern, (_match, prefix, quote) => `${prefix}${quote}${REDACTED}${quote}`)
    .replace(/-----BEGIN [^-]+ PRIVATE KEY-----[\s\S]*?-----END [^-]+ PRIVATE KEY-----/g, REDACTED);
}

function artifactPathFor(name, artifactDirectory) {
  return resolve(artifactDirectory, `${name}.json`);
}

function writeDeterministicJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  renameSync(temporaryPath, path);
}

function publicCommand(command, environment) {
  return {
    executable: redactText(command.executable, environment),
    arguments: command.args.map((argument) => redactText(argument, environment)),
    workingDirectory: redactText(resolve(command.cwd), environment),
  };
}

export function runValidationCommand({
  name,
  executable,
  args = [],
  cwd = repositoryRoot,
  timeoutMs = 120_000,
  artifactPath,
  environment = process.env,
  now = () => new Date(),
  spawnProcess = spawn,
}) {
  if (!name || !executable || !artifactPath) {
    throw new TypeError('name, executable, and artifactPath are required');
  }

  const command = { executable, args: [...args], cwd };
  const startedAtDate = now();
  let stdout = '';
  let stderr = '';
  let timedOut = false;
  let spawnError = null;

  return new Promise((resolveRun) => {
    let child;
    try {
      child = spawnProcess(executable, args, {
        cwd,
        env: environment,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch (error) {
      spawnError = error;
      finish(null, null);
      return;
    }

    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk) => { stdout += chunk; });
    child.stderr?.on('data', (chunk) => { stderr += chunk; });
    child.once('error', (error) => { spawnError = error; });

    const timeout = timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true;
          child.kill('SIGTERM');
        }, timeoutMs)
      : null;

    child.once('close', (exitCode, signal) => {
      if (timeout) clearTimeout(timeout);
      finish(exitCode, signal);
    });

    function finish(exitCode, signal) {
      const endedAtDate = now();
      const artifact = {
        schemaVersion: ARTIFACT_SCHEMA_VERSION,
        name,
        command: publicCommand(command, environment),
        startedAt: startedAtDate.toISOString(),
        endedAt: endedAtDate.toISOString(),
        durationMs: Math.max(0, endedAtDate.getTime() - startedAtDate.getTime()),
        stdout: redactText(stdout, environment),
        stderr: redactText(stderr, environment),
        terminationSignal: signal ?? null,
        timedOut,
        exitCode: spawnError ? null : exitCode,
        spawnError: spawnError
          ? { code: spawnError.code ?? null, message: redactText(spawnError.message, environment) }
          : null,
      };
      writeDeterministicJson(artifactPath, artifact);
      resolveRun({ artifact, artifactPath });
    }
  });
}

export function effectiveExitCode(artifact) {
  if (artifact.timedOut) return 124;
  if (artifact.spawnError) return artifact.spawnError.code === 'ENOENT' ? 127 : 1;
  return artifact.exitCode ?? 1;
}

function printResult({ artifact, artifactPath }) {
  const code = effectiveExitCode(artifact);
  const status = code === 0 ? 'passed' : 'failed';
  const command = [artifact.command.executable, ...artifact.command.arguments].join(' ');
  const lines = [
    `[validation:${artifact.name}] ${status} (exit ${code})`,
    `command: ${command}`,
    `cwd: ${artifact.command.workingDirectory}`,
    `artifact: ${artifactPath}`,
  ];
  if (artifact.stdout) lines.push(`stdout:\n${artifact.stdout.trimEnd()}`);
  if (artifact.stderr) lines.push(`stderr:\n${artifact.stderr.trimEnd()}`);
  if (artifact.spawnError) lines.push(`spawn error: ${artifact.spawnError.code ?? 'UNKNOWN'} ${artifact.spawnError.message}`);
  if (artifact.timedOut) lines.push(`timeout: true; signal: ${artifact.terminationSignal ?? 'none'}`);
  (code === 0 ? console.log : console.error)(lines.join('\n'));
}

async function runNamedCommand(name, artifactDirectory) {
  const command = validationCommands[name];
  if (!command) throw new Error(`Unknown validation command: ${name}`);
  const result = await runValidationCommand({
    name,
    ...command,
    artifactPath: artifactPathFor(name, artifactDirectory),
  });
  printResult(result);
  return result;
}

async function main() {
  const requested = process.argv[2];
  const artifactDirectory = resolve(process.env.VALIDATION_ARTIFACT_DIR ?? '.validation-artifacts');
  if (!requested || (requested !== 'all' && !validationCommands[requested])) {
    console.error(`Usage: node scripts/validation-runner.mjs <${validationCommandNames.join('|')}|all>`);
    process.exitCode = 2;
    return;
  }

  const names = requested === 'all' ? validationCommandNames : [requested];
  const results = [];
  for (const name of names) results.push(await runNamedCommand(name, artifactDirectory));

  if (requested === 'all') {
    const summary = {
      schemaVersion: ARTIFACT_SCHEMA_VERSION,
      name: 'all',
      results: results.map(({ artifact, artifactPath }) => ({
        name: artifact.name,
        artifactPath,
        exitCode: effectiveExitCode(artifact),
      })),
    };
    writeDeterministicJson(artifactPathFor('all', artifactDirectory), summary);
  }

  process.exitCode = results.reduce((code, result) => code || effectiveExitCode(result.artifact), 0);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  main().catch((error) => {
    console.error(redactText(error?.stack ?? error));
    process.exitCode = 1;
  });
}

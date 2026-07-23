import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const node = process.execPath;
const local = (...parts) => join(repositoryRoot, 'node_modules', ...parts);

export const validationCommands = Object.freeze({
  preflight: {
    executable: node,
    args: [join(repositoryRoot, 'scripts', 'preflight.mjs')],
    cwd: repositoryRoot,
    timeoutMs: 120_000,
  },
  lint: {
    executable: node,
    args: [local('eslint', 'bin', 'eslint.js'), '.', '--no-cache', '--max-warnings=0'],
    cwd: repositoryRoot,
    timeoutMs: 120_000,
  },
  'type-check': {
    executable: node,
    args: [local('typescript', 'bin', 'tsc'), '--noEmit', '--pretty', 'false'],
    cwd: repositoryRoot,
    timeoutMs: 120_000,
  },
  'schema-types': {
    executable: node,
    args: [join(repositoryRoot, 'scripts', 'schema-types-drift.mjs')],
    cwd: repositoryRoot,
    timeoutMs: 180_000,
  },
  unit: {
    executable: node,
    args: ['--test', 'scripts/tests/**/*.test.mjs'],
    cwd: repositoryRoot,
    timeoutMs: 120_000,
  },
  property: {
    executable: node,
    args: ['--test', '--test-name-pattern=property', 'scripts/tests/**/*.test.mjs'],
    cwd: repositoryRoot,
    timeoutMs: 120_000,
  },
  integration: {
    executable: 'supabase',
    args: ['test', 'db', '--workdir', repositoryRoot],
    cwd: repositoryRoot,
    timeoutMs: 300_000,
  },
  'mobile-smoke': {
    executable: node,
    args: [local('expo', 'bin', 'cli'), 'export', '--platform', 'android', '--output-dir', '.validation-mobile-smoke', '--clear'],
    cwd: repositoryRoot,
    timeoutMs: 300_000,
  },
});

export const validationCommandNames = Object.freeze(Object.keys(validationCommands));
export { repositoryRoot };

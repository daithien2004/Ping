import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';
import { checkWrite, packagesForChanges } from './workflow-policy.mjs';

const root = process.env.CLAUDE_PROJECT_DIR || fileURLToPath(new URL('../../', import.meta.url));
const mode = process.argv[2];
const git = (...args) =>
  execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    timeout: 10_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
const mainFiles = () =>
  git('ls-tree', '-r', '--name-only', 'main', '--', 'apps/api/prisma/migrations')
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);

function recordBlock(reason) {
  if (!checkWrite(root, 'docs/claude-workflow/metrics.md').allowed) {
    throw new Error('Unsafe metrics path');
  }
  const directory = path.join(root, 'docs/claude-workflow');
  mkdirSync(directory, { recursive: true });
  appendFileSync(
    path.join(directory, 'metrics.md'),
    `| ${new Date().toISOString()} | hook-block | ${reason} |\n`,
  );
}

function pre(input) {
  const result = checkWrite(root, input.tool_input?.file_path, {
    mainFiles,
    scope: process.argv[3],
  });
  if (result.allowed) return {}; // Keep normal permission checks; do not auto-approve.
  try {
    recordBlock(result.reason);
  } catch {
    process.stderr.write('Hook could not record its block metric.\n');
  }
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `Ping write policy: ${result.reason}. Read CLAUDE.md and workflow instructions.`,
    },
  };
}

function post(input) {
  const file = input.tool_input?.file_path;
  if (!checkWrite(root, file, { mainFiles }).allowed) return {};
  const prettier = createRequire(import.meta.url).resolve('prettier/bin/prettier.cjs');
  const result = spawnSync(
    process.execPath,
    [prettier, '--write', '--ignore-unknown', path.resolve(root, file)],
    {
      cwd: root,
      encoding: 'utf8',
      timeout: 30_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  if (result.status === 0) return {};
  return {
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext:
        'Ping: formatting failed; run Prettier on the edited file and report the result.',
    },
  };
}

function stop(input) {
  if (input.stop_hook_active) return {}; // Prevent repeated Stop-hook loops.
  const changed = [
    ...git('diff', '--name-only', 'HEAD', '--').split(/\r?\n/),
    ...git('ls-files', '--others', '--exclude-standard').split(/\r?\n/),
  ].filter(Boolean);
  const packages = packagesForChanges(changed);
  let failed = false;
  if (packages.length) {
    // All arguments below come from a fixed package allowlist, never from tool input.
    const args = [...packages.flatMap((name) => ['--filter', name]), 'typecheck'];
    const windows = process.platform === 'win32';
    const result = spawnSync(
      windows ? 'cmd.exe' : 'pnpm',
      windows ? ['/d', '/s', '/c', `pnpm ${args.join(' ')}`] : args,
      {
        cwd: root,
        encoding: 'utf8',
        timeout: 90_000,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    failed = result.status !== 0;
  }
  if (failed) {
    recordBlock('typecheck-failed');
    return {
      decision: 'block',
      reason:
        'Ping: package typecheck failed or timed out. Run typecheck, fix or report the failure; update status/evidence when the task ends.',
    };
  }
  process.stderr.write(
    'Ping: update task status/evidence when completing the task; include pending checks.\n',
  );
  return {};
}

try {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  const output =
    mode === 'pre'
      ? pre(input)
      : mode === 'post'
        ? post(input)
        : mode === 'stop'
          ? stop(input)
          : null;
  if (output === null) throw new Error('Unknown hook mode');
  process.stdout.write(JSON.stringify(output));
} catch {
  try {
    recordBlock('hook-error');
  } catch {
    // Still fail closed if metrics cannot be written.
  }
  // Exit 2 blocks PreToolUse. Never print request bodies or tool input on errors.
  process.stderr.write('Ping workflow hook failed; inspect configuration before retrying.\n');
  process.exitCode = 2;
}

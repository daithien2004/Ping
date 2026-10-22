import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { after, test } from 'node:test';
import { checkWrite, packagesForChanges } from './workflow-policy.mjs';

const root = mkdtempSync(path.join(tmpdir(), 'ping-workflow-'));
after(() => rmSync(root, { recursive: true, force: true }));
const migration = 'apps/api/prisma/migrations';
const committed = [`${migration}/20261020_initial/migration.sql`];
const check = (file, options = {}) =>
  checkWrite(root, file, { mainFiles: () => committed, ...options });

test('ordinary project source remains writable without querying main', () => {
  assert.equal(check('apps/api/src/example.ts', { mainFiles: () => assert.fail() }).allowed, true);
});

for (const file of [
  '.env',
  '.env.example',
  'apps/web/.env.local',
  'ops/server.pem',
  'ops/SERVER.KEY',
  '.ssh/id_ed25519',
  '../outside.ts',
  path.join(root, '..', 'outside.ts'),
]) {
  test(`protected write is denied: ${file}`, () => {
    assert.equal(check(file).allowed, false);
  });
}

test('every file in a migration directory committed on main is immutable', () => {
  assert.equal(check(`${migration}/20261020_initial/migration.sql`).allowed, false);
  assert.equal(check(`${migration}/20261020_initial/another.sql`).allowed, false);
});

test('new migration and expand/contract migration remain writable', () => {
  assert.equal(check(`${migration}/20261022_expand/migration.sql`).allowed, true);
});

test('migration write fails closed if main cannot be inspected', () => {
  assert.equal(
    check(`${migration}/20261022_expand/migration.sql`, {
      mainFiles: () => {
        throw new Error('main unavailable');
      },
    }).allowed,
    false,
  );
});

test('migration lock committed on main cannot be edited', () => {
  assert.equal(
    check(`${migration}/migration_lock.toml`, {
      mainFiles: () => [`${migration}/migration_lock.toml`],
    }).allowed,
    false,
  );
});

test('junction/symlink cannot redirect a write outside the workspace', () => {
  const outside = mkdtempSync(path.join(tmpdir(), 'ping-workflow-outside-'));
  try {
    symlinkSync(
      outside,
      path.join(root, 'redirect'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    assert.equal(check('redirect/example.ts').allowed, false);
  } finally {
    rmSync(path.join(root, 'redirect'), { force: true, recursive: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test('a sensitive file reached through an alias stays protected', () => {
  mkdirSync(path.join(root, '.env.hidden'), { recursive: true });
  symlinkSync(
    path.join(root, '.env.hidden'),
    path.join(root, 'alias'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  assert.equal(check('alias/example.ts').allowed, false);
});

test('invalid or missing tool file paths fail closed', () => {
  for (const file of [undefined, '', '\0bad', 12]) {
    assert.equal(check(file).allowed, false);
  }
});

test('test-only agent can write test directories but cannot edit source', () => {
  assert.equal(check('apps/api/test/example.e2e-spec.ts', { scope: 'test' }).allowed, true);
  assert.equal(check('apps/web/e2e/example.spec.ts', { scope: 'test' }).allowed, true);
  assert.equal(check('apps/api/src/example.ts', { scope: 'test' }).allowed, false);
});

test('doc-only agent cannot edit files outside docs', () => {
  assert.equal(check('docs/example.md', { scope: 'docs' }).allowed, true);
  assert.equal(check('README.md', { scope: 'docs' }).allowed, false);
});

test('Stop selects affected packages and shared dependents', () => {
  assert.deepEqual(packagesForChanges(['apps/api/src/example.ts']), ['api']);
  assert.deepEqual(packagesForChanges(['apps/web/src/example.tsx']), ['web']);
  assert.deepEqual(packagesForChanges(['packages/shared/src/events.ts']), [
    '@ping/shared',
    'api',
    'web',
  ]);
  assert.deepEqual(packagesForChanges(['docs/example.md']), []);
  assert.deepEqual(packagesForChanges(['package.json']), ['@ping/shared', 'api', 'web']);
});

test('existing source file content never needs to be read by the policy', () => {
  writeFileSync(path.join(root, 'example.ts'), 'not-a-secret-test-fixture');
  assert.equal(check('example.ts').allowed, true);
});

const hook = fileURLToPath(new URL('./workflow.mjs', import.meta.url));
function runHook(mode, input) {
  return spawnSync(process.execPath, [hook, mode], {
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    input: typeof input === 'string' ? input : JSON.stringify(input),
    encoding: 'utf8',
    timeout: 10_000,
  });
}

test('CLI returns deny JSON and records only a reason, without tool content', () => {
  const result = runHook('pre', {
    tool_input: { file_path: '.env', content: 'DO-NOT-LOG-FIXTURE' },
  });
  assert.equal(result.status, 0);
  assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, 'deny');
  const metrics = readFileSync(path.join(root, 'docs/claude-workflow/metrics.md'), 'utf8');
  assert.match(metrics, /secret-path/);
  assert.doesNotMatch(metrics, /DO-NOT-LOG-FIXTURE/);
});

test('CLI allowed edit leaves the normal permission system in control', () => {
  const result = runHook('pre', { tool_input: { file_path: 'example.ts' } });
  assert.equal(result.status, 0);
  assert.deepEqual(JSON.parse(result.stdout), {});
});

test('CLI invalid JSON fails closed without echoing input', () => {
  const result = runHook('pre', 'DO-NOT-LOG-BAD-JSON');
  assert.equal(result.status, 2);
  assert.doesNotMatch(result.stderr, /DO-NOT-LOG-BAD-JSON/);
});

test('Stop recursion guard does not run Git or block again', () => {
  const result = runHook('stop', { stop_hook_active: true });
  assert.equal(result.status, 0);
  assert.deepEqual(JSON.parse(result.stdout), {});
});

test('PostToolUse formats the changed file through local Prettier', () => {
  writeFileSync(path.join(root, 'format-me.ts'), 'const x=1');
  const result = runHook('post', { tool_input: { file_path: 'format-me.ts' } });
  assert.equal(result.status, 0);
  assert.deepEqual(JSON.parse(result.stdout), {});
  assert.equal(readFileSync(path.join(root, 'format-me.ts'), 'utf8'), 'const x = 1;\n');
});

for (const exitCode of [0, 1]) {
  test(`Stop runs typecheck for the affected package (exit ${exitCode})`, () => {
    const fixture = mkdtempSync(path.join(tmpdir(), 'ping-stop-'));
    try {
      execFileSync('git', ['init', '-b', 'main'], { cwd: fixture, stdio: 'pipe' });
      execFileSync(
        'git',
        [
          '-c',
          'user.name=Fixture',
          '-c',
          'user.email=fixture@invalid',
          'commit',
          '--allow-empty',
          '-m',
          'fixture',
        ],
        { cwd: fixture, stdio: 'pipe' },
      );
      mkdirSync(path.join(fixture, 'apps/api/src'), { recursive: true });
      writeFileSync(path.join(fixture, 'apps/api/src/example.ts'), 'export {};');
      mkdirSync(path.join(fixture, 'bin'));
      const windows = process.platform === 'win32';
      const launcher = path.join(fixture, 'bin', windows ? 'pnpm.cmd' : 'pnpm');
      writeFileSync(
        launcher,
        windows
          ? `@echo off\r\necho %* > "%~dp0args.txt"\r\nexit /b ${exitCode}\r\n`
          : `#!/bin/sh\nprintf '%s\\n' "$@" > "$(dirname "$0")/args.txt"\nexit ${exitCode}\n`,
        { mode: 0o755 },
      );
      const env = { ...process.env, CLAUDE_PROJECT_DIR: fixture };
      const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path') || 'PATH';
      env[pathKey] = path.join(fixture, 'bin') + path.delimiter + env[pathKey];
      const result = spawnSync(process.execPath, [hook, 'stop'], {
        cwd: fixture,
        env,
        input: '{}',
        encoding: 'utf8',
        timeout: 10_000,
      });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(
        readFileSync(path.join(fixture, 'bin/args.txt'), 'utf8').trim().replace(/\s+/g, ' '),
        '--filter api typecheck',
      );
      const output = JSON.parse(result.stdout);
      assert.equal(output.decision, exitCode === 0 ? undefined : 'block');
      if (exitCode !== 0) {
        assert.match(
          readFileSync(path.join(fixture, 'docs/claude-workflow/metrics.md'), 'utf8'),
          /typecheck-failed/,
        );
      }
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });
}

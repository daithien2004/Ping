import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const migrationRoot = 'apps/api/prisma/migrations';
const deny = (reason) => ({ allowed: false, reason });
const slash = (value) => value.split(path.sep).join('/');

function resolveThroughLinks(file) {
  let parent = file;
  const remaining = [];
  while (!existsSync(parent)) {
    const next = path.dirname(parent);
    if (next === parent) throw new Error('No existing parent');
    remaining.unshift(path.basename(parent));
    parent = next;
  }
  return path.join(realpathSync(parent), ...remaining);
}

function relativeInside(root, file) {
  const relative = slash(path.relative(root, file));
  if (!relative || relative === '..' || relative.startsWith('../') || path.isAbsolute(relative)) {
    return null;
  }
  return process.platform === 'win32' ? relative.toLowerCase() : relative;
}

function isSecret(file) {
  return file
    .split('/')
    .some((part) => /^\.env|\.(pem|key|p12|pfx)$|^id_(rsa|ed25519|ecdsa)$/i.test(part));
}

export function checkWrite(root, file, { mainFiles, scope } = {}) {
  if (typeof file !== 'string' || !file || file.includes('\0')) return deny('invalid-path');
  let relative;
  let canonical;
  try {
    relative = relativeInside(path.resolve(root), path.resolve(root, file));
    canonical = relativeInside(realpathSync(root), resolveThroughLinks(path.resolve(root, file)));
  } catch {
    return deny('unresolvable-path');
  }
  if (relative === null || canonical === null) return deny('outside-workspace');
  if ([relative, canonical].some(isSecret)) return deny('secret-path');
  if ([relative, canonical].some((value) => value === '.git' || value.startsWith('.git/'))) {
    return deny('git-internals');
  }
  const allowedScope = (value) => {
    if (scope === 'test') return /(^|\/)(test|tests|e2e)\//.test(value);
    if (scope === 'docs') return value.startsWith('docs/');
    return true;
  };
  if (![relative, canonical].every(allowedScope)) return deny('agent-write-scope');
  for (const candidate of new Set([relative, canonical])) {
    if (!candidate.startsWith(migrationRoot + '/')) continue;
    let committed;
    try {
      committed = mainFiles().map((value) =>
        process.platform === 'win32' ? value.toLowerCase() : value,
      );
    } catch {
      return deny('cannot-check-main');
    }
    const rest = candidate.slice(migrationRoot.length + 1);
    const directory = rest.split('/')[0];
    if (
      committed.includes(candidate) ||
      committed.some((value) => value.startsWith(`${migrationRoot}/${directory}/`))
    ) {
      return deny('committed-migration');
    }
  }
  return { allowed: true };
}

export function packagesForChanges(files) {
  const all = ['@ping/shared', 'api', 'web'];
  if (
    files.some(
      (file) =>
        file.startsWith('packages/') ||
        ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'turbo.json'].includes(file),
    )
  ) {
    return all;
  }
  return ['api', 'web'].filter((name) => files.some((file) => file.startsWith(`apps/${name}/`)));
}

import { execFileSync, execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.chdir(path.resolve(fileURLToPath(new URL('..', import.meta.url))));

const url = new URL(process.env.DATABASE_URL ?? 'postgresql://invalid/');
const db = url.pathname.slice(1);
// Chốt chặn: không bao giờ seed/ghi e2e vào CSDL dev `ping`.
if (!/^\w+$/.test(db) || db === 'ping') {
  console.error(`✖ DATABASE_URL phải trỏ CSDL e2e riêng (đang là "${db}").`);
  process.exit(1);
}

// Docker là .exe: truyền tham số trực tiếp để chuỗi SQL không bị shell tách.
const psql = (sql) =>
  execFileSync(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      'postgres',
      'psql',
      '-U',
      url.username,
      '-d',
      'postgres',
      '-tAc',
      sql,
    ],
    { encoding: 'utf8' },
  ).trim();

if (psql(`SELECT 1 FROM pg_database WHERE datname='${db}'`) !== '1') {
  psql(`CREATE DATABASE ${db}`);
  console.log(`Đã tạo CSDL ${db}.`);
}
execSync('pnpm --filter api exec prisma migrate deploy', { stdio: 'inherit' });
execSync('pnpm --filter api exec prisma db seed', { stdio: 'inherit' });

// `pnpm bootstrap`: từ một bản clone mới tới môi trường dev chạy được bằng MỘT lệnh (ADR-0034).
// (Không đặt tên `setup`: `pnpm setup` là lệnh có sẵn của pnpm, cấu hình PATH, nên script cùng tên không chạy.)
//
//   pnpm bootstrap            cài dependency, tạo .env, bật Postgres+Redis, migrate, seed
//   pnpm bootstrap --skip-install   bỏ bước cài dependency (đã cài rồi)
//
// Chạy lại bao nhiêu lần cũng được (idempotent): .env có sẵn thì giữ nguyên, migration và seed đều an toàn khi lặp.
// Viết bằng Node thuần để chạy giống nhau trên Windows, macOS và Linux (không phụ thuộc bash).
import { execSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
process.chdir(root);
const skipInstall = process.argv.includes('--skip-install');

const step = (message) => console.log(`\n▶ ${message}`);
const fail = (message) => {
  console.error(`\n✖ ${message}`);
  process.exit(1);
};
const run = (command) => execSync(command, { stdio: 'inherit' });
const succeeds = (command) => {
  try {
    execSync(command, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

step('Kiểm tra công cụ');
const wantedNode = readFileSync('.nvmrc', 'utf8').trim();
if (process.versions.node !== wantedNode) {
  fail(
    `Cần Node ${wantedNode} (đang là ${process.versions.node}). Với nvm: nvm install ${wantedNode} && nvm use ${wantedNode}.`,
  );
}
if (!succeeds('pnpm --version')) fail('Không thấy pnpm. Cài bằng: corepack enable (đi kèm Node).');
if (!succeeds('docker info')) {
  fail('Docker chưa chạy hoặc chưa cài. Bật Docker Desktop (hoặc dịch vụ docker) rồi chạy lại.');
}

if (skipInstall) {
  step('Bỏ qua cài dependency (--skip-install)');
} else {
  step('Cài dependency (pnpm install --frozen-lockfile)');
  run('pnpm install --frozen-lockfile');
}

step('Tạo .env');
if (existsSync('.env')) {
  console.log('.env đã có: giữ nguyên.');
} else {
  copyFileSync('.env.example', '.env');
  console.log('Đã tạo .env từ .env.example (giá trị dev, KHÔNG dùng cho production).');
}

step('Bật Postgres và Redis (docker compose up -d --wait)');
run('docker compose up -d --wait');

step('Build gói dùng chung, sinh Prisma client, chạy migration, seed dữ liệu demo');
run('pnpm --filter @ping/shared build');
run('pnpm --filter api exec prisma generate');
run('pnpm --filter api exec prisma migrate deploy');
run('pnpm --filter api exec prisma db seed');

console.log(`
✔ Xong. Chạy ứng dụng:

    pnpm dev

  Web:  http://localhost:3000
  API:  http://localhost:4000/api/v1/health   (tài liệu Swagger: http://localhost:4000/docs)

  Tài khoản demo (mật khẩu password123): alice@ping.dev, bob@ping.dev, carol@ping.dev
`);

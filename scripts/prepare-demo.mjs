// `pnpm demo:prepare`: chuẩn bị môi trường diễn demo 5 phút (T7.4) bằng MỘT lệnh.
//
//   pnpm demo:prepare            đảm bảo DB `ping_demo` có, migrate + seed lại (giữ dữ liệu cũ)
//   pnpm demo:prepare --fresh    xoá và tạo lại `ping_demo` từ đầu, rồi migrate + seed
//
// Vì sao cần DB riêng: DB dev tích server từ các lần test, mỗi server sinh một request
// `/servers/:id/unread` → vượt hạn mức 100 request/phút/IP và trang quay vì 429 (đo ở lần
// diễn tập 1). Seed demo idempotent (id cố định) nên chạy lại cho cùng trạng thái.
//
// Viết bằng Node thuần để chạy giống nhau trên Windows, macOS và Linux (không phụ thuộc bash).
import { execFileSync, execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
process.chdir(root);
const fresh = process.argv.includes('--fresh');

const DB = 'ping_demo';
const DATABASE_URL = `postgresql://ping:ping@localhost:5432/${DB}`;
const EXPECTED = { servers: 3, channels: 9, messages: 21600 };

const step = (message) => console.log(`\n▶ ${message}`);
const warn = (message) => console.warn(`\n⚠ ${message}`);
const fail = (message) => {
  console.error(`\n✖ ${message}`);
  process.exit(1);
};
// Docker là .exe nên truyền tham số trực tiếp: qua shell, Node ghép tham số không kèm nháy
// → chuỗi SQL bị tách thành nhiều đối số. pnpm là .cmd nên vẫn phải chạy qua shell (như
// scripts/bootstrap.mjs).
const run = (command, env = {}) =>
  execSync(command, { stdio: 'inherit', env: { ...process.env, ...env } });
const capture = (command, args) =>
  execFileSync(command, args, { encoding: 'utf8', env: process.env }).trim();

const psql = (database, sql) =>
  capture('docker', [
    'compose',
    'exec',
    '-T',
    'postgres',
    'psql',
    '-U',
    'ping',
    '-d',
    database,
    '-tAc',
    sql,
  ]);

function portOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

step('Kiểm tra công cụ');
const wantedNode = readFileSync('.nvmrc', 'utf8').trim();
if (process.versions.node !== wantedNode) {
  fail(
    `Cần Node ${wantedNode} (đang là ${process.versions.node}). Với nvm: nvm use ${wantedNode}.`,
  );
}
try {
  capture('docker', ['info']);
} catch {
  fail('Docker chưa chạy hoặc chưa cài. Bật Docker Desktop rồi chạy lại.');
}
if (!existsSync('.env')) {
  fail('Thiếu .env. Chạy "pnpm bootstrap" trước (tạo .env dev + Postgres/Redis + seed).');
}

step('Bật Postgres, Redis, Qdrant, Mailpit (docker compose up -d --wait)');
run('docker compose up -d --wait');

step(fresh ? `Tạo lại DB ${DB} từ đầu (--fresh)` : `Đảm bảo DB ${DB} tồn tại`);
const exists = psql('postgres', `SELECT 1 FROM pg_database WHERE datname='${DB}'`) === '1';
if (fresh && exists) {
  // Ngắt kết nối đang mở (API dev trỏ DB này) rồi mới drop được.
  psql(
    'postgres',
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${DB}' AND pid <> pg_backend_pid()`,
  );
  psql('postgres', `DROP DATABASE IF EXISTS ${DB}`);
  console.log(`Đã xoá ${DB}.`);
}
if (fresh || !exists) {
  psql('postgres', `CREATE DATABASE ${DB}`);
  console.log(`Đã tạo ${DB}.`);
} else {
  console.log(`${DB} đã có: giữ dữ liệu, chỉ migrate + seed lại.`);
}

step(`Migrate + seed demo trên ${DB}`);
run('pnpm --filter api exec prisma migrate deploy', { DATABASE_URL });
run('pnpm seed:demo', { DATABASE_URL });

step('Kiểm số liệu seed và môi trường');
const counts = {
  servers: Number(psql(DB, 'SELECT count(*) FROM "Server"')),
  channels: Number(psql(DB, 'SELECT count(*) FROM "Channel"')),
  messages: Number(psql(DB, 'SELECT count(*) FROM "Message"')),
  users: Number(psql(DB, 'SELECT count(*) FROM "User"')),
};
console.log(
  `servers=${counts.servers} channels=${counts.channels} messages=${counts.messages} users=${counts.users}`,
);
if (counts.messages < EXPECTED.messages) {
  fail(`Chỉ có ${counts.messages} tin, cần ≥ ${EXPECTED.messages} — seed chưa chạy đúng.`);
}
if (counts.servers !== EXPECTED.servers || counts.channels !== EXPECTED.channels) {
  warn(
    `DB có dư dữ liệu (mong đợi ${EXPECTED.servers} server / ${EXPECTED.channels} kênh). ` +
      'Muốn sạch tuyệt đối trước buổi quay: chạy "pnpm demo:prepare --fresh".',
  );
}

const busy = [];
if (await portOpen(4000)) busy.push('4000 (API)');
if (await portOpen(3000)) busy.push('3000 (web)');
if (busy.length) {
  warn(
    `Cổng đang bận: ${busy.join(', ')}. Process cũ có thể trỏ DB khác (sự cố lần diễn tập 1): ` +
      `tắt chúng rồi khởi động lại với DATABASE_URL bên dưới, và kiểm ` +
      `docker compose exec -T postgres psql -U ping -d ${DB} -c 'select count(*) from "Server"'.`,
  );
}

console.log(`
✔ DB demo sẵn sàng: ${DB} (${counts.messages.toLocaleString('vi-VN')} tin, ${counts.users} tài khoản)

  Mở 3 process (mỗi process một cửa sổ), đều với DATABASE_URL:

    export DATABASE_URL="${DATABASE_URL}"
    pnpm --filter api dev            # API :4000
    pnpm --filter api dev:worker     # worker quét tệp — thiếu thì tệp đứng ở "Đang kiểm tra tệp…"
    pnpm --filter web dev            # web :3000

  Kiểm 60 giây trước khi bấm giờ:

    curl -s -o /dev/null -w "%{http_code}\\n" http://127.0.0.1:4000/api/v1/health   # 200

  Tài khoản (mật khẩu password123): alice/bob/carol/david@ping.dev
  Kịch bản 5 phút: docs/v0.2.0/demo.md
`);

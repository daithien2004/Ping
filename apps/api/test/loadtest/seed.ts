/**
 * Dữ liệu cho load test (H7, ADR-0033). Tạo CSDL riêng `ping_load` (không đụng dữ liệu dev), chạy migration,
 * rồi nạp: N người dùng, một server có M channel, mọi người là member (mang @everyone) và vài triệu tin
 * nhắn phân bố lệch (vài channel rất nóng). Ghi thẳng DB bằng INSERT hàng loạt: đi qua API sẽ đo nhầm
 * rate limit và argon2 thay vì thứ cần đo.
 *
 *   pnpm --filter api exec tsx test/loadtest/seed.ts
 *   LT_USERS=5000 LT_MESSAGES=3000000 LT_CHANNELS=50 (mặc định)
 *
 * Ra: tools/loadtest/data/{tokens.json,meta.json} (bị git bỏ qua). JWT ký sẵn thời hạn 6 giờ: login là
 * argon2.verify, một phép đo CPU băm mật khẩu chứ không phải thứ ta muốn đo.
 */
import { execFileSync } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const apiDir = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const repoRoot = path.resolve(apiDir, '../..');
process.loadEnvFile(path.join(repoRoot, '.env'));

const USERS = Number(process.env.LT_USERS ?? 5000);
const MESSAGES = Number(process.env.LT_MESSAGES ?? 3_000_000);
const CHANNELS = Number(process.env.LT_CHANNELS ?? 50);
const DB_NAME = 'ping_load';
const BATCH = 10_000;

const baseUrl = new URL(process.env.DATABASE_URL!);
const loadUrl = new URL(baseUrl);
loadUrl.pathname = `/${DB_NAME}`;
export const LOAD_DATABASE_URL = loadUrl.toString();

/** UUIDv7 với timestamp cho trước: id phải tăng theo thời gian (cursor phân trang sắp theo id). */
function uuidv7(ms: number): string {
  const bytes = randomBytes(16);
  bytes.writeUIntBE(ms, 0, 6);
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const b64url = (value: Buffer | string) => Buffer.from(value).toString('base64url');
/** JWT HS256 y hệt @nestjs/jwt ký: payload { sub, username }. */
function signJwt(userId: string, username: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify({ sub: userId, username, iat: now, exp: now + 6 * 3600 }));
  const signature = createHmac('sha256', process.env.JWT_ACCESS_SECRET!)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${signature}`;
}

async function createDatabase() {
  const adminUrl = new URL(baseUrl);
  adminUrl.pathname = '/postgres';
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [DB_NAME]);
  if (exists.rowCount === 0) await admin.query(`CREATE DATABASE ${DB_NAME}`);
  await admin.end();
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: apiDir,
    env: { ...process.env, DATABASE_URL: LOAD_DATABASE_URL },
    stdio: 'inherit',
    shell: true,
  });
}

async function main() {
  console.log(`seed: ${USERS} users, ${CHANNELS} channels, ${MESSAGES} messages -> ${DB_NAME}`);
  await createDatabase();
  const db = new pg.Pool({ connectionString: LOAD_DATABASE_URL, max: 4 });

  // Làm sạch lần chạy trước: xóa server (cascade channel, tin nhắn, member, role) rồi user.
  await db.query(`DELETE FROM "Server" WHERE name = 'loadtest'`);
  await db.query(`DELETE FROM "User" WHERE email LIKE 'lt-%@loadtest.local'`);

  const t0 = Date.now();
  const start = Date.now() - 60 * 24 * 3600 * 1000; // lịch sử trải trên 60 ngày
  const stepMs = Math.max(1, Math.floor((60 * 24 * 3600 * 1000) / Math.max(MESSAGES, USERS + 10)));

  // Người dùng.
  const users = Array.from({ length: USERS }, (_, i) => ({
    id: uuidv7(start + i),
    email: `lt-${i}@loadtest.local`,
    username: `lt_${i}`,
  }));
  for (let i = 0; i < users.length; i += 1000) {
    const part = users.slice(i, i + 1000);
    await db.query(
      `INSERT INTO "User"(id, email, username, "displayName", "passwordHash", "updatedAt")
       SELECT id, email, username, username, 'not-a-real-hash', now()
       FROM unnest($1::uuid[], $2::text[], $3::text[]) AS t(id, email, username)`,
      [part.map((u) => u.id), part.map((u) => u.email), part.map((u) => u.username)],
    );
  }

  // Server, role @everyone (VIEW_CHANNEL | SEND_MESSAGES), channel, member.
  const owner = users[0]!;
  const serverId = uuidv7(start + USERS);
  await db.query(
    `INSERT INTO "Server"(id, name, "ownerId", "inviteCode") VALUES ($1, 'loadtest', $2, $3)`,
    [serverId, owner.id, randomBytes(6).toString('hex')],
  );
  const everyoneId = uuidv7(start + USERS + 1);
  // Permissions.VIEW_CHANNEL (1) | SEND_MESSAGES (2): cùng giá trị server thật gán cho @everyone khi tạo server.
  const everyonePermissions = '3';
  await db.query(
    `INSERT INTO "Role"(id, "serverId", name, permissions, position, "isDefault")
     VALUES ($1, $2, '@everyone', $3, 0, true)`,
    [everyoneId, serverId, everyonePermissions],
  );
  const channels = Array.from({ length: CHANNELS }, (_, i) => ({
    id: uuidv7(start + USERS + 2 + i),
    name: `lt-${i}`,
  }));
  await db.query(
    `INSERT INTO "Channel"(id, "serverId", name, position)
     SELECT id, $1, name, ord::int FROM unnest($2::uuid[], $3::text[]) WITH ORDINALITY AS t(id, name, ord)`,
    [serverId, channels.map((c) => c.id), channels.map((c) => c.name)],
  );
  const memberIds = users.map((_, i) => uuidv7(start + USERS + 100 + i));
  for (let i = 0; i < users.length; i += 1000) {
    const ids = memberIds.slice(i, i + 1000);
    const userIds = users.slice(i, i + 1000).map((u) => u.id);
    await db.query(
      `INSERT INTO "Member"(id, "serverId", "userId")
       SELECT id, $1, "userId" FROM unnest($2::uuid[], $3::uuid[]) AS t(id, "userId")`,
      [serverId, ids, userIds],
    );
    await db.query(
      `INSERT INTO "MemberRole"("memberId", "roleId")
       SELECT id, $1 FROM unnest($2::uuid[]) AS t(id)`,
      [everyoneId, ids],
    );
  }
  console.log(`seed: users/server/members done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  // Tin nhắn: id tăng theo thời gian, channel lệch (channel 0 nóng nhất), tác giả ngẫu nhiên.
  const t1 = Date.now();
  const counts = new Array<number>(CHANNELS).fill(0);
  for (let done = 0; done < MESSAGES; done += BATCH) {
    const n = Math.min(BATCH, MESSAGES - done);
    const ids: string[] = [];
    const channelIds: string[] = [];
    const authors: string[] = [];
    const contents: string[] = [];
    const created: string[] = [];
    for (let k = 0; k < n; k++) {
      const ts = start + USERS + 1000 + (done + k) * stepMs;
      const channelIndex = Math.min(CHANNELS - 1, Math.floor(Math.random() ** 3 * CHANNELS));
      counts[channelIndex]!++;
      ids.push(uuidv7(ts));
      channelIds.push(channels[channelIndex]!.id);
      authors.push(users[Math.floor(Math.random() * USERS)]!.id);
      contents.push(`tin nhắn thử tải số ${done + k} lorem ipsum dolor sit amet`);
      created.push(new Date(ts).toISOString());
    }
    await db.query(
      `INSERT INTO "Message"(id, "channelId", "authorId", content, "createdAt")
       SELECT id, "channelId", "authorId", content, "createdAt"
       FROM unnest($1::uuid[], $2::uuid[], $3::uuid[], $4::text[], $5::timestamptz[])
         AS t(id, "channelId", "authorId", content, "createdAt")`,
      [ids, channelIds, authors, contents, created],
    );
    if ((done / BATCH) % 20 === 0) {
      console.log(
        `seed: messages ${done + n}/${MESSAGES} (${((Date.now() - t1) / 1000).toFixed(0)}s)`,
      );
    }
  }
  await db.query('ANALYZE');
  await db.end();

  const outDir = path.join(repoRoot, 'tools/loadtest/data');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    path.join(outDir, 'tokens.json'),
    JSON.stringify(
      users.map((u) => ({ userId: u.id, username: u.username, token: signJwt(u.id, u.username) })),
    ),
  );
  writeFileSync(
    path.join(outDir, 'meta.json'),
    JSON.stringify(
      {
        serverId,
        channels: channels.map((c, i) => ({ id: c.id, messages: counts[i] })),
        hotChannelId: channels[0]!.id,
        users: USERS,
        messages: MESSAGES,
      },
      null,
      2,
    ),
  );
  console.log(
    `seed: done in ${((Date.now() - t0) / 1000).toFixed(0)}s; hot channel has ${counts[0]} messages`,
  );
}

await main();

/**
 * Dev seed — chạy bằng `pnpm --filter api exec prisma db seed`.
 * Mọi tài khoản dùng chung mật khẩu "password123" (CHỈ dev local, không production).
 * Idempotent: id cố định + upsert → chạy lại bao nhiêu lần cũng cho cùng trạng thái.
 */
import { Permissions } from '@ping/shared';
import { PrismaPg } from '@prisma/adapter-pg';
import { argon2id, hash } from 'argon2';
import { PrismaClient } from '../src/generated/prisma/client.js';

// Prisma 7: client không tự đọc DATABASE_URL nữa — phải trao driver adapter.
// Prisma CLI inject .env vào subprocess seed nên biến đã có sẵn ở đây.
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set — seed cần env này để kết nối Postgres.');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const PASSWORD = 'password123';

// Định dạng UUIDv7 thật (timestamp đầu, variant bits, random sau).
const id = (suffix: string): string => `01990000-0000-7000-8000-00000000${suffix}`;

async function main(): Promise<void> {
  const passwordHash = await hash(PASSWORD, { type: argon2id });

  // ── Users ──────────────────────────────────────────────────────────────
  const [alice, bob, carol] = await Promise.all([
    prisma.user.upsert({
      where: { email: 'alice@ping.dev' },
      update: {},
      create: {
        id: id('0001'),
        email: 'alice@ping.dev',
        username: 'alice',
        displayName: 'Alice Nguyen',
        passwordHash,
      },
    }),
    prisma.user.upsert({
      where: { email: 'bob@ping.dev' },
      update: {},
      create: {
        id: id('0002'),
        email: 'bob@ping.dev',
        username: 'bob',
        displayName: 'Bob Tran',
        passwordHash,
      },
    }),
    prisma.user.upsert({
      where: { email: 'carol@ping.dev' },
      update: {},
      create: {
        id: id('0003'),
        email: 'carol@ping.dev',
        username: 'carol',
        displayName: 'Carol Le',
        passwordHash,
      },
    }),
  ]);

  // ── Server ─────────────────────────────────────────────────────────────
  const server = await prisma.server.upsert({
    where: { id: id('0100') },
    update: {},
    create: {
      id: id('0100'),
      name: 'Ping Playground',
      ownerId: alice.id,
      inviteCode: 'playground',
    },
  });

  // ── Roles ──────────────────────────────────────────────────────────────
  const everyone = await prisma.role.upsert({
    where: { id: id('0201') },
    update: {},
    create: {
      id: id('0201'),
      serverId: server.id,
      name: '@everyone',
      isDefault: true,
      permissions: Permissions.VIEW_CHANNEL | Permissions.SEND_MESSAGES,
    },
  });
  const adminRole = await prisma.role.upsert({
    where: { id: id('0202') },
    update: {},
    create: {
      id: id('0202'),
      serverId: server.id,
      name: 'admin',
      position: 1,
      permissions: Permissions.ADMINISTRATOR,
    },
  });
  const modRole = await prisma.role.upsert({
    where: { id: id('0203') },
    update: {},
    create: {
      id: id('0203'),
      serverId: server.id,
      name: 'moderator',
      position: 2,
      permissions:
        Permissions.VIEW_CHANNEL | Permissions.SEND_MESSAGES | Permissions.MANAGE_MESSAGES,
    },
  });

  // ── Members (mỗi user đúng 1 lần mỗi server nhờ @@unique) ──────────────
  await Promise.all([
    prisma.member.upsert({
      where: { serverId_userId: { serverId: server.id, userId: alice.id } },
      update: {},
      create: {
        id: id('0301'),
        serverId: server.id,
        userId: alice.id,
        roles: { create: [{ roleId: everyone.id }, { roleId: adminRole.id }] },
      },
    }),
    prisma.member.upsert({
      where: { serverId_userId: { serverId: server.id, userId: bob.id } },
      update: {},
      create: {
        id: id('0302'),
        serverId: server.id,
        userId: bob.id,
        nickname: 'Bobby',
        roles: { create: [{ roleId: everyone.id }, { roleId: modRole.id }] },
      },
    }),
    prisma.member.upsert({
      where: { serverId_userId: { serverId: server.id, userId: carol.id } },
      update: {},
      create: {
        id: id('0303'),
        serverId: server.id,
        userId: carol.id,
        roles: { create: [{ roleId: everyone.id }] },
      },
    }),
  ]);

  // ── Channels ───────────────────────────────────────────────────────────
  const [general, random, dev] = await Promise.all([
    prisma.channel.upsert({
      where: { id: id('0401') },
      update: {},
      create: { id: id('0401'), serverId: server.id, name: 'general', position: 0 },
    }),
    prisma.channel.upsert({
      where: { id: id('0402') },
      update: {},
      create: { id: id('0402'), serverId: server.id, name: 'random', position: 1 },
    }),
    prisma.channel.upsert({
      where: { id: id('0403') },
      update: {},
      create: { id: id('0403'), serverId: server.id, name: 'dev', position: 2 },
    }),
  ]);

  // ── Messages ───────────────────────────────────────────────────────────
  const messages = [
    { id: id('0501'), channelId: general.id, authorId: alice.id, content: 'Welcome to Ping! 🏓' },
    {
      id: id('0502'),
      channelId: general.id,
      authorId: bob.id,
      content: 'Thanks, happy to be here.',
    },
    { id: id('0503'), channelId: general.id, authorId: carol.id, content: 'Hi both!' },
    {
      id: id('0504'),
      channelId: general.id,
      authorId: alice.id,
      content: 'Kênh #dev dành cho thảo luận kỹ thuật nhé.',
    },
    { id: id('0505'), channelId: random.id, authorId: bob.id, content: 'coffee break?' },
    { id: id('0506'), channelId: random.id, authorId: carol.id, content: 'always ☕' },
    {
      id: id('0507'),
      channelId: random.id,
      authorId: alice.id,
      content: 'Tin này đã bị ẩn bằng soft delete (deletedAt) để demo moderation.',
      deletedAt: new Date(Date.now() - 3_600_000),
    },
    {
      id: id('0508'),
      channelId: dev.id,
      authorId: alice.id,
      content: 'Schema init đã migrate xong.',
    },
    {
      id: id('0509'),
      channelId: dev.id,
      authorId: bob.id,
      content: 'Index (channelId, id desc) cho cursor pagination — nice.',
    },
    {
      id: id('050A'),
      channelId: dev.id,
      authorId: bob.id,
      // Idempotency key: nếu client retry, upsert theo id + unique (channelId, authorId, nonce)
      // chặn ghi trùng bản ghi này.
      content: 'Message này mang nonce để demo chống retry trùng.',
      nonce: 'demo-nonce-1',
    },
    { id: id('050B'), channelId: dev.id, authorId: carol.id, content: 'Ready for Bước 7: auth 🚀' },
  ];

  for (const message of messages) {
    await prisma.message.upsert({ where: { id: message.id }, update: {}, create: message });
  }

  console.log(
    'Seed xong: 3 users / 1 server / 3 roles / 3 members / 3 channels / %d messages.',
    messages.length,
  );
  console.log('Đăng nhập dev: alice@ping.dev (hoặc bob@, carol@) / mật khẩu "%s".', PASSWORD);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

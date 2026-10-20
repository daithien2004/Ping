/**
 * Dev tool: tạo nhiều tin nhắn trong một channel để thử phân trang và danh sách ảo hóa ở web.
 * Ghi thẳng DB (không qua API: rate limit 100 request/phút sẽ chặn).
 *
 *   pnpm --filter api exec tsx prisma/seed-messages.ts <channelId> <authorId,authorId,...> [count=300]
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '../src/generated/prisma/client.js';

/**
 * UUIDv7 với timestamp cho trước. id phải tăng theo thời gian (cursor phân trang sắp theo id);
 * uuid(7) của Prisma sinh trong cùng một mili giây không đảm bảo thứ tự giữa các tin.
 */
function uuidv7(ms: number): string {
  const bytes = randomBytes(16);
  bytes.writeUIntBE(ms, 0, 6);
  bytes[6] = (bytes[6]! & 0x0f) | 0x70; // version 7
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // variant RFC 4122
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function main(): Promise<void> {
  const [channelId, authorList, countArg] = process.argv.slice(2);
  if (!channelId || !authorList) {
    throw new Error('Usage: seed-messages.ts <channelId> <authorId,...> [count]');
  }
  const authorIds = authorList.split(',');
  const count = Number(countArg ?? 300);
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  // Tin cũ nhất cách đây `count` phút, mỗi tin sau cách 1 phút.
  const start = Date.now() - count * 60_000;
  const lengths = [8, 40, 120, 300];
  const data = Array.from({ length: count }, (_, index) => {
    const ms = start + index * 60_000;
    const words = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do'.split(' ');
    const size = lengths[index % lengths.length]!;
    const body = Array.from({ length: size }, (_, w) => words[(index + w) % words.length]).join(
      ' ',
    );
    return {
      id: uuidv7(ms),
      channelId,
      authorId: authorIds[index % authorIds.length]!,
      content: `#${index + 1} ${body}`.slice(0, 4000),
      createdAt: new Date(ms),
    };
  });

  await prisma.message.createMany({ data });
  console.log(`Created ${data.length} messages in channel ${channelId}.`);
  await prisma.$disconnect();
}

await main();

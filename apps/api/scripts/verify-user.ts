/** Dev only: pnpm --filter api exec tsx scripts/verify-user.ts <email> */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

async function main(): Promise<void> {
  const [email] = process.argv.slice(2);
  if (!email) {
    throw new Error('Usage: verify-user.ts <email>');
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set — nạp .env gốc trước khi chạy (xem global-setup).');
  }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const { count } = await prisma.user.updateMany({
    where: { email },
    data: { emailVerified: true },
  });
  console.log(`verify-user: %d user cập nhật (%s)`, count, email);
  await prisma.$disconnect();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

import { config as loadEnvFile } from 'dotenv';
import { resolve } from 'node:path';
import { defineConfig, env } from 'prisma/config';

// Prisma CLI chạy với cwd = apps/api, còn .env nằm ở gốc repo (2 tầng lên).
// Load env TRƯỚC khi env('DATABASE_URL') được đọc ở câu defineConfig bên dưới.
loadEnvFile({ path: resolve(process.cwd(), '../../.env') });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    // `prisma db seed` chạy lệnh này — tsx chạy TS trực tiếp, không cần build step.
    seed: 'tsx prisma/seed.ts',
  },
  datasource: { url: env('DATABASE_URL') },
});

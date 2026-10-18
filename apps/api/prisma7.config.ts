import { config as loadEnvFile } from 'dotenv';
import { resolve } from 'node:path';
import { defineConfig, env } from 'prisma/config';

// Prisma CLI chạy với cwd = apps/api, còn .env nằm ở gốc repo (2 tầng lên).
// Load env TRƯỚC khi env('DATABASE_URL') được đọc ở câu defineConfig bên dưới.
loadEnvFile({ path: resolve(process.cwd(), '../../.env') });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: env('DATABASE_URL') },
});

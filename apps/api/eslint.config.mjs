import { defineConfig, globalIgnores } from 'eslint/config';
import base from '@ping/eslint-config';

export default defineConfig([
  ...base,
  // Prisma-generated client code: built by `prisma generate`, not by hand.
  globalIgnores(['dist/**', 'node_modules/**', 'src/generated/**']),
]);

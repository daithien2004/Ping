import { defineConfig, globalIgnores } from 'eslint/config';
import base from '@ping/eslint-config';

export default defineConfig([
  ...base,
  {
    // Script Node thuần (kiểm tra khói trên stack production): khai báo biến toàn cục của Node.
    files: ['test/smoke/**/*.mjs'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        crypto: 'readonly',
      },
    },
  },
  // Prisma-generated client code: built by `prisma generate`, not by hand.
  globalIgnores(['dist/**', 'node_modules/**', 'src/generated/**']),
]);

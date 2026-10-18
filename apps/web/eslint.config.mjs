import { defineConfig, globalIgnores } from 'eslint/config';
import base from '@ping/eslint-config';
import nextVitals from 'eslint-config-next/core-web-vitals';

export default defineConfig([
  // The shared config already registers the TypeScript parser and plugin.
  ...nextVitals.filter((config) => config.name !== 'next/typescript'),
  ...base,
  {
    settings: {
      next: { rootDir: fileURLToPath(new URL('.', import.meta.url)) },
    },
  },
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts', 'node_modules/**']),
]);
import { fileURLToPath } from 'node:url';

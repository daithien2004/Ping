import { fileURLToPath } from 'node:url';
import { defineConfig, globalIgnores } from 'eslint/config';
import base from '@ping/eslint-config';
import nextVitals from 'eslint-config-next/core-web-vitals';

const noUseParams = {
  name: 'next/navigation',
  importNames: ['useParams'],
  message:
    'Page bị <Activity> giữ ẩn vẫn nhận params của URL hiện tại. Lấy params từ props của page (ADR-0020).',
};
const noApp = {
  group: ['@/app/*', '**/app/*'],
  message: 'app/ chỉ định tuyến; không import từ app/.',
};
const noFeatures = {
  group: ['@/features/*', '**/features/*'],
  message: 'components/ và lib/ không phụ thuộc features/ (phụ thuộc một chiều).',
};

export default defineConfig([
  // The shared config already registers the TypeScript parser and plugin.
  ...nextVitals.filter((config) => config.name !== 'next/typescript'),
  ...base,
  {
    settings: {
      next: { rootDir: fileURLToPath(new URL('.', import.meta.url)) },
    },
  },
  // Ranh giới lớp và bài học F4 (ADR-0020, ADR-0021). Flat config: khối sau GHI ĐÈ cùng rule của
  // khối trước, nên mỗi khối liệt kê đủ hạn chế của nó.
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: { 'no-restricted-imports': ['error', { paths: [noUseParams], patterns: [noApp] }] },
  },
  {
    files: ['src/components/**', 'src/lib/**'],
    rules: {
      'no-restricted-imports': ['error', { paths: [noUseParams], patterns: [noApp, noFeatures] }],
    },
  },
  {
    // Nằm trong layout, phải đi theo URL hiện tại → được dùng useParams().
    files: [
      'src/features/servers/components/server-rail.tsx',
      'src/features/channels/components/channel-sidebar.tsx',
      'src/features/channels/components/channel-redirect.tsx',
    ],
    rules: { 'no-restricted-imports': ['error', { patterns: [noApp] }] },
  },
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts', 'node_modules/**']),
]);

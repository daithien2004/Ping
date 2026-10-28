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

const palette =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black';
// Selector esquery dạng regex; `\\b` vì trong template literal `\b` là ký tự backspace.
const rawColor = `/\\b(bg|text|border|ring|outline|fill|stroke|from|via|to|divide|placeholder|decoration|shadow|accent|caret)-(${palette})\\b/`;
const noProcessEnv = {
  selector: "MemberExpression[object.name='process'][property.name='env']",
  message: 'Đọc biến môi trường qua src/lib/env.ts (một chỗ, có kiểm tra), không dùng process.env.',
};
const rawColorMessage =
  'Dùng token theo nghĩa (bg-muted, text-muted-foreground, bg-rail…) trong globals.css, không dùng màu thô.';

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
      // TG.9: cột hội thoại DM là component layout của /dms (như ChannelSidebar của server).
      'src/features/dms/components/dm-sidebar.tsx',
    ],
    rules: { 'no-restricted-imports': ['error', { patterns: [noApp] }] },
  },
  {
    // Màu chỉ đi qua token trong globals.css (ADR-0023): cấm class màu thô của Tailwind.
    // components/ui là code shadcn sinh ra, đã dùng token.
    files: ['src/**/*.tsx'],
    ignores: ['src/components/ui/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: `Literal[value=${rawColor}]`, message: rawColorMessage },
        { selector: `TemplateElement[value.raw=${rawColor}]`, message: rawColorMessage },
        noProcessEnv,
      ],
    },
  },
  {
    // File .ts cũng không được đọc process.env trực tiếp (khối trên chỉ phủ .tsx).
    files: ['src/**/*.ts'],
    ignores: ['src/lib/env.ts', 'src/**/*.test.ts'],
    rules: { 'no-restricted-syntax': ['error', noProcessEnv] },
  },
  {
    // Accessibility (ADR-0029): bộ luật jsx-a11y mà eslint-config-next chưa bật (Next chỉ bật 6 luật
    // cơ bản). Dùng plugin Next đã đăng ký nên không cần thêm dependency.
    files: ['src/**/*.tsx'],
    rules: {
      'jsx-a11y/anchor-is-valid': 'error',
      'jsx-a11y/click-events-have-key-events': 'error',
      'jsx-a11y/heading-has-content': 'error',
      'jsx-a11y/html-has-lang': 'error',
      'jsx-a11y/iframe-has-title': 'error',
      'jsx-a11y/img-redundant-alt': 'error',
      'jsx-a11y/interactive-supports-focus': 'error',
      'jsx-a11y/label-has-associated-control': ['error', { assert: 'either' }],
      'jsx-a11y/mouse-events-have-key-events': 'error',
      'jsx-a11y/no-autofocus': 'error',
      'jsx-a11y/no-noninteractive-element-interactions': 'error',
      'jsx-a11y/no-noninteractive-tabindex': 'error',
      'jsx-a11y/no-redundant-roles': 'error',
      'jsx-a11y/no-static-element-interactions': 'error',
      'jsx-a11y/tabindex-no-positive': 'error',
    },
  },
  {
    // ADR-0050: antd chi duoc import trong components/ui (bo Ping*).
    files: ['src/**/*.{ts,tsx}'],
    ignores: [
      'src/components/ui/**',
      'src/lib/theme/**',
      'src/providers/**',
      'src/features/servers/components/server-rail.tsx',
      'src/features/channels/components/channel-sidebar.tsx',
      'src/features/channels/components/channel-redirect.tsx',
      // TG.9: cột hội thoại DM là component layout của /dms (như ChannelSidebar của server).
      'src/features/dms/components/dm-sidebar.tsx',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [noUseParams],
          patterns: [
            noApp,
            {
              group: ['antd', 'antd/*'],
              message: 'Antd chi duoc import trong components/ui (bo Ping*). (ADR-0050)',
            },
          ],
        },
      ],
    },
  },
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts', 'node_modules/**']),
]);

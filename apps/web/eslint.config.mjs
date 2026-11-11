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
const noUiKit = {
  group: ['radix-ui', 'radix-ui/*', '@radix-ui/*', 'shadcn', 'class-variance-authority'],
  message: 'Chỉ một bộ component: bọc antd thành Ping* (ADR-0075), không dùng lại shadcn/Radix.',
};
const noAntd = {
  group: ['antd', 'antd/*'],
  message: 'Antd chi duoc import trong components/ui (bo Ping*). (ADR-0050)',
};
const noFeatures = {
  group: ['@/features/*', '**/features/*'],
  message: 'components/ và lib/ không phụ thuộc features/ (phụ thuộc một chiều).',
};
const realtimeIsLowLevel = {
  group: ['@/features/*', '!@/features/realtime', '!@/features/realtime/**'],
  message:
    'features/realtime là tầng truyền tải, không import feature khác. Gắn sự kiện của feature ở gốc ghép (features/shell/components/realtime-provider.tsx) (ADR-0085).',
};
const profileDoesNotKnowMessages = {
  group: ['@/features/messages', '@/features/messages/*'],
  message:
    'features/profile không import messages (messages dùng profile, không ngược lại). Cập nhật cache tin khi hồ sơ đổi do messages tự làm (ADR-0085).',
};
const messagesDoesNotKnowRoutes = {
  group: [
    '@/features/dms',
    '@/features/dms/*',
    '@/features/servers',
    '@/features/servers/*',
    '@/features/channels',
    '@/features/channels/*',
    '@/features/shell',
    '@/features/shell/*',
  ],
  message:
    'features/messages không import dms, servers, channels, shell. Route và DM-hay-server đi vào qua ChannelScope do nơi dựng MessagePane cấp (ADR-0085).',
};

// Nằm trong layout, phải đi theo URL hiện tại → được dùng useParams(). TG.9: cột DM của /dms;
// T6.10: quick switcher cần server của URL hiện tại cho nhóm kênh.
const useParamsFiles = [
  'src/features/servers/components/server-rail.tsx',
  'src/features/channels/components/channel-sidebar.tsx',
  'src/features/channels/components/channel-redirect.tsx',
  'src/features/dms/components/dm-sidebar.tsx',
  'src/features/shell/components/quick-switcher-host.tsx',
];

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
    rules: {
      'no-restricted-imports': ['error', { paths: [noUseParams], patterns: [noApp, noUiKit] }],
    },
  },
  {
    files: ['src/components/**', 'src/lib/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        { paths: [noUseParams], patterns: [noApp, noFeatures, noUiKit] },
      ],
    },
  },
  {
    // Nằm trong layout, phải đi theo URL hiện tại → được dùng useParams().
    files: useParamsFiles,
    rules: { 'no-restricted-imports': ['error', { patterns: [noApp, noUiKit, noAntd] }] },
  },
  {
    // Màu chỉ đi qua token (tokens.ts → globals.css, ADR-0075): cấm class màu thô của Tailwind,
    // áp cho cả bộ Ping* trong components/ui — wrapper cũng lấy màu từ token, không có ngoại lệ.
    files: ['src/**/*.tsx'],
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
    ignores: ['src/components/ui/**', 'src/lib/theme/**', 'src/providers/**', ...useParamsFiles],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [noUseParams],
          patterns: [noApp, noUiKit, noAntd],
        },
      ],
    },
  },
  {
    // ADR-0085: ranh giới giữa các feature. Đặt sau khối antd vì khối sau ghi đè cùng rule.
    files: ['src/features/realtime/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        { paths: [noUseParams], patterns: [noApp, noUiKit, noAntd, realtimeIsLowLevel] },
      ],
    },
  },
  {
    files: ['src/features/profile/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        { paths: [noUseParams], patterns: [noApp, noUiKit, noAntd, profileDoesNotKnowMessages] },
      ],
    },
  },
  {
    files: ['src/features/messages/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        { paths: [noUseParams], patterns: [noApp, noUiKit, noAntd, messagesDoesNotKnowRoutes] },
      ],
    },
  },
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts', 'node_modules/**']),
]);

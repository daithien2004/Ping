/** `node scripts/gen-theme-css.mjs [--check]`; CI chạy `--check`. Chỉ sửa tokens.ts rồi `pnpm --filter web gen:theme`. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  darkColors,
  easing,
  lightColors,
  palette,
  radius,
  shadow,
  typography,
} from '../src/lib/theme/tokens.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, 'src/styles/tokens.generated.css');
const checkOnly = process.argv.includes('--check');

const kebab = (value) => value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

function declarations(colors, indent) {
  const pad = ' '.repeat(indent);
  return Object.entries(colors)
    .map(([key, value]) => `${pad}--${kebab(key)}: ${value};`)
    .join('\n');
}

function paletteDeclarations() {
  const lines = [];
  for (const [group, value] of Object.entries(palette)) {
    if (typeof value === 'string') {
      lines.push(`  --palette-${group}: ${value};`);
      continue;
    }
    for (const [step, hex] of Object.entries(value)) {
      lines.push(`  --palette-${group}-${step}: ${hex};`);
    }
  }
  return lines.join('\n');
}

const radiusDeclarations = Object.entries(radius)
  .map(([key, value]) => `  --ping-radius-${key}: ${value}px;`)
  .join('\n');

// Tiền tố `--ping-` để không đè lên biến cùng tên của Tailwind.
const easingDeclarations = Object.entries(easing)
  .map(([key, value]) => `  --ping-ease-${key}: ${value};`)
  .join('\n');

const weightDeclarations = Object.entries(typography.fontWeight)
  .map(([key, value]) => `  --ping-weight-${key}: ${value};`)
  .join('\n');

const shadowDeclarations = (mode, indent = 2) =>
  Object.entries(shadow)
    .map(([key, value]) => `${' '.repeat(indent)}--ping-shadow-${key}: ${value[mode]};`)
    .join('\n');

const css = `/* AUTO-GENERATED từ src/lib/theme/tokens.ts — KHÔNG sửa tay.
 * Sinh lại: pnpm --filter web gen:theme
 * CI chạy --check và đỏ nếu file này lệch token.
 */
:root {
${paletteDeclarations()}

  /* Bo góc: Tailwind rounded-* đọc các biến này qua @theme trong globals.css. */
${radiusDeclarations}
  --radius: ${radius.lg}px;

  /* Đường cong chuyển động (ease-* của Tailwind). */
${easingDeclarations}

  /* Độ đậm chữ (font-* của Tailwind): ba bậc, xem ghi chú trong tokens.ts. */
${weightDeclarations}

${declarations(lightColors, 2)}

  /* Bóng đổ theo nền (shadow-* của Tailwind). */
${shadowDeclarations('light')}
}

/* Tối theo hệ điều hành, trừ khi người dùng buộc sáng. */
@media (prefers-color-scheme: dark) {
  html:not([data-theme='light']) {
${declarations(darkColors, 4)}
${shadowDeclarations('dark', 4)}
  }
}

/* Buộc tối bằng cài đặt người dùng. */
html[data-theme='dark'] {
${declarations(darkColors, 2)}
${shadowDeclarations('dark')}
}
`;

if (checkOnly) {
  let current = '';
  try {
    current = readFileSync(target, 'utf8');
  } catch {
    console.error(`Thiếu ${target} — chạy: pnpm --filter web gen:theme`);
    process.exit(1);
  }
  if (current !== css) {
    console.error(
      'tokens.generated.css lệch tokens.ts — chạy: pnpm --filter web gen:theme rồi commit file sinh.',
    );
    process.exit(1);
  }
  console.log('tokens.generated.css khớp tokens.ts.');
} else {
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, css, 'utf8');
  console.log(`Đã sinh ${target}`);
}

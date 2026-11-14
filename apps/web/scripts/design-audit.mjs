/** Chỉ đọc. Chạy: `node apps/web/scripts/design-audit.mjs`; exit 1 khi có vi phạm cứng. */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { motion, radius, semanticColors, spacing, typography } from '../src/lib/theme/tokens.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'src');
const failures = [];
const notes = [];

function oklchToSrgb({ l, c, h }) {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l1 = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m1 = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s1 = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clamp = (v) => Math.min(1, Math.max(0, v));
  return [
    clamp(4.0767416621 * l1 - 3.3077115913 * m1 + 0.2309699292 * s1),
    clamp(-1.2684380046 * l1 + 2.6097574011 * m1 - 0.3413193965 * s1),
    clamp(-0.0041960863 * l1 - 0.7034186147 * m1 + 1.707614701 * s1),
  ];
}

function luminance([r, g, b]) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function composite(fg, alpha, bg) {
  return fg.map((channel, i) => channel * alpha + bg[i] * (1 - alpha));
}

function parseColor(value, scope, seen = new Set()) {
  const trimmed = value.trim();
  const varMatch = trimmed.match(/^var\((--[\w-]+)\)$/);
  if (varMatch) {
    const name = varMatch[1];
    if (seen.has(name)) throw new Error(`vòng lặp var(): ${name}`);
    seen.add(name);
    const next = scope.get(name);
    if (!next) throw new Error(`không tìm thấy ${name}`);
    return parseColor(next, scope, seen);
  }
  const oklch = trimmed.match(/^oklch\(([^)]+)\)$/);
  if (oklch) {
    const [main, alphaPart] = oklch[1].split('/');
    const [l, c, h] = main.trim().split(/\s+/).map(Number);
    const alpha = alphaPart ? Number(alphaPart.replace('%', '')) / 100 : 1;
    return { rgb: oklchToSrgb({ l, c, h }), alpha };
  }
  const hex = trimmed.match(/^#([0-9a-f]{3,8})$/i);
  if (hex) {
    let digits = hex[1];
    if (digits.length === 3 || digits.length === 4) {
      digits = digits
        .split('')
        .map((digit) => digit + digit)
        .join('');
    }
    const alpha = digits.length === 8 ? Number.parseInt(digits.slice(6, 8), 16) / 255 : 1;
    const n = Number.parseInt(digits.slice(0, 6), 16);
    return {
      rgb: [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
        const s = v / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      }),
      alpha,
    };
  }
  throw new Error(`màu chưa hỗ trợ: ${trimmed}`);
}

function parseBlock(css, selector) {
  const block = css.match(new RegExp(`${selector}\\s*\\{([^}]*)\\}`));
  if (!block) throw new Error(`không thấy khối ${selector}`);
  const map = new Map();
  for (const line of block[1].replace(/\/\*[\s\S]*?\*\//g, '').split(';')) {
    const decl = line.match(/^\s*(--[\w-]+)\s*:\s*(.+?)\s*$/);
    if (decl) map.set(decl[1], decl[2]);
  }
  return map;
}

const tokensCss = readFileSync(join(srcDir, 'styles/tokens.generated.css'), 'utf8');
const roots = [...tokensCss.matchAll(/:root\s*\{([^}]*)\}/g)].map((m) => m[1]);
const palette = new Map();
const light = new Map();
for (const [index, body] of roots.entries()) {
  if (index > 1) break;
  const target = index === 0 ? palette : light;
  for (const line of body.replace(/\/\*[\s\S]*?\*\//g, '').split(';')) {
    const decl = line.match(/^\s*(--[\w-]+)\s*:\s*(.+?)\s*$/);
    if (decl && !target.has(decl[1])) target.set(decl[1], decl[2]);
  }
}
const dark = parseBlock(tokensCss, "html\\[data-theme='dark'\\]");

function resolve(mode, name) {
  const scope = new Map([...palette, ...(mode === 'dark' ? dark : light)]);
  const { rgb, alpha } = parseColor(scope.get(name) ?? `không có ${name}`, scope);
  return { rgb, alpha };
}

function ratio(mode, fgName, bgName) {
  const bg = resolve(mode, bgName);
  const fg = resolve(mode, fgName);
  const fgRgb = fg.alpha < 1 ? composite(fg.rgb, fg.alpha, bg.rgb) : fg.rgb;
  const bgRgb = bg.alpha < 1 ? composite(bg.rgb, bg.alpha, resolve(mode, '--card').rgb) : bg.rgb;
  return contrast(fgRgb, bgRgb);
}

const TEXT_PAIRS = [
  ['--foreground', '--background', 4.5],
  ['--foreground', '--card', 4.5],
  ['--card-foreground', '--card', 4.5],
  ['--popover-foreground', '--popover', 4.5],
  ['--muted-foreground', '--background', 4.5],
  ['--muted-foreground', '--card', 4.5],
  ['--secondary-foreground', '--secondary', 4.5],
  ['--accent-foreground', '--accent', 4.5],
  ['--link', '--background', 4.5],
  ['--destructive', '--card', 4.5],
  ['--success-foreground', '--success-background', 4.5],
  ['--primary-foreground', '--primary', 4.5],
  ['--rail-foreground', '--rail', 4.5],
  ['--sidebar-foreground', '--sidebar', 4.5],
  ['--sidebar-accent-foreground', '--sidebar-accent', 4.5],
];
const UI_PAIRS = [
  ['--ring', '--background', 3],
  ['--sidebar-primary', '--sidebar', 3],
  ['--input', '--card', 3],
];
const DECORATIVE_PAIRS = [['--border', '--card', 3]];

function printContrast(mode) {
  const rows = [];
  for (const [fg, bg, min] of TEXT_PAIRS) {
    const value = ratio(mode, fg, bg);
    const pass = value >= min;
    if (!pass) failures.push(`${mode}: tương phản ${fg} / ${bg} = ${value.toFixed(2)} < ${min}`);
    rows.push({
      cặp: `${fg} / ${bg}`,
      loại: 'chữ',
      'tỉ lệ': `${value.toFixed(2)}:1`,
      ngưỡng: `${min}:1`,
      kết: pass ? 'đạt' : 'KHÔNG ĐẠT',
    });
  }
  for (const [fg, bg, min] of UI_PAIRS) {
    const value = ratio(mode, fg, bg);
    const pass = value >= min;
    if (!pass)
      failures.push(`${mode}: ranh giới điều khiển ${fg} / ${bg} = ${value.toFixed(2)} < ${min}`);
    rows.push({
      cặp: `${fg} / ${bg}`,
      loại: 'phi chữ',
      'tỉ lệ': `${value.toFixed(2)}:1`,
      ngưỡng: `${min}:1`,
      kết: pass ? 'đạt' : 'KHÔNG ĐẠT',
    });
  }
  for (const [fg, bg, min] of DECORATIVE_PAIRS) {
    const value = ratio(mode, fg, bg);
    const pass = value >= min;
    if (!pass)
      notes.push(
        `${mode}: ${fg} / ${bg} = ${value.toFixed(2)} (dưới ${min}:1 — chỉ là đường phân cách, không phải ranh giới bắt buộc)`,
      );
    rows.push({
      cặp: `${fg} / ${bg}`,
      loại: 'phi chữ',
      'tỉ lệ': `${value.toFixed(2)}:1`,
      ngưỡng: `${min}:1`,
      kết: pass ? 'đạt' : 'ghi chú',
    });
  }
  console.log(`\nTương phản — ${mode === 'light' ? 'nền sáng' : 'nền tối'}`);
  console.table(rows);
}

printContrast('light');
printContrast('dark');

const ANT_PAIRS = [
  ['primaryForeground', 'primary', 4.5],
  ['foreground', 'card', 4.5],
  ['mutedForeground', 'card', 4.5],
  ['link', 'card', 4.5],
  ['destructive', 'card', 4.5],
  ['railForeground', 'rail', 4.5],
  ['borderStrong', 'card', 3],
];
for (const mode of ['light', 'dark']) {
  const colors = semanticColors(mode);
  const card = parseColor(colors.card, new Map()).rgb;
  const rgbOf = (name) => {
    const { rgb, alpha } = parseColor(colors[name], new Map());
    return alpha < 1 ? composite(rgb, alpha, card) : rgb;
  };
  const rows = ANT_PAIRS.map(([fg, bg, min]) => {
    const value = contrast(rgbOf(fg), rgbOf(bg));
    const kind = min === 4.5 ? 'chữ' : 'phi chữ';
    if (kind === 'chữ' && value < min) {
      failures.push(`tokens.ts ${mode}: ${fg}/${bg} = ${value.toFixed(2)} < ${min}`);
    }
    if (kind === 'phi chữ' && value < min) {
      notes.push(`tokens.ts ${mode}: ${fg}/${bg} = ${value.toFixed(2)} (đường phân cách)`);
    }
    return {
      cặp: `${fg} / ${bg}`,
      loại: kind,
      'tỉ lệ': `${value.toFixed(2)}:1`,
      ngưỡng: `${min}:1`,
      kết: value >= min ? 'đạt' : kind === 'chữ' ? 'KHÔNG ĐẠT' : 'ghi chú',
    };
  });
  console.log(`\nTương phản — token antd (tokens.ts), ${mode}`);
  console.table(rows);
}

for (const mode of ['light', 'dark']) {
  const tiers = ['--rail', '--sidebar', '--background'].map((name) => ({
    name,
    value: luminance(resolve(mode, name).rgb),
  }));
  const ordered = tiers[0].value < tiers[1].value && tiers[1].value < tiers[2].value;
  if (!ordered) {
    failures.push(
      `tầng nền ${mode} sai thứ tự: ${tiers.map((t) => `${t.name}=${t.value.toFixed(3)}`).join(', ')}`,
    );
  }
  console.log(
    `\nTầng nền — ${mode === 'light' ? 'nền sáng' : 'nền tối'}: ${tiers
      .map((t) => `${t.name} ${t.value.toFixed(3)}`)
      .join(' → ')}${ordered ? '' : ' — SAI THỨ TỰ'}`,
  );
}

console.log('\nThang thiết kế (nguồn: src/lib/theme/tokens.ts)');
const spacingValues = Object.values(spacing).filter((v) => v > 0);
const spacingOffGrid = spacingValues.filter((v) => v % 4 !== 0);
if (spacingOffGrid.length) failures.push(`spacing lệch lưới 4 px: ${spacingOffGrid.join(', ')}`);
console.log(
  `  spacing: ${spacingValues.join(' / ')} px — ${spacingOffGrid.length ? 'LỆCH LƯỚI' : 'toàn bộ bội số 4 px'}`,
);

const typeSizes = Object.values(typography.fontSize);
console.log(
  `  cỡ chữ: ${typeSizes.join(' / ')} px; giãn dòng ${Object.values(typography.lineHeight).join(' / ')}`,
);
const radii = Object.entries(radius);
console.log(`  radius (antd + biến --ping): ${radii.map(([k, v]) => `${k}=${v}px`).join(', ')}`);
const slowest = Math.max(...Object.values(motion));
if (slowest > 200) failures.push(`motion ${slowest} ms vượt trần 200 ms`);
console.log(
  `  motion: ${Object.entries(motion)
    .map(([k, v]) => `${k}=${v}ms`)
    .join(', ')} — trần 200 ms`,
);

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}
const files = walk(srcDir).filter((f) => /\.(ts|tsx|css)$/.test(f));
const ALLOW_HEX = new Set([
  'app/globals.css',
  'styles/tokens.generated.css',
  'lib/theme/tokens.ts',
  'lib/theme/antd-theme.ts',
  'components/global-error-view.tsx',
  'components/ui/ping-avatar.tsx',
  'features/notifications/favicon.ts',
]);
const ALLOW_IMPORTANT = new Set(['app/globals.css']);
const hexHits = [];
const importantHits = [];
const arbitraryHits = [];
const tinyTextHits = [];
const antdHits = [];
const iconHits = [];
const hoverFiles = new Set();
const stateFiles = new Set();
const ALLOWED_WEIGHTS = new Set(['normal', 'medium', 'semibold']);
const weightCounts = new Map();
const offWeightHits = [];

for (const file of files) {
  const rel = relative(srcDir, file).replaceAll('\\', '/');
  const source = readFileSync(file, 'utf8');
  for (const [, value] of source.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
    if (!ALLOW_HEX.has(rel)) hexHits.push(`${rel}: ${value}`);
  }
  if (!ALLOW_IMPORTANT.has(rel) && source.includes('!important')) importantHits.push(rel);
  for (const match of source.matchAll(/\[[0-9.]+(?:px|rem)\]|text-\[\d+px\]/g)) {
    arbitraryHits.push({ file: rel, value: match[0] });
  }
  for (const match of source.matchAll(/text-\[([0-9.]+)px\]/g)) {
    if (Number(match[1]) < 12) tinyTextHits.push({ file: rel, value: match[0] });
  }
  if (
    !rel.startsWith('components/ui/') &&
    !rel.startsWith('lib/theme/') &&
    !rel.startsWith('providers/')
  ) {
    for (const match of source.matchAll(/from '(antd(?:\/[^']*)?)'/g))
      antdHits.push(`${rel}: ${match[1]}`);
  }
  for (const match of source.matchAll(/from '([^']*icons[^']*)'/g))
    iconHits.push(`${rel}: ${match[1]}`);
  if (/hover:/.test(source)) hoverFiles.add(rel);
  if (/disabled:|disabled=/.test(source)) stateFiles.add(rel);
  for (const match of source.matchAll(
    /font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)\b/g,
  )) {
    weightCounts.set(match[1], (weightCounts.get(match[1]) ?? 0) + 1);
    if (!ALLOWED_WEIGHTS.has(match[1])) offWeightHits.push(`${rel}: ${match[0]}`);
  }
}

const ALLOW_ARBITRARY = new Set([]);
const arbitraryOff = arbitraryHits.filter(
  (hit) => !ALLOW_ARBITRARY.has(`${hit.file}: ${hit.value}`),
);
if (arbitraryOff.length) {
  notes.push(
    `giá trị tuỳ ý ngoài thang: ${arbitraryOff.map((hit) => `${hit.file} ${hit.value}`).join('; ')}`,
  );
}
if (hexHits.length) failures.push(`hex ngoài token: ${hexHits.join('; ')}`);
if (tinyTextHits.length)
  failures.push(
    `chữ dưới 12 px: ${tinyTextHits.map((hit) => `${hit.file} ${hit.value}`).join('; ')}`,
  );
if (importantHits.length)
  failures.push(`!important ngoài globals.css: ${importantHits.join('; ')}`);
if (antdHits.length)
  failures.push(`antd ngoài components/ui|lib/theme|providers: ${antdHits.join('; ')}`);
if (iconHits.length) failures.push(`icon ngoài lucide-react: ${iconHits.join('; ')}`);
if (offWeightHits.length)
  failures.push(`độ đậm ngoài thang normal/medium/semibold: ${offWeightHits.join('; ')}`);

const weightSummary = [...weightCounts.entries()]
  .sort((a, b) => b[1] - a[1])
  .map(([weight, count]) => `${weight}=${count}`)
  .join(', ');

console.log('\nQuét nguồn');
console.log(`  file đã quét: ${files.length}`);
console.log(`  hex ngoài danh sách cho phép: ${hexHits.length}`);
console.log(`  !important ngoài globals.css: ${importantHits.length}`);
console.log(`  giá trị px/rem tuỳ ý ngoài thang: ${arbitraryOff.length}`);
console.log(`  import antd ngoài components/ui|lib/theme|providers: ${antdHits.length}`);
console.log(`  icon ngoài lucide-react: ${iconHits.length}`);
console.log(`  độ đậm chữ ngoài thang: ${offWeightHits.length} (${weightSummary || 'chưa dùng'})`);
console.log(`  file dùng hover:: ${hoverFiles.size}; file có disabled: ${stateFiles.size}`);

if (notes.length) {
  console.log('\nGhi chú:');
  for (const note of notes) console.log(`  - ${note}`);
}
if (failures.length) {
  console.log('\nKHÔNG ĐẠT:');
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exitCode = 1;
} else {
  console.log('\nTất cả kiểm tra cứng đều đạt.');
}

/**
 * Sinh tài sản sticker hệ thống (TG.22, ADR-0067): đọc SVG nguồn từ
 * `scripts/sticker-sources/*.svg`, xuất WebP tĩnh 512×512 (nền trong suốt) sang
 * `apps/web/public/stickers/`. Tài sản tự vẽ — nguồn giấy phép ở `ASSETS_LICENSES.md`.
 *
 * Chạy: `pnpm --filter api exec node ../../scripts/generate-stickers.mjs`
 * (sharp chỉ được cài trong apps/api nên script mượn resolver của gói đó).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const sourcesDir = join(here, 'sticker-sources');
const outputDir = resolve(here, '../apps/web/public/stickers');

// sharp là dependency của apps/api — resolve qua package.json của gói đó.
const requireFromApi = createRequire(resolve(here, '../apps/api/package.json'));
const sharp = requireFromApi('sharp');

const files = readdirSync(sourcesDir).filter((name) => name.endsWith('.svg'));
if (files.length === 0) {
  console.error('Không có SVG nguồn nào trong scripts/sticker-sources/');
  process.exit(1);
}
mkdirSync(outputDir, { recursive: true });

for (const name of files) {
  const svg = readFileSync(join(sourcesDir, name));
  const out = join(outputDir, `${name.slice(0, -4)}.webp`);
  await sharp(svg, { density: 96 })
    .resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: false })
    .webp({ quality: 90, alphaQuality: 100 })
    .toFile(out);
  console.log(`✓ ${name} → ${out.replace(/\\/g, '/')}`);
}
console.log(`Xong ${files.length} sticker.`);

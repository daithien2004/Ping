/** `pnpm --filter api exec node ../../scripts/generate-stickers.mjs` (sharp chỉ cài trong apps/api) */
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const sourcesDir = join(here, 'sticker-sources');
const outputDir = resolve(here, '../apps/web/public/stickers');

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

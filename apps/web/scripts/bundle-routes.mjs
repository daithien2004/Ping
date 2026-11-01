// TF.15: báo cáo JS tải ban đầu theo route (gzip) từ `page_client-reference-manifest.js`
// của Turbopack — mỗi manifest liệt kê chunk của module client mà route cần; chunk có
// `async: true` tải khi mở tính năng (modal AI, search…) nên không tính. Cộng thêm base dùng
// chung (`rootMainFiles` + `polyfillFiles` + `lowPriorityFiles`) như `bundle-budget.mjs`.
// Không đặt ngưỡng mới: ngân sách tổng vẫn do `bundle-budget.mjs` chặn.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import vm from 'node:vm';

const NEXT_DIR = process.env.NEXT_DIST_DIR ?? '.next';
const MANIFEST = join(NEXT_DIR, 'build-manifest.json');
if (!existsSync(MANIFEST)) {
  throw new Error(`Không thấy ${MANIFEST}. Chạy \`pnpm build\` trước khi báo cáo bundle.`);
}

const walk = (dir) =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });

const buildManifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const baseChunks = new Set(
  [
    ...(buildManifest.rootMainFiles ?? []),
    ...(buildManifest.polyfillFiles ?? []),
    ...(buildManifest.lowPriorityFiles ?? []),
  ].map((file) => `/${file.replaceAll('\\', '/')}`),
);

const normalizeRoute = (page) =>
  page
    .replace(/^\/\((app|auth|public)\)/, '')
    .replace(/\/page$/, '')
    .replace(/\/_not-found$/, '/_not-found')
    .replace(/\/_global-error$/, '/_global-error') || '/';

const chunkSize = (() => {
  const cache = new Map();
  return (chunk) => {
    if (!cache.has(chunk)) {
      const path = join(NEXT_DIR, chunk.replace(/^\/_next\//, ''));
      cache.set(chunk, existsSync(path) ? gzipSync(readFileSync(path)).length : 0);
    }
    return cache.get(chunk);
  };
})();

const appDir = join(NEXT_DIR, 'server/app');
const manifests = walk(appDir).filter((path) => path.endsWith('page_client-reference-manifest.js'));

const rows = [];
for (const path of manifests) {
  const sandbox = {};
  vm.runInNewContext(readFileSync(path, 'utf8'), { globalThis: sandbox });
  const pages = Object.keys(sandbox.__RSC_MANIFEST ?? {});
  if (pages.length === 0) continue;
  const page = pages[0];
  const chunks = new Set(baseChunks);
  for (const clientModule of Object.values(sandbox.__RSC_MANIFEST[page].clientModules ?? {})) {
    for (const chunk of clientModule.chunks ?? []) {
      if (!clientModule.async) chunks.add(chunk);
    }
  }
  let bytes = 0;
  for (const chunk of chunks) bytes += chunkSize(chunk);
  rows.push({ route: normalizeRoute(page), kb: bytes / 1024, chunks: chunks.size });
}

rows.sort((a, b) => b.kb - a.kb);
const width = Math.max(...rows.map((row) => row.route.length), 5);
console.log(
  `JS tải ban đầu theo route (gzip, ${NEXT_DIR}, base ${baseChunks.size} chunk + chunk route):`,
);
for (const row of rows) {
  console.log(
    `  ${row.route.padEnd(width)}  ${row.kb.toFixed(1).padStart(7)} KB  (${row.chunks} chunk)`,
  );
}

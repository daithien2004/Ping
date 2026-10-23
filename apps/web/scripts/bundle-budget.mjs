import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';

// Ngân sách JS phía client (H4, ADR-0029; đo lại theo ADR-0058).
//
// `rootMainFiles` + `polyfillFiles` trong `build-manifest.json` là những chunk trình duyệt tải
// ngay khi mở trang, trước khi điều hướng sang route khác — đúng nghĩa "JS tải ban đầu" mà plan
// (T3.7/TF.15) và checklist phát hành nói tới. Các chunk còn lại chỉ tải khi vào route tương ứng
// (admin/AI/search, xem ADR-0050 mục 6) nên có trần riêng, không cộng vào tổng ban đầu.
//
// Trần lấy từ plan: bundle ban đầu 450 KB gzip (T3.7, T6.10, checklist phát hành), mỗi chunk
// 100 KB, chunk tải theo yêu cầu 160 KB (ADR-0031 cho Sentry; ADR-0058 áp dụng cho route).
export const LIMITS = { initialKb: 450, chunkKb: 100, routeKb: 160 };

// Chunk tải theo yêu cầu (route hoặc thư viện bật bằng cấu hình như Sentry): tên có tiền tố này
// trong `sizes` để `evaluate` không cộng vào tổng ban đầu. Nhận thêm bằng chuỗi đặc trưng trong
// nội dung chunk (ADR-0031) vì Sentry được nạp bằng `import()` có điều kiện.
export const ROUTE_PREFIX = 'route:';
export const LAZY_MARKERS = ['sentry.javascript'];

const bytesToKb = (bytes) => bytes / 1024;
const kbText = (bytes) => bytesToKb(bytes).toFixed(1);

/** sizes: { tên chunk: byte gzip } → danh sách vi phạm (rỗng = đạt). */
export function evaluate(sizes, limits = LIMITS) {
  const entries = Object.entries(sizes);
  const isRoute = ([name]) => name.startsWith(ROUTE_PREFIX);
  const route = entries.filter(isRoute);
  const initial = entries.filter((entry) => !isRoute(entry));
  const problems = [];

  const total = initial.reduce((sum, [, bytes]) => sum + bytes, 0);
  if (total > limits.initialKb * 1024) {
    problems.push(`JS tải ban đầu ${kbText(total)} KB gzip > ${limits.initialKb} KB`);
  }
  for (const [name, bytes] of initial) {
    if (bytes > limits.chunkKb * 1024) {
      problems.push(`${name}: ${kbText(bytes)} KB gzip > ${limits.chunkKb} KB`);
    }
  }
  for (const [name, bytes] of route) {
    if (bytes > limits.routeKb * 1024) {
      problems.push(
        `${name.replace(ROUTE_PREFIX, '')}: ${kbText(bytes)} KB gzip > ${limits.routeKb} KB (tải theo yêu cầu)`,
      );
    }
  }
  return problems;
}

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const normalize = (path) => path.replaceAll('\\', '/');

/**
 * Đo mọi chunk JS của client. Chunk nằm trong `rootMainFiles`/`polyfillFiles`/`lowPriorityFiles`
 * (hoặc được đánh dấu lazy) là JS tải ban đầu; phần còn lại là chunk tải theo yêu cầu.
 * Cần chạy `pnpm build` trước — thiếu `build-manifest.json` thì báo lỗi rõ ràng.
 */
export function measure(nextDir = '.next') {
  const manifestPath = join(nextDir, 'build-manifest.json');
  if (!existsSync(manifestPath)) {
    throw new Error(
      `Không thấy ${manifestPath}. Chạy \`pnpm build\` trước khi kiểm ngân sách bundle.`,
    );
  }
  const chunksDir = join(nextDir, 'static/chunks');
  if (!existsSync(chunksDir)) {
    throw new Error(
      `Không thấy ${chunksDir}. Chạy \`pnpm build\` trước khi kiểm ngân sách bundle.`,
    );
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const initialFiles = new Set(
    [
      ...(manifest.rootMainFiles ?? []),
      ...(manifest.polyfillFiles ?? []),
      ...(manifest.lowPriorityFiles ?? []),
    ].map(normalize),
  );

  const sizes = {};
  for (const file of walk(chunksDir).filter((path) => path.endsWith('.js'))) {
    const content = readFileSync(file);
    const name = normalize(relative(nextDir, file));
    const lazy = LAZY_MARKERS.some((marker) => content.includes(marker));
    sizes[`${initialFiles.has(name) && !lazy ? '' : ROUTE_PREFIX}${name}`] =
      gzipSync(content).length;
  }
  return sizes;
}

if (process.argv[1]?.endsWith('bundle-budget.mjs')) {
  const sizes = measure();
  const isRoute = (name) => name.startsWith(ROUTE_PREFIX);
  const sum = (entries) => entries.reduce((total, [, bytes]) => total + bytes, 0);
  const all = Object.entries(sizes);
  const initial = all.filter(([name]) => !isRoute(name));
  const route = all.filter(([name]) => isRoute(name));

  console.log(
    `JS tải ban đầu: ${kbText(sum(initial))} KB gzip (${initial.length} chunk); ` +
      `tải theo yêu cầu: ${kbText(sum(route))} KB (${route.length} chunk); ` +
      `tổng mọi chunk (tham khảo): ${kbText(sum(all))} KB`,
  );

  const problems = evaluate(sizes);
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
}

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

// Ngân sách JS phía client (H4, ADR-0029): tổng gzip và chunk lớn nhất. Số đo ban đầu: 371 KB tổng,
// chunk lớn nhất 70 KB; trần chừa ~20% dư địa. Muốn biết CÁI GÌ làm phình bundle: `pnpm exec next experimental-analyze`.
export const LIMITS = { totalKb: 450, chunkKb: 100, lazyKb: 160 };

// Chunk tải theo yêu cầu, chỉ khi bật tính năng tương ứng (Sentry khi có DSN, ADR-0031): không tính vào
// JS tải ban đầu, có trần riêng. Nhận ra bằng chuỗi đặc trưng trong nội dung chunk.
export const LAZY_PREFIX = 'lazy:';
export const LAZY_MARKERS = ['sentry.javascript'];

/** sizes: { tên chunk: byte gzip } → danh sách vi phạm (rỗng = đạt). */
export function evaluate(sizes, limits = LIMITS) {
  const entries = Object.entries(sizes);
  const isLazy = ([name]) => name.startsWith(LAZY_PREFIX);
  const lazy = entries.filter(isLazy);
  const initial = entries.filter((entry) => !isLazy(entry));
  const total = initial.reduce((sum, [, bytes]) => sum + bytes, 0);
  const problems = [];
  for (const [name, bytes] of lazy) {
    if (bytes > limits.lazyKb * 1024) {
      problems.push(`${name}: ${(bytes / 1024).toFixed(1)} KB gzip > ${limits.lazyKb} KB (lazy)`);
    }
  }
  if (total > limits.totalKb * 1024) {
    problems.push(`tổng ${(total / 1024).toFixed(1)} KB gzip > ${limits.totalKb} KB`);
  }
  for (const [name, bytes] of initial) {
    if (bytes > limits.chunkKb * 1024) {
      problems.push(`${name}: ${(bytes / 1024).toFixed(1)} KB gzip > ${limits.chunkKb} KB`);
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

export function measure(chunksDir) {
  const sizes = {};
  for (const file of walk(chunksDir).filter((f) => f.endsWith('.js'))) {
    const content = readFileSync(file);
    const lazy = LAZY_MARKERS.some((marker) => content.includes(marker));
    sizes[`${lazy ? LAZY_PREFIX : ''}${file.slice(chunksDir.length + 1)}`] =
      gzipSync(content).length;
  }
  return sizes;
}

if (process.argv[1]?.endsWith('bundle-budget.mjs')) {
  const sizes = measure('.next/static/chunks');
  const sum = (entries) => entries.reduce((a, [, bytes]) => a + bytes, 0) / 1024;
  const all = Object.entries(sizes);
  const lazy = all.filter(([name]) => name.startsWith(LAZY_PREFIX));
  console.log(
    `JS client ban đầu: ${(sum(all) - sum(lazy)).toFixed(1)} KB gzip (${all.length - lazy.length} chunk); ` +
      `tải theo yêu cầu: ${sum(lazy).toFixed(1)} KB (${lazy.length} chunk)`,
  );
  const problems = evaluate(sizes);
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
}

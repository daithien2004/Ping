import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

// Ngân sách JS phía client (H4, ADR-0029): tổng gzip và chunk lớn nhất. Số đo ban đầu: 371 KB tổng,
// chunk lớn nhất 70 KB; trần chừa ~20% dư địa. Muốn biết CÁI GÌ làm phình bundle: `pnpm exec next experimental-analyze`.
export const LIMITS = { totalKb: 450, chunkKb: 100 };

/** sizes: { tên chunk: byte gzip } → danh sách vi phạm (rỗng = đạt). */
export function evaluate(sizes, limits = LIMITS) {
  const entries = Object.entries(sizes);
  const total = entries.reduce((sum, [, bytes]) => sum + bytes, 0);
  const problems = [];
  if (total > limits.totalKb * 1024) {
    problems.push(`tổng ${(total / 1024).toFixed(1)} KB gzip > ${limits.totalKb} KB`);
  }
  for (const [name, bytes] of entries) {
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
    sizes[file.slice(chunksDir.length + 1)] = gzipSync(readFileSync(file)).length;
  }
  return sizes;
}

if (process.argv[1]?.endsWith('bundle-budget.mjs')) {
  const sizes = measure('.next/static/chunks');
  const total = Object.values(sizes).reduce((a, b) => a + b, 0);
  console.log(
    `JS client: ${(total / 1024).toFixed(1)} KB gzip, ${Object.keys(sizes).length} chunk`,
  );
  const problems = evaluate(sizes);
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
}

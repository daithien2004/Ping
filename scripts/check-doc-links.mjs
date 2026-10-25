// Dò liên kết tương đối hỏng trong mọi file Markdown của repo (ADR-0034). `pnpm docs:check`, cũng chạy trong CI.
// Chỉ kiểm file/thư mục đích có tồn tại, không kiểm phần #neo, không kiểm URL http(s).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const SKIP = new Set(['node_modules', '.git', '.pnpm-store', '.next', 'dist', '.turbo', 'data']);

function* markdownFiles(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) yield* markdownFiles(full);
    else if (entry.endsWith('.md')) yield full;
  }
}

const link = /\[[^\]]*\]\(([^)\s]+)\)/g;
const broken = [];
for (const file of markdownFiles(root)) {
  // Bỏ khối mã và code span: ví dụ trong ``` hoặc `...` có thể chứa cú pháp giống liên kết
  // (HANDOFF.md có `[text](url)` là ví dụ, không phải liên kết thật).
  const text = readFileSync(file, 'utf8')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`\n]*`/g, '');
  for (const match of text.matchAll(link)) {
    const target = match[1].split('#')[0];
    if (!target || /^(https?:|mailto:)/.test(target)) continue;
    const resolved = path.resolve(path.dirname(file), decodeURI(target));
    if (!existsSync(resolved)) broken.push(`${path.relative(root, file)}: ${match[1]}`);
  }
}

if (broken.length) {
  console.error(`Liên kết hỏng (${broken.length}):\n${broken.map((b) => `  ${b}`).join('\n')}`);
  process.exit(1);
}
console.log('Liên kết tài liệu: không có liên kết tương đối nào hỏng.');

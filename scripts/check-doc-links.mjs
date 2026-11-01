// Dò liên kết tương đối hỏng trong mọi file Markdown của repo (ADR-0034). `pnpm docs:check`, cũng chạy trong CI.
// Chỉ kiểm file/thư mục đích có tồn tại, không kiểm phần #neo, không kiểm URL http(s).
// File đích bị `.gitignore` bỏ qua cũng tính là hỏng: nó có trên máy dev nhưng không có trên
// clone/CI — đúng lỗi từng lọt qua CI của lô gộp 3 (link tới kế hoạch local).
import { spawnSync } from 'node:child_process';
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
const resolvedLinks = [];
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
    else resolvedLinks.push({ file, raw: match[1], resolved });
  }
}

// `git check-ignore` gom một lượt; ngoài git repo (ví dụ bản export .tar) thì bỏ kiểm tra này.
const ignored = new Set();
if (resolvedLinks.length) {
  const unique = [...new Set(resolvedLinks.map((item) => item.resolved))];
  const result = spawnSync('git', ['check-ignore', '--stdin', '-z'], {
    cwd: root,
    input: unique.join('\0'),
    encoding: 'utf8',
  });
  if (result.status === 0) {
    for (const entry of result.stdout.split('\0'))
      if (entry) ignored.add(path.resolve(root, entry));
  }
}
for (const item of resolvedLinks) {
  if (ignored.has(item.resolved)) {
    broken.push(`${path.relative(root, item.file)}: ${item.raw} (đích bị .gitignore bỏ qua)`);
  }
}

if (broken.length) {
  console.error(`Liên kết hỏng (${broken.length}):\n${broken.map((b) => `  ${b}`).join('\n')}`);
  process.exit(1);
}
console.log('Liên kết tài liệu: không có liên kết tương đối nào hỏng.');

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const srcRoot = fileURLToPath(new URL('../../', import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}

// Hợp đồng giữa skin Pop (ADR-0084) và component: CSS chỉ bám vào `data-slot`. Test này đỏ khi
// ai đó đổi tên/xóa slot ở component mà quên CSS (hoặc ngược lại), thay vì để skin vỡ âm thầm.
describe('skin Pop — hợp đồng data-slot', () => {
  const css = readFileSync(join(srcRoot, 'styles/skin-pop.css'), 'utf8');
  const used = [...new Set([...css.matchAll(/\[data-slot='([a-z-]+)'\]/g)].map((m) => m[1]!))];
  const components = sourceFiles(srcRoot)
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n');

  it('CSS dùng ít nhất một slot', () => {
    expect(used.length).toBeGreaterThan(0);
  });

  it.each(used)('slot "%s" có mặt trong một component', (slot) => {
    expect(components).toContain(`data-slot="${slot}"`);
  });

  it('bảng slot trong ghi chú đầu file khớp với slot đang dùng', () => {
    const header = css.slice(0, css.indexOf('*/'));
    for (const slot of used) expect(header, slot).toContain(slot);
  });

  it('không có hex thô trong CSS của skin', () => {
    expect(css.replace(/url\("[^"]*"\)/g, '')).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});

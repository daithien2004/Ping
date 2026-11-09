import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { toAntdSize } from './size';

const dir = fileURLToPath(new URL('.', import.meta.url));
const wrappers = readdirSync(dir).filter((file) => /^ping-.*\.tsx$/.test(file));

describe('cỡ dùng chung', () => {
  it('đổi cỡ Ping sang cỡ antd', () => {
    expect([toAntdSize('sm'), toAntdSize('md'), toAntdSize('lg')]).toEqual([
      'small',
      'middle',
      'large',
    ]);
  });

  it.each(wrappers)('%s không để lộ cỡ antd, không forwardRef và dùng PingSize', (file) => {
    const source = readFileSync(join(dir, file), 'utf8');
    expect(source).not.toMatch(/size\??:\s*'(small|middle|large)'/);
    expect(source).not.toContain('forwardRef');
    if (/\bsize\?:/.test(source) && !file.includes('drawer')) {
      expect(source).toContain("from './size'");
    }
  });
});

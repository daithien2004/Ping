import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dir = fileURLToPath(new URL('.', import.meta.url));
const files = readdirSync(dir).filter((name) => /^ping-.*\.tsx$/.test(name));

describe('hợp đồng wrapper Ping', () => {
  it.each(files)('%s: data-* hợp đồng đứng sau {...rest}/{...props}', (name) => {
    const source = readFileSync(join(dir, name), 'utf8');
    const spread = source.search(/\{\.\.\.(rest|props)\}/);
    for (const attr of ['data-slot=', 'data-variant=', 'data-size=']) {
      const at = source.indexOf(attr);
      if (spread !== -1 && at !== -1) expect(at, `${attr} phải sau spread`).toBeGreaterThan(spread);
    }
  });

  it.each(files)('%s: không dùng biến CSS ngoài token', (name) => {
    const source = readFileSync(join(dir, name), 'utf8');
    expect(source).not.toMatch(/var\(--ping-/);
  });
});

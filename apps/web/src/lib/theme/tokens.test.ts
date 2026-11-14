import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { radius, semanticColors, typography, type ThemeMode } from './tokens';

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
const generated = read('../../styles/tokens.generated.css');
const globals = read('../../app/globals.css');

function luminance(hex: string) {
  const n = Number.parseInt(hex.slice(1), 16);
  const channel = (value: number) => {
    const s = value / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
  );
}

describe('thang bo góc (ADR-0075)', () => {
  it('sinh đủ mọi bậc radius từ tokens.ts', () => {
    for (const [step, value] of Object.entries(radius)) {
      expect(generated).toContain(`--ping-radius-${step}: ${value}px;`);
    }
  });

  it('--radius nền bằng bậc lg để antd và Tailwind cùng một số', () => {
    expect(generated).toContain(`--radius: ${radius.lg}px;`);
    expect(radius.lg).toBe(12);
  });

  it('Tailwind đọc radius từ token chứ không tự suy ra', () => {
    for (const step of ['sm', 'md', 'lg', 'xl', '2xl', '3xl']) {
      expect(globals).toContain(`--radius-${step}: var(--ping-radius-${step});`);
    }
  });
});

describe('tầng nền (2.6)', () => {
  it.each<ThemeMode>(['light', 'dark'])('%s: rail < sidebar < nội dung', (mode) => {
    const colors = semanticColors(mode);
    const rail = luminance(colors.rail);
    const sidebar = luminance(colors.sidebar);
    const content = luminance(colors.background);
    expect(rail).toBeLessThan(sidebar);
    expect(sidebar).toBeLessThan(content);
  });
});

describe('thang độ đậm (2.3)', () => {
  it('chỉ ba bậc, sinh ra CSS và nối vào Tailwind', () => {
    expect(Object.values(typography.fontWeight)).toEqual([400, 500, 600]);
    for (const [weight, value] of Object.entries(typography.fontWeight)) {
      expect(generated).toContain(`--ping-weight-${weight}: ${value};`);
      expect(globals).toContain(`--font-weight-${weight}: var(--ping-weight-${weight});`);
    }
  });
});

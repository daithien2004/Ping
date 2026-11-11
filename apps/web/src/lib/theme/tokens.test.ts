import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { buildAntdTheme } from './antd-theme';
import { parseSkin, readSkinCookie } from './skin';
import { borderWidth, radius, semanticColors, skins, typography, type ThemeMode } from './tokens';

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
const generated = read('../../styles/tokens.generated.css');
const globals = read('../../app/globals.css');

/** Độ sáng tương đối WCAG của một màu hex. */
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

  // Lỗi cũ: token lg = 12 px (antd) nhưng rounded-lg của Tailwind ra 8 px.
  it('Tailwind đọc radius từ token chứ không tự suy ra', () => {
    for (const step of ['sm', 'md', 'lg', 'xl', '2xl', '3xl']) {
      expect(globals).toContain(`--radius-${step}: var(--ping-radius-${step});`);
    }
  });
});

describe('tầng nền (2.6)', () => {
  // Ba mặt phẳng phải giữ đúng thứ tự ở cả hai nền: rail tối nhất, sidebar giữa, nội dung sáng
  // nhất. Bằng nhau hoặc đảo thứ tự là mất phân tầng.
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

describe('skin Pixel (ADR-0076)', () => {
  it('sinh khối data-skin: radius 0, viền 2 px, easing bậc thang, bóng cứng', () => {
    expect(generated).toContain("html[data-skin='pixel'] {");
    for (const step of Object.keys(radius)) {
      expect(generated).toContain(`--ping-radius-${step}: ${skins.pixel.radius}px;`);
    }
    expect(generated).toContain('--radius: 0px;');
    expect(generated).toContain(`--ping-border-width: ${skins.pixel.borderWidth}px;`);
    expect(generated).toContain(`--ping-ease-standard: ${skins.pixel.easing};`);
    expect(generated).toContain(`--ping-shadow-panel: ${skins.pixel.shadow.panel.light};`);
    // Nền tối phải có khối riêng, không rơi về bóng mềm của theme.
    expect(generated).toContain("html[data-skin='pixel'][data-theme='dark']");
  });

  it('skin mặc định không đổi gì: viền 1 px, antd giữ radius cũ', () => {
    expect(generated).toContain(`--ping-border-width: ${borderWidth}px;`);
    const theme = buildAntdTheme('dark');
    expect(theme.token?.borderRadius).toBe(radius.md);
    expect(theme.token?.borderRadiusLG).toBe(radius.lg);
    expect(theme.token?.lineWidth).toBeUndefined();
  });

  it('antd nhận skin: bo 0, viền 2 px, bóng cứng, màu giữ nguyên', () => {
    const pixel = buildAntdTheme('dark', 'pixel');
    const normal = buildAntdTheme('dark');
    expect(pixel.token?.borderRadius).toBe(0);
    expect(pixel.token?.borderRadiusLG).toBe(0);
    expect(pixel.components?.Button?.borderRadius).toBe(0);
    expect(pixel.token?.lineWidth).toBe(skins.pixel.borderWidth);
    expect(pixel.token?.boxShadow).toBe(skins.pixel.shadow.overlay.dark);
    expect(pixel.token?.colorPrimary).toBe(normal.token?.colorPrimary);
  });

  it('cookie skin chỉ nhận các giá trị đã biết', () => {
    expect(parseSkin('pixel')).toBe('pixel');
    expect(parseSkin('pop')).toBe('pop');
    expect(parseSkin('default')).toBe('default');
    expect(parseSkin('PIXEL')).toBe('default');
    expect(parseSkin(undefined)).toBe('default');
  });

  it('skin mặc định là Pop khi trình duyệt chưa có cookie lựa chọn', () => {
    vi.stubGlobal('document', { cookie: '' });
    expect(readSkinCookie()).toBe('pop');
    vi.unstubAllGlobals();
  });
});

describe('skin Pop (ADR-0084)', () => {
  it('sinh khối data-skin cho cả sáng và tối, có ghi đè màu', () => {
    expect(generated).toContain("html[data-skin='pop'] {");
    expect(generated).toContain("html[data-skin='pop'][data-theme='dark']");
    expect(generated).toContain(`--primary: ${skins.pop.colors.light.primary};`);
    expect(generated).toContain(`--ping-border-width: ${skins.pop.borderWidth}px;`);
    expect(generated).toContain(`--ping-shadow-panel: ${skins.pop.shadow.panel.dark};`);
  });

  it('chỉ Pop đổi màu; default giữ nguyên bảng gốc', () => {
    for (const mode of ['light', 'dark'] as const) {
      expect(semanticColors(mode, 'pixel')).toEqual(semanticColors(mode));
      expect(semanticColors(mode, 'pop').primary).toBe(skins.pop.colors[mode].primary);
      expect(semanticColors(mode, 'pop').destructive).toBe(semanticColors(mode).destructive);
    }
  });

  it('antd nhận skin Pop: bo sticker, viền 2 px, bóng cứng, màu Pop', () => {
    const pop = buildAntdTheme('light', 'pop');
    expect(pop.token?.borderRadius).toBe(skins.pop.radius.md);
    expect(pop.token?.lineWidth).toBe(skins.pop.borderWidth);
    expect(pop.token?.boxShadow).toBe(skins.pop.shadow.overlay.light);
    expect(pop.token?.colorPrimary).toBe(skins.pop.colors.light.primary);
    expect(pop.components?.Button?.primaryColor).toBe(skins.pop.colors.light.primaryForeground);
    expect(buildAntdTheme('light').components?.Button?.primaryColor).toBeUndefined();
  });
});

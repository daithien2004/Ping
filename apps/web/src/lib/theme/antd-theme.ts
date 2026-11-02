import { theme as antdTheme } from 'antd';
import type { ThemeConfig } from 'antd';
import { semanticColors, spacing, radius, skins, typography, motion } from './tokens';
import type { Skin, ThemeMode } from './tokens';

/**
 * `skin` chỉ đổi hình thức (bo góc, độ dày viền, bóng) — ADR-0076. Mặc định 'default' giữ
 * nguyên cấu hình cũ nên mọi màn không bật skin không đổi một pixel.
 */
export function buildAntdTheme(mode: ThemeMode, skin: Skin = 'default'): ThemeConfig {
  const c = semanticColors(mode);
  const isDark = mode === 'dark';
  const pixel = skin === 'pixel';
  // Skin Pixel làm phẳng mọi bo góc về 0; không lấy `radius` gốc để tránh lẫn hai thang.
  const corner = (step: keyof typeof radius) => (pixel ? skins.pixel.radius : radius[step]);
  return {
    token: {
      colorPrimary: c.primary,
      colorBgBase: c.background,
      colorTextBase: c.foreground,
      // Viền ô nhập/select: WCAG 1.4.11 đòi ≥ 3:1 vì viền chính là ranh giới điều khiển;
      // `border` (1.34:1) chỉ dùng cho đường phân cách trang trí.
      colorBorder: c.borderStrong,
      colorBgContainer: c.card,
      colorBgElevated: c.popover,
      colorText: c.foreground,
      colorTextSecondary: c.mutedForeground,
      // antd tự suy colorTextDescription từ colorTextBase pha alpha (~45%) → dưới 4.5:1 trên
      // nền card (axe bắt color-contrast ở mô tả Empty của bảng vai trò, T6.9). Dùng màu phụ
      // của palette (đã đạt AA ở cả hai nền) thay vì alpha.
      colorTextDescription: c.mutedForeground,
      colorLink: c.link,
      colorError: c.destructive,
      borderRadius: corner('md'),
      borderRadiusLG: corner('lg'),
      borderRadiusSM: corner('sm'),
      fontFamily: typography.fontFamily.sans,
      fontSize: typography.fontSize.base,
      motionDurationMid: `${motion.normal}ms`,
      motionDurationSlow: `${motion.slow}ms`,
      motionDurationFast: `${motion.fast}ms`,
      ...(pixel
        ? {
            // Viền antd dày 2 px và bóng cứng, cùng ngôn ngữ với khung Tailwind của skin.
            lineWidth: skins.pixel.borderWidth,
            boxShadow: skins.pixel.shadow.overlay[mode],
            boxShadowSecondary: skins.pixel.shadow.panel[mode],
            boxShadowTertiary: skins.pixel.shadow.panel[mode],
          }
        : {}),
    },
    components: {
      // Nút "danger" kiểu viền lấy chữ từ colorError; antd suy palette[6] từ seed nên nền tối
      // thành #cf6b5d, chỉ ~4.4:1 trên card. Ghim về đúng destructive của palette (5.8:1 tối,
      // 4.7:1 sáng) — axe color-contrast (serious) ở mục Thu hồi phiên (T6.9).
      Button: { borderRadius: corner('md'), controlHeight: 36, colorError: c.destructive },
      Input: { borderRadius: corner('md'), controlHeight: 36 },
      Modal: { borderRadiusLG: corner('xl') },
      Card: { borderRadiusLG: corner('lg') },
      // Mặc định antd dùng colorTextLabel (text pha alpha) cho mục chưa chọn — trên nền
      // ink-50/ink-950 của palette này tụt dưới 4.5:1 (axe bắt ở trang cài đặt TG.13).
      Segmented: { itemColor: c.foreground, itemHoverColor: c.foreground },
      // Tag preset 'default' của antd cũng dùng chữ pha alpha trên nền xám nhẹ — axe bắt
      // color-contrast (serious) ở tag "Chưa xác minh"/"Phiên này" của TG.8. Text đậm màu
      // foreground, nền giữ neutralFill (vẫn phân biệt được với nền card).
      Tag: { defaultColor: c.foreground, defaultBg: c.muted },
      // Avatar mặc định của antd là chữ trắng trên nền đen pha 25% (2,29:1) — axe color-contrast
      // (serious) ở icon server đang chọn. Ghim nền/chữ theo cặp muted/foreground đạt AA; nền
      // thương hiệu truyền qua `style` ở nơi dùng vì CSS của antd nằm ngoài layer Tailwind.
      Avatar: { colorTextPlaceholder: c.muted, colorTextLightSolid: c.foreground },
    },
    hashed: true,
    cssVar: { key: 'ping' },
    algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
  };
}

export { spacing, radius, typography, motion };

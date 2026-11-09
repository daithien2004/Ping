import { theme as antdTheme } from 'antd';
import type { ThemeConfig } from 'antd';
import { palette, semanticColors, spacing, radius, skins, typography, motion } from './tokens';
import type { Skin, ThemeMode } from './tokens';

/**
 * `skin` chỉ đổi hình thức (bo góc, độ dày viền, bóng) — ADR-0076. Mặc định 'default' giữ
 * nguyên cấu hình cũ nên mọi màn không bật skin không đổi một pixel.
 */
export function buildAntdTheme(mode: ThemeMode, skin: Skin = 'default'): ThemeConfig {
  const c = semanticColors(mode, skin);
  const isDark = mode === 'dark';
  const pixel = skin === 'pixel';
  const pop = skin === 'pop';
  // Pixel làm phẳng mọi bo góc về 0, Pop dùng thang bo riêng; không lẫn với `radius` gốc.
  const corner = (step: keyof typeof radius) =>
    pixel ? skins.pixel.radius : pop ? skins.pop.radius[step] : radius[step];
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
      ...(pop
        ? {
            lineWidth: skins.pop.borderWidth,
            // antd suy placeholder/disabled từ chữ pha alpha (~1,7:1 trên nền trắng); axe bắt ở kho /dev/ui.
            colorTextPlaceholder: c.mutedForeground,
            colorTextDisabled: c.mutedForeground,
            boxShadow: skins.pop.shadow.overlay[mode],
            boxShadowSecondary: skins.pop.shadow.panel[mode],
            boxShadowTertiary: skins.pop.shadow.panel[mode],
          }
        : {}),
    },
    components: {
      // Nút "danger" kiểu viền lấy chữ từ colorError; antd suy palette[6] từ seed nên nền tối
      // thành #cf6b5d, chỉ ~4.4:1 trên card. Ghim về đúng destructive của palette (5.8:1 tối,
      // 4.7:1 sáng) — axe color-contrast (serious) ở mục Thu hồi phiên (T6.9).
      Button: {
        borderRadius: corner('md'),
        controlHeight: 36,
        colorError: c.destructive,
        // Nút chính mặc định chữ trắng (colorTextLightSolid); trên cam của Pop chỉ ~3,5:1 nên lấy
        // chữ mực từ palette (axe color-contrast bắt ở nút "Đăng nhập", e2e skin-pop).
        // darkAlgorithm suy lại colorPrimary từ seed nên nền tối làm cam xỉn đi, chữ mực tụt dưới
        // AA; ghim đúng cam của palette cho cả ba trạng thái (hover sang vàng, đúng chất pop).
        ...(pop
          ? {
              primaryColor: c.primaryForeground,
              // Viền 3px + bóng làm nút nhỏ (24px) lùn và chật chữ.
              controlHeightSM: 30,
              paddingInlineSM: 12,
              colorPrimary: c.primary,
              colorPrimaryHover: palette.pop.yellow,
              colorPrimaryActive: c.primary,
            }
          : {}),
      },
      Input: { borderRadius: corner('md'), controlHeight: 36 },
      Modal: { borderRadiusLG: corner('xl') },
      Card: { borderRadiusLG: corner('lg') },
      // Mặc định antd dùng colorTextLabel (text pha alpha) cho mục chưa chọn — trên nền
      // ink-50/ink-950 của palette này tụt dưới 4.5:1 (axe bắt ở trang cài đặt TG.13).
      Segmented: { itemColor: c.foreground, itemHoverColor: c.foreground },
      // Pop: antd tô chữ mục đang chọn bằng colorPrimary (cam, ~3,3:1 trên trắng) — dùng chữ thường
      // và để thanh/nền làm điểm nhấn (axe bắt ở kho /dev/ui).
      ...(pop
        ? {
            Tabs: {
              itemSelectedColor: c.foreground,
              itemHoverColor: c.foreground,
              inkBarColor: c.primary,
            },
            Switch: { colorPrimary: palette.pop.mint, colorPrimaryHover: palette.pop.mint },
            Menu: {
              itemSelectedColor: palette.pop.ink,
              itemSelectedBg: palette.pop.yellow,
            },
          }
        : {}),
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
